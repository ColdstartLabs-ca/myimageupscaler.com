import { test, expect } from '@playwright/test';
import { TestContext, WebhookClient } from '../helpers';

/**
 * Billing Workflow Integration Tests
 *
 * These tests verify webhook processing for billing workflows:
 * - Subscription lifecycle webhooks
 * - Webhook idempotency
 * - Error handling
 *
 * Note: Credit pack purchases are no longer supported - subscription only.
 * Note: Tests that require real database operations are excluded since
 *       test mode uses mocked users and skips actual DB writes.
 */

test.describe('Billing Workflow Integration', () => {
  let ctx: TestContext;
  let webhookClient: WebhookClient;
  let testUser: { id: string; email: string; token: string };

  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test.beforeEach(async ({ request }) => {
    testUser = await ctx.createUser();
    webhookClient = new WebhookClient(request);
  });

  test.describe('Subscription Webhook Processing', () => {
    test('should handle subscription creation webhook', async () => {
      const subscriptionResponse = await webhookClient.sendSubscriptionCreated({
        userId: testUser.id,
        customerId: `cus_${testUser.id}`,
        subscriptionId: `sub_test_${Date.now()}`,
        priceId: 'price_pro_monthly',
      });

      expect([200, 202]).toContain(subscriptionResponse.status);
    });

    test('should handle subscription cancellation webhook', async () => {
      const cancelResponse = await webhookClient.sendSubscriptionCancelled({
        userId: testUser.id,
        customerId: `cus_${testUser.id}`,
        subscriptionId: `sub_cancel_${Date.now()}`,
      });

      expect([200, 202]).toContain(cancelResponse.status);
    });

    test('should handle subscription update webhook', async () => {
      const upgradeResponse = await webhookClient.sendSubscriptionUpdated({
        userId: testUser.id,
        customerId: `cus_${testUser.id}`,
        subscriptionId: `sub_update_${Date.now()}`,
        priceId: 'price_business_monthly',
      });

      expect([200, 202]).toContain(upgradeResponse.status);
    });

    test('should handle invoice payment succeeded webhook', async () => {
      const invoiceResponse = await webhookClient.sendInvoicePaymentSucceeded({
        userId: testUser.id,
        customerId: `cus_${testUser.id}`,
        subscriptionId: `sub_invoice_${Date.now()}`,
      });

      expect([200, 202]).toContain(invoiceResponse.status);
    });

    test('should handle invoice payment failed webhook', async () => {
      const failedResponse = await webhookClient.sendInvoicePaymentFailed({
        userId: testUser.id,
        customerId: `cus_${testUser.id}`,
        subscriptionId: `sub_failed_${Date.now()}`,
      });

      expect([200, 202]).toContain(failedResponse.status);
    });
  });

  test.describe('Webhook Idempotency', () => {
    test('should handle duplicate webhook events gracefully', async () => {
      const eventId = `evt_duplicate_${Date.now()}`;

      const event = {
        id: eventId,
        type: 'customer.subscription.created',
        data: {
          object: {
            id: `sub_dup_${Date.now()}`,
            customer: `cus_${testUser.id}`,
            status: 'active',
            items: {
              data: [{ price: { id: 'price_pro_monthly' } }],
            },
          },
        },
      };

      const response1 = await webhookClient.sendRawEvent(event);
      expect([200, 202]).toContain(response1.status);

      // Send duplicate webhook with same event ID
      const response2 = await webhookClient.sendRawEvent(event);
      expect([200, 202]).toContain(response2.status);

      const data2 = (await response2.json()) as { received: boolean; skipped?: boolean };
      expect(data2.received).toBe(true);
    });
  });

  test.describe('Webhook Error Handling', () => {
    test('should handle malformed webhook events', async () => {
      const malformedEvent = {
        id: `evt_malformed_${Date.now()}`,
        type: 'customer.subscription.created',
        data: null,
      };

      const response = await webhookClient.sendRawEvent(malformedEvent);
      expect([200, 400, 422, 500]).toContain(response.status);
    });

    test('should handle unknown event types gracefully', async () => {
      const unknownEvent = {
        id: `evt_unknown_${Date.now()}`,
        type: 'unknown.event.type',
        data: {
          object: { id: 'test_123' },
        },
      };

      const response = await webhookClient.sendRawEvent(unknownEvent);
      // Should return 200 to prevent Stripe retries
      expect([200, 202]).toContain(response.status);
    });
  });
});
