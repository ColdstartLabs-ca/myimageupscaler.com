import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { clientEnv, serverEnv } from '@shared/config/env';

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

    // Handle authentication
    let user: { id: string; email?: string } | null = null;
    let authError: Error | null = null;

    if (serverEnv.ENV === 'test') {
      // In test mode, only accept mock tokens
      if (token.startsWith('test_token_')) {
        // Mock authentication for test environment
        const mockUserId = token.replace('test_token_', '');
        user = {
          id: mockUserId,
          email: `test-${mockUserId}@test.local`,
        };
      } else {
        // Reject any non-mock token immediately in test mode
        // This prevents hanging on invalid tokens during tests
        authError = new Error('Invalid test token');
      }
    } else {
      // Verify the user with Supabase for non-test environments
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

    // 2. Parse and validate request body
    let body: { returnUrl?: string } = {};
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Invalid JSON in request body',
          },
        },
        { status: 400 }
      );
    }

    // 3. Validate return URL if provided
    let returnUrl: string;
    if (body.returnUrl) {
      // Basic URL validation and XSS prevention
      try {
        const url = new URL(body.returnUrl);

        // Only allow http and https protocols
        if (!['http:', 'https:'].includes(url.protocol)) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'INVALID_RETURN_URL',
                message: 'Invalid return URL protocol',
              },
            },
            { status: 400 }
          );
        }

        // Additional XSS prevention - check for dangerous patterns
        const dangerousPatterns = [
          /javascript:/i,
          /data:/i,
          /vbscript:/i,
          /<script/i,
          /onload=/i,
          /onerror=/i,
        ];

        for (const pattern of dangerousPatterns) {
          if (pattern.test(body.returnUrl)) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: 'INVALID_RETURN_URL',
                  message: 'Invalid return URL format',
                },
              },
              { status: 400 }
            );
          }
        }

        returnUrl = body.returnUrl;
      } catch {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_RETURN_URL',
              message: 'Invalid return URL format',
            },
          },
          { status: 400 }
        );
      }
    } else {
      // Default return URL if not provided
      const baseUrl = request.headers.get('origin') || clientEnv.BASE_URL;
      returnUrl = `${baseUrl}/dashboard/billing`;
    }

    // 4. Get Stripe Customer ID from profile
    let stripeCustomerId: string | null = null;

    if (serverEnv.ENV === 'test' && user.id.startsWith('mock_user_')) {
      // Mock Stripe customer ID for test environment
      stripeCustomerId = `cus_test_${user.id}`;
      console.log('Using mock Stripe customer ID for test environment');
    } else {
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
              message: 'Activate a subscription to manage billing.',
            },
          },
          { status: 400 }
        );
      }

      stripeCustomerId = profile.stripe_customer_id;
    }

    // 5. Create Stripe Customer Portal session

    // Check if we're in test mode with dummy Stripe key
    if (serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key') || serverEnv.ENV === 'test') {
      // Return mock response for testing
      return NextResponse.json({
        success: true,
        data: {
          url: `${returnUrl}?mock=true`,
          mock: true,
        },
      });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId!, // We've validated this above
      return_url: returnUrl,
    });

    // 6. Return the portal URL
    return NextResponse.json({
      success: true,
      data: {
        url: portalSession.url,
      },
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
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}
