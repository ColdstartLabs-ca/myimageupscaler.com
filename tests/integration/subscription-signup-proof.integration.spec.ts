/**
 * Subscription Signup Proof Suite
 *
 * Stateful integration tests that prove real user journeys end with correct persisted database state.
 * These tests fire actual webhook route handlers and verify the final persisted database state
 * across profiles, subscriptions, and credit_transactions tables.
 *
 * Phase 2 of Subscription System Test Overhaul:
 * - Tests Free → {Hobby, Pro, Business, Starter} signup flows
 * - Tests Credit Pack purchase (no subscription)
 * - Tests that signup webhook sequences allocate credits exactly once
 *
 * @see docs/PRDs/subscription-test-overhaul.md Phase 2
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

test.describe('Subscription Signup Proof Suite', () => {
  let ctx: TestContext;

  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test.describe('Free → Hobby signup flow', () => {
    test('should end with correct tier, status, and credits', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // Step 1: Create free user (10 credits)
      const freeUser = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(freeUser.id);

      const customerId = `cus_${freeUser.id}`;
      const subscriptionId = `sub_${freeUser.id}_hobby`;
      const invoiceId = `in_${freeUser.id}_hobby`;
      const sessionId = `cs_${freeUser.id}_hobby`;

      // Step 2: Fire checkout.session.completed (subscription mode, Hobby price)
      const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        sessionId,
      });
      // Update with Hobby price ID
      (checkoutEvent.data.object as any).items = {
        data: [{
          price: { id: PRICE_IDS.HOBBY },
        }],
      };
      await webhookClient.send(checkoutEvent);

      // Step 3: Fire customer.subscription.created
      const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.HOBBY,
      });
      await webhookClient.send(subscriptionCreatedEvent);

      // Step 4: Fire invoice.payment_succeeded
      const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('hobby', {
        userId: freeUser.id,
        customerId,
        subscriptionId,
      });
      // Update invoice ID to match
      (invoiceEvent.data.object as any).id = invoiceId;
      await webhookClient.send(invoiceEvent);

      // Step 5: Assert final persisted state
      const supabase = ctx.supabaseAdmin;

      // Assert subscription state across profiles and subscriptions tables
      await assertSubscriptionState(supabase, freeUser.id, {
        tier: 'hobby',
        status: 'active',
        subscriptionCredits: CREDITS.HOBBY_MONTHLY,
        purchasedCredits: 0,
        latestPriceId: PRICE_IDS.HOBBY,
      });

      // Assert exactly 1 subscription credit allocation (not 2 or 3)
      await assertNoDuplicateAllocations(supabase, freeUser.id);
    });
  });

  test.describe('Free → Pro signup flow', () => {
    test('should end with correct tier, status, and credits', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // Step 1: Create free user (10 credits)
      const freeUser = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(freeUser.id);

      const customerId = `cus_${freeUser.id}`;
      const subscriptionId = `sub_${freeUser.id}_pro`;
      const invoiceId = `in_${freeUser.id}_pro`;
      const sessionId = `cs_${freeUser.id}_pro`;

      // Step 2: Fire checkout.session.completed (subscription mode, Pro price)
      const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        sessionId,
      });
      (checkoutEvent.data.object as any).items = {
        data: [{
          price: { id: PRICE_IDS.PRO },
        }],
      };
      await webhookClient.send(checkoutEvent);

      // Step 3: Fire customer.subscription.created
      const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.PRO,
      });
      await webhookClient.send(subscriptionCreatedEvent);

      // Step 4: Fire invoice.payment_succeeded
      const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('pro', {
        userId: freeUser.id,
        customerId,
        subscriptionId,
      });
      (invoiceEvent.data.object as any).id = invoiceId;
      await webhookClient.send(invoiceEvent);

      // Step 5: Assert final persisted state
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
  });

  test.describe('Free → Business signup flow', () => {
    test('should end with correct tier, status, and credits', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // Step 1: Create free user (10 credits)
      const freeUser = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(freeUser.id);

      const customerId = `cus_${freeUser.id}`;
      const subscriptionId = `sub_${freeUser.id}_business`;
      const invoiceId = `in_${freeUser.id}_business`;
      const sessionId = `cs_${freeUser.id}_business`;

      // Step 2: Fire checkout.session.completed (subscription mode, Business price)
      const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        sessionId,
      });
      (checkoutEvent.data.object as any).items = {
        data: [{
          price: { id: PRICE_IDS.BUSINESS },
        }],
      };
      await webhookClient.send(checkoutEvent);

      // Step 3: Fire customer.subscription.created
      const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.BUSINESS,
      });
      await webhookClient.send(subscriptionCreatedEvent);

      // Step 4: Fire invoice.payment_succeeded
      const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('business', {
        userId: freeUser.id,
        customerId,
        subscriptionId,
      });
      (invoiceEvent.data.object as any).id = invoiceId;
      await webhookClient.send(invoiceEvent);

      // Step 5: Assert final persisted state
      const supabase = ctx.supabaseAdmin;

      await assertSubscriptionState(supabase, freeUser.id, {
        tier: 'business',
        status: 'active',
        subscriptionCredits: CREDITS.BUSINESS_MONTHLY,
        purchasedCredits: 0,
        latestPriceId: PRICE_IDS.BUSINESS,
      });

      // Assert no duplicate allocations
      await assertNoDuplicateAllocations(supabase, freeUser.id);
    });
  });

  test.describe('Free → Starter signup flow', () => {
    test('should end with correct tier, status, and credits', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // Step 1: Create free user (10 credits)
      const freeUser = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(freeUser.id);

      const customerId = `cus_${freeUser.id}`;
      const subscriptionId = `sub_${freeUser.id}_starter`;
      const invoiceId = `in_${freeUser.id}_starter`;
      const sessionId = `cs_${freeUser.id}_starter`;

      // Step 2: Fire checkout.session.completed (subscription mode, Starter price)
      const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        sessionId,
      });
      (checkoutEvent.data.object as any).items = {
        data: [{
          price: { id: PRICE_IDS.STARTER },
        }],
      };
      await webhookClient.send(checkoutEvent);

      // Step 3: Fire customer.subscription.created
      const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.STARTER,
      });
      await webhookClient.send(subscriptionCreatedEvent);

      // Step 4: Fire invoice.payment_succeeded
      const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('starter', {
        userId: freeUser.id,
        customerId,
        subscriptionId,
      });
      (invoiceEvent.data.object as any).id = invoiceId;
      await webhookClient.send(invoiceEvent);

      // Step 5: Assert final persisted state
      const supabase = ctx.supabaseAdmin;

      await assertSubscriptionState(supabase, freeUser.id, {
        tier: 'starter',
        status: 'active',
        subscriptionCredits: CREDITS.STARTER_MONTHLY,
        purchasedCredits: 0,
        latestPriceId: PRICE_IDS.STARTER,
      });

      // Assert no duplicate allocations
      await assertNoDuplicateAllocations(supabase, freeUser.id);
    });
  });

  test.describe('Credit Pack purchase (no subscription)', () => {
    test('should add purchased credits only, leaving tier unchanged', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // Step 1: Create free user (10 credits)
      const freeUser = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(freeUser.id);

      const customerId = `cus_${freeUser.id}`;
      const sessionId = `cs_${freeUser.id}_credits`;
      const creditsAmount = 200;

      // Step 2: Fire checkout.session.completed with mode: payment (credit pack)
      const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForCredits({
        userId: freeUser.id,
        customerId,
        sessionId,
        creditsAmount,
      });
      await webhookClient.send(checkoutEvent);

      // Step 3: Assert final persisted state
      const supabase = ctx.supabaseAdmin;

      // Assert that purchased credits were added
      await assertSubscriptionState(supabase, freeUser.id, {
        subscriptionCredits: 10, // Free tier default
        purchasedCredits: creditsAmount,
      });

      // Assert subscription tier and status unchanged
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier, subscription_status')
        .eq('id', freeUser.id)
        .single();

      expect(profile?.subscription_tier).toBeNull();
      expect(profile?.subscription_status).toBeNull();

      // Assert no duplicate allocations
      await assertNoDuplicateAllocations(supabase, freeUser.id);
    });
  });

  test.describe('Signup webhook sequence credit allocation', () => {
    test('should allocate subscription credits exactly once', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // This test verifies that the full webhook sequence results in exactly one
      // credit allocation, not 2 or 3 from duplicate handlers processing the same event

      // Step 1: Create free user (10 credits)
      const freeUser = await ctx.createUser({ subscription: 'free' });
      await ctx.setupStripeCustomer(freeUser.id);

      const customerId = `cus_${freeUser.id}`;
      const subscriptionId = `sub_${freeUser.id}_pro_seq`;
      const invoiceId = `in_${freeUser.id}_pro_seq`;
      const sessionId = `cs_${freeUser.id}_pro_seq`;

      // Step 2: Fire full webhook sequence in normal order
      // checkout.session.completed → customer.subscription.created → invoice.payment_succeeded

      // 2a: checkout.session.completed
      const checkoutEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        sessionId,
      });
      (checkoutEvent.data.object as any).items = {
        data: [{
          price: { id: PRICE_IDS.PRO },
        }],
      };
      (checkoutEvent.data.object as any).invoice = invoiceId;
      await webhookClient.send(checkoutEvent);

      // 2b: customer.subscription.created
      const subscriptionCreatedEvent = StripeWebhookMockFactory.createSubscriptionCreated({
        userId: freeUser.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.PRO,
      });
      await webhookClient.send(subscriptionCreatedEvent);

      // 2c: invoice.payment_succeeded
      const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('pro', {
        userId: freeUser.id,
        customerId,
        subscriptionId,
      });
      (invoiceEvent.data.object as any).id = invoiceId;
      await webhookClient.send(invoiceEvent);

      // Step 3: Assert exactly 1 subscription allocation in credit_transactions
      const supabase = ctx.supabaseAdmin;

      // Query all subscription-type transactions for this user
      const { data: transactions, error: queryError } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', freeUser.id)
        .eq('type', 'subscription');

      expect(queryError).toBeNull();

      // Filter for allocations related to this subscription (positive amounts)
      const allocationTransactions = transactions?.filter(t => (t.amount as number) > 0) || [];

      // Assert exactly 1 subscription allocation (not 2 or 3)
      // The idempotency check in handlers should prevent duplicates
      expect(allocationTransactions.length).toBe(1);

      // Assert the correct amount was allocated
      expect(allocationTransactions[0].amount).toBe(CREDITS.PRO_MONTHLY);

      // Assert no duplicate ref_id values
      await assertNoDuplicateAllocations(supabase, freeUser.id);

      // Assert final subscription state is correct
      await assertSubscriptionState(supabase, freeUser.id, {
        tier: 'pro',
        status: 'active',
        subscriptionCredits: CREDITS.PRO_MONTHLY,
        latestPriceId: PRICE_IDS.PRO,
      });
    });
  });
});
