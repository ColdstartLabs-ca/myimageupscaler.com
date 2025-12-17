/**
 * Subscription Sync Service
 *
 * Shared helper functions for synchronizing subscription data between Stripe and Database.
 * Used by both webhook handlers and scheduled cron jobs.
 */

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { stripe } from '@server/stripe/config';
import { getPlanForPriceId } from '@shared/config/stripe';
import type Stripe from 'stripe';
import dayjs from 'dayjs';

/**
 * Sync subscription data from Stripe to database
 * Updates both subscriptions and profiles tables
 */
export async function syncSubscriptionFromStripe(
  userId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const priceId = subscription.items.data[0]?.price.id || '';
  const plan = getPlanForPriceId(priceId);

  if (!plan) {
    console.error(`Unknown price ID in subscription sync: ${priceId}`);
    throw new Error(`Unknown price ID: ${priceId}`);
  }

  // Access period timestamps
  // Note: Stripe types don't always expose these fields, but they exist at runtime
  const subscriptionWithPeriod = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
    canceled_at?: number | null;
  };
  const currentPeriodStart = subscriptionWithPeriod.current_period_start;
  const currentPeriodEnd = subscriptionWithPeriod.current_period_end;
  const canceledAt = subscriptionWithPeriod.canceled_at;

  // Validate required timestamp fields
  if (!currentPeriodStart || !currentPeriodEnd) {
    console.error('Missing required period timestamps in subscription:', {
      id: subscription.id,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
    });
    throw new Error('Missing required period timestamps');
  }

  // Validate that timestamps are valid numbers
  if (isNaN(currentPeriodStart) || isNaN(currentPeriodEnd)) {
    console.error('Invalid timestamp values in subscription:', {
      id: subscription.id,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
    });
    throw new Error('Invalid timestamp values');
  }

  // Convert Unix timestamps to ISO strings
  const currentPeriodStartISO = dayjs.unix(currentPeriodStart).toISOString();
  const currentPeriodEndISO = dayjs.unix(currentPeriodEnd).toISOString();
  const canceledAtISO = canceledAt ? dayjs.unix(canceledAt).toISOString() : null;

  // Upsert subscription data
  const { error: subError } = await supabaseAdmin.from('subscriptions').upsert({
    id: subscription.id,
    user_id: userId,
    status: subscription.status,
    price_id: priceId,
    current_period_start: currentPeriodStartISO,
    current_period_end: currentPeriodEndISO,
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: canceledAtISO,
  });

  if (subError) {
    console.error('Error upserting subscription:', subError);
    throw subError;
  }

  // Update profile subscription status
  // IMPORTANT: Use plan.key (e.g., 'pro') not plan.name (e.g., 'Professional')
  // This ensures getBatchLimit() can correctly look up the plan configuration
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      subscription_status: subscription.status,
      subscription_tier: plan.key,
    })
    .eq('id', userId);

  if (profileError) {
    console.error('Error updating profile subscription status:', profileError);
    throw profileError;
  }

  console.log(`Synced subscription for user ${userId}: ${plan.name} (${subscription.status})`);
}

/**
 * Mark subscription as canceled in database
 * Used when subscription is deleted or not found in Stripe
 */
export async function markSubscriptionCanceled(
  userId: string,
  subscriptionId: string
): Promise<void> {
  // Update subscription status
  const { error: subError } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: dayjs().toISOString(),
    })
    .eq('id', subscriptionId);

  if (subError) {
    console.error('Error updating canceled subscription:', subError);
    throw subError;
  }

  // Update profile
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      subscription_status: 'canceled',
    })
    .eq('id', userId);

  if (profileError) {
    console.error('Error updating profile subscription status:', profileError);
    throw profileError;
  }

  console.log(`Marked subscription ${subscriptionId} as canceled for user ${userId}`);
}

/**
 * Update subscription period from Stripe data
 * Used when period end has been extended (late webhook scenario)
 */
export async function updateSubscriptionPeriod(
  subscriptionId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const subscriptionWithPeriod = subscription as Stripe.Subscription & {
    current_period_start: number;
    current_period_end: number;
  };
  const currentPeriodStart = subscriptionWithPeriod.current_period_start;
  const currentPeriodEnd = subscriptionWithPeriod.current_period_end;

  const currentPeriodStartISO = dayjs.unix(currentPeriodStart).toISOString();
  const currentPeriodEndISO = dayjs.unix(currentPeriodEnd).toISOString();

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      current_period_start: currentPeriodStartISO,
      current_period_end: currentPeriodEndISO,
      status: subscription.status,
    })
    .eq('id', subscriptionId);

  if (error) {
    console.error('Error updating subscription period:', error);
    throw error;
  }

  console.log(
    `Updated subscription ${subscriptionId} period to ${currentPeriodEndISO} (status: ${subscription.status})`
  );
}

/**
 * Get user ID from Stripe customer ID
 */
export async function getUserIdFromCustomerId(customerId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  return profile?.id || null;
}

/**
 * Check if error is a Stripe "Not Found" error
 */
export function isStripeNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const stripeError = error as {
    type?: string;
    statusCode?: number;
    message?: string;
  };

  return (
    stripeError.type === 'StripeInvalidRequestError' &&
    (stripeError.statusCode === 404 || (stripeError.message?.includes('No such') ?? false))
  );
}

/**
 * Process a Stripe webhook event
 * Re-usable function for both webhook endpoint and recovery cron
 */
export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  console.log(`Processing Stripe event: ${event.type} (${event.id})`);

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const userId = await getUserIdFromCustomerId(customerId);

      if (!userId) {
        throw new Error(`No profile found for customer ${customerId}`);
      }

      await syncSubscriptionFromStripe(userId, subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const userId = await getUserIdFromCustomerId(customerId);

      if (!userId) {
        throw new Error(`No profile found for customer ${customerId}`);
      }

      await markSubscriptionCanceled(userId, subscription.id);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceWithSub = invoice as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
      };

      const subscriptionId =
        typeof invoiceWithSub.subscription === 'string'
          ? invoiceWithSub.subscription
          : invoiceWithSub.subscription?.id;

      if (subscriptionId) {
        // Fetch and sync the full subscription
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const customerId = subscription.customer as string;
        const userId = await getUserIdFromCustomerId(customerId);

        if (userId) {
          await syncSubscriptionFromStripe(userId, subscription);
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const userId = await getUserIdFromCustomerId(customerId);

      if (userId) {
        // Update profile to past_due status
        await supabaseAdmin
          .from('profiles')
          .update({ subscription_status: 'past_due' })
          .eq('id', userId);

        console.log(`Marked user ${userId} as past_due due to failed payment`);
      }
      break;
    }

    default:
      console.log(`Unhandled event type in sync service: ${event.type}`);
  }
}

/**
 * Create a new sync run record
 */
export async function createSyncRun(
  jobType: 'expiration_check' | 'webhook_recovery' | 'full_reconciliation'
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('sync_runs')
    .insert({ job_type: jobType })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating sync run:', error);
    throw error;
  }

  return data.id;
}

/**
 * Complete a sync run with results
 */
export async function completeSyncRun(
  syncRunId: string,
  results: {
    status: 'completed' | 'failed';
    recordsProcessed?: number;
    recordsFixed?: number;
    discrepanciesFound?: number;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('sync_runs')
    .update({
      status: results.status,
      completed_at: new Date().toISOString(),
      records_processed: results.recordsProcessed || 0,
      records_fixed: results.recordsFixed || 0,
      discrepancies_found: results.discrepanciesFound || 0,
      error_message: results.errorMessage,
      metadata: results.metadata,
    })
    .eq('id', syncRunId);

  if (error) {
    console.error('Error completing sync run:', error);
    throw error;
  }
}

/**
 * Small delay helper for rate limiting
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
