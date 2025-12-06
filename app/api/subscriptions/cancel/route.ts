import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

export const runtime = 'edge';

function isSchemaMissingError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;

  return (
    error.code === 'PGRST204' ||
    (typeof error.message === 'string' &&
      (error.message.includes('schema cache') || error.message.toLowerCase().includes('column')))
  );
}

export async function POST(request: NextRequest) {
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
      .select('id, status')
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

    // 3. Cancel the subscription in Stripe (at period end)
    const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });

    // 4. Update the subscription in our database
    const updateData: {
      cancel_at_period_end: boolean;
      updated_at: string;
      cancellation_reason?: string;
    } = {
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
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
          })
          .eq('id', subscription.id);

        if (fallbackError) {
          console.error('Fallback subscription update without cancellation_reason failed:', fallbackError);
        } else {
          console.log('Retried subscription update without cancellation_reason column.');
        }
      }
      // Continue anyway - Stripe is the source of truth
    }

    // Access period end timestamp - Stripe returns Unix timestamps
    const currentPeriodEnd = (updatedSubscription as any).current_period_end as number;

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
