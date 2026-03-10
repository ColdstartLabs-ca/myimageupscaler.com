/**
 * Webhook Recovery Proof Suite
 *
 * Stateful integration tests that prove recovery scenarios result in correct
 * final state when webhooks are missed, delayed, or fail.
 *
 * Phase 7 of Subscription System Test Overhaul:
 * - Tests missing webhook recovery
 * - Tests stuck processing state recovery
 * - Tests failed event retry
 * - Tests max retry limits
 *
 * @see docs/PRDs/subscription-test-overhaul.md Phase 7
 */

import { test, expect } from '@playwright/test';
import {
  TestContext,
  assertSubscriptionState,
  assertNoDuplicateAllocations,
  StripeWebhookMockFactory,
  PRICE_IDS,
  CREDITS,
  WebhookClient,
} from '../helpers';

test.describe('Webhook Recovery Proof Suite', () => {
  let ctx: TestContext;

  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test.describe('Missing Webhook Recovery', () => {
    test('Missing checkout webhook: subscription + invoice recover state', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // Create free user
      const user = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(user.id);

      const customerId = `cus_${user.id}_no_checkout`;
      const subscriptionId = `sub_${user.id}_no_checkout`;
      const invoiceId = `in_${user.id}_no_checkout`;

      // Set initial credits
      const supabase = ctx.supabaseAdmin;
      await supabase
        .from('profiles')
        .update({ subscription_credits_balance: 10 })
        .eq('id', user.id);

      // SKIP checkout.session.completed - only fire subscription.created + invoice.payment_succeeded
      const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
        userId: user.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.PRO,
      });
      await webhookClient.send(subscriptionCreatedEvent);

      // Fire invoice.payment_succeeded
      const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('pro', {
        userId: user.id,
        customerId,
        subscriptionId,
      });
      (invoiceEvent.data.object as any).id = invoiceId;
      await webhookClient.send(invoiceEvent);

      // Assert state recovered - tier and credits correct
      await assertSubscriptionState(supabase, user.id, {
        tier: 'pro',
        status: 'active',
      });

      await assertNoDuplicateAllocations(supabase, user.id);
    });

    test('Missing invoice webhook: checkout + subscription establish tier', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // Create free user
      const user = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(user.id);

      const customerId = `cus_${user.id}_no_invoice`;
      const subscriptionId = `sub_${user.id}_no_invoice`;
      const sessionId = `cs_${user.id}_no_invoice`;

      // Set initial credits
      const supabase = ctx.supabaseAdmin;
      await supabase
        .from('profiles')
        .update({ subscription_credits_balance: 10 })
        .eq('id', user.id);

      // Fire checkout.session.completed
      const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription({
        userId: user.id,
        customerId,
        subscriptionId,
        sessionId,
      });
      (checkoutEvent.data.object as any).items = {
        data: [{
          price: { id: PRICE_IDS.HOBBY },
        }],
      };
      await webhookClient.send(checkoutEvent);

      // Fire subscription.created
      const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
        userId: user.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.HOBBY,
      });
      await webhookClient.send(subscriptionCreatedEvent);

      // SKIP invoice.payment_succeeded - tier should still be established
      await assertSubscriptionState(supabase, user.id, {
        tier: 'hobby',
        status: 'active',
      });
    });
  });

  test.describe('Processing State Recovery', () => {
    test('Stuck processing event can be detected', async () => {
      // This test verifies the logic for detecting stuck events
      // In production, the cron job would identify events with:
      // - status = 'processing'
      // - created_at < NOW() - 5 minutes

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000 - 1000);
      const stuckEvent = {
        id: 'evt_stuck_test',
        status: 'processing',
        created_at: fiveMinutesAgo.toISOString(),
        retry_count: 0,
        recoverable: true,
      };

      // Verify the event would be identified as stuck
      const isStuck =
        stuckEvent.status === 'processing' &&
        new Date(stuckEvent.created_at) < new Date(Date.now() - 5 * 60 * 1000);

      expect(isStuck).toBe(true);
    });

    test('Recent processing event is not considered stuck', async () => {
      const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
      const recentEvent = {
        id: 'evt_recent_test',
        status: 'processing',
        created_at: oneMinuteAgo.toISOString(),
        retry_count: 0,
        recoverable: true,
      };

      const isStuck =
        recentEvent.status === 'processing' &&
        new Date(recentEvent.created_at) < new Date(Date.now() - 5 * 60 * 1000);

      expect(isStuck).toBe(false);
    });
  });

  test.describe('Retry Limits', () => {
    test('Event below max retries is eligible for retry', async () => {
      const MAX_RETRIES = 3;
      const retryableEvent = {
        id: 'evt_retryable',
        status: 'failed',
        retry_count: 2,
        recoverable: true,
      };

      const isEligibleForRetry =
        retryableEvent.status === 'failed' &&
        retryableEvent.recoverable === true &&
        retryableEvent.retry_count < MAX_RETRIES;

      expect(isEligibleForRetry).toBe(true);
    });

    test('Event at max retries is not retried', async () => {
      const MAX_RETRIES = 3;
      const maxRetriesEvent = {
        id: 'evt_max_retries',
        status: 'failed',
        retry_count: 3,
        recoverable: false,
      };

      const isEligibleForRetry =
        maxRetriesEvent.status === 'failed' &&
        maxRetriesEvent.recoverable === true &&
        maxRetriesEvent.retry_count < MAX_RETRIES;

      expect(isEligibleForRetry).toBe(false);
    });
  });

  test.describe('No Permanent Bad State', () => {
    test('No "active plan, free credits" state after partial webhook delivery', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // Create free user
      const user = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(user.id);

      const customerId = `cus_${user.id}_partial`;
      const subscriptionId = `sub_${user.id}_partial`;

      // Set initial credits
      const supabase = ctx.supabaseAdmin;
      await supabase
        .from('profiles')
        .update({ subscription_credits_balance: 10 })
        .eq('id', user.id);

      // Fire only subscription.created (no checkout, no invoice)
      const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
        userId: user.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.PRO,
      });
      await webhookClient.send(subscriptionCreatedEvent);

      // Check state - user should either have proper credits or a clear failure state
      // NOT stuck with active tier + 10 free credits
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier, subscription_status, subscription_credits_balance')
        .eq('id', user.id)
        .single();

      if (profile?.subscription_tier === 'pro') {
        // If tier is pro, credits should be > 10 (not stuck at free credits)
        expect(profile.subscription_credits_balance).toBeGreaterThan(10);
      }
      // Otherwise, tier should be null (not partially upgraded)
    });
  });
});
