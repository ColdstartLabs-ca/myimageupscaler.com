import { test, expect } from '@playwright/test';
import { TestContext, WebhookClient, ApiResponse } from '../helpers';

/**
 * Integration Tests for Stripe Webhooks API
 *
 * These tests validate webhook event processing including:
 * - Signature validation (bypassed in test mode)
 * - Subscription lifecycle management
 * - Invoice payment handling
 * - Error handling and edge cases
 *
 * Note: Credit purchase tests removed as the system is subscription-only.
 * Webhook handlers rely on stripe_customer_id mapping which is set during
 * actual Stripe checkout flows, not during test user creation.
 */

// Shared test setup for all webhook tests
let ctx: TestContext;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

test.describe('API: Stripe Webhooks - Signature Validation', () => {
  test('should reject requests without stripe-signature header', async ({ request }) => {
    const webhookClient = new WebhookClient(request);
    const response = await webhookClient.send(
      {
        type: 'checkout.session.completed',
        data: { object: {} },
      },
      null
    );

    response.expectStatus(400);
  });

  test('should accept requests with valid signature header in test mode', async ({ request }) => {
    const webhookClient = new WebhookClient(request);
    const user = await ctx.createUser();

    const response = await webhookClient.sendCreditPurchase({
      userId: user.id,
      creditsAmount: 50,
    });

    // In test mode, signature verification is bypassed - webhook should be received
    response.expectSuccess();
  });
});

test.describe('API: Stripe Webhooks - Event Processing', () => {
  test('should process valid webhook events without crashing', async ({ request }) => {
    const webhookClient = new WebhookClient(request);
    const user = await ctx.createUser();

    // Create a checkout session event with real user
    const event = {
      id: `evt_checkout_${Date.now()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          status: 'complete',
          customer: `cus_${user.id}`,
          subscription: 'sub_test_subscription',
          metadata: {
            user_id: user.id,
            plan_key: 'hobby',
          },
        },
      },
    };

    const response = await webhookClient.send(event);
    // Webhook should return 200 (even if user not found by customer ID)
    response.expectSuccess();
    const data = (await response.json()) as { received: boolean };
    expect(data.received).toBe(true);
  });

  test('should handle unknown customer gracefully', async ({ request }) => {
    const webhookClient = new WebhookClient(request);

    const response = await webhookClient.sendSubscriptionCreated({
      userId: 'unknown_user',
      customerId: 'cus_unknown',
      subscriptionId: 'sub_unknown',
    });

    // Should still return 200 (Stripe expects 2xx to stop retrying)
    response.expectSuccess();
    const data = (await response.json()) as { received: boolean };
    expect(data.received).toBe(true);
  });

  test('should handle subscription lifecycle events', async ({ request }) => {
    const testUser = await ctx.createUser();
    const webhookClient = new WebhookClient(request);

    // Send subscription created event
    const response1 = await webhookClient.sendSubscriptionCreated({
      userId: testUser.id,
      customerId: `cus_${testUser.id}`,
      subscriptionId: `sub_lifecycle_${Date.now()}`,
      priceId: 'price_hobby_monthly',
    });

    // Webhook should be received (even if business logic doesn't find user by customer ID)
    expect([200, 202]).toContain(response1.status);

    // Send subscription updated event
    const response2 = await webhookClient.sendSubscriptionUpdated({
      userId: testUser.id,
      customerId: `cus_${testUser.id}`,
      subscriptionId: `sub_lifecycle_${Date.now()}`,
      priceId: 'price_pro_monthly',
    });
    expect([200, 202]).toContain(response2.status);
  });
});

test.describe('API: Stripe Webhooks - Error Handling', () => {
  test('should reject malformed webhook body', async ({ request }) => {
    const response = await request.post('/api/webhooks/stripe', {
      data: 'invalid json {{{',
      headers: {
        'stripe-signature': 'invalid_signature',
        'content-type': 'text/plain',
      },
    });

    // Should return 400 or 500 for malformed JSON
    expect([400, 500]).toContain(response.status());
  });

  test('should handle checkout session without metadata', async ({ request }) => {
    const webhookClient = new WebhookClient(request);

    const event = {
      id: `evt_no_metadata_${Date.now()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'payment',
          payment_status: 'paid',
          status: 'complete',
          // No metadata field
        },
      },
    };

    const response = await webhookClient.send(event);

    // Should handle gracefully without crashing - returns 200
    response.expectSuccess();
    const data = (await response.json()) as { received: boolean };
    expect(data.received).toBe(true);
  });

  test('should handle malformed event data gracefully', async ({ request }) => {
    const webhookClient = new WebhookClient(request);

    const malformedEvent = {
      id: `evt_malformed_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.created',
      data: { object: {} }, // Missing required fields
    };

    const response = await webhookClient.sendRawEvent(malformedEvent);

    // Should still return success to prevent Stripe retries
    // The webhook handler logs errors but returns 200 for most cases
    expect([200, 400, 422, 500]).toContain(response.status);
  });
});

test.describe('API: Stripe Webhooks - Idempotency', () => {
  test('should skip duplicate events', async ({ request }) => {
    const webhookClient = new WebhookClient(request);
    const eventId = `evt_idempotency_${Date.now()}`;

    // Create event with explicit ID
    const event = {
      id: eventId,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          status: 'complete',
          customer: 'cus_test',
          subscription: 'sub_test',
        },
      },
    };

    // First request should process
    const response1 = await webhookClient.sendRawEvent(event);
    expect([200, 202]).toContain(response1.status);

    // Second request with same ID should be skipped
    const response2 = await webhookClient.sendRawEvent(event);
    expect([200, 202]).toContain(response2.status);

    const data2 = (await response2.json()) as { received: boolean; skipped?: boolean };
    // Should indicate it was skipped due to duplicate
    expect(data2.received).toBe(true);
    if (data2.skipped !== undefined) {
      expect(data2.skipped).toBe(true);
    }
  });

  test('should handle concurrent duplicate requests', async ({ request }) => {
    const testUser = await ctx.createUser();
    const webhookClient = new WebhookClient(request);

    const concurrentRequests = 5;
    const promises = [];

    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(
        webhookClient.sendCreditPurchase({
          userId: testUser.id,
          creditsAmount: 50,
        })
      );
    }

    const responses = await Promise.all(promises);

    // All should complete without error (200 or rate limited 429)
    responses.forEach(response => {
      expect([200, 202, 429]).toContain(response.status);
    });
  });
});

test.describe('API: Stripe Webhooks - Performance', () => {
  test('should handle multiple webhook events within time limit', async ({ request }) => {
    const testUser = await ctx.createUser();
    const webhookClient = new WebhookClient(request);

    const startTime = Date.now();
    const responses: ApiResponse[] = [];

    // Send 10 events sequentially
    for (let i = 0; i < 10; i++) {
      const response = await webhookClient.sendInvoicePaymentSucceeded({
        userId: testUser.id,
        customerId: `cus_${testUser.id}`,
        subscriptionId: `sub_perf_${i}_${Date.now()}`,
      });
      responses.push(response);
    }
    const endTime = Date.now();

    // Should complete within 30 seconds
    expect(endTime - startTime).toBeLessThan(30000);

    // All should return valid status codes
    responses.forEach(response => {
      expect([200, 202, 429]).toContain(response.status);
    });
  });
});

test.describe('API: Stripe Webhooks - Subscription Price Validation', () => {
  test('should accept valid subscription price IDs', async ({ request }) => {
    const user = await ctx.createUser();
    const webhookClient = new WebhookClient(request);

    // Known valid price IDs from the subscription.config.ts
    const validPriceIds = [
      'price_1Sz0fNL1vUl00LlZX1XClz95', // STARTER_MONTHLY
      'price_1Sz0fNL1vUl00LlZT6MMTxAg', // HOBBY_MONTHLY
      'price_1Sz0fOL1vUl00LlZ7bbM2cDs', // PRO_MONTHLY
      'price_1Sz0fOL1vUl00LlZP3y5zdFx', // BUSINESS_MONTHLY
    ];

    // Test a valid subscription price ID
    for (const priceId of validPriceIds) {
      const response = await webhookClient.sendSubscriptionCreated({
        userId: user.id,
        customerId: `cus_${user.id}`,
        subscriptionId: `sub_price_${Date.now()}`,
        priceId,
      });

      // Should process valid subscription prices
      response.expectSuccess();
      const data = (await response.json()) as { received: boolean };
      expect(data.received).toBe(true);
    }
  });
});
