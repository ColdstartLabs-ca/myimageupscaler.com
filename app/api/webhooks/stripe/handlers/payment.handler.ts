import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { trackServerEvent, trackRevenue } from '@server/analytics';
import { stripe } from '@server/stripe';
import { serverEnv } from '@shared/config/env';
import { assertKnownPriceId, getPlanForPriceId, resolvePlanOrPack } from '@shared/config/stripe';
import { getBasePriceIdByPlanKey } from '@shared/config/pricing-regions';
import { getEmailService } from '@server/services/email.service';
import { redeemDiscount } from '@server/services/engagement-discount.service';
import Stripe from 'stripe';

// Charge interface for accessing invoice property
interface IStripeChargeExtended extends Stripe.Charge {
  invoice?: string | null | undefined;
}

export class PaymentHandler {
  private static async resolveCheckoutSessionUserId(
    session: Stripe.Checkout.Session
  ): Promise<string> {
    const metadataUserId = session.metadata?.user_id || session.metadata?.supabase_user_id;
    if (metadataUserId) {
      return metadataUserId;
    }

    if (session.client_reference_id) {
      console.warn('[CHECKOUT_USER_ID_RECOVERED]', {
        sessionId: session.id,
        strategy: 'client_reference_id',
        userId: session.client_reference_id,
      });
      return session.client_reference_id;
    }

    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
    if (!customerId) {
      throw new Error(`Unable to resolve checkout session user: ${session.id} has no user_id`);
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to resolve checkout session user from customer ${customerId}: ${error.message}`
      );
    }

    if (!profile?.id) {
      throw new Error(`No profile found for checkout customer ${customerId}`);
    }

    console.warn('[CHECKOUT_USER_ID_RECOVERED]', {
      sessionId: session.id,
      strategy: 'stripe_customer_id',
      customerId,
      userId: profile.id,
    });

    return profile.id;
  }

  private static async syncSubscriptionStateFromCheckout(params: {
    userId: string;
    customerId: string | null;
    subscription: Stripe.Subscription;
    priceId: string;
    planKey: string;
  }): Promise<void> {
    const { userId, customerId, subscription, priceId, planKey } = params;
    const subscriptionWithPeriods = subscription as Stripe.Subscription & {
      current_period_start?: number;
      current_period_end?: number;
    };

    const profileUpdate: {
      stripe_customer_id?: string;
      subscription_status: string;
      subscription_tier: string;
    } = {
      subscription_status: subscription.status,
      subscription_tier: planKey,
    };

    if (customerId) {
      profileUpdate.stripe_customer_id = customerId;
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(profileUpdate)
      .eq('id', userId);

    if (profileError) {
      console.error('[CHECKOUT_SYNC_PROFILE_ERROR]', {
        userId,
        customerId,
        subscriptionId: subscription.id,
        error: profileError,
      });
    }

    const currentPeriodStart = subscriptionWithPeriods.current_period_start;
    const currentPeriodEnd = subscriptionWithPeriods.current_period_end;

    if (!currentPeriodStart || !currentPeriodEnd) {
      console.warn('[CHECKOUT_SYNC_SUBSCRIPTION_SKIPPED]', {
        userId,
        subscriptionId: subscription.id,
        reason: 'Missing current period timestamps on subscription payload',
      });
      return;
    }

    const { error: subscriptionError } = await supabaseAdmin.from('subscriptions').upsert({
      id: subscription.id,
      user_id: userId,
      status: subscription.status,
      price_id: priceId,
      current_period_start: new Date(currentPeriodStart * 1000).toISOString(),
      current_period_end: new Date(currentPeriodEnd * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      canceled_at: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000).toISOString()
        : null,
    });

    if (subscriptionError) {
      console.error('[CHECKOUT_SYNC_SUBSCRIPTION_ERROR]', {
        userId,
        subscriptionId: subscription.id,
        error: subscriptionError,
      });
    }
  }

  /**
   * Handle successful checkout session
   */
  static async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId = await this.resolveCheckoutSessionUserId(session);

    console.log(`Checkout completed for user ${userId}, mode: ${session.mode}`);

    let purchaseType: 'subscription' | 'credit_pack' | null = null;
    let planKey: string | undefined;
    let packKey: string | undefined;
    let amountCents = session.amount_total || 0;

    if (session.mode === 'subscription') {
      purchaseType = 'subscription';
      // For subscriptions, add initial credits immediately since user lands on success page
      // The subscription will be fully set up by the subscription.created event
      const subscriptionId = session.subscription as string;

      if (subscriptionId) {
        try {
          // Check if this is a test subscription ID
          if (subscriptionId.startsWith('sub_test_')) {
            console.log('Test subscription detected, using mock data');

            // For test subscriptions, add credits based on session metadata or a default
            const testPriceId = serverEnv.STRIPE_PRICE_PRO; // Default to PRO_MONTHLY for testing
            let plan;
            try {
              const resolved = assertKnownPriceId(testPriceId);
              if (resolved.type !== 'plan') {
                throw new Error(`Test price ID ${testPriceId} is not a subscription plan`);
              }
              plan = getPlanForPriceId(testPriceId); // Still use this for the legacy format
            } catch (error) {
              console.error('Test subscription plan resolution failed:', error);
              // Continue with mock plan data
            }

            if (plan) {
              const { error } = await supabaseAdmin.rpc('add_subscription_credits', {
                target_user_id: userId,
                amount: plan.creditsPerMonth,
                ref_id: session.id,
                description: `Test subscription credits - ${plan.name} plan - ${plan.creditsPerMonth} credits`,
              });

              if (error) {
                console.error('Error adding test subscription credits:', error);
              } else {
                console.log(
                  `Added ${plan.creditsPerMonth} test subscription credits to user ${userId} for ${plan.name} plan`
                );
              }
            }
          } else {
            // MEDIUM-5 FIX: Real subscription - get details from Stripe
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const priceId = subscription.items.data[0]?.price.id;
            const customerId =
              typeof session.customer === 'string'
                ? session.customer
                : session.customer?.id || null;

            // Get the invoice ID from the session for proper reference tracking
            const invoiceId = session.invoice as string | null;

            if (priceId) {
              // For price_data subscriptions, Stripe generates a throwaway price ID;
              // fall back to plan_key from subscription metadata to resolve the base price.
              const subPlanKey = subscription.metadata?.plan_key || '';
              const basePriceId = subPlanKey
                ? (getBasePriceIdByPlanKey(subPlanKey) ?? priceId)
                : priceId;
              let plan;
              try {
                const resolved = assertKnownPriceId(basePriceId);
                if (resolved.type !== 'plan') {
                  throw new Error(
                    `Price ID ${priceId} in checkout session is not a subscription plan`
                  );
                }
                plan = getPlanForPriceId(basePriceId);
                const planMetadata = resolvePlanOrPack(basePriceId);
                planKey = planMetadata?.type === 'plan' ? planMetadata.key : undefined;
              } catch (error) {
                console.error(
                  `[WEBHOOK_ERROR] Checkout session plan resolution failed: ${priceId}`,
                  {
                    error: error instanceof Error ? error.message : error,
                    subscriptionId,
                    sessionId: session.id,
                    userId,
                  }
                );
                // Don't return — analytics (purchase_confirmed, checkout_completed, revenue)
                // must still fire even if credit allocation is deferred to subscription.created.
                // Credit allocation will be handled by the subscription.created or
                // invoice.payment_succeeded fallback.
              }
              if (plan) {
                await this.syncSubscriptionStateFromCheckout({
                  userId,
                  customerId,
                  subscription,
                  priceId: basePriceId,
                  planKey: planKey ?? plan.key,
                });

                // Add initial credits for the first month
                // Use invoice ID as ref_id for refund correlation
                const refId = invoiceId ? `invoice_${invoiceId}` : `session_${session.id}`;

                // Check if credits were already added (e.g., by invoice.payment_succeeded fallback)
                // This prevents double-crediting if Stripe retries this event after invoice handler ran
                const { data: existingCredit } = await supabaseAdmin
                  .from('credit_transactions')
                  .select('id')
                  .eq('reference_id', refId)
                  .limit(1)
                  .maybeSingle();

                if (existingCredit) {
                  console.log(
                    `[CHECKOUT_SKIP] Credits already added for ref ${refId} - skipping to prevent double allocation`
                  );
                } else {
                  const { error } = await supabaseAdmin.rpc('add_subscription_credits', {
                    target_user_id: userId,
                    amount: plan.creditsPerMonth,
                    ref_id: refId,
                    description: `Initial subscription credits - ${plan.name} plan - ${plan.creditsPerMonth} credits`,
                  });

                  if (error) {
                    console.error('Error adding initial subscription credits:', error);
                  } else {
                    console.log(
                      `Added ${plan.creditsPerMonth} initial subscription credits to user ${userId} for ${plan.name} plan`
                    );
                  }
                }
              }

              // Send payment success email for subscription
              const subEmail = session.customer_email || session.customer_details?.email;
              if (!subEmail) {
                console.warn('No customer email available for subscription payment email');
              } else
                try {
                  const emailService = getEmailService();
                  await emailService.send({
                    to: subEmail,
                    template: 'payment-success',
                    data: {
                      userName: session.customer_details?.name || 'there',
                      amount: `$${(session.amount_total || 0) / 100}`,
                      planName: planKey,
                      receiptUrl: (session as unknown as { receipt_url?: string }).receipt_url,
                    },
                    userId,
                  });
                } catch (emailError) {
                  // Log but don't fail the webhook
                  console.error('Failed to send subscription payment email:', emailError);
                }
            }
          }
        } catch (error) {
          console.error('Error processing subscription checkout:', error);
        }
      }
    } else if (session.mode === 'payment') {
      purchaseType = 'credit_pack';
      packKey = session.metadata?.pack_key;
      // Handle credit pack purchase
      await this.handleCreditPackPurchase(session, userId);

      // Handle engagement discount redemption (if applied)
      if (session.metadata?.engagement_discount_applied === 'true') {
        try {
          const redeemResult = await redeemDiscount(userId);
          if (redeemResult.success) {
            console.log(`[ENGAGEMENT_DISCOUNT] Discount redeemed for user ${userId}`);

            // Track redemption event
            await trackServerEvent(
              'engagement_discount_redeemed',
              {
                pack: packKey || 'unknown',
                discountPercent: parseInt(session.metadata?.engagement_discount_percent || '0', 10),
                amountCents: session.amount_total || 0,
                sessionId: session.id,
              },
              { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
            );
          } else {
            console.warn(
              `[ENGAGEMENT_DISCOUNT] Failed to redeem discount for user ${userId}:`,
              redeemResult.error
            );
          }
        } catch (redeemError) {
          // Log but don't fail the webhook - purchase is already complete
          console.error('[ENGAGEMENT_DISCOUNT] Error redeeming discount:', redeemError);
        }
      }
    } else {
      console.warn(
        `Unexpected checkout mode: ${session.mode} for session ${session.id}. Expected 'subscription' or 'payment'.`
      );
    }

    // Track checkout completed event
    if (purchaseType) {
      // Get payment method from session (Stripe Checkout uses 'card' by default)
      // Payment method details are in session.payment_method_types
      const paymentMethodType = session.payment_method_types?.[0] || 'card';
      const paymentMethod = paymentMethodType === 'card' ? 'stripe_card' : paymentMethodType;

      // Extract pricing region and discount from session metadata
      const pricingRegion = session.metadata?.pricing_region || 'standard';
      const discountPercent = parseInt(session.metadata?.discount_percent || '0', 10);

      await trackServerEvent(
        'checkout_completed',
        {
          purchaseType,
          planTier: planKey,
          pack: packKey,
          amount: amountCents,
          paymentMethod,
          sessionId: session.id,
          currency: session.currency ?? 'usd',
          pricingRegion,
          discountPercent,
        },
        { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
      );

      // purchase_confirmed is the canonical "purchase happened" event for funnel analysis.
      // Fired server-side so it captures 100% of payments regardless of whether the user
      // reaches the success page (tab close, redirect race, etc.).
      await trackServerEvent(
        'purchase_confirmed',
        {
          purchaseType,
          sessionId: session.id,
          pricingRegion,
          discountPercent,
          planTier: planKey,
          pack: packKey,
          amount: amountCents,
          currency: session.currency ?? 'usd',
        },
        { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
      );

      // Update user properties in Amplitude for subscription purchases
      // Note: subscription.handler.ts handles the primary $identify for subscriptions,
      // but we also add one here to capture the checkout completion moment
      if (purchaseType === 'subscription' && planKey) {
        const billingInterval =
          session.mode === 'subscription'
            ? (
                session as {
                  subscription?: {
                    items?: { data?: { price?: { recurring?: { interval?: string } } }[] };
                  };
                }
              ).subscription?.items?.data?.[0]?.price?.recurring?.interval || 'month'
            : 'month';

        await trackServerEvent(
          '$identify',
          {
            $set: {
              plan: planKey,
              subscription_status: 'active',
              subscription_started_at: new Date().toISOString(),
              billing_interval: billingInterval === 'month' ? 'monthly' : billingInterval,
            },
          },
          { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
        );
      }

      // Track revenue in Amplitude for LTV/ARPU dashboards
      await trackRevenue(
        {
          userId,
          amountCents,
          productId:
            purchaseType === 'subscription'
              ? `subscription_${planKey ?? 'unknown'}_monthly`
              : `credit_pack_${packKey ?? 'unknown'}`,
          purchaseType,
          currency: session.currency ?? 'usd',
        },
        { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
      );
    }
  }

  /**
   * Handle one-time credit pack purchase
   * MEDIUM-14 FIX: Verify credits from price config, not session metadata
   */
  private static async handleCreditPackPurchase(
    session: Stripe.Checkout.Session,
    userId: string
  ): Promise<void> {
    const packKey = session.metadata?.pack_key;
    const priceIdFromMetadata = session.metadata?.price_id;

    // Get price ID from line items (authoritative source)
    let priceId = priceIdFromMetadata;
    if (session.line_items?.data?.[0]?.price?.id) {
      priceId = session.line_items.data[0].price.id;
    }

    // MEDIUM-14 FIX: Verify credits from price config, not trusted from metadata
    let credits: number;
    if (priceId) {
      try {
        const resolved = resolvePlanOrPack(priceId);
        if (resolved && resolved.type === 'pack' && resolved.credits) {
          credits = resolved.credits;
          console.log(
            `[CREDIT_PACK] Verified credits from price config: ${credits} (price_id: ${priceId})`
          );
        } else {
          // Fall back to metadata but log a warning
          credits = parseInt(session.metadata?.credits || '0', 10);
          console.warn(
            `[CREDIT_PACK] Could not verify credits from price config, using metadata: ${credits}`
          );
        }
      } catch {
        // Fall back to metadata but log a warning
        credits = parseInt(session.metadata?.credits || '0', 10);
        console.warn(
          `[CREDIT_PACK] Price ID ${priceId} not found in config, using metadata: ${credits}`
        );
      }
    } else {
      // Fall back to metadata if no price ID available
      credits = parseInt(session.metadata?.credits || '0', 10);
      console.warn(`[CREDIT_PACK] No price ID available, using metadata credits: ${credits}`);
    }

    if (!credits || credits <= 0) {
      console.error(`Invalid credits for credit pack purchase: ${credits}`);
      return;
    }

    // Get payment intent for refund correlation
    const paymentIntentId = session.payment_intent as string;

    try {
      const { error } = await supabaseAdmin.rpc('add_purchased_credits', {
        target_user_id: userId,
        amount: credits,
        ref_id: paymentIntentId ? `pi_${paymentIntentId}` : `session_${session.id}`,
        description: `Credit pack purchase - ${packKey || 'unknown'} - ${credits} credits`,
      });

      if (error) {
        console.error('Error adding purchased credits:', error);
        throw error; // Trigger webhook retry
      }

      console.log(`Added ${credits} purchased credits to user ${userId} (pack: ${packKey})`);

      // Track credit pack purchased event
      await trackServerEvent(
        'credit_pack_purchased',
        {
          pack: packKey || 'unknown',
          credits,
          amountCents: session.amount_total || 0,
        },
        { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
      );
    } catch (error) {
      console.error('Failed to process credit purchase:', error);
      throw error; // Re-throw for webhook retry
    }

    // Send payment success email for credit pack
    const packEmail = session.customer_email || session.customer_details?.email;
    if (!packEmail) {
      console.warn('No customer email available for credit pack payment email');
    } else
      try {
        const emailService = getEmailService();
        await emailService.send({
          to: packEmail,
          template: 'payment-success',
          data: {
            userName: session.customer_details?.name || 'there',
            amount: `$${(session.amount_total || 0) / 100}`,
            credits,
            receiptUrl: (session as unknown as { receipt_url?: string }).receipt_url,
          },
          userId,
        });
      } catch (emailError) {
        // Log but don't fail the webhook
        console.error('Failed to send credit pack payment email:', emailError);
      }
  }

  /**
   * Handle charge refund - clawback credits from appropriate pool
   * FIXED: Support multiple reference prefixes (invoice_, pi_, session_)
   */
  static async handleChargeRefunded(charge: IStripeChargeExtended): Promise<void> {
    const customerId = charge.customer;
    const refundAmount = charge.amount_refunded || 0;

    if (refundAmount === 0) {
      console.log(`Charge ${charge.id} has no refund amount, skipping`);
      return;
    }

    // Get the user ID from the customer
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    // FIX: Throw error instead of silent return - Stripe will retry
    if (!profile) {
      console.error(`[WEBHOOK_RETRY] No profile found for customer ${customerId}`, {
        chargeId: charge.id,
        customerId,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Profile not found for customer ${customerId} - webhook will retry`);
    }

    const userId = profile.id;
    const invoiceId = charge.invoice;
    const paymentIntentId = charge.payment_intent as string | null;

    console.log(`[CHARGE_REFUND] Processing refund for charge ${charge.id}:`, {
      userId,
      refundAmount,
      invoiceId,
      paymentIntentId,
      timestamp: new Date().toISOString(),
    });

    // Try multiple reference formats to find the original transaction
    // Credit packs use pi_ or session_, subscriptions use invoice_
    const referenceIds = [
      invoiceId ? `invoice_${invoiceId}` : null,
      paymentIntentId ? `pi_${paymentIntentId}` : null,
      `session_${charge.id}`, // Fallback: some old transactions used session ID
    ].filter(Boolean) as string[];

    let clawbackSucceeded = false;

    for (const refId of referenceIds) {
      try {
        const { data: result, error } = await supabaseAdmin.rpc('clawback_from_transaction_v2', {
          p_target_user_id: userId,
          p_original_ref_id: refId,
          p_reason: `Refund for charge ${charge.id} (${refundAmount} cents)`,
        });

        if (!error && result && result.length > 0 && result[0]?.success) {
          console.log(`[CHARGE_REFUND] Clawback succeeded with ref_id: ${refId}`, {
            creditsClawedBack: result[0].credits_clawed_back,
            subscriptionClawed: result[0].subscription_clawed,
            purchasedClawed: result[0].purchased_clawed,
            newSubscriptionBalance: result[0].new_subscription_balance,
            newPurchasedBalance: result[0].new_purchased_balance,
          });
          clawbackSucceeded = true;
          break;
        }
      } catch (err) {
        console.warn(`[CHARGE_REFUND] Clawback attempt failed for ref_id ${refId}:`, err);
      }
    }

    if (!clawbackSucceeded) {
      console.warn(`[CHARGE_REFUND] Could not correlate refund to any transaction`, {
        userId,
        chargeId: charge.id,
        attemptedRefIds: referenceIds,
      });
      // Don't throw - refund processed even if clawback fails
      // This avoids blocking legitimate refunds for old transactions
    }
  }

  /**
   * Handle invoice payment refunded - clawback subscription credits
   */
  static async handleInvoicePaymentRefunded(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;

    console.log(`[INVOICE_REFUND] Invoice ${invoice.id} payment refunded`);

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    // FIX: Throw error instead of silent return - Stripe will retry
    if (!profile) {
      console.error(`[WEBHOOK_RETRY] No profile found for customer ${customerId}`, {
        invoiceId: invoice.id,
        customerId,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Profile not found for customer ${customerId} - webhook will retry`);
    }

    try {
      // Clawback using invoice reference - will route to correct pool automatically
      // The clawback function will find the original transaction and remove all credits from it
      const { data: result, error } = await supabaseAdmin.rpc('clawback_from_transaction_v2', {
        p_target_user_id: profile.id,
        p_original_ref_id: `invoice_${invoice.id}`,
        p_reason: `Invoice refund: ${invoice.id}`,
      });

      if (error) {
        console.error(`[INVOICE_REFUND] Failed to clawback credits:`, error);
        throw error;
      }

      if (result && result.length > 0) {
        const clawbackResult = result[0];
        if (clawbackResult.success) {
          console.log(
            `[INVOICE_REFUND] Clawed back ${clawbackResult.credits_clawed_back} credits ` +
              `(sub: ${clawbackResult.subscription_clawed}, pur: ${clawbackResult.purchased_clawed}) ` +
              `New balances - sub: ${clawbackResult.new_subscription_balance}, pur: ${clawbackResult.new_purchased_balance}`
          );
        } else {
          console.error(`[INVOICE_REFUND] Clawback failed: ${clawbackResult.error_message}`);
        }
      }
    } catch (error) {
      console.error(`[INVOICE_REFUND] Error during credit clawback:`, error);
      throw error;
    }
  }
}
