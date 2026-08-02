import { stripe, STRIPE_WEBHOOK_SECRET } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv, isTest } from '@shared/config/env';
import { trackServerEvent, trackRevenue } from '@server/analytics';
import { recordPaymentFailure, trackPaymentRecovered } from '@server/analytics/paymentRecovery';
import type { IPaymentFailedProperties } from '@server/analytics/types';
import {
  assertKnownPriceId,
  calculateBalanceWithExpiration,
  getPlanByKey,
  getPlanByPriceId,
  resolvePlanOrPack,
} from '@shared/config/subscription.utils';
import { getBasePriceIdByPlanKey } from '@shared/config/pricing-regions';
import Stripe from 'stripe';

/**
 * Track purchase_confirmed for an invoice payment.
 * Fire-and-forget — analytics failures must never block the webhook.
 * Stripe IDs are included for reconciliation if an event is dropped.
 */
function trackPurchaseConfirmed(params: {
  userId: string;
  planKey: string;
  amountCents: number;
  purchaseType: 'subscription_new' | 'subscription_renewal';
  currency: string;
  invoiceId: string;
  subscriptionId: string;
  priceId?: string;
  sourceObjectId?: string;
  lifecycleAction?: string;
}): void {
  const { userId, planKey, amountCents, purchaseType, currency } = params;
  const sourceObjectId = params.sourceObjectId || params.invoiceId;
  const lifecycleAction = params.lifecycleAction || purchaseType;
  trackServerEvent(
    'purchase_confirmed',
    {
      purchaseType: 'subscription',
      sessionId: params.invoiceId,
      invoiceId: params.invoiceId,
      pricingRegion: 'standard',
      planTier: planKey,
      amount: amountCents,
      amountCents,
      currency,
      source: purchaseType,
      stripeInvoiceId: params.invoiceId,
      stripeSubscriptionId: params.subscriptionId,
      sourceObjectId,
      ...(params.priceId ? { priceId: params.priceId } : {}),
    },
    {
      apiKey: serverEnv.AMPLITUDE_API_KEY,
      userId,
      sourceObjectId,
      lifecycleAction,
      deduplicate: true,
    }
  )
    .then(success => {
      if (!success) {
        console.error('[ANALYTICS] purchase_confirmed for invoice was not accepted:', {
          userId,
          invoiceId: params.invoiceId,
          subscriptionId: params.subscriptionId,
          purchaseType,
        });
      }
    })
    .catch(err =>
      console.error('[ANALYTICS] Failed to track purchase_confirmed for invoice:', {
        error: err,
        userId,
        invoiceId: params.invoiceId,
        subscriptionId: params.subscriptionId,
      })
    );
}

async function trackRevenueSafely(
  params: Parameters<typeof trackRevenue>[0],
  options: Parameters<typeof trackRevenue>[1]
): Promise<void> {
  try {
    const accepted = await trackRevenue(params, options);
    if (!accepted) {
      console.error('[ANALYTICS] Revenue event was not accepted', {
        sourceObjectId: params.sourceObjectId,
        amountCents: params.amountCents,
      });
    }
  } catch (error) {
    console.error('[ANALYTICS] Revenue event failed', {
      sourceObjectId: params.sourceObjectId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function trackAnalyticsSafely(
  eventName: Parameters<typeof trackServerEvent>[0],
  properties: Record<string, unknown>,
  options: Parameters<typeof trackServerEvent>[2]
): Promise<void> {
  try {
    const accepted = await trackServerEvent(eventName, properties, options);
    if (!accepted) {
      console.error('[ANALYTICS] Invoice event was not accepted', { eventName });
    }
  } catch (error) {
    console.error('[ANALYTICS] Invoice event failed', {
      eventName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function hasPositivePaidCharge(invoice: Stripe.Invoice): boolean {
  const invoiceState = invoice as Stripe.Invoice & {
    paid?: boolean | null;
    status?: string | null;
  };
  const amountCents = invoice.amount_paid ?? 0;
  if (!Number.isFinite(amountCents) || amountCents <= 0 || invoiceState.paid === false) {
    return false;
  }

  return !['draft', 'open', 'uncollectible', 'unpaid', 'void'].includes(invoiceState.status || '');
}

function getInvoiceCurrency(invoice: Stripe.Invoice): string | null {
  return typeof invoice.currency === 'string' && invoice.currency.trim()
    ? invoice.currency.toLowerCase()
    : null;
}

function getInvoicePaymentIntentId(invoice: Stripe.Invoice): string | null {
  const paymentIntent = (
    invoice as Stripe.Invoice & {
      payment_intent?: string | { id?: string } | null;
    }
  ).payment_intent;
  if (typeof paymentIntent === 'string') return paymentIntent;
  return paymentIntent && typeof paymentIntent.id === 'string' ? paymentIntent.id : null;
}

async function recordRetentionBillingEvent(params: {
  subscriptionId: string | undefined;
  sourceId: string;
  eventType: 'invoice_paid' | 'billing_error';
  amountCents?: number;
}): Promise<void> {
  if (!params.subscriptionId) return;
  try {
    const { data: cohort } = await supabaseAdmin
      .from('subscription_retention_events')
      .select('user_id, variant')
      .eq('subscription_id', params.subscriptionId)
      .in('event_type', ['offer_shown', 'holdout_assigned'])
      .limit(1)
      .maybeSingle();
    if (!cohort) return;
    const { error } = await supabaseAdmin.from('subscription_retention_events').upsert(
      {
        event_key: `${params.eventType}:${params.sourceId}`,
        subscription_id: params.subscriptionId,
        user_id: cohort.user_id,
        event_type: params.eventType,
        variant: cohort.variant,
        amount_cents: params.amountCents ?? 0,
      },
      { onConflict: 'event_key', ignoreDuplicates: true }
    );
    if (error) console.warn('[RETENTION_MEASUREMENT] Failed to record billing event', error);
  } catch (error) {
    console.warn('[RETENTION_MEASUREMENT] Failed to record billing event', error);
  }
}

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
    await recordRetentionBillingEvent({
      subscriptionId,
      sourceId: invoice.id,
      eventType: 'invoice_paid',
      amountCents: invoice.amount_paid || 0,
    });

    // Check if this is the first invoice for a new subscription
    // Previously we blindly skipped these, assuming checkout.session.completed already added credits.
    // But if checkout was rate-limited (429) or failed, credits were never allocated.
    // Now we check credit_transactions to decide: skip if credits exist, fallback-add if not.
    const billingReason = invoiceWithSub.billing_reason;
    const amountCents = invoice.amount_paid || 0;
    const currency = getInvoiceCurrency(invoice);
    const hasRecognizedCharge = hasPositivePaidCharge(invoice) && !!invoice.id && !!currency;
    // The invoice is the shared provider object for checkout.session.completed
    // and invoice.payment_succeeded. Keep it as the initial-charge identity so
    // both handlers converge on one dedupe key.
    const initialSourceObjectId = invoice.id;
    if (billingReason === 'subscription_create') {
      const refId = `invoice_${invoice.id}`;
      const { data: existingCredit } = await supabaseAdmin
        .from('credit_transactions')
        .select('id')
        .eq('reference_id', refId)
        .limit(1)
        .maybeSingle();

      if (existingCredit) {
        console.log(
          `[INVOICE_SKIP] Credits already added for invoice ${invoice.id} by checkout.session.completed`
        );
        // Still fire purchase_confirmed as a fallback — the checkout handler may have
        // skipped analytics if price resolution failed (see payment.handler.ts).
        // Fire-and-forget; never blocks the webhook.
        const { data: skipProfile } = await supabaseAdmin
          .from('profiles')
          .select('id, subscription_tier')
          .eq('stripe_customer_id', invoice.customer as string)
          .maybeSingle();
        if (skipProfile?.id && hasRecognizedCharge) {
          await trackPaymentRecovered({
            userId: skipProfile.id,
            candidateFailureObjectIds: [invoice.id, getInvoicePaymentIntentId(invoice)].filter(
              (value): value is string => Boolean(value)
            ),
            sourceObjectId: invoice.id,
            purchaseType: 'subscription',
            amountCents,
            currency: currency!,
            recoveryChannel: 'invoice_retry',
          });
          trackPurchaseConfirmed({
            userId: skipProfile.id,
            planKey: skipProfile.subscription_tier || '',
            amountCents,
            purchaseType: 'subscription_new',
            currency: currency!,
            invoiceId: invoice.id,
            subscriptionId,
            sourceObjectId: initialSourceObjectId,
            lifecycleAction: 'purchase_initial',
          });
          await trackRevenueSafely(
            {
              userId: skipProfile.id,
              amountCents,
              productId: `subscription_${skipProfile.subscription_tier || 'unknown'}_monthly`,
              purchaseType: 'subscription',
              currency: currency!,
              invoiceId: invoice.id,
              subscriptionId,
              sourceObjectId: initialSourceObjectId,
              lifecycleAction: 'purchase_initial',
            },
            {
              apiKey: serverEnv.AMPLITUDE_API_KEY,
              userId: skipProfile.id,
              sourceObjectId: initialSourceObjectId,
              lifecycleAction: 'purchase_initial',
              deduplicate: true,
            }
          );
        }
        return;
      }

      console.log(
        `[INVOICE_FALLBACK] No credits found for invoice ${invoice.id} - ` +
          `checkout.session.completed may have failed. Adding credits as fallback.`
      );
      // Fall through to normal credit addition logic
    }

    const customerId = invoice.customer as string;

    // Get the user ID from the customer
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, subscription_tier, subscription_credits_balance, purchased_credits_balance')
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

    if (hasRecognizedCharge) {
      await trackPaymentRecovered({
        userId,
        candidateFailureObjectIds: [invoice.id, getInvoicePaymentIntentId(invoice)].filter(
          (value): value is string => Boolean(value)
        ),
        sourceObjectId: invoice.id,
        purchaseType: 'subscription',
        amountCents,
        currency: currency!,
        recoveryChannel: 'invoice_retry',
      });
    }

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

    // Resolve base price ID: for price_data subscriptions Stripe generates a throwaway price ID,
    // so fall back to plan_key from subscription metadata.
    let basePriceId = priceId;
    const envPlanKey =
      (['starter', 'hobby', 'pro', 'business'] as const).find(
        candidate => getBasePriceIdByPlanKey(candidate) === priceId
      ) || '';
    const fallbackPlanKey = envPlanKey || profile.subscription_tier || '';

    if (fallbackPlanKey) {
      const planConfig = getPlanByKey(fallbackPlanKey);
      if (planConfig?.stripePriceId) {
        basePriceId = planConfig.stripePriceId;
      }
    }

    if (priceId) {
      try {
        assertKnownPriceId(priceId); // Known price ID — use as-is
      } catch {
        // Throwaway price ID from price_data — resolve via subscription metadata
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const subPlanKey = sub.metadata?.plan_key || fallbackPlanKey;
          if (subPlanKey) basePriceId = getBasePriceIdByPlanKey(subPlanKey) ?? priceId;
        } catch {
          // Leave basePriceId as priceId — assertKnownPriceId will throw below
        }
      }
    }

    // Use unified resolver to get plan details
    let planMetadata;
    try {
      planMetadata = assertKnownPriceId(basePriceId);
      if (planMetadata.type !== 'plan') {
        throw new Error(
          `Price ID ${basePriceId} resolved to a credit pack, not a subscription plan`
        );
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
    const planDetails = resolvePlanOrPack(basePriceId);
    if (!planDetails || planDetails.type !== 'plan') {
      const error = new Error(
        `Price ID ${basePriceId} did not resolve to a valid plan for invoice payment`
      );
      console.error(`[WEBHOOK_ERROR] Invalid plan resolution for invoice: ${basePriceId}`, {
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
    const planConfig = getPlanByPriceId(basePriceId);
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
          throw new Error(`Failed to expire subscription credits: ${expireError.message}`);
        } else {
          console.log(`Successfully expired ${expiredCount ?? 0} credits for user ${userId}`);
        }
      } catch (error) {
        console.error('Exception expiring credits:', error);
        throw error;
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
        throw new Error(
          `Failed to add subscription credits for invoice ${invoice.id}: ${error.message}`
        );
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

    // Track recurring analytics only for a paid, positive recurring charge. The first invoice
    // gets initial-charge fallback telemetry below, but is never classified as a renewal.
    if (billingReason === 'subscription_cycle' && hasRecognizedCharge) {
      await trackAnalyticsSafely(
        'subscription_renewed',
        {
          plan: planDetails.key,
          amountCents,
          currency: currency!,
          subscriptionId,
          invoiceId: invoice.id,
          creditsAdded: actualCreditsToAdd,
        },
        {
          apiKey: serverEnv.AMPLITUDE_API_KEY,
          userId,
          sourceObjectId: invoice.id,
          lifecycleAction: 'subscription_renewal',
          deduplicate: true,
        }
      );

      // purchase_confirmed for renewals — ensures every successful payment is captured
      trackPurchaseConfirmed({
        userId,
        planKey: planDetails.key,
        amountCents,
        purchaseType: 'subscription_renewal',
        currency: currency!,
        invoiceId: invoice.id,
        subscriptionId,
        priceId: basePriceId,
        sourceObjectId: invoice.id,
        lifecycleAction: 'subscription_renewal',
      });

      await trackRevenueSafely(
        {
          userId,
          amountCents,
          productId: `subscription_${planDetails.key}_monthly`,
          purchaseType: 'subscription',
          currency: currency!,
          invoiceId: invoice.id,
          subscriptionId,
          sourceObjectId: invoice.id,
          lifecycleAction: 'subscription_renewal',
        },
        {
          apiKey: serverEnv.AMPLITUDE_API_KEY,
          userId,
          sourceObjectId: invoice.id,
          lifecycleAction: 'subscription_renewal',
          deduplicate: true,
        }
      );
    } else if (billingReason === 'subscription_create' && hasRecognizedCharge) {
      // First invoice — fire purchase_confirmed as a fallback in case checkout handler
      // skipped analytics (e.g. price resolution failure).
      trackPurchaseConfirmed({
        userId,
        planKey: planDetails.key,
        amountCents,
        purchaseType: 'subscription_new',
        currency: currency!,
        invoiceId: invoice.id,
        subscriptionId,
        priceId: basePriceId,
        sourceObjectId: initialSourceObjectId,
        lifecycleAction: 'purchase_initial',
      });
      await trackRevenueSafely(
        {
          userId,
          amountCents,
          productId: `subscription_${planDetails.key}_monthly`,
          purchaseType: 'subscription',
          currency: currency!,
          invoiceId: invoice.id,
          subscriptionId,
          sourceObjectId: initialSourceObjectId,
          lifecycleAction: 'purchase_initial',
        },
        {
          apiKey: serverEnv.AMPLITUDE_API_KEY,
          userId,
          sourceObjectId: initialSourceObjectId,
          lifecycleAction: 'purchase_initial',
          deduplicate: true,
        }
      );
    }
  }

  /**
   * Handle failed invoice payment
   */
  static async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    const invoiceSubscription = (
      invoice as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
      }
    ).subscription;
    const subscriptionId =
      typeof invoiceSubscription === 'string' ? invoiceSubscription : invoiceSubscription?.id;
    await recordRetentionBillingEvent({
      subscriptionId,
      sourceId: invoice.id,
      eventType: 'billing_error',
    });

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

    await recordPaymentFailure({
      failureObjectId: invoice.id,
      userId,
      purchaseType: 'subscription',
      amountCents: invoice.amount_due || invoice.amount_remaining || 0,
      currency: (invoice.currency ?? 'usd').toLowerCase(),
      failureType: this.mapStripeErrorType(invoice.last_finalization_error?.code),
      recoveryChannel: 'invoice_retry',
    });

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

    // Track payment failure analytics (fire-and-forget — don't risk webhook retry on analytics failure)
    const lines = (invoice.lines?.data ?? []) as IStripeInvoiceLineItemExtended[];
    const linePrice = lines[0]?.price;
    const priceId =
      typeof linePrice === 'object' && linePrice?.id
        ? linePrice.id
        : typeof linePrice === 'string'
          ? linePrice
          : undefined;
    trackServerEvent(
      'payment_failed',
      {
        priceId,
        plan: priceId ? getPlanByPriceId(priceId)?.key || undefined : undefined,
        errorType: this.mapStripeErrorType(invoice.last_finalization_error?.code),
        errorMessage: this.sanitizeErrorMessage(invoice.last_finalization_error?.message),
        attemptCount: invoice.attempt_count || 1,
        customerId,
        sourceObjectId: invoice.id,
        amountCents: invoice.amount_due || invoice.amount_remaining || 0,
        currency: (invoice.currency ?? 'usd').toLowerCase(),
      },
      {
        apiKey: serverEnv.AMPLITUDE_API_KEY,
        userId,
        sourceObjectId: invoice.id,
        lifecycleAction: 'payment_failed',
        deduplicate: true,
      }
    ).catch(err => console.error('Failed to track payment_failed event', err));
  }

  /**
   * Map Stripe error codes to simplified error types
   */
  private static mapStripeErrorType(code?: string): IPaymentFailedProperties['errorType'] {
    if (!code) return 'generic';
    const lowerCode = code.toLowerCase();
    if (lowerCode.includes('card_declined') || lowerCode.includes('do_not_honor')) {
      return 'card_declined';
    }
    if (lowerCode.includes('insufficient_funds')) {
      return 'insufficient_funds';
    }
    if (lowerCode.includes('expired_card') || lowerCode.includes('card_expired')) {
      return 'expired_card';
    }
    return 'generic';
  }

  /**
   * Sanitize error message to remove sensitive data
   */
  private static sanitizeErrorMessage(message?: string): string {
    if (!message) return 'Unknown error';
    // Remove any potential card numbers or sensitive data
    return message
      .replace(/\d{13,16}/g, '[REDACTED]')
      .replace(/card_[a-zA-Z0-9]+/gi, '[CARD_ID]')
      .substring(0, 200); // Limit length
  }
}
