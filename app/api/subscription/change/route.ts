import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import { getPlanForPriceId } from '@shared/config/stripe';
import { SubscriptionCreditsService } from '@server/services/SubscriptionCredits';

export const runtime = 'edge';

interface ISubscriptionChangeRequest {
  targetPriceId: string;
}

/**
 * Check if this is a downgrade (fewer credits in new plan)
 */
function isDowngrade(currentPriceId: string | null, targetPriceId: string): boolean {
  if (!currentPriceId) return false;
  const currentPlan = getPlanForPriceId(currentPriceId);
  const targetPlan = getPlanForPriceId(targetPriceId);
  if (!currentPlan || !targetPlan) return false;
  return targetPlan.creditsPerMonth < currentPlan.creditsPerMonth;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing authorization header',
          },
        },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid authentication token',
          },
        },
        { status: 401 }
      );
    }

    // 2. Parse and validate request body
    let body: ISubscriptionChangeRequest;
    try {
      const text = await request.text();
      body = JSON.parse(text) as ISubscriptionChangeRequest;
    } catch (parseError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Invalid JSON in request body',
          },
        },
        { status: 400 }
      );
    }

    if (!body.targetPriceId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_PRICE_ID',
            message: 'targetPriceId is required',
          },
        },
        { status: 400 }
      );
    }

    // 3. Validate target price ID
    const targetPlan = getPlanForPriceId(body.targetPriceId);
    if (!targetPlan) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PRICE_ID',
            message: 'Invalid or unsupported price ID',
          },
        },
        { status: 400 }
      );
    }

    // 4. Get user's current subscription
    const { data: currentSubscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // 5. Check if this is actually a change
    if (!subError && currentSubscription && currentSubscription.price_id === body.targetPriceId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SAME_PLAN',
            message: 'Target plan is the same as current plan',
          },
        },
        { status: 400 }
      );
    }

    // 6. Get user's Stripe customer ID
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.stripe_customer_id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'STRIPE_CUSTOMER_NOT_FOUND',
            message: 'User has no Stripe customer ID',
          },
        },
        { status: 400 }
      );
    }

    // 7. Handle subscription change
    if (subError || !currentSubscription) {
      // No current subscription - create new one
      // This should go through the regular checkout flow instead
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_ACTIVE_SUBSCRIPTION',
            message: 'No active subscription found. Use checkout endpoint instead.',
          },
        },
        { status: 400 }
      );
    }

    // Get current plan metadata for logging
    const currentPlan = currentSubscription.price_id
      ? getPlanForPriceId(currentSubscription.price_id)
      : null;

    console.log('[PLAN_CHANGE_START]', {
      userId: user.id,
      subscriptionId: currentSubscription.id,
      currentPriceId: currentSubscription.price_id,
      currentPlan: currentPlan?.name,
      targetPriceId: body.targetPriceId,
      targetPlan: targetPlan.name,
      timestamp: new Date().toISOString(),
    });

    // Existing subscription - modify it
    try {
      // Check if we're in test mode
      if (serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key') || serverEnv.ENV === 'test') {
        // Mock subscription change for testing
        console.log(
          `[TEST MODE] Would change subscription ${currentSubscription.id} from ${currentPlan?.name || 'Unknown'} to ${targetPlan.name}`
        );

        // Update local database to simulate the change
        await supabaseAdmin
          .from('subscriptions')
          .update({
            price_id: body.targetPriceId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentSubscription.id);

        // Update profile subscription tier
        await supabaseAdmin
          .from('profiles')
          .update({
            subscription_tier: targetPlan.name,
          })
          .eq('id', user.id);

        // Note: Credit adjustment for plan changes happens in the webhook handler
        // when customer.subscription.updated event is received from Stripe.
        // Upgrades receive additional credits immediately, downgrades retain existing credits.

        return NextResponse.json({
          success: true,
          data: {
            subscription_id: currentSubscription.id,
            status: 'active',
            new_price_id: body.targetPriceId,
            effective_immediately: true,
            mock: true,
          },
        });
      }

      // CRITICAL-5 FIX: Fetch fresh subscription data immediately before update
      // This prevents using stale item IDs if subscription was modified in Stripe Portal
      const latestSubscription = await stripe.subscriptions.retrieve(currentSubscription.id);

      // Log full subscription object for debugging period fields
      console.log('[PLAN_CHANGE_STRIPE_FETCH]', {
        subscriptionId: currentSubscription.id,
        latestPriceId: latestSubscription.items.data[0]?.price.id,
        expectedPriceId: currentSubscription.price_id,
        billing_cycle_anchor: latestSubscription.billing_cycle_anchor,
        start_date: latestSubscription.start_date,
        created: latestSubscription.created,
        // Check if period info is nested or named differently
        rawSubscription: JSON.stringify(latestSubscription).slice(0, 500),
      });

      // Validate the subscription hasn't changed since we started processing
      const latestPriceId = latestSubscription.items.data[0]?.price.id;
      if (latestPriceId !== currentSubscription.price_id) {
        console.warn(
          `Subscription ${currentSubscription.id} was modified during processing. Expected price: ${currentSubscription.price_id}, Found: ${latestPriceId}`
        );
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'SUBSCRIPTION_MODIFIED',
              message:
                'Your subscription was modified elsewhere. Please refresh the page and try again.',
            },
          },
          { status: 409 }
        );
      }

      // Check if this is a downgrade
      const isDowngradeChange = isDowngrade(currentSubscription.price_id, body.targetPriceId);

      console.log('[PLAN_CHANGE_STRIPE_UPDATE]', {
        subscriptionId: currentSubscription.id,
        itemId: latestSubscription.items.data[0]?.id,
        oldPriceId: latestSubscription.items.data[0]?.price.id,
        newPriceId: body.targetPriceId,
        isDowngrade: isDowngradeChange,
      });

      // Access period timestamps from latestSubscription
      // Note: In newer Stripe API versions, these fields may not be in the SDK types
      // Cast to any to access them, with fallback calculation below
      let periodStart = (latestSubscription as any).current_period_start as number | undefined;
      let periodEnd = (latestSubscription as any).current_period_end as number | undefined;

      // Fallback: Calculate period from billing_cycle_anchor if direct fields not available
      if (!periodEnd && latestSubscription.billing_cycle_anchor) {
        const anchor = latestSubscription.billing_cycle_anchor;
        const now = Math.floor(Date.now() / 1000);
        // Calculate how many billing cycles have passed
        const interval = latestSubscription.items.data[0]?.price?.recurring?.interval;
        const intervalCount =
          latestSubscription.items.data[0]?.price?.recurring?.interval_count || 1;

        let secondsPerInterval = 30 * 24 * 60 * 60; // Default to ~monthly
        if (interval === 'year') secondsPerInterval = 365 * 24 * 60 * 60;
        else if (interval === 'week') secondsPerInterval = 7 * 24 * 60 * 60;
        else if (interval === 'day') secondsPerInterval = 24 * 60 * 60;

        const totalSeconds = secondsPerInterval * intervalCount;
        const cyclesPassed = Math.floor((now - anchor) / totalSeconds);
        periodStart = anchor + cyclesPassed * totalSeconds;
        periodEnd = periodStart + totalSeconds;

        console.log('[PLAN_CHANGE_PERIOD_CALCULATED]', {
          billing_cycle_anchor: anchor,
          interval,
          intervalCount,
          cyclesPassed,
          periodStart: new Date(periodStart * 1000).toISOString(),
          periodEnd: new Date(periodEnd * 1000).toISOString(),
        });
      }

      if (isDowngradeChange) {
        // DOWNGRADE: Schedule change at end of billing period using Subscription Schedules

        // Validate we have period end timestamp
        if (!periodEnd) {
          console.error('[PLAN_CHANGE_DOWNGRADE_ERROR] Missing period end timestamp');
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'INVALID_SUBSCRIPTION_STATE',
                message: 'Could not determine billing period end date',
              },
            },
            { status: 500 }
          );
        }

        console.log('[PLAN_CHANGE_DOWNGRADE_SCHEDULED]', {
          userId: user.id,
          subscriptionId: currentSubscription.id,
          periodStart: periodStart ? new Date(periodStart * 1000).toISOString() : 'unknown',
          scheduledFor: new Date(periodEnd * 1000).toISOString(),
        });

        // Check if subscription already has a schedule attached
        let schedule;
        const existingScheduleId = latestSubscription.schedule;

        if (existingScheduleId && typeof existingScheduleId === 'string') {
          // Use existing schedule
          console.log('[PLAN_CHANGE_USING_EXISTING_SCHEDULE]', { scheduleId: existingScheduleId });
          schedule = await stripe.subscriptionSchedules.retrieve(existingScheduleId);
        } else {
          // Create a new schedule from the existing subscription
          schedule = await stripe.subscriptionSchedules.create({
            from_subscription: currentSubscription.id,
          });
        }

        // Update the schedule with two phases:
        // 1. Current phase: keep current plan until period end
        // 2. Next phase: switch to new (lower) plan
        // Note: When created from_subscription, Stripe sets current_phase start automatically
        schedule = await stripe.subscriptionSchedules.update(schedule.id, {
          end_behavior: 'release', // Release back to regular subscription after schedule completes
          phases: [
            {
              items: [{ price: currentSubscription.price_id!, quantity: 1 }],
              start_date: periodStart || 'now',
              end_date: periodEnd,
              proration_behavior: 'none',
            },
            {
              items: [{ price: body.targetPriceId, quantity: 1 }],
              start_date: periodEnd,
              // No end_date for final phase with end_behavior: release
              proration_behavior: 'none',
            },
          ],
        });

        // Store the scheduled downgrade in our database
        // The subscription keeps current price_id until the schedule executes
        await supabaseAdmin
          .from('subscriptions')
          .update({
            scheduled_price_id: body.targetPriceId,
            scheduled_change_date: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentSubscription.id);

        console.log('[PLAN_CHANGE_DOWNGRADE_COMPLETE]', {
          userId: user.id,
          scheduleId: schedule.id,
          currentPlan: currentPlan?.name,
          scheduledPlan: targetPlan.name,
          effectiveDate: periodEnd ? new Date(periodEnd * 1000).toISOString() : 'unknown',
        });

        return NextResponse.json({
          success: true,
          data: {
            subscription_id: currentSubscription.id,
            schedule_id: schedule.id,
            status: 'scheduled',
            current_price_id: currentSubscription.price_id,
            scheduled_price_id: body.targetPriceId,
            effective_immediately: false,
            effective_date: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          },
        });
      }

      // UPGRADE: Apply immediately with proration
      const updatedSubscription = await stripe.subscriptions.update(currentSubscription.id, {
        items: [
          {
            id: latestSubscription.items.data[0]?.id,
            price: body.targetPriceId,
          },
        ],
        proration_behavior: 'create_prorations',
        payment_behavior: 'error_if_incomplete',
      });

      // Access updated period timestamps
      const updatedPeriodStart = (updatedSubscription as any).current_period_start as
        | number
        | undefined;
      const updatedPeriodEnd = (updatedSubscription as any).current_period_end as
        | number
        | undefined;

      // Update local database with new price ID
      const updateData: {
        price_id: string;
        updated_at: string;
        current_period_start?: string;
        current_period_end?: string;
        scheduled_price_id?: null;
        scheduled_change_date?: null;
      } = {
        price_id: body.targetPriceId,
        updated_at: new Date().toISOString(),
        scheduled_price_id: null, // Clear any scheduled changes
        scheduled_change_date: null,
      };

      if (updatedPeriodStart) {
        updateData.current_period_start = new Date(updatedPeriodStart * 1000).toISOString();
      }
      if (updatedPeriodEnd) {
        updateData.current_period_end = new Date(updatedPeriodEnd * 1000).toISOString();
      }

      await supabaseAdmin.from('subscriptions').update(updateData).eq('id', currentSubscription.id);

      // Update profile subscription tier
      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_tier: targetPlan.name,
        })
        .eq('id', user.id);

      // ADJUST CREDITS FOR UPGRADE
      const previousCredits = currentPlan?.creditsPerMonth || 0;
      const newCredits = targetPlan.creditsPerMonth;

      console.log('[PLAN_CHANGE_UPGRADE_DB_UPDATED]', {
        userId: user.id,
        subscriptionId: currentSubscription.id,
        oldPlan: currentPlan?.name || 'Unknown',
        newPlan: targetPlan.name,
        oldPriceId: currentSubscription.price_id,
        newPriceId: body.targetPriceId,
        previousCredits,
        newCredits,
        timestamp: new Date().toISOString(),
      });

      // Calculate and add upgrade credits
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('subscription_credits_balance, purchased_credits_balance')
        .eq('id', user.id)
        .single();

      const currentBalance =
        (profile?.subscription_credits_balance ?? 0) + (profile?.purchased_credits_balance ?? 0);

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

      console.log('[PLAN_CHANGE_CREDITS_CHECK]', {
        userId: user.id,
        currentBalance,
        previousTierCredits: previousCredits,
        newTierCredits: newCredits,
        maxReasonableBalance: calculation.maxReasonableBalance,
        creditsToAdd: calculation.creditsToAdd,
        reason: calculation.reason,
        isLegitimate: calculation.isLegitimate,
        explanation,
      });

      if (calculation.creditsToAdd > 0) {
        const { error: creditError } = await supabaseAdmin.rpc('increment_credits_with_log', {
          target_user_id: user.id,
          amount: calculation.creditsToAdd,
          transaction_type: 'subscription',
          ref_id: currentSubscription.id,
          description: `Plan upgrade - ${currentPlan?.name || 'Unknown'} → ${targetPlan.name} - ${calculation.creditsToAdd} credits`,
        });

        if (creditError) {
          console.error('[PLAN_CHANGE_CREDITS_ERROR]', { userId: user.id, error: creditError });
        } else {
          console.log('[PLAN_CHANGE_CREDITS_ADDED]', {
            userId: user.id,
            creditsAdded: calculation.creditsToAdd,
            previousBalance: currentBalance,
            newBalance: currentBalance + calculation.creditsToAdd,
          });
        }
      } else {
        console.log('[PLAN_CHANGE_CREDITS_BLOCKED]', {
          userId: user.id,
          currentBalance,
          maxReasonableBalance: calculation.maxReasonableBalance,
          reason: 'Farming detected - user has excessive credits from downgrade',
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          subscription_id: updatedSubscription.id,
          status: updatedSubscription.status,
          new_price_id: body.targetPriceId,
          effective_immediately: true,
          ...(updatedPeriodStart && {
            current_period_start: new Date(updatedPeriodStart * 1000).toISOString(),
          }),
          ...(updatedPeriodEnd && {
            current_period_end: new Date(updatedPeriodEnd * 1000).toISOString(),
          }),
        },
      });
    } catch (stripeError: unknown) {
      console.error('Stripe subscription change error:', stripeError);
      const errorMessage = stripeError instanceof Error ? stripeError.message : 'Unknown error';

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'STRIPE_ERROR',
            message: `Failed to change subscription: ${errorMessage}`,
          },
        },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error('Subscription change error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}
