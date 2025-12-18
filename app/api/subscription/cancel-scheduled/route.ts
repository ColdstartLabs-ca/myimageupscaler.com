import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';

/**
 * Cancel a scheduled subscription change (downgrade)
 * This releases the Stripe subscription schedule and clears our database fields
 */
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

    // 2. Get user's current subscription
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (subError || !subscription) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_ACTIVE_SUBSCRIPTION',
            message: 'No active subscription found',
          },
        },
        { status: 400 }
      );
    }

    // 3. Check if there's a scheduled change
    if (!subscription.scheduled_price_id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_SCHEDULED_CHANGE',
            message: 'No scheduled plan change to cancel',
          },
        },
        { status: 400 }
      );
    }

    console.log('[CANCEL_SCHEDULED_START]', {
      userId: user.id,
      subscriptionId: subscription.id,
      scheduledPriceId: subscription.scheduled_price_id,
      scheduledDate: subscription.scheduled_change_date,
    });

    // 4. Handle test mode
    if (serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key') || serverEnv.ENV === 'test') {
      // Mock: Just clear the database fields
      await supabaseAdmin
        .from('subscriptions')
        .update({
          scheduled_price_id: null,
          scheduled_change_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

      return NextResponse.json({
        success: true,
        data: {
          message: 'Scheduled change canceled successfully',
          mock: true,
        },
      });
    }

    // 5. Get the Stripe subscription to find the schedule
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.id);
    const scheduleId = stripeSubscription.schedule;

    if (scheduleId && typeof scheduleId === 'string') {
      // Release the schedule - this converts back to a regular subscription
      // keeping the current plan without changes
      await stripe.subscriptionSchedules.release(scheduleId);

      console.log('[CANCEL_SCHEDULED_STRIPE_RELEASED]', {
        userId: user.id,
        scheduleId,
      });
    }

    // 6. Clear our database fields
    await supabaseAdmin
      .from('subscriptions')
      .update({
        scheduled_price_id: null,
        scheduled_change_date: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscription.id);

    console.log('[CANCEL_SCHEDULED_COMPLETE]', {
      userId: user.id,
      subscriptionId: subscription.id,
    });

    return NextResponse.json({
      success: true,
      data: {
        message: 'Scheduled change canceled successfully',
      },
    });
  } catch (error: unknown) {
    console.error('Cancel scheduled change error:', error);
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
