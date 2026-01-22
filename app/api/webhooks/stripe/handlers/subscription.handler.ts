import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { trackServerEvent } from '@server/analytics';
import { getService } from '@server/di/container';
import type { ISubscriptionCredits } from '@server/interfaces';
import { stripe } from '@server/stripe';
import { serverEnv } from '@shared/config/env';
import { getPlanForPriceId, resolvePlanOrPack, assertKnownPriceId } from '@shared/config/stripe';
import { getTrialConfig } from '@shared/config/subscription.config';
import { getEmailService } from '@server/services/email.service';
import { isTest } from '@shared/config/env';
import Stripe from 'stripe';
import dayjs from 'dayjs';

// Stripe subscription interface for accessing fields not in the SDK types
type IStripeSubscriptionExtended = Stripe.Subscription & {
  current_period_start?: number;
  current_period_end?: number;
  canceled_at?: number | null | undefined;
};

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

export class SubscriptionHandler {
  /**
   * Handle customer creation
   */
  static async handleCustomerCreated(customer: Stripe.Customer): Promise<void> {
    console.log(`Customer created: ${customer.id}`);

    // If customer has metadata with user_id, update the profile with stripe_customer_id
    const userId = customer.metadata?.user_id;

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
        } else {
          console.log(`Updated profile ${userId} with Stripe customer ID ${customer.id}`);
        }
      } catch (error) {
        console.error(`Exception updating profile for customer ${customer.id}:`, error);
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
    options?: {
      previousPriceId?: string | null;
    }
  ): Promise<void> {
    const customerId = subscription.customer as string;

    console.log('[WEBHOOK_SUBSCRIPTION_UPDATE_START]', {
      subscriptionId: subscription.id,
      customerId,
      status: subscription.status,
      optionsPreviousPriceId: options?.previousPriceId,
      timestamp: new Date().toISOString(),
    });

    // Get the user ID from the customer and current subscription details
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, subscription_status, subscription_credits_balance, purchased_credits_balance')
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
      .select('price_id, updated_at')
      .eq('id', subscription.id)
      .maybeSingle();

    // Prefer Stripe's previous_attributes (accurate) over DB (may be stale after plan change)
    const previousPriceId = options?.previousPriceId || existingSubscription?.price_id || null;

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

    // Get price ID and resolve using unified resolver
    const priceId = subscription.items.data[0]?.price.id || '';

    // Use unified resolver - this will throw if price ID is unknown, causing webhook to fail loudly
    // This ensures Stripe will retry instead of silently dropping the event
    let resolvedPlan;
    try {
      resolvedPlan = assertKnownPriceId(priceId);
      if (resolvedPlan.type !== 'plan') {
        throw new Error(`Price ID ${priceId} resolved to a credit pack, not a subscription plan`);
      }
    } catch (error) {
      console.error(`[WEBHOOK_ERROR] Unknown price ID in subscription update: ${priceId}`, {
        error: error instanceof Error ? error.message : error,
        subscriptionId: subscription.id,
        customerId,
        timestamp: new Date().toISOString(),
      });
      // Throw the error so webhook fails and Stripe retries
      throw error;
    }

    // Get trial configuration and unified plan data
    const trialConfig = getTrialConfig(priceId);
    const planMetadata = resolvePlanOrPack(priceId);

    if (!planMetadata || planMetadata.type !== 'plan') {
      const error = new Error(`Price ID ${priceId} did not resolve to a valid plan`);
      console.error(`[WEBHOOK_ERROR] Invalid plan resolution: ${priceId}`, {
        error: error.message,
        subscriptionId: subscription.id,
        customerId,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }

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
      price_id: priceId,
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
          price_id: priceId,
          current_period_start: currentPeriodStartISO,
          current_period_end: currentPeriodEndISO,
          cancel_at_period_end: subscription.cancel_at_period_end,
        };

        const { error: fallbackError } = await supabaseAdmin
          .from('subscriptions')
          .upsert(minimalPayload);

        if (fallbackError) {
          console.error('Fallback subscription upsert failed:', fallbackError);
        } else {
          console.log('Fallback subscription upsert succeeded without optional columns.');
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
      currentPriceId: priceId,
      previousPriceId: effectivePreviousPriceId,
      optionsPreviousPriceId: options?.previousPriceId,
      existingSubscriptionPriceId: existingSubscription?.price_id,
      subscriptionStatus: subscription.status,
      isPlanChange: effectivePreviousPriceId && effectivePreviousPriceId !== priceId,
      currentCreditsBalance:
        (profile.subscription_credits_balance ?? 0) + (profile.purchased_credits_balance ?? 0),
    });

    if (
      effectivePreviousPriceId &&
      effectivePreviousPriceId !== priceId &&
      subscription.status === 'active'
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

          // Use SubscriptionCreditsService for consistent credit calculation
          const creditsService = getService<ISubscriptionCredits>('ISubscriptionCredits');
          const calculation = creditsService.calculateUpgradeCredits({
            currentBalance,
            previousTierCredits: previousCredits,
            newTierCredits: newCredits,
          });

          const explanation = creditsService.getExplanation(calculation, {
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
            const { error } = await supabaseAdmin.rpc('add_subscription_credits', {
              target_user_id: userId,
              amount: calculation.creditsToAdd,
              ref_id: subscription.id,
              description: `Plan upgrade - ${previousPlanMetadata.name} → ${planMetadata.name} - ${calculation.creditsToAdd} credits (tier difference)`,
            });

            if (error) {
              console.error('[WEBHOOK_CREDITS_UPGRADE_ERROR]', {
                userId,
                error,
                creditsToAdd: calculation.creditsToAdd,
              });
            } else {
              console.log('[WEBHOOK_CREDITS_UPGRADE_SUCCESS]', {
                userId,
                creditsAdded: calculation.creditsToAdd,
                previousBalance: currentBalance,
                newBalance: currentBalance + calculation.creditsToAdd,
              });
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
    } else {
      console.log('[WEBHOOK_SUBSCRIPTION_UPDATE_COMPLETE]', {
        userId,
        subscriptionId: subscription.id,
        plan: planMetadata.name,
        status: subscription.status,
        timestamp: new Date().toISOString(),
      });

      // Track subscription created event for new active/trialing subscriptions
      if (subscription.status === 'active' || subscription.status === 'trialing') {
        await trackServerEvent(
          'subscription_created',
          {
            plan: planMetadata.key,
            amountCents: subscription.items.data[0]?.price.unit_amount || 0,
            billingInterval: subscription.items.data[0]?.price.recurring?.interval || 'month',
            status: subscription.status,
            subscriptionId: subscription.id,
          },
          { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
        );
      }
    }
  }

  /**
   * Handle subscription deletion
   */
  static async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
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

    // Get the price ID for tracking before updating
    const priceId = subscription.items.data[0]?.price.id;
    let planKey: string | undefined;
    if (priceId) {
      try {
        const planMetadata = resolvePlanOrPack(priceId);
        planKey = planMetadata?.type === 'plan' ? planMetadata.key : undefined;
      } catch {
        // Ignore resolution errors for tracking
      }
    }

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
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Error updating profile subscription status:', profileError);
    } else {
      console.log(`Canceled subscription for user ${userId}`);

      // Track subscription canceled event
      await trackServerEvent(
        'subscription_canceled',
        {
          plan: planKey,
          subscriptionId: subscription.id,
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
      return;
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
      return;
    }

    // If this was a scheduled downgrade, reset credits to the new tier
    if (scheduledPriceId) {
      const newPlan = getPlanForPriceId(scheduledPriceId);

      if (newPlan) {
        // Update profile tier
        // IMPORTANT: Use plan.key (e.g., 'pro') not plan.name (e.g., 'Professional')
        await supabaseAdmin
          .from('profiles')
          .update({
            subscription_tier: newPlan.key,
          })
          .eq('id', subscription.user_id);

        // Reset credits to the new tier amount
        // This is the key difference from immediate downgrades - at renewal, credits reset
        const { error: creditError } = await supabaseAdmin
          .from('profiles')
          .update({
            subscription_credits_balance: newPlan.creditsPerMonth,
          })
          .eq('id', subscription.user_id);

        if (creditError) {
          console.error(`Error resetting credits for user ${subscription.user_id}:`, creditError);
        } else {
          console.log(
            `[SCHEDULE_DOWNGRADE_CREDITS_RESET] User ${subscription.user_id} subscription credits reset to ${newPlan.creditsPerMonth} for ${newPlan.name} plan`
          );
        }

        // Log the credit transaction (using add_subscription_credits with 0 amount just for logging)
        await supabaseAdmin.rpc('add_subscription_credits', {
          target_user_id: subscription.user_id,
          amount: 0, // Amount doesn't matter - we're just logging
          ref_id: `schedule_${schedule.id}`,
          description: `Scheduled downgrade completed - subscription credits reset to ${newPlan.creditsPerMonth} for ${newPlan.name} plan`,
        });
      }
    }

    console.log(
      `[SCHEDULE_COMPLETED_DONE] Cleared scheduled downgrade for subscription ${subscriptionId}`
    );
  }
}
