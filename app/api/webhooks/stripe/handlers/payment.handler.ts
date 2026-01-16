import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { trackServerEvent } from '@server/analytics';
import { stripe } from '@server/stripe';
import { serverEnv } from '@shared/config/env';
import { assertKnownPriceId, getPlanForPriceId, resolvePlanOrPack } from '@shared/config/stripe';
import Stripe from 'stripe';

// Charge interface for accessing invoice property
interface IStripeChargeExtended extends Stripe.Charge {
  invoice?: string | null | undefined;
}

export class PaymentHandler {
  /**
   * Handle successful checkout session
   */
  static async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.user_id;
    if (!userId) {
      console.error('No user_id in session metadata');
      return;
    }

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
            const testPriceId = 'price_1SZmVzALMLhQocpfPyRX2W8D'; // Default to PRO_MONTHLY for testing
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

            // Get the invoice ID from the session for proper reference tracking
            const invoiceId = session.invoice as string | null;

            if (priceId) {
              let plan;
              try {
                const resolved = assertKnownPriceId(priceId);
                if (resolved.type !== 'plan') {
                  throw new Error(
                    `Price ID ${priceId} in checkout session is not a subscription plan`
                  );
                }
                plan = getPlanForPriceId(priceId); // Still use this for the legacy format
                const planMetadata = resolvePlanOrPack(priceId);
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
                // For checkout sessions, we'll continue without failing since the subscription.created event will handle it
                return;
              }
              if (plan) {
                // Add initial credits for the first month
                // Use invoice ID as ref_id for refund correlation
                const { error } = await supabaseAdmin.rpc('add_subscription_credits', {
                  target_user_id: userId,
                  amount: plan.creditsPerMonth,
                  ref_id: invoiceId ? `invoice_${invoiceId}` : `session_${session.id}`,
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
    } else {
      console.warn(
        `Unexpected checkout mode: ${session.mode} for session ${session.id}. Expected 'subscription' or 'payment'.`
      );
    }

    // Track checkout completed event
    if (purchaseType) {
      await trackServerEvent(
        'checkout_completed',
        {
          purchaseType,
          plan: planKey,
          pack: packKey,
          amountCents,
          sessionId: session.id,
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
