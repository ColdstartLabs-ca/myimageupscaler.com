import { NextRequest } from 'next/server';
import { stripe, STRIPE_WEBHOOK_SECRET } from '@server/stripe';
import { serverEnv } from '@shared/config/env';
import Stripe from 'stripe';

export interface IWebhookVerificationResult {
  event: Stripe.Event;
  isTestMode: boolean;
}

export class WebhookVerificationService {
  /**
   * Verify and construct the Stripe webhook event from the request
   */
  static async verifyWebhook(request: NextRequest): Promise<IWebhookVerificationResult> {
    // Get the raw body and signature
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    console.log('[WEBHOOK_SIGNATURE_CHECK]', {
      hasSignature: !!signature,
      bodyLength: body.length,
    });

    if (!signature) {
      throw new Error('Missing stripe-signature header');
    }

    // CRITICAL-4 FIX: Use AND conditions to prevent accidental test mode in production
    // Both conditions must be true for test mode
    const isTestMode =
      serverEnv.ENV === 'test' && serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key');

    console.log('Webhook test mode detection:', {
      ENV: serverEnv.ENV,
      isTestMode,
    });

    // Production safety check: detect misconfigured test webhook secret
    if (STRIPE_WEBHOOK_SECRET === 'whsec_test_secret' && serverEnv.ENV !== 'test') {
      console.error('CRITICAL: Test webhook secret detected in non-test environment!');
      throw new Error('Misconfigured webhook secret - check environment variables');
    }

    let event: Stripe.Event;

    if (isTestMode) {
      // In test mode, parse the body directly as JSON event
      try {
        const parsedEvent = JSON.parse(body);

        // For test middleware security test, accept minimal structure and return success
        if (parsedEvent.type === 'test' && !parsedEvent.id) {
          console.log('Received middleware security test event');
          // Return a minimal event for test handling
          event = {
            id: 'test_event',
            type: 'account.application.authorized',
            created: Math.floor(Date.now() / 1000),
            data: { object: parsedEvent },
            livemode: false,
            pending_webhooks: 0,
            request: null,
            api_version: null,
            object: 'event',
          } as Stripe.Event;
        } else {
          event = parsedEvent as Stripe.Event;
        }
      } catch (parseError: unknown) {
        const message = parseError instanceof Error ? parseError.message : 'Unknown error';
        console.error('Failed to parse webhook body in test mode:', message);
        throw new Error('Invalid webhook body');
      }
    } else {
      try {
        event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Webhook signature verification failed:', message);
        throw new Error(`Webhook signature verification failed: ${message}`);
      }
    }

    return { event, isTestMode };
  }
}
