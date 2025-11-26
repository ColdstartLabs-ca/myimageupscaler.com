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

    if (!priceId) {
      return NextResponse.json(
        { error: 'priceId is required' },
        { status: 400 }
      );
    }

    // 2. Get the authenticated user from the Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Missing authorization header' },
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
        { error: 'Invalid authentication token' },
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
      url: session.url,
      sessionId: session.id,
    });
  } catch (error: unknown) {
    console.error('Checkout error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during checkout';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
