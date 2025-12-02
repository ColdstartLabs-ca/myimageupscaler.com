import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import type { ICheckoutSessionRequest } from '@server/stripe/types';
import { clientEnv } from '@shared/config/env';

export const runtime = 'edge'; // Cloudflare Worker compatible

export async function POST(request: NextRequest) {
  try {
    // 1. Get the request body
    const body: ICheckoutSessionRequest = await request.json();
    const { priceId, successUrl, cancelUrl, metadata = {} } = body;

    // Basic validation first (always run this, even in test mode)
    if (!priceId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'priceId is required'
          }
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
            message: 'Missing authorization header'
          }
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
            message: 'Invalid authentication token'
          }
        },
        { status: 401 }
      );
    }

    // 3. Get or create Stripe customer
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    // Only use mock mode if we have an explicitly dummy key or are in NODE_ENV=test
    // Real test keys (sk_test_*) should go through normal Stripe flow
    if (process.env.STRIPE_SECRET_KEY?.includes('dummy_key') && process.env.NODE_ENV === 'test') {
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
        }
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

    // 4. Get the price to determine checkout mode
    const price = await stripe.prices.retrieve(priceId);
    const isSubscription = price.type === 'recurring';

    // 5. Create Stripe Checkout Session
    const baseUrl = request.headers.get('origin') || clientEnv.BASE_URL;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: isSubscription ? 'subscription' : 'payment',
      success_url: successUrl || `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${baseUrl}/canceled`,
      metadata: {
        user_id: user.id,
        ...metadata,
      },
    };

    // For subscriptions, also store metadata on subscription
    if (isSubscription) {
      sessionParams.subscription_data = {
        metadata: {
          user_id: user.id,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // 6. Return the session URL
    return NextResponse.json({
      success: true,
      data: {
        url: session.url,
        sessionId: session.id,
      }
    });
  } catch (error: unknown) {
    console.error('Checkout error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during checkout';
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
