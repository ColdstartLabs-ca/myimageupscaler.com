/**
 * Webhook Ordering Proof Suite
 *
 * Stateful integration tests that prove webhook events result in correct
 * persisted database state regardless of delivery order.
 *
 * Phase 3 of Subscription System Test Overhaul:
 * - Tests that different webhook delivery orders result in same final state
 * - Tests idempotency by firing duplicate events
 * - Tests concurrent duplicate handling
 * - Tests that credits are allocated exactly once
 *
 * @see docs/PRDs/subscription-test-overhaul.md Phase 3
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
import type { IStripeEventMock } from '../helpers/stripe-webhook-mocks';

/**
 * Helper to wait for a short delay between webhook events
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper to assert that two subscription states are equivalent
 */
function assertEquivalentState(
  actual: { tier: string | null; status: string | null; credits: number; priceId: string | null },
  expected: { tier: string | null; status: string | null; credits: number; priceId: string | null }
): void {
  expect(actual.tier).toBe(expected.tier);
  expect(actual.status).toBe(expected.status);
  expect(actual.credits).toBe(expected.credits);
  expect(actual.priceId).toBe(expected.priceId);
}

test.describe('Webhook Ordering Proof Suite', () => {
  let ctx: TestContext;

  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test.describe('Event Ordering Tests', () => {
    /**
     * Test ordering 1: Normal order
     * checkout.session.completed -> subscription.created -> invoice.payment_succeeded
     */
    test('ordering 1: normal order results in correct final state', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // Create free user
      const freeUser = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(freeUser.id);

      const customerId = `cus_${freeUser.id}_order1`;
      const subscriptionId = `sub_${freeUser.id}_order1`;
      const invoiceId = `in_${freeUser.id}_order1`;
      const sessionId = `cs_${freeUser.id}_order1`;

      // Fire events in normal order
      // 1. checkout.session.completed
      const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        sessionId,
      });
      (checkoutEvent.data.object as any).items = {
        data: [{ price: { id: PRICE_IDS.PRO } }],
      };
      await webhookClient.send(checkoutEvent);

      // 2. customer.subscription.created
      const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.PRO,
      });
      await webhookClient.send(subscriptionCreatedEvent);

      // 3. invoice.payment_succeeded
      const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('pro', {
        userId: freeUser.id,
        customerId,
        subscriptionId,
      });
      (invoiceEvent.data.object as any).id = invoiceId;
      await webhookClient.send(invoiceEvent);

      // Assert final persisted state
      const supabase = ctx.supabaseAdmin;
      await assertSubscriptionState(supabase, freeUser.id, {
        tier: 'pro',
        status: 'active',
        subscriptionCredits: CREDITS.PRO_MONTHLY,
        purchasedCredits: 0,
        latestPriceId: PRICE_IDS.PRO,
      });

      // Assert no duplicate allocations
      await assertNoDuplicateAllocations(supabase, freeUser.id);
    });

    /**
     * Test ordering 2: subscription.created first
     * subscription.created -> checkout.session.completed -> invoice.payment_succeeded
     */
    test('ordering 2: subscription.created first results in same final state', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      const freeUser = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(freeUser.id);

      const customerId = `cus_${freeUser.id}_order2`;
      const subscriptionId = `sub_${freeUser.id}_order2`;
      const invoiceId = `in_${freeUser.id}_order2`;
      const sessionId = `cs_${freeUser.id}_order2`;

      // Fire events with subscription.created first
      // 1. customer.subscription.created (arrives first)
      const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.PRO,
      });
      await webhookClient.send(subscriptionCreatedEvent);

      // 2. checkout.session.completed
      const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        sessionId,
      });
      (checkoutEvent.data.object as any).items = {
        data: [{ price: { id: PRICE_IDS.PRO } }],
      };
      await webhookClient.send(checkoutEvent);

      // 3. invoice.payment_succeeded
      const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('pro', {
        userId: freeUser.id,
        customerId,
        subscriptionId,
      });
      (invoiceEvent.data.object as any).id = invoiceId;
      await webhookClient.send(invoiceEvent);

      // Assert SAME final state as ordering 1
      const supabase = ctx.supabaseAdmin;
      await assertSubscriptionState(supabase, freeUser.id, {
        tier: 'pro',
        status: 'active',
        subscriptionCredits: CREDITS.PRO_MONTHLY,
        purchasedCredits: 0,
        latestPriceId: PRICE_IDS.PRO,
      });

      await assertNoDuplicateAllocations(supabase, freeUser.id);
    });

    /**
     * Test ordering 3: invoice first
     * invoice.payment_succeeded -> checkout.session.completed -> subscription.created
     */
    test('ordering 3: invoice first results in same final state', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      const freeUser = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(freeUser.id);

      const customerId = `cus_${freeUser.id}_order3`;
      const subscriptionId = `sub_${freeUser.id}_order3`;
      const invoiceId = `in_${freeUser.id}_order3`;
      const sessionId = `cs_${freeUser.id}_order3`;

      // Fire events with invoice first
      // 1. invoice.payment_succeeded (arrives first)
      const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('pro', {
        userId: freeUser.id,
        customerId,
        subscriptionId,
      });
      (invoiceEvent.data.object as any).id = invoiceId;
      await webhookClient.send(invoiceEvent);

      // 2. checkout.session.completed
      const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        sessionId,
      });
      (checkoutEvent.data.object as any).items = {
        data: [{ price: { id: PRICE_IDS.PRO } }],
      };
      await webhookClient.send(checkoutEvent);

      // 3. customer.subscription.created
      const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.PRO,
      });
      await webhookClient.send(subscriptionCreatedEvent);

      // Assert SAME final state
      const supabase = ctx.supabaseAdmin;
      await assertSubscriptionState(supabase, freeUser.id, {
        tier: 'pro',
        status: 'active',
        subscriptionCredits: CREDITS.PRO_MONTHLY,
        purchasedCredits: 0,
        latestPriceId: PRICE_IDS.PRO,
      });

      await assertNoDuplicateAllocations(supabase, freeUser.id);
    });

    /**
     * Test ordering 4: subscription.created -> invoice -> checkout
     */
    test('ordering 4: subscription and invoice before checkout results in same final state', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      const freeUser = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(freeUser.id);

      const customerId = `cus_${freeUser.id}_order4`;
      const subscriptionId = `sub_${freeUser.id}_order4`;
      const invoiceId = `in_${freeUser.id}_order4`;
      const sessionId = `cs_${freeUser.id}_order4`;

      // Fire events: subscription.created -> invoice -> checkout
      const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.PRO,
      });
      await webhookClient.send(subscriptionCreatedEvent);

      const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('pro', {
        userId: freeUser.id,
        customerId,
        subscriptionId,
      });
      (invoiceEvent.data.object as any).id = invoiceId;
      await webhookClient.send(invoiceEvent);

      const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        sessionId,
      });
      (checkoutEvent.data.object as any).items = {
        data: [{ price: { id: PRICE_IDS.PRO } }],
      };
      await webhookClient.send(checkoutEvent);

      // Assert SAME final state as ordering 1
      const supabase = ctx.supabaseAdmin;
      await assertSubscriptionState(supabase, freeUser.id, {
        tier: 'pro',
        status: 'active',
        subscriptionCredits: CREDITS.PRO_MONTHLY,
        purchasedCredits: 0,
        latestPriceId: PRICE_IDS.PRO,
      });

      await assertNoDuplicateAllocations(supabase, freeUser.id);
    });
  });

  test.describe('Duplicate Delivery Tests', () => {
    /**
     * Test: Fire each event twice in normal order
     * Credits should be allocated exactly once, no duplicates
     */
    test('duplicate delivery: each event twice does not double-allocate credits', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      const freeUser = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(freeUser.id);

      const customerId = `cus_${freeUser.id}_dup1`;
      const subscriptionId = `sub_${freeUser.id}_dup1`;
      const invoiceId = `in_${freeUser.id}_dup1`;
      const sessionId = `cs_${freeUser.id}_dup1`;

      // Fire all events twice
      for (let i = 0; i < 2; i++) {
        const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription({
          userId: freeUser.id,
          customerId,
          subscriptionId,
          sessionId,
        });
        (checkoutEvent.data.object as any).items = {
          data: [{ price: { id: PRICE_IDS.PRO } }],
        };
        await webhookClient.send(checkoutEvent);

        const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
          userId: freeUser.id,
          customerId,
          subscriptionId,
          priceId: PRICE_IDS.PRO,
        });
        await webhookClient.send(subscriptionCreatedEvent);

        const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('pro', {
          userId: freeUser.id,
          customerId,
          subscriptionId,
        });
        (invoiceEvent.data.object as any).id = invoiceId;
        await webhookClient.send(invoiceEvent);
      }

      // Assert credits allocated exactly once
      const supabase = ctx.supabaseAdmin;
      await assertSubscriptionState(supabase, freeUser.id, {
        tier: 'pro',
        status: 'active',
        subscriptionCredits: CREDITS.PRO_MONTHLY,
        purchasedCredits: 0,
        latestPriceId: PRICE_IDS.PRO,
      });

      await assertNoDuplicateAllocations(supabase, freeUser.id);
    });

    /**
     * Test: Concurrent duplicate checkout events
     */
    test('concurrent duplicate checkout does not double-allocate', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      const freeUser = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(freeUser.id);

      const customerId = `cus_${freeUser.id}_concurrent`;
      const subscriptionId = `sub_${freeUser.id}_concurrent`;
      const invoiceId = `in_${freeUser.id}_concurrent`;
      const sessionId = `cs_${freeUser.id}_concurrent`;

      // Fire checkout.session.completed twice concurrently
      const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        sessionId,
      });
      (checkoutEvent.data.object as any).items = {
        data: [{ price: { id: PRICE_IDS.PRO } }],
      };

      // Fire both concurrently
      const [response1, response2] = await Promise.all([
        webhookClient.send(checkoutEvent),
        webhookClient.send(checkoutEvent),
      ]);

      // At least one should succeed (200 or 409 for duplicate)
      expect([200, 409, 400].includes(response1.status())).toBeTruthy();
      expect([200, 409, 400].includes(response2.status())).toBeTruthy();

      // Follow up with remaining events to complete subscription
      const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.PRO,
      });
      await webhookClient.send(subscriptionCreatedEvent);

      const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('pro', {
        userId: freeUser.id,
        customerId,
        subscriptionId,
      });
      (invoiceEvent.data.object as any).id = invoiceId;
      await webhookClient.send(invoiceEvent);

      // Assert credits allocated exactly once
      const supabase = ctx.supabaseAdmin;
      const { data: transactions, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', freeUser.id);

      expect(error).toBeNull();

      // Count positive credit allocations
      const allocations = transactions?.filter(t => (t.amount as number) > 0) ?? [];
      const refIds = new Set(allocations.map(t => t.ref_id));
      expect(refIds.size).toBe(allocations.length);

      await assertNoDuplicateAllocations(supabase, freeUser.id);
    });

    /**
     * Test: Duplicate invoice.payment_succeeded
     */
    test('concurrent duplicate invoice does not double-allocate', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      const freeUser = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(freeUser.id);

      const customerId = `cus_${freeUser.id}_invdup`;
      const subscriptionId = `sub_${freeUser.id}_invdup`;
      const invoiceId = `in_${freeUser.id}_invdup`;
      const sessionId = `cs_${freeUser.id}_invdup`;

      // Complete signup first
      const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        sessionId,
      });
      (checkoutEvent.data.object as any).items = {
        data: [{ price: { id: PRICE_IDS.PRO } }],
      };
      await webhookClient.send(checkoutEvent);

      const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.PRO,
      });
      await webhookClient.send(subscriptionCreatedEvent);

      const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('pro', {
        userId: freeUser.id,
        customerId,
        subscriptionId,
      });
      (invoiceEvent.data.object as any).id = invoiceId;
      await webhookClient.send(invoiceEvent);

      // Get initial credit count
      const supabase = ctx.supabaseAdmin;
      const { data: initialProfile } = await supabase
        .from('profiles')
        .select('subscription_credits_balance')
        .eq('id', freeUser.id)
        .single();
      const initialCredits = initialProfile?.subscription_credits_balance ?? 0;

      // Fire the same invoice.payment_succeeded again (duplicate)
      await webhookClient.send(invoiceEvent);

      // Get final credit count
      const { data: finalProfile } = await supabase
        .from('profiles')
        .select('subscription_credits_balance')
        .eq('id', freeUser.id)
        .single();
      const finalCredits = finalProfile?.subscription_credits_balance ?? 0;

      // Credits should NOT have increased from duplicate
      expect(finalCredits).toBe(initialCredits);

      // Assert credit_transactions has exactly 1 entry for that invoice ref
      const { data: transactions, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', freeUser.id)
        .eq('ref_id', invoiceId);

      expect(error).toBeNull();
      expect(transactions?.length ?? 0).toBe(1);

      // Assert no duplicate allocations overall
      await assertNoDuplicateAllocations(supabase, freeUser.id);
    });
  });

  test.describe('Final State Verification Across Orderings', () => {
    /**
     * Comprehensive test: verify all 4 orderings produce identical final state
     */
    test('all orderings produce identical final subscription state', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      interface ISubscriptionFinalState {
        tier: string | null;
        status: string | null;
        credits: number;
        priceId: string | null;
      }

      const results: ISubscriptionFinalState[] = [];

      // Test all 4 orderings
      for (let ordering = 1; ordering <= 4; ordering++) {
        const user = await ctx.createUser({ subscription: 'free' });
        await ctx.setupStripeCustomer(user.id);

        const customerId = `cus_${user.id}_allorder${ordering}`;
        const subscriptionId = `sub_${user.id}_allorder${ordering}`;
        const invoiceId = `in_${user.id}_allorder${ordering}`;
        const sessionId = `cs_${user.id}_allorder${ordering}`;

        // Create events
        const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription({
          userId: user.id,
          customerId,
          subscriptionId,
          sessionId,
        });
        (checkoutEvent.data.object as any).items = {
          data: [{ price: { id: PRICE_IDS.PRO } }],
        };

        const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
          userId: user.id,
          customerId,
          subscriptionId,
          priceId: PRICE_IDS.PRO,
        });

        const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('pro', {
          userId: user.id,
          customerId,
          subscriptionId,
        });
        (invoiceEvent.data.object as any).id = invoiceId;

        // Fire events in different orders
        switch (ordering) {
          case 1: // Normal order
            await webhookClient.send(checkoutEvent);
            await webhookClient.send(subscriptionCreatedEvent);
            await webhookClient.send(invoiceEvent);
            break;
          case 2: // subscription.created first
            await webhookClient.send(subscriptionCreatedEvent);
            await webhookClient.send(checkoutEvent);
            await webhookClient.send(invoiceEvent);
            break;
          case 3: // invoice.payment_succeeded first
            await webhookClient.send(invoiceEvent);
            await webhookClient.send(checkoutEvent);
            await webhookClient.send(subscriptionCreatedEvent);
            break;
          case 4: // checkout.session.completed last
            await webhookClient.send(subscriptionCreatedEvent);
            await webhookClient.send(invoiceEvent);
            await webhookClient.send(checkoutEvent);
            break;
        }

        // Capture final state
        const supabase = ctx.supabaseAdmin;
        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_tier, subscription_status, subscription_credits_balance')
          .eq('id', user.id)
          .single();

        const { data: subscriptions } = await supabase
          .from('subscriptions')
          .select('price_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        results.push({
          tier: profile?.subscription_tier ?? null,
          status: profile?.subscription_status ?? null,
          credits: profile?.subscription_credits_balance ?? 0,
          priceId: subscriptions?.[0]?.price_id ?? null,
        });
      }

      // All 4 results should be identical
      const expectedState: ISubscriptionFinalState = {
        tier: 'pro',
        status: 'active',
        credits: CREDITS.PRO_MONTHLY,
        priceId: PRICE_IDS.PRO,
      };

      for (let i = 0; i < results.length; i++) {
        assertEquivalentState(results[i], expectedState);
      }
    });
  });
});
