import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import type { ICheckoutSessionRequest } from '@shared/types/stripe';
import { clientEnv, serverEnv } from '@shared/config/env';
import { getPlanForPriceId } from '@shared/config/stripe';
import { BILLING_COPY } from '@shared/constants/billing';
import { getTrialConfig, getPlanConfig } from '@shared/config/subscription.config';

export const runtime = 'edge'; // Cloudflare Worker compatible

export async function POST(request: NextRequest) {
  try {
    // 1. Get the request body
    const body: ICheckoutSessionRequest = await request.json();
    const { priceId, successUrl, cancelUrl, metadata = {}, uiMode = 'hosted' } = body;

    // Basic validation first (always run this, even in test mode)
    if (!priceId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'priceId is required',
          },
        },
        { status: 400 }
      );
    }

    // Check if we're in test mode (before plan validation)
    const isTestMode =
      serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key') && serverEnv.ENV === 'test';

    // Validate that the price ID is a valid subscription price (skip in test mode)
    let plan = null;
    if (!isTestMode) {
      plan = getPlanForPriceId(priceId);
      if (!plan) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_PRICE',
              message: 'Invalid price ID. Only subscription plans are supported.',
            },
          },
          { status: 400 }
        );
      }
    }

    // 2. Get the authenticated user from the Authorization header
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

    // 3. Check if user already has an active subscription
    const { data: existingSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status, price_id')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSubscription) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ALREADY_SUBSCRIBED',
            message:
              'You already have an active subscription. Please manage your subscription through the billing portal to upgrade or downgrade.',
          },
        },
        { status: 400 }
      );
    }

    // 4. Get or create Stripe customer
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    // Only use mock mode if we have an explicitly dummy key or are in NODE_ENV=test
    // Real test keys (sk_test_*) should go through normal Stripe flow
    if (isTestMode) {
      // Create mock customer ID if it doesn't exist
      if (!customerId) {
        customerId = `cus_test_${user.id}`;
        // Update the profile with the mock customer ID
        await supabaseAdmin
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', user.id);
      }

      // Return mock checkout session for testing
      const baseUrl = request.headers.get('origin') || clientEnv.BASE_URL;
      const mockSessionId = `cs_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      return NextResponse.json({
        success: true,
        data: {
          url: `${baseUrl}/success?session_id=${mockSessionId}`,
          sessionId: mockSessionId,
          mock: true,
        },
      });
    }

    if (!customerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });

      customerId = customer.id;

      // Update the profile with the new customer ID
      await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // 5. Verify price is a recurring subscription (double-check with Stripe in production)
    if (!isTestMode) {
      const price = await stripe.prices.retrieve(priceId);
      if (price.type !== 'recurring') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_PRICE',
              message: 'Only subscription plans are supported. One-time payments are not allowed.',
            },
          },
          { status: 400 }
        );
      }
    }

    // 6. Create Stripe Checkout Session (subscription mode only)
    const baseUrl = request.headers.get('origin') || clientEnv.BASE_URL;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      ui_mode: uiMode,
      metadata: {
        user_id: user.id,
        ...(plan ? { plan_key: plan.key } : {}),
        ...metadata,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          ...(plan ? { plan_key: plan.key } : {}),
        },
      },
    };

    // Add trial period if configured and enabled
    const trialConfig = getTrialConfig(priceId);
    if (trialConfig && trialConfig.enabled) {
      // Add trial period to subscription
      sessionParams.subscription_data = {
        ...sessionParams.subscription_data,
        trial_period_days: trialConfig.durationDays,
      };

      // If payment method is not required upfront, set payment collection
      if (!trialConfig.requirePaymentMethod) {
        sessionParams.payment_method_collection = 'if_required';
      }
    }

    // Add return URLs only for hosted mode
    if (uiMode === 'hosted') {
      sessionParams.success_url =
        successUrl || `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`;
      sessionParams.cancel_url = cancelUrl || `${baseUrl}/canceled`;
    } else {
      // For embedded mode, use return_url
      sessionParams.return_url =
        successUrl || `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // 7. Return the session data
    return NextResponse.json({
      success: true,
      data: {
        url: session.url,
        sessionId: session.id,
        clientSecret: session.client_secret, // Required for embedded checkout
      },
    });
  } catch (error: unknown) {
    console.error('Checkout error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'An error occurred during checkout';
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
