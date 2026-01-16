import { stripe, STRIPE_WEBHOOK_SECRET } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv, isTest } from '@shared/config/env';
import {
  assertKnownPriceId,
  calculateBalanceWithExpiration,
  getPlanByPriceId,
  resolvePlanOrPack,
} from '@shared/config/subscription.utils';
import Stripe from 'stripe';

// Invoice line item interface for accessing runtime properties
interface IStripeInvoiceLineItemExtended {
  type?: string;
  proration?: boolean;
  amount?: number;
  price?: { id?: string } | string;
  plan?: { id?: string } | string;
}

export class InvoiceHandler {
  /**
   * Handle successful invoice payment (subscription renewal)
   */
  static async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const invoiceWithSub = invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
      billing_reason?: string | null;
      lines?: {
        data: Array<{
          price?: { id: string };
          plan?: { id: string };
          type?: string;
          proration?: boolean;
          amount?: number;
        }>;
      };
    };
    const subscriptionId =
      typeof invoiceWithSub.subscription === 'string'
        ? invoiceWithSub.subscription
        : invoiceWithSub.subscription?.id;

    if (!subscriptionId) {
      return; // Not a subscription invoice
    }

    // HIGH-7 FIX: Skip first invoice - credits already added by checkout.session.completed
    // This prevents double credit allocation when both checkout and first invoice fire
    const billingReason = invoiceWithSub.billing_reason;
    if (billingReason === 'subscription_create') {
      console.log(
        `[INVOICE_SKIP] Skipping first invoice ${invoice.id} (billing_reason: subscription_create) - ` +
          `credits already added by checkout.session.completed`
      );
      return;
    }

    const customerId = invoice.customer as string;

    // Get the user ID from the customer
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, subscription_credits_balance, purchased_credits_balance')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    // In test mode, handle unknown customers gracefully since stripe_customer_id mapping won't exist
    // In production, throw error so Stripe will retry
    if (!profile) {
      if (isTest()) {
        console.warn(
          `[WEBHOOK_TEST_MODE] No profile found for customer ${customerId} - skipping in test mode`,
          {
            invoiceId: invoice.id,
            subscriptionId,
            customerId,
            timestamp: new Date().toISOString(),
          }
        );
        return; // Return early in test mode - webhook returns 200
      }
      console.error(`[WEBHOOK_RETRY] No profile found for customer ${customerId}`, {
        invoiceId: invoice.id,
        subscriptionId,
        customerId,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Profile not found for customer ${customerId} - webhook will retry`);
    }

    const userId = profile.id;

    // Get the price ID from invoice lines to determine credit amount.
    // Prefer the subscription line item; if missing (proration invoice), choose the positive proration line
    // so upgrades map to the new plan instead of the previous one.
    // Cast to extended type to access runtime properties
    const lines = (invoiceWithSub.lines?.data ?? []) as IStripeInvoiceLineItemExtended[];

    const hasPriceId = (line: IStripeInvoiceLineItemExtended): boolean => {
      if (typeof line.price === 'object' && line.price?.id) return true;
      if (typeof line.price === 'string') return true;
      if (typeof line.plan === 'object' && line.plan?.id) return true;
      if (typeof line.plan === 'string') return true;
      return false;
    };

    const subscriptionLine = lines.find(line => line.type === 'subscription' && hasPriceId(line));
    const positiveProrationLine = lines.find(
      line => line.proration && (line.amount ?? 0) > 0 && hasPriceId(line)
    );
    const anyPricedLine = lines.find(hasPriceId);

    const getPriceId = (
      price?: { id?: string } | string,
      plan?: { id?: string } | string
    ): string => {
      if (typeof price === 'object' && price?.id) return price.id;
      if (typeof price === 'string') return price;
      if (typeof plan === 'object' && plan?.id) return plan.id;
      if (typeof plan === 'string') return plan;
      return '';
    };

    const priceId =
      getPriceId(subscriptionLine?.price, subscriptionLine?.plan) ||
      getPriceId(positiveProrationLine?.price, positiveProrationLine?.plan) ||
      getPriceId(anyPricedLine?.price, anyPricedLine?.plan) ||
      '';

    // Use unified resolver to get plan details
    let planMetadata;
    try {
      planMetadata = assertKnownPriceId(priceId);
      if (planMetadata.type !== 'plan') {
        throw new Error(`Price ID ${priceId} resolved to a credit pack, not a subscription plan`);
      }
    } catch (error) {
      console.error(`[WEBHOOK_ERROR] Unknown price ID in invoice payment: ${priceId}`, {
        error: error instanceof Error ? error.message : error,
        subscriptionId,
        timestamp: new Date().toISOString(),
      });
      // Throw the error so webhook fails and Stripe retries
      throw error;
    }

    // In test environment, use simplified logic
    const isTestMode =
      serverEnv.ENV === 'test' ||
      serverEnv.STRIPE_SECRET_KEY?.includes('test') ||
      !STRIPE_WEBHOOK_SECRET ||
      STRIPE_WEBHOOK_SECRET === 'whsec_test_YOUR_STRIPE_WEBHOOK_SECRET_HERE' ||
      STRIPE_WEBHOOK_SECRET === 'whsec_test_secret';

    if (!isTestMode) {
      // In production, fetch the full subscription to ensure we have latest status
      try {
        await stripe.subscriptions.retrieve(subscriptionId);
        // Defer to subscription handler for the update
        // This ensures consistency between invoice and subscription events
      } catch (error) {
        console.error('Failed to retrieve subscription from Stripe:', error);
      }
    }

    // Get plan details from unified resolver
    const planDetails = resolvePlanOrPack(priceId);
    if (!planDetails || planDetails.type !== 'plan') {
      const error = new Error(
        `Price ID ${priceId} did not resolve to a valid plan for invoice payment`
      );
      console.error(`[WEBHOOK_ERROR] Invalid plan resolution for invoice: ${priceId}`, {
        error: error.message,
        subscriptionId,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }

    const creditsToAdd = planDetails.creditsPerCycle!;
    // Calculate total balance from both pools
    const currentBalance =
      (profile.subscription_credits_balance ?? 0) + (profile.purchased_credits_balance ?? 0);
    const maxRollover = planDetails.maxRollover ?? creditsToAdd * 6; // Default 6x rollover

    // Calculate new balance considering expiration mode
    // Get expiration mode from plan config (defaults to 'never' for rollover)
    const planConfig = getPlanByPriceId(priceId);
    const expirationMode = planConfig?.creditsExpiration?.mode ?? 'never';
    const { newBalance, expiredAmount } = calculateBalanceWithExpiration({
      currentBalance,
      newCredits: creditsToAdd,
      expirationMode,
      maxRollover,
    });

    // If credits are expiring, call the expiration RPC first
    if (expiredAmount > 0) {
      console.log(`Expiring ${expiredAmount} credits for user ${userId} (mode: ${expirationMode})`);

      try {
        const { data: expiredCount, error: expireError } = await supabaseAdmin.rpc(
          'expire_subscription_credits',
          {
            target_user_id: userId,
            expiration_reason: expirationMode === 'end_of_cycle' ? 'cycle_end' : 'rolling_window',
            subscription_stripe_id: subscriptionId,
            cycle_end_date: invoice.period_end
              ? new Date(invoice.period_end * 1000).toISOString()
              : null,
          }
        );

        if (expireError) {
          console.error('Error expiring credits:', expireError);
          // Continue with credit allocation even if expiration fails
        } else {
          console.log(`Successfully expired ${expiredCount ?? 0} credits for user ${userId}`);
        }
      } catch (error) {
        console.error('Exception expiring credits:', error);
        // Continue with credit allocation
      }
    }

    // Now add the new subscription credits
    const actualCreditsToAdd = newBalance - (expiredAmount > 0 ? 0 : currentBalance);

    if (actualCreditsToAdd > 0) {
      // Build description based on expiration
      let description = `Monthly subscription renewal - ${planDetails.name} plan`;

      if (expiredAmount > 0) {
        description += ` (${expiredAmount} credits expired, ${actualCreditsToAdd} new credits added)`;
      } else if (actualCreditsToAdd < creditsToAdd) {
        description += ` (capped from ${creditsToAdd} due to rollover limit of ${maxRollover})`;
      }

      // MEDIUM-5: Use consistent invoice reference format for refund correlation
      const { error } = await supabaseAdmin.rpc('add_subscription_credits', {
        target_user_id: userId,
        amount: actualCreditsToAdd,
        ref_id: `invoice_${invoice.id}`,
        description,
      });

      if (error) {
        console.error('Error adding subscription credits:', error);
      } else {
        console.log(
          `Added ${actualCreditsToAdd} subscription credits to user ${userId} from ${planDetails.name} plan (balance: ${currentBalance} → ${newBalance}, mode: ${expirationMode})`
        );
      }
    } else if (expiredAmount === 0) {
      console.log(
        `Skipped adding credits for user ${userId}: already at max rollover (${currentBalance}/${maxRollover})`
      );
    }
  }

  /**
   * Handle failed invoice payment
   */
  static async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;

    // Get the user ID from the customer
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    // In test mode, handle unknown customers gracefully since stripe_customer_id mapping won't exist
    // In production, throw error so Stripe will retry
    if (!profile) {
      if (isTest()) {
        console.warn(
          `[WEBHOOK_TEST_MODE] No profile found for customer ${customerId} - skipping in test mode`,
          {
            invoiceId: invoice.id,
            customerId,
            timestamp: new Date().toISOString(),
          }
        );
        return; // Return early in test mode - webhook returns 200
      }
      console.error(`[WEBHOOK_RETRY] No profile found for customer ${customerId}`, {
        invoiceId: invoice.id,
        customerId,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Profile not found for customer ${customerId} - webhook will retry`);
    }

    const userId = profile.id;

    // Update profile to indicate payment issue
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        subscription_status: 'past_due',
      })
      .eq('id', userId);

    if (error) {
      console.error('Error updating profile for failed payment:', error);
    } else {
      console.log(`Marked user ${userId} subscription as past_due`);
    }
  }
}
