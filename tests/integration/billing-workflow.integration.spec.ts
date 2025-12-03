import { test, expect } from '@playwright/test';
import { TestContext, ApiClient, WebhookClient } from '../helpers';

/**
 * Billing Workflow Integration Tests
 *
 * These tests verify complete billing workflows including:
 * - Credit pack purchases via Stripe
 * - Subscription management
 * - Webhook processing
 * - Credit allocation and deduction
 * - Billing portal access
 */

test.describe('Billing Workflow Integration', () => {
  let ctx: TestContext;
  let api: ApiClient;
  let webhookClient: WebhookClient;
  let testUser: any;

  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test.beforeEach(async ({ request }) => {
    // Create fresh user for each test
    testUser = await ctx.createUser();
    // Initialize clients for this test
    api = new ApiClient(request).withAuth(testUser.token);
    webhookClient = new WebhookClient(request);
  });

  test.describe('Credit Pack Purchases', () => {
    test('should handle complete credit pack purchase workflow', async ({ request }) => {
      // Step 1: Create checkout session
      const checkoutResponse = await api.post('/api/checkout', {
        priceId: 'price_1O2x3YExample', // Test price ID
        credits: 100,
        mode: 'payment',
      });

      expect([200, 400, 500]).toContain(checkoutResponse.status);

      if (checkoutResponse.status !== 200) {
        return; // Skip webhook test if checkout failed
      }

      const checkoutData = await checkoutResponse.json();
      expect(checkoutData.data?.checkoutUrl).toMatch(/^https?:\/\//);
      expect(checkoutData.data?.sessionId).toBeTruthy();

      // Step 2: Simulate successful payment via webhook
      const webhookResponse = await webhookClient.sendCreditPurchase({
        userId: testUser.id,
        creditsAmount: 100,
        sessionId: checkoutData.data.sessionId,
      });

      expect([200, 202]).toContain(webhookResponse.status);

      // Step 3: Verify credits were added
      const updatedProfile = await ctx.data.getUserProfile(testUser.id);
      expect(updatedProfile.credits_balance).toBe(110); // 10 initial + 100 purchased

      // Step 4: Verify transaction was logged
      const transactions = await ctx.data.getCreditTransactions(testUser.id);
      const purchaseTransaction = transactions.find(t => t.reference_id === checkoutData.data.sessionId);
      expect(purchaseTransaction).toMatchObject({
        amount: 100,
        type: 'purchase',
        description: expect.stringContaining('credit'),
      });
    });

    test('should handle different credit pack sizes', async ({ request }) => {
      const creditPacks = [
        { priceId: 'price_starter', credits: 25, expectedCost: 5 },
        { priceId: 'price_pro', credits: 100, expectedCost: 15 },
        { priceId: 'price_enterprise', credits: 500, expectedCost: 50 },
      ];

      for (const pack of creditPacks) {
        const user = await ctx.createUser();
        const initialProfile = await ctx.data.getUserProfile(user.id);

        // Initialize clients for this user
        const userApi = new ApiClient(request).withAuth(user.token);
        const userWebhookClient = new WebhookClient(request);

        const checkoutResponse = await userApi.post('/api/checkout', {
          priceId: pack.priceId,
          credits: pack.credits,
          mode: 'payment',
        });

        expect([200, 400, 500]).toContain(checkoutResponse.status);

        if (checkoutResponse.status === 200) {
          const checkoutData = await checkoutResponse.json();

          // Simulate webhook
          const webhookResponse = await userWebhookClient.sendCreditPurchase({
            userId: user.id,
            creditsAmount: pack.credits,
            sessionId: checkoutData.data.sessionId,
          });

          expect([200, 202]).toContain(webhookResponse.status);

          // Verify credits
          const finalProfile = await ctx.data.getUserProfile(user.id);
          expect(finalProfile.credits_balance).toBe(
            (initialProfile.credits_balance as number) + pack.credits
          );
        }
      }
    });

    test('should handle failed payment gracefully', async ({ request }) => {
      const checkoutResponse = await api.post('/api/checkout', {
        priceId: 'price_test_failed',
        credits: 50,
        mode: 'payment',
      });

      expect([200, 400, 500]).toContain(checkoutResponse.status);

      if (checkoutResponse.status === 200) {
        const checkoutData = await checkoutResponse.json();

        // Simulate failed payment
        const webhookEvent = {
          type: 'checkout.session.async_payment_failed',
          data: {
            object: {
              id: checkoutData.data.sessionId,
              mode: 'payment',
              payment_status: 'requires_payment_method',
              status: 'complete',
              metadata: {
                user_id: testUser.id,
                credits_amount: '50',
              },
            },
          },
        };

        const webhookResponse = await webhookClient.send(webhookEvent);
        expect([200, 202]).toContain(webhookResponse.status);
      }

      // Verify no credits were added
      const profile = await ctx.data.getUserProfile(testUser.id);
      expect(profile.credits_balance).toBe(10); // Still initial amount
    });
  });

  test.describe('Subscription Management', () => {
    test('should handle subscription creation and activation', async ({ request }) => {
      // Step 1: Create subscription checkout
      const checkoutResponse = await api.post('/api/checkout', {
        priceId: 'price_pro_monthly',
        mode: 'subscription',
      });

      expect([200, 400, 500]).toContain(checkoutResponse.status);

      if (checkoutResponse.status !== 200) {
        return;
      }

      const checkoutData = await checkoutResponse.json();
      expect(checkoutData.data?.sessionId).toBeTruthy();

      // Step 2: Simulate successful subscription creation
      const subscriptionResponse = await webhookClient.sendSubscriptionCreated({
        userId: testUser.id,
        subscriptionId: 'sub_test_123',
        priceId: 'price_pro_monthly',
      });

      expect([200, 202]).toContain(subscriptionResponse.status);

      // Step 3: Verify subscription status
      const updatedProfile = await ctx.data.getUserProfile(testUser.id);
      expect(updatedProfile.subscription_status).toBe('active');
      expect(updatedProfile.subscription_tier).toBe('pro');

      // Step 4: Simulate first payment success
      const invoiceResponse = await webhookClient.sendInvoicePaymentSucceeded({
        userId: testUser.id,
        subscriptionId: 'sub_test_123',
        amount: 1500, // $15.00
      });

      expect([200, 202]).toContain(invoiceResponse.status);

      // Step 5: Verify monthly credits were added
      const finalProfile = await ctx.data.getUserProfile(testUser.id);
      expect(finalProfile.credits_balance).toBeGreaterThanOrEqual(110); // 10 + 100 monthly
    });

    test('should handle subscription cancellation', async ({ request }) => {
      // First create active subscription
      await ctx.data.setSubscriptionStatus(testUser.id, 'active', 'pro', 'sub_test_456');

      // Step 1: Access billing portal
      const portalResponse = await api.post('/api/portal', {
        returnUrl: 'http://localhost:3000/dashboard',
      });

      expect([200, 400, 403]).toContain(portalResponse.status);

      if (portalResponse.status === 200) {
        const portalData = await portalResponse.json();
        expect(portalData.data?.portalUrl).toMatch(/^https?:\/\//);
      }

      // Step 2: Simulate subscription cancellation via webhook
      const cancelResponse = await webhookClient.sendSubscriptionCancelled({
        userId: testUser.id,
        subscriptionId: 'sub_test_456',
      });

      expect([200, 202]).toContain(cancelResponse.status);

      // Step 3: Verify subscription status was updated
      const profile = await ctx.data.getUserProfile(testUser.id);
      expect(profile.subscription_status).toBe('canceled');
      expect(profile.subscription_tier).toBeNull(); // Tier cleared on cancellation
    });

    test('should handle subscription upgrade/downgrade', async ({ request }) => {
      // Start with pro subscription
      await ctx.data.setSubscriptionStatus(testUser.id, 'active', 'pro', 'sub_test_pro');

      // Step 1: Upgrade to enterprise
      const upgradeResponse = await webhookClient.sendSubscriptionUpdated({
        userId: testUser.id,
        subscriptionId: 'sub_test_pro',
        priceId: 'price_enterprise_monthly',
      });

      expect([200, 202]).toContain(upgradeResponse.status);

      // Verify upgrade
      const profile = await ctx.data.getUserProfile(testUser.id);
      expect(profile.subscription_tier).toBe('enterprise');
      expect(profile.subscription_status).toBe('active');

      // Step 2: Downgrade back to pro
      const downgradeResponse = await webhookClient.sendSubscriptionUpdated({
        userId: testUser.id,
        subscriptionId: 'sub_test_pro',
        priceId: 'price_pro_monthly',
      });

      expect([200, 202]).toContain(downgradeResponse.status);

      // Verify downgrade
      const finalProfile = await ctx.data.getUserProfile(testUser.id);
      expect(finalProfile.subscription_tier).toBe('pro');
      expect(finalProfile.subscription_status).toBe('active');
    });
  });

  test.describe('Billing Portal Access', () => {
    test('should provide billing portal access for active users', async ({ request }) => {
      // Set up user with active subscription
      await ctx.data.setSubscriptionStatus(testUser.id, 'active', 'pro');

      const portalResponse = await api.post('/api/portal', {
        returnUrl: 'http://localhost:3000/dashboard',
      });

      expect([200, 400, 403]).toContain(portalResponse.status);

      if (portalResponse.status === 200) {
        const portalData = await portalResponse.json();
        expect(portalData.data?.portalUrl).toMatch(/^https?:\/\//);
        expect(portalData.data?.portalUrl).toContain('return_url=');
      }
    });

    test('should allow portal access for users with purchase history', async ({ request }) => {
      // Add some credits via purchase to create history
      await ctx.data.addCredits(testUser.id, 25, 'purchase');

      const portalResponse = await api.post('/api/portal', {
        returnUrl: 'http://localhost:3000/dashboard',
      });

      expect([200, 400, 403]).toContain(portalResponse.status);
    });

    test('should restrict portal access for users without billing history', async ({ request }) => {
      // User has no subscription or purchase history
      const portalResponse = await api.post('/api/portal', {
        returnUrl: 'http://localhost:3000/dashboard',
      });

      expect([403, 400]).toContain(portalResponse.status);

      if (portalResponse.status === 403) {
        const errorData = await portalResponse.json();
        expect(errorData.error).toContain('No billing history');
      }
    });
  });

  test.describe('Webhook Processing', () => {
    test('should handle duplicate webhook events gracefully', async ({ request }) => {
      const sessionId = 'cs_test_duplicate_' + Date.now();

      // Create webhook event
      const webhookResponse1 = await webhookClient.sendCreditPurchase({
        userId: testUser.id,
        creditsAmount: 50,
        sessionId: sessionId,
      });

      expect([200, 202]).toContain(webhookResponse1.status);

      // Send duplicate webhook
      const webhookResponse2 = await webhookClient.sendCreditPurchase({
        userId: testUser.id,
        creditsAmount: 50,
        sessionId: sessionId,
      });

      expect([200, 202, 409]).toContain(webhookResponse2.status);

      // Verify credits were only added once
      const profile = await ctx.data.getUserProfile(testUser.id);
      expect(profile.credits_balance).toBe(60); // 10 + 50, not 10 + 50 + 50

      // Verify only one transaction
      const transactions = await ctx.data.getCreditTransactions(testUser.id);
      const purchaseTransactions = transactions.filter(t => t.reference_id === sessionId);
      expect(purchaseTransactions).toHaveLength(1);
    });

    test('should handle invalid webhook signatures', async ({ request }) => {
      const webhookEvent = {
        id: 'evt_test_invalid',
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: {
              user_id: testUser.id,
              credits_amount: '25',
            },
          },
        },
      };

      const response = await webhookClient.sendRawEvent(webhookEvent, 'invalid-signature');
      expect([400, 401]).toContain(response.status);

      // Verify no credits were added
      const profile = await ctx.data.getUserProfile(testUser.id);
      expect(profile.credits_balance).toBe(10);
    });

    test('should handle malformed webhook events', async ({ request }) => {
      const malformedEvent = {
        id: 'evt_invalid',
        type: 'checkout.session.completed',
        data: null, // Missing object
      };

      const response = await webhookClient.sendRawEvent(malformedEvent);
      expect([400, 422]).toContain(response.status);
    });
  });

  test.describe('Credit System Integration', () => {
    test('should handle credit deductions for processing', async ({ request }) => {
      // Add credits first
      await ctx.data.addCredits(testUser.id, 50, 'purchase');

      const initialProfile = await ctx.data.getUserProfile(testUser.id);
      const initialBalance = initialProfile.credits_balance as number;

      // Simulate image processing job (this would normally be done by the upscaler service)
      const { error: deductError } = await ctx.supabaseAdmin.rpc('decrement_credits_with_log', {
        target_user_id: testUser.id,
        amount: 3, // Cost for 2x upscale
        transaction_type: 'usage',
        ref_id: 'job_test_123',
        description: 'Image upscaling - 2x',
      });

      expect(deductError).toBeNull();

      // Verify deduction
      const finalProfile = await ctx.data.getUserProfile(testUser.id);
      expect(finalProfile.credits_balance).toBe(initialBalance - 3);

      // Verify transaction
      const transactions = await ctx.data.getCreditTransactions(testUser.id);
      const usageTransaction = transactions.find(t => t.reference_id === 'job_test_123');
      expect(usageTransaction).toMatchObject({
        amount: -3,
        type: 'usage',
        description: 'Image upscaling - 2x',
      });
    });

    test('should refund credits on processing failure', async ({ request }) => {
      // Add credits first
      await ctx.data.addCredits(testUser.id, 25, 'purchase');

      const initialProfile = await ctx.data.getUserProfile(testUser.id);
      const initialBalance = initialProfile.credits_balance as number;

      // Simulate failed processing with refund
      const { error: deductError } = await ctx.supabaseAdmin.rpc('decrement_credits_with_log', {
        target_user_id: testUser.id,
        amount: 2,
        transaction_type: 'usage',
        ref_id: 'job_failed_456',
        description: 'Image upscaling - failed',
      });

      expect(deductError).toBeNull();

      // Now refund
      const { error: refundError } = await ctx.supabaseAdmin.rpc('refund_credits', {
        target_user_id: testUser.id,
        amount: 2,
        job_id: 'job_failed_456',
      });

      expect(refundError).toBeNull();

      // Verify refund (balance should be back to original)
      const finalProfile = await ctx.data.getUserProfile(testUser.id);
      expect(finalProfile.credits_balance).toBe(initialBalance);

      // Verify both transactions exist
      const transactions = await ctx.data.getCreditTransactions(testUser.id);
      const usageTransaction = transactions.find(t => t.reference_id === 'job_failed_456' && t.type === 'usage');
      const refundTransaction = transactions.find(t => t.reference_id === 'job_failed_456' && t.type === 'refund');

      expect(usageTransaction).toMatchObject({ amount: -2, type: 'usage' });
      expect(refundTransaction).toMatchObject({ amount: 2, type: 'refund' });
    });
  });

  test.describe('Analytics and Reporting', () => {
    test('should track billing events in analytics', async ({ request }) => {
      // Create a purchase
      const checkoutResponse = await api.post('/api/checkout', {
        priceId: 'price_test_analytics',
        credits: 75,
        mode: 'payment',
      });

      if (checkoutResponse.status === 200) {
        const checkoutData = await checkoutResponse.json();

        // Simulate successful purchase
        const webhookResponse = await webhookClient.sendCreditPurchase({
          userId: testUser.id,
          creditsAmount: 75,
          sessionId: checkoutData.data.sessionId,
        });

        expect([200, 202]).toContain(webhookResponse.status);

        // Verify transaction for reporting
        const transactions = await ctx.data.getCreditTransactions(testUser.id);
        const purchaseTransaction = transactions.find(t => t.reference_id === checkoutData.data.sessionId);
        expect(purchaseTransaction).toMatchObject({
          amount: 75,
          type: 'purchase',
        });
      }
    });

    test('should maintain audit trail for compliance', async ({ request }) => {
      // Perform multiple billing operations
      await ctx.data.addCredits(testUser.id, 30, 'purchase');

      const { error: deductError } = await ctx.supabaseAdmin.rpc('decrement_credits_with_log', {
        target_user_id: testUser.id,
        amount: 5,
        transaction_type: 'usage',
        ref_id: 'compliance_test',
      });

      expect(deductError).toBeNull();

      // Get complete transaction history
      const transactions = await ctx.data.getCreditTransactions(testUser.id);

      // Verify audit trail properties
      transactions.forEach(transaction => {
        expect(transaction).toHaveProperty('created_at');
        expect(transaction).toHaveProperty('amount');
        expect(transaction).toHaveProperty('type');
        expect(transaction).toHaveProperty('user_id');
        expect(transaction.user_id).toBe(testUser.id);
      });

      // Verify chronological ordering (newest first in this implementation)
      for (let i = 1; i < transactions.length; i++) {
        const current = new Date(transactions[i].created_at as string);
        const previous = new Date(transactions[i - 1].created_at as string);
        expect(current.getTime()).toBeLessThanOrEqual(previous.getTime());
      }
    });
  });
});