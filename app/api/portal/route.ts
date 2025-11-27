import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { clientEnv } from '@shared/config/env';

export const runtime = 'edge';

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

    // 2. Get Stripe Customer ID from profile
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
            message: 'No Stripe customer found. Please make a purchase first.'
          }
        },
        { status: 400 }
      );
    }

    // 3. Create Stripe Customer Portal session
    const baseUrl = request.headers.get('origin') || clientEnv.BASE_URL;

    // Check if we're in test mode with dummy Stripe key
    if (process.env.STRIPE_SECRET_KEY?.includes('dummy_key') || process.env.NODE_ENV === 'test') {
      // Return mock response for testing
      return NextResponse.json({
        success: true,
        data: {
          url: `${baseUrl}/dashboard/billing?mock=true`,
          mock: true,
        }
      });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${baseUrl}/dashboard/billing`,
    });

    // 4. Return the portal URL
    return NextResponse.json({
      success: true,
      data: {
        url: portalSession.url,
      }
    });
  } catch (error: unknown) {
    console.error('Portal session error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'An error occurred creating portal session';
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
