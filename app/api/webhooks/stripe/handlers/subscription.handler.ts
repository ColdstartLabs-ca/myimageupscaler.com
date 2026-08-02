import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { trackServerEvent } from '@server/analytics';
import { stripe } from '@server/stripe';
import { serverEnv } from '@shared/config/env';
import { getPlanForPriceId, resolvePlanOrPack, assertKnownPriceId } from '@shared/config/stripe';
import { getTrialConfig } from '@shared/config/subscription.config';
import { getPlanByKey } from '@shared/config/subscription.utils';
import { getBasePriceIdByPlanKey } from '@shared/config/pricing-regions';
import { SubscriptionCreditsService } from '@server/services/SubscriptionCredits';
import { getEmailService } from '@server/services/email.service';
import { isTest } from '@shared/config/env';
import Stripe from 'stripe';
import dayjs from 'dayjs';
import type { IAnalyticsEventName } from '@server/analytics/types';

// Stripe subscription interface for accessing fields not in the SDK types
type IStripeSubscriptionExtended = Stripe.Subscription & {
  current_period_start?: number;
  current_period_end?: number;
  canceled_at?: number | null | undefined;
  cancel_at?: number | null | undefined;
  cancellation_details?: {
    reason?: string | null;
    feedback?: string | null;
  } | null;
  latest_invoice?: string | Stripe.Invoice | null | undefined;
};

export type TSubscriptionWebhookLifecycleAction = 'created' | 'updated' | 'deleted';

export interface ISubscriptionWebhookOptions {
  eventType?:
    | 'customer.subscription.created'
    | 'customer.subscription.updated'
    | 'customer.subscription.deleted';
  lifecycleAction?: TSubscriptionWebhookLifecycleAction;
  previousPriceId?: string | null;
  previousCancelAtPeriodEnd?: boolean | null;
  previousStatus?: string | null;
}

interface IStoredSubscriptionLifecycleState {
  price_id?: string | null;
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  cancellation_reason?: string | null;
  current_period_end?: string | null;
  updated_at?: string | null;
}

type TCancellationReasonCategory =
  | 'too_expensive'
  | 'not_using'
  | 'quality'
  | 'technical_issue'
  | 'temporary_need'
  | 'payment_failure'
  | 'other'
  | 'unknown';

type TCancellationReasonSource = 'in_app' | 'stripe' | 'support' | 'unknown';

const ACCEPTED_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

function isAcceptedSubscriptionStatus(status: string): status is 'active' | 'trialing' {
  return ACCEPTED_SUBSCRIPTION_STATUSES.has(status);
}

function normalizeCancellationReason(reason: unknown): TCancellationReasonCategory {
  if (typeof reason !== 'string' || !reason.trim()) return 'unknown';

  const normalized = reason
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (['too_expensive', 'price_too_high', 'cost'].includes(normalized)) {
    return 'too_expensive';
  }
  if (
    ['not_using', 'not_using_enough', 'not_using_it', 'unused', 'not_needed'].includes(normalized)
  ) {
    return 'not_using';
  }
  if (
    ['quality', 'poor_quality', 'missing_features', 'switching_competitor'].includes(normalized)
  ) {
    return 'quality';
  }
  if (['technical_issue', 'technical_issues', 'technical_problem'].includes(normalized)) {
    return 'technical_issue';
  }
  if (['temporary_need', 'temporary', 'only_needed_temporarily'].includes(normalized)) {
    return 'temporary_need';
  }
  if (
    ['payment_failure', 'payment_failed', 'billing_issue', 'payment_method'].includes(normalized)
  ) {
    return 'payment_failure';
  }
  if (normalized === 'other') return 'other';
  return 'unknown';
}

function getCancellationReason(
  subscription: Stripe.Subscription,
  storedSubscription: IStoredSubscriptionLifecycleState | null | undefined
): { category: TCancellationReasonCategory; source: TCancellationReasonSource } {
  const appReason = storedSubscription?.cancellation_reason;
  if (typeof appReason === 'string' && appReason.trim()) {
    return { category: normalizeCancellationReason(appReason), source: 'in_app' };
  }

  const cancellationDetails = (subscription as IStripeSubscriptionExtended).cancellation_details;
  const stripeReason = cancellationDetails?.reason || cancellationDetails?.feedback;
  if (stripeReason) {
    return { category: normalizeCancellationReason(stripeReason), source: 'stripe' };
  }

  return { category: 'unknown', source: 'unknown' };
}

function isoFromUnixTimestamp(timestamp: unknown): string | null {
  return typeof timestamp === 'number' && Number.isFinite(timestamp)
    ? dayjs.unix(timestamp).toISOString()
    : null;
}

function resolveCancellationEffectiveAt(
  subscription: Stripe.Subscription,
  storedSubscription: IStoredSubscriptionLifecycleState | null | undefined
): string {
  const extended = subscription as IStripeSubscriptionExtended;
  return (
    isoFromUnixTimestamp(extended.cancel_at) ||
    isoFromUnixTimestamp(extended.canceled_at) ||
    isoFromUnixTimestamp(extended.current_period_end) ||
    (typeof storedSubscription?.current_period_end === 'string'
      ? storedSubscription.current_period_end
      : null) ||
    dayjs().toISOString()
  );
}

async function trackAnalyticsSafely(
  eventName: IAnalyticsEventName,
  properties: Record<string, unknown>,
  options: Parameters<typeof trackServerEvent>[2]
): Promise<void> {
  try {
    const accepted = await trackServerEvent(eventName, properties, options);
    if (!accepted) {
      console.error('[ANALYTICS] Billing event was not accepted', { eventName, properties });
    }
  } catch (error) {
    console.error('[ANALYTICS] Billing event failed', {
      eventName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function isSchemaMissingError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;

  return (
    error.code === 'PGRST204' ||
    (typeof error.message === 'string' &&
      (error.message.includes('schema cache') || error.message.toLowerCase().includes('column')))
  );
}

function extractLatestInvoiceId(subscription: Stripe.Subscription): string | null {
  const latestInvoice = (subscription as IStripeSubscriptionExtended).latest_invoice;
  if (typeof latestInvoice === 'string') {
    return latestInvoice;
  }
  if (latestInvoice && typeof latestInvoice === 'object' && 'id' in latestInvoice) {
    return typeof latestInvoice.id === 'string' ? latestInvoice.id : null;
  }
  return null;
}

export class SubscriptionHandler {
  /**
   * Handle customer creation
   */
  static async handleCustomerCreated(customer: Stripe.Customer): Promise<void> {
    console.log(`Customer created: ${customer.id}`);

    // If customer has metadata with user_id, update the profile with stripe_customer_id
    const userId = customer.metadata?.user_id || customer.metadata?.supabase_user_id;

    if (userId) {
      try {
        const { error } = await supabaseAdmin
          .from('profiles')
          .update({
            stripe_customer_id: customer.id,
          })
          .eq('id', userId);

        if (error) {
          console.error(`Error updating profile ${userId} with customer ID ${customer.id}:`, error);
          throw new Error(
            `Failed to persist Stripe customer ${customer.id} for profile ${userId}: ${error.message}`
          );
        } else {
          console.log(`Updated profile ${userId} with Stripe customer ID ${customer.id}`);
        }
      } catch (error) {
        console.error(`Exception updating profile for customer ${customer.id}:`, error);
        throw error;
      }
    } else {
      console.log(
        `Customer ${customer.id} created without user_id metadata - this is expected for Stripe Checkout customers`
      );
    }
  }

  /**
   * Handle subscription creation/update
   */
  static async handleSubscriptionUpdate(
    subscription: Stripe.Subscription,
    options: ISubscriptionWebhookOptions = {}
  ): Promise<void> {
    const customerId = subscription.customer as string;
    const lifecycleAction =
      options.lifecycleAction ||
      (options.eventType === 'customer.subscription.created' ? 'created' : 'updated');

    console.log('[WEBHOOK_SUBSCRIPTION_UPDATE_START]', {
      subscriptionId: subscription.id,
      customerId,
      status: subscription.status,
      optionsPreviousPriceId: options?.previousPriceId,
      lifecycleAction,
      timestamp: new Date().toISOString(),
    });

    // Get the user ID from the customer and current subscription details
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select(
        'id, subscription_status, subscription_tier, subscription_credits_balance, purchased_credits_balance'
      )
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    // In test mode, handle unknown customers gracefully since stripe_customer_id mapping won't exist
    // In production, throw error so Stripe will retry
    if (!profile) {
      if (isTest()) {
        console.warn(
          `[WEBHOOK_TEST_MODE] No profile found for customer ${customerId} - skipping in test mode`,
          {
            subscriptionId: subscription.id,
            customerId,
            status: subscription.status,
            timestamp: new Date().toISOString(),
          }
        );
        return; // Return early in test mode - webhook returns 200
      }
      console.error(`[WEBHOOK_RETRY] No profile found for customer ${customerId}`, {
        subscriptionId: subscription.id,
        customerId,
        status: subscription.status,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Profile not found for customer ${customerId} - webhook will retry`);
    }

    const userId = profile.id;
    const previousStatus = profile.subscription_status;

    // Get the user's previous subscription to detect plan changes
    // IMPORTANT: Prefer options.previousPriceId from Stripe's previous_attributes over DB value
    // because the /api/subscription/change route updates the DB BEFORE the webhook fires,
    // making the DB value stale (it already has the NEW price_id)
    const { data: existingSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select(
        'price_id, status, cancel_at_period_end, cancellation_reason, current_period_end, updated_at'
      )
      .eq('id', subscription.id)
      .maybeSingle();

    // Prefer Stripe's previous_attributes (accurate) over DB (may be stale after plan change)
    const previousPriceId = options.previousPriceId || existingSubscription?.price_id || null;
    const previousCancelAtPeriodEnd =
      options.previousCancelAtPeriodEnd ?? existingSubscription?.cancel_at_period_end ?? null;

    // RACE CONDITION LOGGING: Detect when DB price_id differs from Stripe's previous_attributes
    // This indicates the /api/subscription/change route updated the DB before the webhook fired
    if (options?.previousPriceId && existingSubscription?.price_id !== options.previousPriceId) {
      console.warn('[WEBHOOK_RACE] DB price_id differs from Stripe previous_attributes', {
        userId: profile.id,
        subscriptionId: subscription.id,
        dbPriceId: existingSubscription?.price_id,
        stripePreviousPriceId: options.previousPriceId,
        currentPriceId: subscription.items.data[0]?.price.id,
        dbUpdatedAt: existingSubscription?.updated_at,
        timestamp: new Date().toISOString(),
        note: 'Using Stripe previous_attributes for accurate plan change detection',
      });
    }

    // Prefer the subscription item's current Stripe price over metadata. Route-driven
    // plan changes can leave subscription.metadata.plan_key stale for a short time,
    // and trusting that stale metadata rolls the user back to the old tier.
    const rawPriceId = subscription.items.data[0]?.price.id || '';
    const metadataPlanKey = subscription.metadata?.plan_key || '';
    const fallbackPlanKey = profile.subscription_tier || '';

    let basePriceId = rawPriceId;
    let planMetadata = null as ReturnType<typeof resolvePlanOrPack>;
    let resolvedPlanKey = '';

    const rawPlanMetadata = rawPriceId ? resolvePlanOrPack(rawPriceId) : null;
    if (rawPlanMetadata?.type === 'plan') {
      resolvedPlanKey = rawPlanMetadata.key;
      basePriceId = getBasePriceIdByPlanKey(rawPlanMetadata.key) ?? rawPriceId;
      planMetadata = rawPlanMetadata;

      if (metadataPlanKey && metadataPlanKey !== rawPlanMetadata.key) {
        console.warn('[WEBHOOK_STALE_PLAN_METADATA]', {
          subscriptionId: subscription.id,
          customerId,
          rawPriceId,
          rawPlanKey: rawPlanMetadata.key,
          metadataPlanKey,
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (!planMetadata) {
      const envPlanKey =
        (['starter', 'hobby', 'pro', 'business'] as const).find(
          candidate => getBasePriceIdByPlanKey(candidate) === rawPriceId
        ) || '';
      resolvedPlanKey = metadataPlanKey || envPlanKey || fallbackPlanKey;

      if (resolvedPlanKey) {
        const planConfig = getPlanByKey(resolvedPlanKey);
        if (planConfig) {
          basePriceId =
            getBasePriceIdByPlanKey(resolvedPlanKey) ?? planConfig.stripePriceId ?? rawPriceId;
          planMetadata = {
            type: 'plan',
            key: planConfig.key,
            name: planConfig.name,
            creditsPerCycle: planConfig.creditsPerCycle,
            maxRollover:
              planConfig.maxRollover ?? planConfig.creditsPerCycle * planConfig.rolloverMultiplier,
          };
        }
      }
    }

    // Use unified resolver - this will throw if price ID is unknown, causing webhook to fail loudly
    // This ensures Stripe will retry instead of silently dropping the event
    let resolvedPlan;
    if (!planMetadata) {
      try {
        resolvedPlan = assertKnownPriceId(basePriceId);
        if (resolvedPlan.type !== 'plan') {
          throw new Error(
            `Price ID ${rawPriceId} resolved to a credit pack, not a subscription plan`
          );
        }
        planMetadata = resolvePlanOrPack(basePriceId);
      } catch (error) {
        console.error(`[WEBHOOK_ERROR] Unknown price ID in subscription update: ${rawPriceId}`, {
          error: error instanceof Error ? error.message : error,
          subscriptionId: subscription.id,
          customerId,
          resolvedPlanKey,
          timestamp: new Date().toISOString(),
        });
        // Throw the error so webhook fails and Stripe retries
        throw error;
      }
    }

    // Get trial configuration and unified plan data (use basePriceId for all plan lookups)
    const trialConfig = getTrialConfig(basePriceId);

    if (!planMetadata || planMetadata.type !== 'plan') {
      const error = new Error(`Price ID ${rawPriceId} did not resolve to a valid plan`);
      console.error(`[WEBHOOK_ERROR] Invalid plan resolution: ${rawPriceId}`, {
        error: error.message,
        subscriptionId: subscription.id,
        customerId,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }

    let latestInvoiceId = extractLatestInvoiceId(subscription);

    // Access period timestamps - these are standard Stripe subscription fields (Unix timestamps in seconds)
    let currentPeriodStart = (subscription as IStripeSubscriptionExtended).current_period_start as
      | number
      | undefined;
    let currentPeriodEnd = (subscription as IStripeSubscriptionExtended).current_period_end as
      | number
      | undefined;
    const trialEnd = (subscription as IStripeSubscriptionExtended).trial_end as
      | number
      | null
      | undefined;
    const canceledAt = (subscription as IStripeSubscriptionExtended).canceled_at as
      | number
      | null
      | undefined;

    // If period timestamps are missing, fetch fresh subscription data from Stripe
    if (!currentPeriodStart || !currentPeriodEnd) {
      console.warn('Period timestamps missing from webhook, fetching fresh subscription data...');
      try {
        const freshSubscription = await stripe.subscriptions.retrieve(subscription.id);
        // Access the subscription data
        latestInvoiceId = latestInvoiceId ?? extractLatestInvoiceId(freshSubscription);
        currentPeriodStart = (freshSubscription as IStripeSubscriptionExtended)
          .current_period_start;
        currentPeriodEnd = (freshSubscription as IStripeSubscriptionExtended).current_period_end;
        console.log('Fetched fresh subscription data:', {
          id: subscription.id,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
        });
      } catch (fetchError) {
        console.error('Failed to fetch subscription from Stripe:', fetchError);
      }
    }

    // If still missing, use fallback values (common in test mode)
    // Use dayjs to calculate reasonable defaults
    if (!currentPeriodStart || !currentPeriodEnd) {
      console.warn('Using fallback period timestamps for subscription:', subscription.id);
      const now = dayjs();
      currentPeriodStart = now.unix();
      currentPeriodEnd = now.add(30, 'day').unix();
    }

    // Validate that timestamps are valid numbers
    if (isNaN(currentPeriodStart) || isNaN(currentPeriodEnd)) {
      console.error('Invalid timestamp values in subscription:', {
        id: subscription.id,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
      });
      return;
    }

    // Convert Unix timestamps to ISO strings using dayjs
    const currentPeriodStartISO = dayjs.unix(currentPeriodStart).toISOString();
    const currentPeriodEndISO = dayjs.unix(currentPeriodEnd).toISOString();
    const trialEndISO = trialEnd ? dayjs.unix(trialEnd).toISOString() : null;
    const canceledAtISO = canceledAt ? dayjs.unix(canceledAt).toISOString() : null;

    // Store trial end date in subscriptions table
    const subscriptionUpsertPayload = {
      id: subscription.id,
      user_id: userId,
      status: subscription.status,
      price_id: basePriceId,
      current_period_start: currentPeriodStartISO,
      current_period_end: currentPeriodEndISO,
      trial_end: trialEndISO,
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: canceledAtISO,
    };

    const { error: subError } = await supabaseAdmin
      .from('subscriptions')
      .upsert(subscriptionUpsertPayload);

    if (subError) {
      console.error('Error upserting subscription:', subError);

      if (isSchemaMissingError(subError)) {
        const minimalPayload = {
          id: subscription.id,
          user_id: userId,
          status: subscription.status,
          price_id: basePriceId,
          current_period_start: currentPeriodStartISO,
          current_period_end: currentPeriodEndISO,
          cancel_at_period_end: subscription.cancel_at_period_end,
        };

        const { error: fallbackError } = await supabaseAdmin
          .from('subscriptions')
          .upsert(minimalPayload);

        if (fallbackError) {
          console.error('Fallback subscription upsert failed:', fallbackError);
          throw new Error(
            `Failed to upsert subscription ${subscription.id}: ${fallbackError.message}`
          );
        } else {
          console.log('Fallback subscription upsert succeeded without optional columns.');
        }
      } else {
        throw new Error(`Failed to upsert subscription ${subscription.id}: ${subError.message}`);
      }
    }

    const isNewActiveSubscription =
      !existingSubscription && subscription.status === 'active' && previousStatus !== 'trialing';

    if (isNewActiveSubscription && latestInvoiceId) {
      const initialCreditRefId = `invoice_${latestInvoiceId}`;

      const { data: existingInitialCredit } = await supabaseAdmin
        .from('credit_transactions')
        .select('id')
        .eq('reference_id', initialCreditRefId)
        .limit(1)
        .maybeSingle();

      if (existingInitialCredit) {
        console.log(
          `[SUBSCRIPTION_INITIAL_CREDITS_SKIP] Credits already exist for ${initialCreditRefId}`
        );
      } else {
        const { error } = await supabaseAdmin.rpc('add_subscription_credits', {
          target_user_id: userId,
          amount: planMetadata.creditsPerCycle!,
          ref_id: initialCreditRefId,
          description: `Initial subscription credits fallback - ${planMetadata.name} plan - ${planMetadata.creditsPerCycle} credits`,
        });

        if (error) {
          console.error('[SUBSCRIPTION_INITIAL_CREDITS_ERROR]', {
            userId,
            subscriptionId: subscription.id,
            refId: initialCreditRefId,
            error,
          });
          throw new Error(
            `Failed to add initial subscription credits for ${subscription.id}: ${error.message}`
          );
        } else {
          console.log(
            `[SUBSCRIPTION_INITIAL_CREDITS_ADDED] Added ${planMetadata.creditsPerCycle} credits to user ${userId} for ${planMetadata.name} plan`
          );
        }
      }
    }

    // Handle trial start - allocate trial-specific credits
    if (subscription.status === 'trialing' && previousStatus !== 'trialing') {
      console.log(`Trial started for user ${userId}`);

      if (trialConfig && trialConfig.enabled) {
        // Determine how many credits to allocate for trial
        const trialCredits = trialConfig.trialCredits ?? planMetadata.creditsPerCycle!;

        const { error } = await supabaseAdmin.rpc('add_subscription_credits', {
          target_user_id: userId,
          amount: trialCredits,
          ref_id: subscription.id,
          description: `Trial credits - ${planMetadata.name} plan - ${trialCredits} credits`,
        });

        if (error) {
          console.error('Error adding trial credits:', error);
          throw new Error(
            `Failed to add trial credits for subscription ${subscription.id}: ${error.message}`
          );
        } else {
          console.log(
            `Added ${trialCredits} trial credits to user ${userId} for ${planMetadata.name} plan`
          );
        }
      }
    }

    // Handle trial conversion to active subscription
    if (subscription.status === 'active' && previousStatus === 'trialing') {
      console.log(`Trial converted to paid for user ${userId}`);

      if (trialConfig && trialConfig.enabled && trialConfig.trialCredits !== null) {
        // Trial had different credits, adjust balance
        const fullCredits = planMetadata.creditsPerCycle!;
        const currentBalance =
          (profile.subscription_credits_balance ?? 0) + (profile.purchased_credits_balance ?? 0);

        // Calculate credits to add (full cycle minus what's already available from trial)
        const creditsToAdd = Math.max(0, fullCredits - currentBalance);

        if (creditsToAdd > 0) {
          const { error } = await supabaseAdmin.rpc('add_subscription_credits', {
            target_user_id: userId,
            amount: creditsToAdd,
            ref_id: subscription.id,
            description: `Trial conversion - ${planMetadata.name} plan - ${creditsToAdd} additional credits`,
          });

          if (error) {
            console.error('Error adjusting credits after trial:', error);
            throw new Error(
              `Failed to adjust trial conversion credits for ${subscription.id}: ${error.message}`
            );
          } else {
            console.log(`Added ${creditsToAdd} credits to user ${userId} after trial conversion`);
          }
        }
      }
    }

    // Handle plan changes (upgrade/downgrade)
    // Only process if this is an existing subscription being updated (not a new creation)
    const effectivePreviousPriceId = previousPriceId;

    // Debug logging for plan change detection
    console.log('[WEBHOOK_PLAN_CHANGE_DETECTION]', {
      subscriptionId: subscription.id,
      userId,
      currentPriceId: basePriceId,
      rawPriceId,
      previousPriceId: effectivePreviousPriceId,
      optionsPreviousPriceId: options?.previousPriceId,
      existingSubscriptionPriceId: existingSubscription?.price_id,
      subscriptionStatus: subscription.status,
      isPlanChange: effectivePreviousPriceId && effectivePreviousPriceId !== basePriceId,
      currentCreditsBalance:
        (profile.subscription_credits_balance ?? 0) + (profile.purchased_credits_balance ?? 0),
    });

    if (
      effectivePreviousPriceId &&
      effectivePreviousPriceId !== basePriceId &&
      subscription.status === 'active' &&
      lifecycleAction === 'updated'
    ) {
      // Resolve previous plan using unified resolver
      let previousPlanMetadata = null;
      try {
        if (effectivePreviousPriceId) {
          const resolved = assertKnownPriceId(effectivePreviousPriceId);
          if (resolved.type !== 'plan') {
            throw new Error(
              `Previous price ID ${effectivePreviousPriceId} is not a subscription plan`
            );
          }
          previousPlanMetadata = resolvePlanOrPack(effectivePreviousPriceId);
        }
      } catch (error) {
        console.error(
          `[WEBHOOK_ERROR] Failed to resolve previous price ID: ${effectivePreviousPriceId}`,
          {
            error: error instanceof Error ? error.message : error,
            subscriptionId: subscription.id,
            customerId,
          }
        );
        // Continue without previous plan data - better than failing the whole webhook
      }

      if (previousPlanMetadata && previousPlanMetadata.type === 'plan') {
        const previousCredits = previousPlanMetadata.creditsPerCycle!;
        const newCredits = planMetadata.creditsPerCycle!;
        const creditDifference = newCredits - previousCredits;

        console.log('[WEBHOOK_PLAN_CHANGE_CONFIRMED]', {
          userId,
          subscriptionId: subscription.id,
          previousPlan: previousPlanMetadata.name,
          previousCredits,
          newPlan: planMetadata.name,
          newCredits,
          creditDifference,
          changeType:
            creditDifference > 0 ? 'upgrade' : creditDifference < 0 ? 'downgrade' : 'same',
          currentBalance:
            (profile.subscription_credits_balance ?? 0) + (profile.purchased_credits_balance ?? 0),
        });

        // Only add credits for upgrades (positive difference)
        // For downgrades, user keeps existing credits until next renewal
        if (creditDifference > 0) {
          const currentBalance =
            (profile.subscription_credits_balance ?? 0) + (profile.purchased_credits_balance ?? 0);
          const creditRefId = SubscriptionCreditsService.buildPlanChangeCreditRefId({
            subscriptionId: subscription.id,
            previousPriceId: effectivePreviousPriceId,
            newPriceId: basePriceId,
            periodStart: currentPeriodStartISO,
          });

          // Use SubscriptionCreditsService for consistent credit calculation
          const calculation = SubscriptionCreditsService.calculateUpgradeCredits({
            currentBalance,
            previousTierCredits: previousCredits,
            newTierCredits: newCredits,
          });

          const explanation = SubscriptionCreditsService.getExplanation(calculation, {
            currentBalance,
            previousTierCredits: previousCredits,
            newTierCredits: newCredits,
          });

          console.log('[WEBHOOK_CREDITS_UPGRADE_START]', {
            userId,
            currentBalance,
            previousTierCredits: previousCredits,
            newTierCredits: newCredits,
            tierDifference: creditDifference,
            creditsToAdd: calculation.creditsToAdd,
            reason: calculation.reason,
            isLegitimate: calculation.isLegitimate,
            explanation,
          });

          if (calculation.creditsToAdd > 0) {
            const { data: existingUpgradeCredit } = await supabaseAdmin
              .from('credit_transactions')
              .select('id')
              .eq('reference_id', creditRefId)
              .limit(1)
              .maybeSingle();

            if (existingUpgradeCredit) {
              console.log('[WEBHOOK_CREDITS_UPGRADE_SKIP]', {
                userId,
                subscriptionId: subscription.id,
                creditRefId,
                reason: 'Credits already applied for this plan change',
              });
            } else {
              const { error } = await supabaseAdmin.rpc('add_subscription_credits', {
                target_user_id: userId,
                amount: calculation.creditsToAdd,
                ref_id: creditRefId,
                description: `Plan upgrade - ${previousPlanMetadata.name} → ${planMetadata.name} - ${calculation.creditsToAdd} credits (tier difference)`,
              });

              if (error) {
                console.error('[WEBHOOK_CREDITS_UPGRADE_ERROR]', {
                  userId,
                  error,
                  creditsToAdd: calculation.creditsToAdd,
                  creditRefId,
                });
                throw new Error(
                  `Failed to add upgrade credits for ${subscription.id}: ${error.message}`
                );
              } else {
                console.log('[WEBHOOK_CREDITS_UPGRADE_SUCCESS]', {
                  userId,
                  creditsAdded: calculation.creditsToAdd,
                  previousBalance: currentBalance,
                  newBalance: currentBalance + calculation.creditsToAdd,
                  creditRefId,
                });
              }
            }
          } else {
            console.log('[WEBHOOK_CREDITS_UPGRADE_BLOCKED]', {
              userId,
              currentBalance,
              reason: calculation.reason,
              explanation,
            });
          }
        } else if (creditDifference < 0) {
          console.log('[WEBHOOK_CREDITS_DOWNGRADE]', {
            userId,
            message: 'User keeps existing credits. Next renewal will provide new tier credits.',
            currentBalance:
              (profile.subscription_credits_balance ?? 0) +
              (profile.purchased_credits_balance ?? 0),
            nextRenewalCredits: newCredits,
          });
        } else {
          console.log('[WEBHOOK_CREDITS_NO_CHANGE]', {
            userId,
            message: 'Same credit amount - no adjustment needed',
            credits: newCredits,
          });
        }

        // Send plan change email notification
        try {
          const { data: profileWithEmail } = await supabaseAdmin
            .from('profiles')
            .select('email')
            .eq('id', userId)
            .single();

          if (profileWithEmail?.email) {
            const emailService = getEmailService();
            await emailService.send({
              to: profileWithEmail.email,
              template: 'subscription-update',
              data: {
                userName: profileWithEmail.email.split('@')[0] || 'there',
                status: creditDifference > 0 ? 'upgraded' : 'changed',
                action: `Your plan has been ${creditDifference > 0 ? 'upgraded' : 'changed'} from ${previousPlanMetadata.name} to ${planMetadata.name}`,
                newPlan: planMetadata.name,
                previousPlan: previousPlanMetadata.name,
              },
              userId,
            });
          }
        } catch (emailError) {
          // Log but don't fail the webhook
          console.error('Failed to send plan change email:', emailError);
        }
      }
    }

    // Update profile subscription status
    // IMPORTANT: Use plan key (e.g., 'pro') not display name (e.g., 'Professional')
    // This ensures getBatchLimit() and other tier-based logic works correctly
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        subscription_status: subscription.status,
        subscription_tier: planMetadata.key,
      })
      .eq('id', userId);

    if (profileError) {
      console.error('[WEBHOOK_PROFILE_UPDATE_ERROR]', {
        userId,
        error: profileError,
      });
      throw new Error(`Failed to update profile subscription state: ${profileError.message}`);
    } else {
      console.log('[WEBHOOK_SUBSCRIPTION_UPDATE_COMPLETE]', {
        userId,
        subscriptionId: subscription.id,
        plan: planMetadata.name,
        status: subscription.status,
        timestamp: new Date().toISOString(),
      });

      const isAcceptedStatus = isAcceptedSubscriptionStatus(subscription.status);
      const becameActiveFromIncomplete =
        lifecycleAction === 'updated' &&
        isAcceptedStatus &&
        (existingSubscription?.status === 'incomplete' ||
          previousStatus === 'incomplete' ||
          options.previousStatus === 'incomplete');
      const shouldEmitCreated =
        isAcceptedStatus && (lifecycleAction === 'created' || becameActiveFromIncomplete);

      // Creation semantics come from Stripe's lifecycle action, not from whether another
      // webhook (usually checkout.session.completed) inserted the database row first.
      if (shouldEmitCreated) {
        await trackAnalyticsSafely(
          'subscription_created',
          {
            plan: planMetadata.key,
            amountCents: subscription.items.data[0]?.price.unit_amount || 0,
            currency: (subscription.currency ?? 'usd').toLowerCase(),
            billingInterval: subscription.items.data[0]?.price.recurring?.interval || 'month',
            status: subscription.status,
            subscriptionId: subscription.id,
          },
          {
            apiKey: serverEnv.AMPLITUDE_API_KEY,
            userId,
            sourceObjectId: subscription.id,
            lifecycleAction: 'subscription_created',
            deduplicate: true,
          }
        );
      } else if (isAcceptedStatus && lifecycleAction === 'updated') {
        await trackAnalyticsSafely(
          'subscription_updated',
          {
            plan: planMetadata.key,
            amountCents: subscription.items.data[0]?.price.unit_amount || 0,
            currency: (subscription.currency ?? 'usd').toLowerCase(),
            billingInterval: subscription.items.data[0]?.price.recurring?.interval || 'month',
            status: subscription.status,
            subscriptionId: subscription.id,
          },
          { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
        );

        const isPlanChange = Boolean(
          effectivePreviousPriceId && effectivePreviousPriceId !== basePriceId
        );
        const planChangeAmountCents = subscription.items.data[0]?.price.unit_amount || 0;

        // Keep the subscription-change purchase signal for the legacy plan-change funnel. The
        // invoice webhook remains the authoritative paid-revenue source and deduplication keeps
        // retries from producing a second event for the same subscription transition.
        if (isPlanChange && planChangeAmountCents > 0) {
          void trackAnalyticsSafely(
            'purchase_confirmed',
            {
              purchaseType: 'subscription',
              sessionId: subscription.id,
              pricingRegion: 'standard',
              planTier: planMetadata.key,
              amount: planChangeAmountCents,
              amountCents: planChangeAmountCents,
              currency: (subscription.currency ?? 'usd').toLowerCase(),
              source: 'subscription_plan_change',
              stripeSubscriptionId: subscription.id,
              ...(latestInvoiceId ? { stripeInvoiceId: latestInvoiceId } : {}),
              priceId: basePriceId,
            },
            {
              apiKey: serverEnv.AMPLITUDE_API_KEY,
              userId,
              sourceObjectId: subscription.id,
              lifecycleAction: 'subscription_plan_change',
              deduplicate: true,
            }
          ).catch(error => {
            console.error('[ANALYTICS] Plan-change purchase tracking failed', {
              userId,
              subscriptionId: subscription.id,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      }

      if (
        lifecycleAction === 'updated' &&
        isAcceptedStatus &&
        previousCancelAtPeriodEnd !== null &&
        previousCancelAtPeriodEnd !== subscription.cancel_at_period_end
      ) {
        const reason = getCancellationReason(subscription, existingSubscription);
        const cancellationOptions = {
          apiKey: serverEnv.AMPLITUDE_API_KEY,
          userId,
          sourceObjectId: subscription.id,
          deduplicate: true,
        };

        if (subscription.cancel_at_period_end) {
          await trackAnalyticsSafely(
            'subscription_cancel_scheduled',
            {
              plan: planMetadata.key,
              subscriptionId: subscription.id,
              effectiveAt: resolveCancellationEffectiveAt(subscription, existingSubscription),
              reasonCategory: reason.category,
              reasonSource: reason.source,
            },
            { ...cancellationOptions, lifecycleAction: 'subscription_cancel_scheduled' }
          );
        } else {
          await trackAnalyticsSafely(
            'subscription_cancel_reversed',
            {
              plan: planMetadata.key,
              subscriptionId: subscription.id,
              reversedAt: dayjs().toISOString(),
            },
            { ...cancellationOptions, lifecycleAction: 'subscription_cancel_reversed' }
          );
        }
      }

      if (shouldEmitCreated || isAcceptedStatus) {
        // Update user properties in Amplitude via $identify. This is observability only and
        // must never turn a successful billing state update into a failed webhook.
        const billingInterval = subscription.items.data[0]?.price.recurring?.interval || 'month';
        await trackAnalyticsSafely(
          '$identify',
          {
            $set: {
              plan: planMetadata.key,
              subscription_status: subscription.status,
              subscription_started_at: new Date().toISOString(),
              billing_interval: billingInterval === 'month' ? 'monthly' : billingInterval,
            },
          },
          { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
        );
      }
    }
  }

  /**
   * Handle subscription deletion
   */
  static async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
    _options: ISubscriptionWebhookOptions = {}
  ): Promise<void> {
    const customerId = subscription.customer as string;

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
            subscriptionId: subscription.id,
            customerId,
            timestamp: new Date().toISOString(),
          }
        );
        return; // Return early in test mode - webhook returns 200
      }
      console.error(`[WEBHOOK_RETRY] No profile found for customer ${customerId}`, {
        subscriptionId: subscription.id,
        customerId,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Profile not found for customer ${customerId} - webhook will retry`);
    }

    const userId = profile.id;

    let storedSubscription: IStoredSubscriptionLifecycleState | null = null;
    try {
      const { data } = await supabaseAdmin
        .from('subscriptions')
        .select('price_id, cancellation_reason, current_period_end')
        .eq('id', subscription.id)
        .maybeSingle();
      storedSubscription = data as IStoredSubscriptionLifecycleState | null;
    } catch (error) {
      // Deletion must still converge billing state if the optional reason lookup is unavailable.
      console.error('[WEBHOOK_CANCELLATION_CONTEXT_UNAVAILABLE]', {
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    let planKey = subscription.metadata?.plan_key || undefined;
    if (!planKey && storedSubscription?.price_id) {
      const resolvedPlan = resolvePlanOrPack(storedSubscription.price_id);
      if (resolvedPlan?.type === 'plan') planKey = resolvedPlan.key;
    }
    const cancellationReason = getCancellationReason(subscription, storedSubscription);
    const effectiveAt = resolveCancellationEffectiveAt(subscription, storedSubscription);

    // Update subscription status
    const { error: subError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: dayjs().toISOString(),
      })
      .eq('id', subscription.id);

    if (subError) {
      console.error('Error updating canceled subscription:', subError);
    }

    // Update profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        subscription_status: 'canceled',
        subscription_tier: null,
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Error updating profile subscription status:', profileError);
    } else {
      console.log(`Canceled subscription for user ${userId}`);

      await trackAnalyticsSafely(
        'subscription_canceled',
        {
          plan: planKey || 'unknown',
          subscriptionId: subscription.id,
          effectiveAt,
          reasonCategory: cancellationReason.category,
          reasonSource: cancellationReason.source,
        },
        {
          apiKey: serverEnv.AMPLITUDE_API_KEY,
          userId,
          sourceObjectId: subscription.id,
          lifecycleAction: 'subscription_canceled',
          deduplicate: true,
        }
      );

      // Update user properties in Amplitude - set plan to 'free'
      await trackAnalyticsSafely(
        '$identify',
        {
          $set: {
            plan: 'free',
            subscription_status: 'canceled',
            subscription_canceled_at: effectiveAt,
          },
        },
        { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
      );

      // Send cancellation email notification
      try {
        const { data: profileWithEmail } = await supabaseAdmin
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .single();

        if (profileWithEmail?.email) {
          const emailService = getEmailService();
          await emailService.send({
            to: profileWithEmail.email,
            template: 'subscription-update',
            data: {
              userName: profileWithEmail.email.split('@')[0] || 'there',
              status: 'canceled',
              action:
                'Your subscription has been canceled. Your remaining credits will be available until the end of your billing period.',
            },
            userId,
          });
        }
      } catch (emailError) {
        // Log but don't fail the webhook
        console.error('Failed to send cancellation email:', emailError);
      }
    }
  }

  /**
   * Handle trial will end warning
   */
  static async handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;

    // Get the user ID from the customer
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    // In test mode, handle unknown customers gracefully since stripe_customer_id mapping won't exist
    // In production, throw error so Stripe will retry
    if (!profile) {
      if (isTest()) {
        console.warn(
          `[WEBHOOK_TEST_MODE] No profile found for customer ${customerId} - skipping in test mode`,
          {
            subscriptionId: subscription.id,
            customerId,
            timestamp: new Date().toISOString(),
          }
        );
        return; // Return early in test mode - webhook returns 200
      }
      console.error(`[WEBHOOK_RETRY] No profile found for customer ${customerId}`, {
        subscriptionId: subscription.id,
        customerId,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Profile not found for customer ${customerId} - webhook will retry`);
    }

    const userId = profile.id;
    const trialEnd = (subscription as IStripeSubscriptionExtended).trial_end as number | null;

    if (!trialEnd) {
      console.error(`No trial end date for subscription ${subscription.id}`);
      return;
    }

    const trialEndDate = dayjs.unix(trialEnd);
    const daysUntilEnd = trialEndDate.diff(dayjs(), 'day');

    console.log(`Trial ending in ${daysUntilEnd} days for user ${userId}`);

    // Send trial ending soon email notification
    try {
      const emailService = getEmailService();
      await emailService.send({
        to: profile.email || '',
        template: 'subscription-update',
        data: {
          userName: profile.email?.split('@')[0] || 'there',
          status: 'trial ending soon',
          action: `Your trial ends in ${daysUntilEnd} days`,
        },
        userId,
      });
    } catch (emailError) {
      // Log but don't fail the webhook
      console.error('Failed to send trial ending email:', emailError);
    }

    // Log this notification attempt for tracking
    await supabaseAdmin.from('credit_transactions').insert({
      user_id: userId,
      amount: 0,
      balance_after: 0,
      type: 'trial_warning',
      description: `Trial ending in ${daysUntilEnd} days`,
      metadata: {
        subscription_id: subscription.id,
        trial_end_date: trialEndDate.toISOString(),
        days_remaining: daysUntilEnd,
        email: profile.email,
      },
    });
  }

  /**
   * Handle subscription schedule completion (scheduled downgrade taking effect)
   */
  static async handleSubscriptionScheduleCompleted(
    schedule: Stripe.SubscriptionSchedule
  ): Promise<void> {
    const subscriptionId = schedule.subscription;

    if (!subscriptionId) {
      console.log(`Schedule ${schedule.id} has no subscription, skipping`);
      return;
    }

    console.log(
      `[SCHEDULE_COMPLETED] Schedule ${schedule.id} completed for subscription ${subscriptionId}`
    );

    // Get the subscription from our database
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, scheduled_price_id, price_id')
      .eq('id', subscriptionId)
      .maybeSingle();

    if (subError || !subscription) {
      console.error(`No subscription found for schedule completion: ${subscriptionId}`, subError);
      throw new Error(`Subscription lookup failed for completed schedule ${schedule.id}`);
    }

    const scheduledPriceId = subscription.scheduled_price_id;

    // Clear the scheduled fields since the schedule has completed
    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        scheduled_price_id: null,
        scheduled_change_date: null,
        price_id: scheduledPriceId || subscription.price_id, // Update to new price
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriptionId);

    if (updateError) {
      console.error(
        `Error clearing scheduled downgrade for subscription ${subscriptionId}:`,
        updateError
      );
      throw new Error(`Failed to converge completed schedule ${schedule.id}`);
    }

    // If this was a scheduled downgrade, update the profile tier
    // NOTE: Credit allocation is handled exclusively by handleInvoicePaymentSucceeded
    // to avoid double-granting credits (the schedule completion triggers a new invoice)
    if (scheduledPriceId) {
      const newPlan = getPlanForPriceId(scheduledPriceId);

      if (newPlan) {
        // Update profile tier
        // IMPORTANT: Use plan.key (e.g., 'pro') not plan.name (e.g., 'Professional')
        const { error: profileUpdateError } = await supabaseAdmin
          .from('profiles')
          .update({
            subscription_tier: newPlan.key,
          })
          .eq('id', subscription.user_id);
        if (profileUpdateError) {
          throw new Error(`Failed to update profile for completed schedule ${schedule.id}`);
        }

        console.log(
          `[SCHEDULE_DOWNGRADE_TIER_UPDATED] User ${subscription.user_id} tier updated to ${newPlan.key} for ${newPlan.name} plan. Credits will be allocated by invoice handler.`
        );
      }
    }

    console.log(
      `[SCHEDULE_COMPLETED_DONE] Cleared scheduled downgrade for subscription ${subscriptionId}`
    );
  }
}
