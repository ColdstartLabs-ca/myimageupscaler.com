import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

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

export async function POST(request: NextRequest) {
  let cancellationClaimed = false;
  let stripeCancellationApplied = false;
  let cancellationStartedAt: string | null = null;
  let cancellationState: {
    id: string;
    cancel_at_period_end: boolean | null;
    scheduled_price_id: string | null;
    scheduled_change_date: string | null;
  } | null = null;

  try {
    // 1. Get the authenticated user from the Authorization header
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

    // Extract the JWT token
    const token = authHeader.replace('Bearer ', '');

    // Verify the user with Supabase
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

    // Parse request body for optional cancellation reason
    let cancellationReason: string | undefined;
    try {
      const body = await request.json();
      cancellationReason = body.reason;
    } catch {
      // No body or invalid JSON - that's okay, reason is optional
    }

    // 2. Get the user's active subscription
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status, cancel_at_period_end, scheduled_price_id, scheduled_change_date')
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

    cancellationStartedAt = new Date().toISOString();
    cancellationState = subscription;
    const { data: claimedSubscription, error: cancellationClaimError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        cancel_at_period_end: true,
        scheduled_price_id: null,
        scheduled_change_date: null,
        updated_at: cancellationStartedAt,
      })
      .eq('id', subscription.id)
      .select('updated_at')
      .maybeSingle();
    if (cancellationClaimError || !claimedSubscription) {
      throw new Error(
        `Failed to claim subscription cancellation: ${
          cancellationClaimError?.message ?? 'subscription was not updated'
        }`
      );
    }
    cancellationStartedAt = String(claimedSubscription.updated_at ?? cancellationStartedAt);
    cancellationClaimed = true;

    // Cancellation wins over any pending plan change.
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.id);
    if (stripeSubscription.schedule && typeof stripeSubscription.schedule === 'string') {
      await stripe.subscriptionSchedules.release(stripeSubscription.schedule);
    }

    // 3. Cancel the subscription in Stripe (at period end)
    const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });
    stripeCancellationApplied = true;

    // 4. Update the subscription in our database
    const updateData: {
      cancel_at_period_end: boolean;
      updated_at: string;
      cancellation_reason?: string;
      scheduled_price_id: null;
      scheduled_change_date: null;
    } = {
      cancel_at_period_end: true,
      updated_at: cancellationStartedAt,
      scheduled_price_id: null,
      scheduled_change_date: null,
    };

    // Add cancellation reason if provided
    if (cancellationReason) {
      updateData.cancellation_reason = cancellationReason;
    }

    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update(updateData)
      .eq('id', subscription.id);

    if (updateError) {
      console.error('Error updating subscription in database:', updateError);
      if (cancellationReason && isSchemaMissingError(updateError)) {
        const { error: fallbackError } = await supabaseAdmin
          .from('subscriptions')
          .update({
            cancel_at_period_end: true,
            updated_at: updateData.updated_at,
            scheduled_price_id: null,
            scheduled_change_date: null,
          })
          .eq('id', subscription.id);

        if (fallbackError) {
          console.error(
            'Fallback subscription update without cancellation_reason failed:',
            fallbackError
          );
        } else {
          console.log('Retried subscription update without cancellation_reason column.');
        }
      }
      // Continue anyway - Stripe is the source of truth
    }

    // Access period end timestamp - Stripe returns Unix timestamps
    const updatedSubUnknown = updatedSubscription as unknown as {
      current_period_end?: number;
    };
    const currentPeriodEnd = updatedSubUnknown.current_period_end || 0;

    return NextResponse.json({
      success: true,
      data: {
        subscription_id: subscription.id,
        cancel_at_period_end: updatedSubscription.cancel_at_period_end,
        current_period_end: currentPeriodEnd,
      },
    });
  } catch (error: unknown) {
    console.error('Cancel subscription error:', error);
    if (
      cancellationClaimed &&
      !stripeCancellationApplied &&
      cancellationState &&
      cancellationStartedAt
    ) {
      const { error: rollbackError } = await supabaseAdmin
        .from('subscriptions')
        .update({
          cancel_at_period_end: cancellationState.cancel_at_period_end,
          scheduled_price_id: cancellationState.scheduled_price_id,
          scheduled_change_date: cancellationState.scheduled_change_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cancellationState.id)
        .eq('updated_at', cancellationStartedAt);
      if (rollbackError) {
        console.error('Failed to roll back subscription cancellation claim:', rollbackError);
      }
    }
    const errorMessage =
      error instanceof Error ? error.message : 'An error occurred canceling subscription';
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
