import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import type { ICheckoutSessionRequest } from '@shared/types/stripe';
import { clientEnv, serverEnv } from '@shared/config/env';
import { getPlanForPriceId } from '@shared/config/stripe';
import { BILLING_COPY } from '@shared/constants/billing';
import { getTrialConfig, getPlanConfig } from '@shared/config/subscription.config';
import { getCreditPackByPriceId } from '@shared/config/subscription.utils';

export const runtime = 'edge'; // Cloudflare Worker compatible

export async function POST(request: NextRequest) {
  try {
    // 1. Get the request body
    let body: ICheckoutSessionRequest;
    try {
      const text = await request.text();
      body = JSON.parse(text);
    } catch (parseError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid JSON in request body',
          },
        },
        { status: 400 }
      );
    }

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

    // Basic format validation for price ID (always run, even in test mode)
    if (typeof priceId !== 'string' || priceId.trim() === '') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'priceId must be a non-empty string',
          },
        },
        { status: 400 }
      );
    }

    // Validate basic Stripe price ID format (starts with 'price_' and has reasonable length)
    if (!priceId.startsWith('price_') || priceId.length < 10) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PRICE',
            message:
              'Invalid price ID format. Price IDs must start with "price_" and be valid Stripe price identifiers.',
          },
        },
        { status: 400 }
      );
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

    // Check if we're in test mode (after basic validation)
    const isTestMode =
      (serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key') && serverEnv.ENV === 'test') ||
      (serverEnv.ENV === 'test' && token.startsWith('test_token_'));

    // Validate that the price ID is either a subscription plan or credit pack (skip in test mode)
    let plan = null;
    let creditPack = null;

    if (!isTestMode) {
      plan = getPlanForPriceId(priceId);
      creditPack = getCreditPackByPriceId(priceId);

      if (!plan && !creditPack) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_PRICE',
              message: 'Invalid price ID. Must be a subscription plan or credit pack.',
            },
          },
          { status: 400 }
        );
      }
    }

    // 3. Get user from token (mock authentication for testing)
    let user: any = null;
    let authError: any = null;

    if (serverEnv.ENV === 'test' && token.startsWith('test_token_')) {
      // Mock authentication for testing
      // Handle both format: test_token_mock_user_{userId} and test_token_{userId}
      let mockUserId: string;

      if (token.startsWith('test_token_mock_user_')) {
        // New format from test data manager
        mockUserId = token.replace('test_token_mock_user_', '');
      } else {
        // Legacy format
        mockUserId = token.replace('test_token_', '');
      }

      user = {
        id: mockUserId,
        email: `test-${mockUserId}@example.com`,
      };
    } else {
      // Verify the user with Supabase
      const result = await supabaseAdmin.auth.getUser(token);
      user = result.data.user;
      authError = result.error;
    }

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

    // 4. Check if user already has an active subscription (only for subscription purchases)
    let existingSubscription = null;

    if (plan) {
      // Only check for existing subscription if purchasing a subscription plan
      if (serverEnv.ENV === 'test' && token.startsWith('test_token_')) {
        // For mock users, check if subscription status is encoded in the token metadata
        // Mock users can include subscription info in their token metadata

        // Check if token includes subscription metadata (format: test_token_mock_user_id_sub_status_tier)
        const tokenParts = token.split('_');
        if (tokenParts.length > 5) {
          const subscriptionStatus = tokenParts[tokenParts.length - 2];
          if (['active', 'trialing'].includes(subscriptionStatus)) {
            existingSubscription = { status: subscriptionStatus };
          }
        }
      } else {
        const { data: subscriptionData } = await supabaseAdmin
          .from('subscriptions')
          .select('id, status, price_id')
          .eq('user_id', user.id)
          .in('status', ['active', 'trialing'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        existingSubscription = subscriptionData;
      }

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
    }

    // 5. Get or create Stripe customer
    let customerId = null;

    if (!(serverEnv.ENV === 'test' && token.startsWith('test_token_'))) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .single();

      customerId = profile?.stripe_customer_id;
    }

    // Only use mock mode if we have an explicitly dummy key or are in NODE_ENV=test
    // Real test keys (sk_test_*) should go through normal Stripe flow
    if (isTestMode) {
      // Create mock customer ID if it doesn't exist
      if (!customerId) {
        customerId = `cus_test_${user.id}`;

        // Only try to update profile for non-mock users
        if (!token.startsWith('test_token_mock_user_')) {
          // Update the profile with the mock customer ID
          await supabaseAdmin
            .from('profiles')
            .update({ stripe_customer_id: customerId })
            .eq('id', user.id);
        }
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

    // 6. Verify price type matches expected (double-check with Stripe in production)
    if (!isTestMode) {
      const price = await stripe.prices.retrieve(priceId);
      if (plan && price.type !== 'recurring') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_PRICE',
              message: 'Invalid price type. Subscription plans must be recurring.',
            },
          },
          { status: 400 }
        );
      }
      if (creditPack && price.type !== 'one_time') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_PRICE',
              message: 'Invalid price type. Credit packs must be one-time payments.',
            },
          },
          { status: 400 }
        );
      }
    }

    // 7. Create Stripe Checkout Session (supports both subscription and payment modes)
    const baseUrl = request.headers.get('origin') || clientEnv.BASE_URL;
    const checkoutMode = creditPack ? 'payment' : 'subscription';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: checkoutMode,
      ui_mode: uiMode,
      metadata: {
        user_id: user.id,
        ...(plan ? { plan_key: plan.key, type: 'subscription' } : {}),
        ...(creditPack
          ? {
              credits: creditPack.credits.toString(),
              pack_key: creditPack.key,
              type: 'credit_purchase',
            }
          : {}),
        ...metadata,
      },
    };

    // Only add subscription_data for subscriptions
    if (plan && checkoutMode === 'subscription') {
      sessionParams.subscription_data = {
        metadata: {
          user_id: user.id,
          plan_key: plan.key,
        },
      };

      // Add trial period if configured and enabled
      const trialConfig = getTrialConfig(priceId);
      if (trialConfig && trialConfig.enabled) {
        // Add trial period to subscription
        sessionParams.subscription_data.trial_period_days = trialConfig.durationDays;

        // If payment method is not required upfront, set payment collection
        if (!trialConfig.requirePaymentMethod) {
          sessionParams.payment_method_collection = 'if_required';
        }
      }
    }

    // Add return URLs only for hosted mode
    // Include purchase type in success URL for proper messaging
    const purchaseType = creditPack ? 'credits' : 'subscription';
    const creditsParam = creditPack ? `&credits=${creditPack.credits}` : '';

    if (uiMode === 'hosted') {
      sessionParams.success_url =
        successUrl ||
        `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&type=${purchaseType}${creditsParam}`;
      sessionParams.cancel_url = cancelUrl || `${baseUrl}/canceled`;
    } else {
      // For embedded mode, use return_url
      sessionParams.return_url =
        successUrl ||
        `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&type=${purchaseType}${creditsParam}`;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // 8. Return the session data
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
