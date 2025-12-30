import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { stripe } from '@server/stripe';
import { assertKnownPriceId, getPlanForPriceId } from '@shared/config/stripe';
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

    if (session.mode === 'subscription') {
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
      // Handle credit pack purchase
      await this.handleCreditPackPurchase(session, userId);
    } else {
      console.warn(
        `Unexpected checkout mode: ${session.mode} for session ${session.id}. Expected 'subscription' or 'payment'.`
      );
    }
  }

  /**
   * Handle one-time credit pack purchase
   */
  private static async handleCreditPackPurchase(
    session: Stripe.Checkout.Session,
    userId: string
  ): Promise<void> {
    const credits = parseInt(session.metadata?.credits || '0', 10);
    const packKey = session.metadata?.pack_key;

    if (!credits || credits <= 0) {
      console.error(`Invalid credits in session metadata: ${session.metadata?.credits}`);
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
    } catch (error) {
      console.error('Failed to process credit purchase:', error);
      throw error; // Re-throw for webhook retry
    }
  }

  /**
   * Handle charge refund - clawback credits from appropriate pool
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

    if (!profile) {
      console.error(`No profile found for customer ${customerId} for charge refund`);
      return;
    }

    const userId = profile.id;

    console.log(
      `[CHARGE_REFUND] Processing refund for charge ${charge.id}: ${refundAmount} cents for user ${userId}`
    );

    // Get the invoice to determine if this is subscription or credit pack refund
    const invoiceId = charge.invoice;

    try {
      if (invoiceId) {
        // Subscription refund - clawback using invoice reference
        const { data: result, error } = await supabaseAdmin.rpc('clawback_from_transaction_v2', {
          p_target_user_id: userId,
          p_original_ref_id: `invoice_${invoiceId}`,
          p_reason: `Charge refund: ${charge.id} (${refundAmount} cents)`,
        });

        if (error) {
          console.error(`[CHARGE_REFUND] Failed to clawback credits:`, error);
          throw error;
        }

        if (result && result.length > 0) {
          const clawbackResult = result[0];
          if (clawbackResult.success) {
            console.log(
              `[CHARGE_REFUND] Clawed back ${clawbackResult.credits_clawed_back} credits ` +
                `(sub: ${clawbackResult.subscription_clawed}, pur: ${clawbackResult.purchased_clawed}) ` +
                `New balances - sub: ${clawbackResult.new_subscription_balance}, pur: ${clawbackResult.new_purchased_balance}`
            );
          } else {
            console.error(`[CHARGE_REFUND] Clawback failed: ${clawbackResult.error_message}`);
          }
        }
      } else {
        // Credit pack refund (no invoice) - use payment intent
        const paymentIntentId = charge.payment_intent as string;

        if (!paymentIntentId) {
          console.warn(
            `[CHARGE_REFUND] Charge ${charge.id} has no invoice or payment_intent - cannot clawback`
          );
          return;
        }

        const { data: result, error } = await supabaseAdmin.rpc('clawback_purchased_credits', {
          p_target_user_id: userId,
          p_payment_intent_id: `pi_${paymentIntentId}`,
          p_reason: `Credit pack refund: ${charge.id} (${refundAmount} cents)`,
        });

        if (error) {
          console.error(`[CHARGE_REFUND] Failed to clawback purchased credits:`, error);
          throw error;
        }

        if (result && result.length > 0) {
          const clawbackResult = result[0];
          if (clawbackResult.success) {
            console.log(
              `[CHARGE_REFUND] Clawed back ${clawbackResult.credits_clawed_back} purchased credits. ` +
                `New purchased balance: ${clawbackResult.new_balance}`
            );
          } else {
            console.error(
              `[CHARGE_REFUND] Purchased credits clawback failed: ${clawbackResult.error_message}`
            );
          }
        }
      }
    } catch (error) {
      console.error(`[CHARGE_REFUND] Error during credit clawback:`, error);
      throw error;
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

    if (!profile) {
      console.error(`[INVOICE_REFUND] No profile found for customer ${customerId}`);
      return;
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
