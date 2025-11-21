import { test, expect } from '@playwright/test';
import crypto from 'crypto';

test.describe('API: Stripe Webhooks', () => {
  // Helper function to generate Stripe webhook signature
  function generateStripeSignature(
    payload: string,
    secret: string
  ): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    return `t=${timestamp},v1=${signature}`;
  }

  test('should reject requests without stripe-signature header', async ({
    request,
  }) => {
    const response = await request.post('/api/webhooks/stripe', {
      data: JSON.stringify({
        type: 'checkout.session.completed',
        data: { object: {} },
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('stripe-signature');
  });

  test('should reject requests with invalid signature', async ({ request }) => {
    const payload = JSON.stringify({
      id: 'evt_test_invalid',
      type: 'checkout.session.completed',
      data: { object: {} },
    });

    const response = await request.post('/api/webhooks/stripe', {
      data: payload,
      headers: {
        'stripe-signature': 'invalid_signature',
        'content-type': 'application/json',
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('signature verification failed');
  });

  // E2E tests with real Stripe webhook signatures are disabled
  // These require proper STRIPE_WEBHOOK_SECRET configuration
  // To enable, add STRIPE_WEBHOOK_SECRET to .env.test and uncomment

  // test('should process valid webhook with correct signature', async ({
  //   request,
  // }) => {
  //   const webhookSecret =
  //     process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';
  //
  //   const event = {
  //     id: 'evt_test_123',
  //     object: 'event',
  //     type: 'checkout.session.completed',
  //     data: {
  //       object: {
  //         id: 'cs_test_123',
  //         object: 'checkout.session',
  //         mode: 'payment',
  //         customer: 'cus_test_123',
  //         metadata: {
  //           user_id: 'user_test_123',
  //           credits_amount: '100',
  //         },
  //       },
  //     },
  //   };
  //
  //   const payload = JSON.stringify(event);
  //   const signature = generateStripeSignature(payload, webhookSecret);
  //
  //   const response = await request.post('/api/webhooks/stripe', {
  //     data: payload,
  //     headers: {
  //       'stripe-signature': signature,
  //       'content-type': 'application/json',
  //     },
  //   });
  //
  //   if (response.status() === 500) {
  //     const data = await response.json();
  //     expect(data.error).not.toContain('signature');
  //     console.log('Expected error (DB/config issue):', data.error);
  //   } else {
  //     expect(response.status()).toBe(200);
  //     const data = await response.json();
  //     expect(data.received).toBe(true);
  //   }
  // });
});
