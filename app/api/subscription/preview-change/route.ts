import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import { getPlanForPriceId, SUBSCRIPTION_PRICE_MAP } from '@shared/config/stripe';
import type { ISubscriptionPlanMetadata } from '@shared/config/stripe';

export const runtime = 'edge';

interface IPreviewChangeRequest {
  targetPriceId: string;
}

interface IPreviewChangeResponse {
  proration: {
    amount_due: number; // in cents, can be negative (credit) or positive (charge)
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
            message: 'Missing authorization header'
          }
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
            message: 'Invalid authentication token'
          }
        },
        { status: 401 }
      );
    }

    // 2. Parse and validate request body
    let body: IPreviewChangeRequest;
    try {
      const text = await request.text();
      body = JSON.parse(text) as IPreviewChangeRequest;
    } catch (parseError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Invalid JSON in request body'
          }
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
            message: 'targetPriceId is required'
          }
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
            message: 'Invalid or unsupported price ID'
          }
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

    let currentPlan: ISubscriptionPlanMetadata | null = null;
    let currentPriceId: string | null = null;

    if (!subError && currentSubscription) {
      currentPriceId = currentSubscription.price_id;
      if (currentPriceId) {
        currentPlan = getPlanForPriceId(currentPriceId);
      }
    }

    // 5. Check if this is actually a change
    if (currentPriceId === body.targetPriceId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SAME_PLAN',
            message: 'Target plan is the same as current plan'
          }
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
            message: 'User has no Stripe customer ID'
          }
        },
        { status: 400 }
      );
    }

    // 7. Calculate proration
    let prorationResult: IPreviewChangeResponse['proration'] = {
      amount_due: 0,
      currency: 'usd',
      period_start: new Date().toISOString(),
      period_end: new Date().toISOString(),
    };

    // If user has no current subscription, this is a new subscription (no proration)
    if (currentSubscription && currentPlan) {
      // Check if we're in test mode
      if (serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key') || serverEnv.ENV === 'test') {
        // Mock proration calculation for testing
        const currentPlanPrice = 1900; // $19 for hobby in cents
        const targetPlanPrice = targetPlan.key === 'pro' ? 4900 : targetPlan.key === 'business' ? 14900 : 1900;

        // Simple mock calculation: difference in monthly price * remaining days in month / 30
        const daysInMonth = 30;
        const remainingDays = Math.max(1, daysInMonth - new Date().getDate());
        const priceDifference = targetPlanPrice - currentPlanPrice;
        prorationResult.amount_due = Math.round((priceDifference * remainingDays) / daysInMonth);
      } else {
        // Real Stripe proration calculation
        try {
          const subscription = await stripe.subscriptions.retrieve(currentSubscription.id);

          // Create a preview invoice to see the proration
          const invoice = await stripe.invoices.createPreview({
            customer: profile.stripe_customer_id,
            subscription: currentSubscription.id,
            subscription_details: {
              items: [
                {
                  id: subscription.items.data[0]?.id,
                  price: body.targetPriceId,
                },
              ],
            },
          });

          // Get the proration amount from the invoice
          const prorationAmount = invoice.lines.data
            .filter((line: any) => line.type === 'invoiceitem' && line.proration)
            .reduce((total: number, line: any) => total + (line.amount || 0), 0);

          prorationResult = {
            amount_due: Math.abs(prorationAmount),
            currency: invoice.currency,
            period_start: new Date(invoice.period_start * 1000).toISOString(),
            period_end: new Date(invoice.period_end * 1000).toISOString(),
          };

          // Make amount_due negative for credits, positive for charges
          if (prorationAmount < 0) {
            prorationResult.amount_due = -prorationResult.amount_due;
          }
        } catch (stripeError: unknown) {
          console.error('Stripe proration calculation error:', stripeError);
          const errorMessage = stripeError instanceof Error ? stripeError.message : 'Unknown error';

          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'STRIPE_ERROR',
                message: `Failed to calculate proration: ${errorMessage}`
              }
            },
            { status: 500 }
          );
        }
      }
    }

    // 8. Build response
    const response: IPreviewChangeResponse = {
      proration: prorationResult,
      current_plan: currentPlan ? {
        name: currentPlan.name,
        price_id: currentPriceId!,
        credits_per_month: currentPlan.creditsPerMonth,
      } : null,
      new_plan: {
        name: targetPlan.name,
        price_id: body.targetPriceId,
        credits_per_month: targetPlan.creditsPerMonth,
      },
      effective_immediately: !!currentSubscription,
    };

    return NextResponse.json({
      success: true,
      data: response,
    });

  } catch (error: unknown) {
    console.error('Subscription preview error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage
        }
      },
      { status: 500 }
    );
  }
}