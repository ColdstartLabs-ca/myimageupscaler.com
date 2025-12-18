import { NextResponse } from 'next/server';
import { stripe } from '@server/stripe';
import { serverEnv } from '@shared/config/env';

export async function GET() {
  try {
    const healthStatus = {
      stripe_configured: false,
      webhook_secret_valid: false,
      api_key_valid: false,
      test_mode: false,
      error: null as string | null,
    };

    // Check if Stripe secret key is configured
    if (!serverEnv.STRIPE_SECRET_KEY || serverEnv.STRIPE_SECRET_KEY.includes('dummy_key')) {
      healthStatus.test_mode = true;
      healthStatus.error = 'Stripe is in test mode with dummy key';
      return NextResponse.json(healthStatus);
    }

    healthStatus.stripe_configured = true;

    // Check webhook secret
    if (!serverEnv.STRIPE_WEBHOOK_SECRET) {
      healthStatus.webhook_secret_valid = false;
      healthStatus.error = 'Stripe webhook secret is not configured';
    } else if (serverEnv.STRIPE_WEBHOOK_SECRET.startsWith('whsec_test_')) {
      healthStatus.webhook_secret_valid = true;
      healthStatus.test_mode = true;
    } else {
      healthStatus.webhook_secret_valid = true;
    }

    // Test API key validity by making a simple API call
    try {
      // Use a lightweight API call to test the key
      await stripe.prices.list({ limit: 1 });
      healthStatus.api_key_valid = true;
    } catch (apiError: unknown) {
      healthStatus.api_key_valid = false;
      const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown API error';
      healthStatus.error = `Stripe API key validation failed: ${errorMessage}`;
    }

    // Return health status
    return NextResponse.json(healthStatus);

  } catch (error: unknown) {
    console.error('Stripe health check error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        stripe_configured: false,
        webhook_secret_valid: false,
        api_key_valid: false,
        test_mode: false,
        error: `Health check failed: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}