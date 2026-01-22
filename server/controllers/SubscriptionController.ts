import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { BaseController } from './BaseController';
import { supabaseAdmin } from '../supabase/supabaseAdmin';
import { stripe } from '../stripe';
import { serverEnv } from '@shared/config/env';
import { getPlanForPriceId, assertKnownPriceId, resolvePlanOrPack } from '@shared/config/stripe';
import { getPlanByPriceId } from '@shared/config/subscription.utils';
import dayjs from 'dayjs';
import type Stripe from 'stripe';

/**
 * Request body schemas
 */
interface ISubscriptionChangeRequest {
  targetPriceId: string;
}

interface IPreviewChangeRequest {
  targetPriceId: string;
}

interface ICancelSubscriptionRequest {
  reason?: string;
}

/**
 * Response types
 */
interface IPreviewChangeResponse {
  proration: {
    amount_due: number;
    currency: string;
    period_start: string;
    period_end: string;
  };
  current_plan: {
    name: string;
    price_id: string;
    credits_per_month: number;
  } | null;
  new_plan: {
    name: string;
    price_id: string;
    credits_per_month: number;
  };
  effective_immediately: boolean;
  effective_date?: string;
  is_downgrade: boolean;
}

/**
 * Subscription Controller
 *
 * Handles subscription-related API endpoints:
 * - POST /api/subscription/change - Change subscription plan (upgrade/downgrade)
 * - POST /api/subscription/preview-change - Preview proration for plan change
 * - POST /api/subscription/cancel-scheduled - Cancel a scheduled downgrade
 * - POST /api/subscriptions/cancel - Cancel subscription at period end
 */
export class SubscriptionController extends BaseController {
  /**
   * Handle incoming request
   */
  protected async handle(req: NextRequest): Promise<NextResponse> {
    const path = req.nextUrl.pathname;

    // Route to appropriate method based on path
    if (path.endsWith('/change') && this.isPost(req)) {
      return this.change(req);
    }
    if (path.endsWith('/preview-change') && this.isPost(req)) {
      return this.previewChange(req);
    }
    if (path.endsWith('/cancel-scheduled') && this.isPost(req)) {
      return this.cancelScheduled(req);
    }
    if (path.includes('/subscriptions/cancel') && this.isPost(req)) {
      return this.cancel(req);
    }

    return this.error('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  /**
   * Authenticate user from Authorization header
   */
  private async authenticateUser(req: NextRequest): Promise<{ userId: string; email?: string } | NextResponse> {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return this.error('UNAUTHORIZED', 'Missing authorization header', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return this.error('UNAUTHORIZED', 'Invalid authentication token', 401);
    }

    return { userId: user.id, email: user.email };
  }

  /**
   * Validate price ID and resolve to plan
   */
  private validatePriceId(targetPriceId: string): { plan: ReturnType<typeof getPlanForPriceId>; error?: NextResponse } {
    try {
      const resolved = assertKnownPriceId(targetPriceId);
      if (resolved.type !== 'plan') {
        return {
          plan: null,
          error: this.error('INVALID_PRICE_ID', `Price ID ${targetPriceId} is not a subscription plan`, 400),
        };
      }
      const plan = getPlanForPriceId(targetPriceId);
      if (!plan) {
        return {
          plan: null,
          error: this.error('INTERNAL_ERROR', 'Failed to resolve target plan after validation', 500),
        };
      }
      return { plan };
    } catch (error) {
      return {
        plan: null,
        error: this.error(
          'INVALID_PRICE_ID',
          error instanceof Error ? error.message : 'Invalid or unsupported price ID',
          400
        ),
      };
    }
  }

  /**
   * Check if this is a downgrade based on tier credits
   */
  private isDowngrade(subscriptionTier: string | null, targetCredits: number): boolean {
    const tierCreditsMap: Record<string, number> = {
      starter: 100,
      hobby: 200,
      pro: 1000,
      business: 5000,
    };
    const currentTierCredits = tierCreditsMap[subscriptionTier || ''] || 0;
    return currentTierCredits > targetCredits;
  }

  /**
   * POST /api/subscription/change
   * Change subscription plan (upgrade/downgrade)
   */
  private async change(req: NextRequest): Promise<NextResponse> {
    // 1. Authenticate user
    const authResult = await this.authenticateUser(req);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    // 2. Parse and validate request body
    const body = await this.getBody<ISubscriptionChangeRequest>(req);
    if (!body.targetPriceId) {
      return this.error('VALIDATION_ERROR', 'targetPriceId is required', 400);
    }

    // 3. Validate target price ID
    const { plan: targetPlan, error: planError } = this.validatePriceId(body.targetPriceId);
    if (planError) return planError;
    if (!targetPlan) return this.error('INTERNAL_ERROR', 'Failed to resolve target plan', 500);

    // 4. Get user's current subscription
    const { data: currentSubscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // 5. Check if this is actually a change
    if (!subError && currentSubscription && currentSubscription.price_id === body.targetPriceId) {
      return this.error('SAME_PLAN', 'Target plan is the same as current plan', 400);
    }

    // 6. Get user's profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id, subscription_tier')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.stripe_customer_id) {
      return this.error('STRIPE_CUSTOMER_NOT_FOUND', 'User has no Stripe customer ID', 400);
    }

    // 7. Handle no current subscription
    if (subError || !currentSubscription) {
      return this.error('NO_ACTIVE_SUBSCRIPTION', 'No active subscription found. Use checkout endpoint instead.', 400);
    }

    // 8. Determine if this is a downgrade
    const isDowngradeChange = this.isDowngrade(profile.subscription_tier, targetPlan.creditsPerMonth);

    console.log('[PLAN_CHANGE_START]', {
      userId,
      subscriptionId: currentSubscription.id,
      currentPriceId: currentSubscription.price_id,
      targetPriceId: body.targetPriceId,
      isDowngrade: isDowngradeChange,
    });

    // 9. Handle test mode
    if (serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key') || serverEnv.ENV === 'test') {
      await supabaseAdmin
        .from('subscriptions')
        .update({
          price_id: body.targetPriceId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentSubscription.id);

      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_tier: targetPlan.key,
        })
        .eq('id', userId);

      return this.json({
        subscription_id: currentSubscription.id,
        status: 'active',
        new_price_id: body.targetPriceId,
        effective_immediately: true,
        mock: true,
      });
    }

    // 10. Fetch fresh subscription data
    const latestSubscription = await stripe.subscriptions.retrieve(currentSubscription.id);

    // Sync database with Stripe if price_id is out of sync
    const latestPriceId = latestSubscription.items.data[0]?.price.id;
    if (latestPriceId !== currentSubscription.price_id) {
      await supabaseAdmin.from('subscriptions').update({ price_id: latestPriceId }).eq('id', currentSubscription.id);
      currentSubscription.price_id = latestPriceId;
    }

    // Get period timestamps
    const latestSubUnknown = latestSubscription as unknown as {
      current_period_start?: number;
      current_period_end?: number;
    };
    let periodStart = latestSubUnknown.current_period_start;
    let periodEnd = latestSubUnknown.current_period_end;

    // Fallback period calculation
    if (!periodEnd && latestSubscription.billing_cycle_anchor) {
      const anchor = latestSubscription.billing_cycle_anchor;
      const now = Math.floor(Date.now() / 1000);
      const interval = latestSubscription.items.data[0]?.price?.recurring?.interval;
      const intervalCount = latestSubscription.items.data[0]?.price?.recurring?.interval_count || 1;

      let secondsPerInterval = 30 * 24 * 60 * 60;
      if (interval === 'year') secondsPerInterval = 365 * 24 * 60 * 60;
      else if (interval === 'week') secondsPerInterval = 7 * 24 * 60 * 60;
      else if (interval === 'day') secondsPerInterval = 24 * 60 * 60;

      const totalSeconds = secondsPerInterval * intervalCount;
      const cyclesPassed = Math.floor((now - anchor) / totalSeconds);
      periodStart = anchor + cyclesPassed * totalSeconds;
      periodEnd = periodStart + totalSeconds;
    }

    if (isDowngradeChange) {
      // DOWNGRADE: Schedule at end of billing period using Subscription Schedules
      if (!periodEnd) {
        return this.error('INVALID_SUBSCRIPTION_STATE', 'Could not determine billing period end date', 500);
      }

      // Release existing schedule if present
      const existingScheduleId = latestSubscription.schedule;
      if (existingScheduleId && typeof existingScheduleId === 'string') {
        try {
          await stripe.subscriptionSchedules.release(existingScheduleId);
        } catch {
          // Schedule may already be released
        }
      }

      // Create schedule from current subscription
      const schedule = await stripe.subscriptionSchedules.create({
        from_subscription: currentSubscription.id,
      });

      const existingPhaseStartDate = schedule.phases[0]?.start_date;
      if (!existingPhaseStartDate) {
        return this.error('SCHEDULE_ERROR', 'Could not determine schedule phase start date', 500);
      }

      // Update schedule with two phases
      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: 'release',
        phases: [
          {
            items: [{ price: currentSubscription.price_id!, quantity: 1 }],
            start_date: existingPhaseStartDate,
            end_date: periodEnd,
            proration_behavior: 'none',
          },
          {
            items: [{ price: body.targetPriceId, quantity: 1 }],
            start_date: periodEnd,
            proration_behavior: 'none',
          },
        ],
      });

      // Store scheduled downgrade in database
      await supabaseAdmin
        .from('subscriptions')
        .update({
          scheduled_price_id: body.targetPriceId,
          scheduled_change_date: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentSubscription.id);

      return this.json({
        subscription_id: currentSubscription.id,
        schedule_id: schedule.id,
        status: 'scheduled',
        current_price_id: currentSubscription.price_id,
        scheduled_price_id: body.targetPriceId,
        effective_immediately: false,
        effective_date: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
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

    const updatedSubUnknown = updatedSubscription as unknown as {
      current_period_start?: number;
      current_period_end?: number;
    };
    const updatedPeriodStart = updatedSubUnknown.current_period_start;
    const updatedPeriodEnd = updatedSubUnknown.current_period_end;

    // Update database
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
      scheduled_price_id: null,
      scheduled_change_date: null,
    };

    if (updatedPeriodStart) {
      updateData.current_period_start = new Date(updatedPeriodStart * 1000).toISOString();
    }
    if (updatedPeriodEnd) {
      updateData.current_period_end = new Date(updatedPeriodEnd * 1000).toISOString();
    }

    await supabaseAdmin.from('subscriptions').update(updateData).eq('id', currentSubscription.id);

    await supabaseAdmin
      .from('profiles')
      .update({
        subscription_tier: targetPlan.key,
      })
      .eq('id', userId);

    return this.json({
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
    });
  }

  /**
   * POST /api/subscription/preview-change
   * Preview proration for plan change
   */
  private async previewChange(req: NextRequest): Promise<NextResponse> {
    // 1. Authenticate user
    const authResult = await this.authenticateUser(req);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    // 2. Parse and validate request body
    const body = await this.getBody<IPreviewChangeRequest>(req);
    if (!body.targetPriceId) {
      return this.error('VALIDATION_ERROR', 'targetPriceId is required', 400);
    }

    // 3. Validate target price ID
    const { plan: targetPlan, error: planError } = this.validatePriceId(body.targetPriceId);
    if (planError) return planError;
    if (!targetPlan) return this.error('INTERNAL_ERROR', 'Failed to resolve target plan', 500);

    // 4. Get user's current subscription
    const { data: currentSubscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (subError || !currentSubscription) {
      return this.error('NO_ACTIVE_SUBSCRIPTION', 'No active subscription found. Use checkout endpoint instead.', 400);
    }

    const currentPriceId = currentSubscription.price_id;

    // 5. Check if this is actually a change
    if (currentPriceId === body.targetPriceId) {
      return this.error('SAME_PLAN', 'Target plan is the same as current plan', 400);
    }

    // 6. Get user's profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id, subscription_tier')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.stripe_customer_id) {
      return this.error('STRIPE_CUSTOMER_NOT_FOUND', 'User has no Stripe customer ID', 400);
    }

    // 7. Determine if this is a downgrade
    const tierCreditsMap: Record<string, number> = {
      starter: 100,
      hobby: 200,
      pro: 1000,
      business: 5000,
    };
    const currentTierCredits = tierCreditsMap[profile.subscription_tier || ''] || 0;
    const targetCredits = targetPlan.creditsPerMonth;
    const isDowngradeChange = currentTierCredits > targetCredits;

    // 8. Get current plan info
    let currentPlan = currentPriceId ? getPlanForPriceId(currentPriceId) : null;

    // 9. Calculate proration
    let prorationResult: IPreviewChangeResponse['proration'] = {
      amount_due: 0,
      currency: 'usd',
      period_start: dayjs().toISOString(),
      period_end: dayjs().toISOString(),
    };

    let effectiveDate: string | undefined;

    if (serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key') || serverEnv.ENV === 'test') {
      // Mock proration for testing
      const currentPlanConfig = currentPriceId ? getPlanByPriceId(currentPriceId) : null;
      const targetPlanConfig = getPlanByPriceId(body.targetPriceId);
      const currentPlanPrice = currentPlanConfig?.priceInCents || 0;
      const targetPlanPrice = targetPlanConfig?.priceInCents || 0;

      if (isDowngradeChange) {
        effectiveDate = dayjs().add(1, 'month').startOf('month').toISOString();
        prorationResult.amount_due = 0;
      } else {
        const daysInMonth = 30;
        const remainingDays = Math.max(1, daysInMonth - dayjs().date());
        const priceDifference = targetPlanPrice - currentPlanPrice;
        prorationResult.amount_due = Math.round((priceDifference * remainingDays) / daysInMonth);
      }
    } else {
      // Real Stripe calculation
      const subscription = await stripe.subscriptions.retrieve(currentSubscription.id);
      const subscriptionItemId = subscription.items.data[0]?.id;

      if (!subscriptionItemId) {
        return this.error('INVALID_SUBSCRIPTION_STATE', 'Subscription has no items', 500);
      }

      if (isDowngradeChange) {
        const subscriptionUnknown = subscription as unknown as {
          current_period_start?: number;
          current_period_end?: number;
        };
        const periodStart = subscriptionUnknown.current_period_start;
        const periodEnd = subscriptionUnknown.current_period_end;

        const periodStartISO = periodStart ? dayjs.unix(periodStart).toISOString() : dayjs().toISOString();
        effectiveDate = periodEnd ? dayjs.unix(periodEnd).toISOString() : undefined;

        prorationResult = {
          amount_due: 0,
          currency: 'usd',
          period_start: periodStartISO,
          period_end: effectiveDate || dayjs().toISOString(),
        };
      } else {
        // Use createPreview for proration calculation
        const invoice = await stripe.invoices.createPreview({
          customer: profile.stripe_customer_id,
          subscription: currentSubscription.id,
          subscription_details: {
            items: [
              {
                id: subscriptionItemId,
                price: body.targetPriceId,
              },
            ],
            proration_behavior: 'create_prorations',
          },
        });

        const currentPlanName = currentPlan?.name || '';
        const targetPlanName = targetPlan.name;

        const relevantItems = invoice.lines.data.filter(line => {
          const desc = line.description || '';
          return (
            (desc.includes('Unused time on') && desc.includes(currentPlanName)) ||
            (desc.includes('Remaining time on') && desc.includes(targetPlanName))
          );
        });

        const seenTypes = new Set<string>();
        const uniqueItems = relevantItems.filter((line: Stripe.InvoiceLineItem) => {
          const desc = line.description || '';
          const type = desc.includes('Unused') ? `unused_${currentPlanName}` : `remaining_${targetPlanName}`;
          if (seenTypes.has(type)) return false;
          seenTypes.add(type);
          return true;
        });

        const prorationTotal = uniqueItems.reduce(
          (sum: number, line: Stripe.InvoiceLineItem) => sum + (line.amount || 0),
          0
        );

        prorationResult = {
          amount_due: prorationTotal,
          currency: invoice.currency,
          period_start: dayjs.unix(invoice.period_start).toISOString(),
          period_end: dayjs.unix(invoice.period_end).toISOString(),
        };
      }
    }

    // 10. Build response
    const tierNameMap: Record<string, string> = {
      starter: 'Starter',
      hobby: 'Hobby',
      pro: 'Professional',
      business: 'Business',
    };
    const currentTierName = tierNameMap[profile.subscription_tier || ''] || profile.subscription_tier || 'Unknown';

    const response: IPreviewChangeResponse = {
      proration: prorationResult,
      current_plan: profile.subscription_tier
        ? {
            name: currentPlan?.name || currentTierName,
            price_id: currentPriceId || '',
            credits_per_month: currentPlan?.creditsPerMonth || currentTierCredits,
          }
        : null,
      new_plan: {
        name: targetPlan.name,
        price_id: body.targetPriceId,
        credits_per_month: targetPlan.creditsPerMonth,
      },
      effective_immediately: !isDowngradeChange,
      effective_date: effectiveDate,
      is_downgrade: isDowngradeChange,
    };

    return this.json(response);
  }

  /**
   * POST /api/subscription/cancel-scheduled
   * Cancel a scheduled subscription change (downgrade)
   */
  private async cancelScheduled(req: NextRequest): Promise<NextResponse> {
    // 1. Authenticate user
    const authResult = await this.authenticateUser(req);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    // 2. Get user's current subscription
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (subError || !subscription) {
      return this.error('NO_ACTIVE_SUBSCRIPTION', 'No active subscription found', 400);
    }

    // 3. Check if there's a scheduled change
    if (!subscription.scheduled_price_id) {
      return this.error('NO_SCHEDULED_CHANGE', 'No scheduled plan change to cancel', 400);
    }

    console.log('[CANCEL_SCHEDULED_START]', {
      userId,
      subscriptionId: subscription.id,
      scheduledPriceId: subscription.scheduled_price_id,
    });

    // 4. Handle test mode
    if (serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key') || serverEnv.ENV === 'test') {
      await supabaseAdmin
        .from('subscriptions')
        .update({
          scheduled_price_id: null,
          scheduled_change_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

      return this.json({
        message: 'Scheduled change canceled successfully',
        mock: true,
      });
    }

    // 5. Get Stripe subscription and release schedule
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.id);
    const scheduleId = stripeSubscription.schedule;

    if (scheduleId && typeof scheduleId === 'string') {
      await stripe.subscriptionSchedules.release(scheduleId);
    }

    // 6. Clear database fields
    await supabaseAdmin
      .from('subscriptions')
      .update({
        scheduled_price_id: null,
        scheduled_change_date: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscription.id);

    return this.json({
      message: 'Scheduled change canceled successfully',
    });
  }

  /**
   * POST /api/subscriptions/cancel
   * Cancel subscription at period end
   */
  private async cancel(req: NextRequest): Promise<NextResponse> {
    // 1. Authenticate user
    const authResult = await this.authenticateUser(req);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    // 2. Parse request body for optional cancellation reason
    const body = await this.getBody<ICancelSubscriptionRequest>(req);
    const cancellationReason = body.reason;

    // 3. Get user's active subscription
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (subError || !subscription) {
      return this.error('NO_ACTIVE_SUBSCRIPTION', 'No active subscription found', 400);
    }

    // 4. Cancel the subscription in Stripe (at period end)
    const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });

    // 5. Update the subscription in database
    const updateData: {
      cancel_at_period_end: boolean;
      updated_at: string;
      cancellation_reason?: string;
    } = {
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    };

    if (cancellationReason) {
      updateData.cancellation_reason = cancellationReason;
    }

    await supabaseAdmin
      .from('subscriptions')
      .update(updateData)
      .eq('id', subscription.id);

    // Access period end timestamp
    const updatedSubUnknown = updatedSubscription as unknown as {
      current_period_end?: number;
    };
    const currentPeriodEnd = updatedSubUnknown.current_period_end || 0;

    return this.json({
      subscription_id: subscription.id,
      cancel_at_period_end: updatedSubscription.cancel_at_period_end,
      current_period_end: currentPeriodEnd,
    });
  }
}
