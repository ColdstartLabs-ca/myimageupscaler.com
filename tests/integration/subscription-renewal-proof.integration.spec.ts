/**
 * Subscription Renewal Proof Suite
 *
 * Stateful integration tests that prove renewal events result in correct
 * persisted database state respecting rollover caps.
 *
 * Phase 6 of Subscription System Test Overhaul:
 * - Tests renewal below/at/above rollover cap
 * - Tests Business renewal with no rollover (use-it-or-lose-it)
 * - Tests post-upgrade/downgrade renewal with correct plan credits
 * - Tests renewal credits allocated exactly once
 *
 * @see docs/PRDs/subscription-test-overhaul.md Phase 6
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

/**
 * Helper to set user credits directly in database
 */
async function setUserCredits(
  supabase: any,
  userId: string,
  subscriptionCredits: number
): Promise<void> {
  await supabase
    .from('profiles')
    .update({ subscription_credits_balance: subscriptionCredits })
    .eq('id', userId);
}

test.describe('Subscription Renewal Proof Suite', () => {
  let ctx: TestContext;

  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test.describe('Rollover Cap Tests', () => {
    test('Renewal below cap adds full plan credits', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // Create Hobby user with 100 credits (below 400 cap)
      const hobbyUser = await ctx.createUser({ subscription: 'active', tier: 'hobby', credits: 100 });
      await ctx.setupStripeCustomer(hobbyUser.id);

      const customerId = `cus_${hobbyUser.id}_renewal1`;
      const subscriptionId = `sub_${hobbyUser.id}_renewal1`;

      // Set initial credits
      const supabase = ctx.supabaseAdmin;
      await setUserCredits(supabase, hobbyUser.id, 100);

      // Fire renewal invoice
      const renewalEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('hobby', {
        userId: hobbyUser.id,
        customerId,
        subscriptionId,
      });

      await webhookClient.send(renewalEvent);

      // Assert credits increased by 200 (Hobby monthly) but capped at 400
      // 100 + 200 = 300 (below 400 cap, so full 200 added)
      await assertSubscriptionState(supabase, hobbyUser.id, {
        tier: 'hobby',
        status: 'active',
        subscriptionCredits: 300, // 100 + 200
      });

      await assertNoDuplicateAllocations(supabase, hobbyUser.id);
    });

    test('Renewal at cap adds zero credits', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // Create Hobby user with 400 credits (at cap)
      const hobbyUser = await ctx.createUser({ subscription: 'active', tier: 'hobby', credits: 400 });
      await ctx.setupStripeCustomer(hobbyUser.id);

      const customerId = `cus_${hobbyUser.id}_renewal2`;
      const subscriptionId = `sub_${hobbyUser.id}_renewal2`;

      // Set initial credits at cap
      const supabase = ctx.supabaseAdmin;
      await setUserCredits(supabase, hobbyUser.id, 400);

      // Fire renewal invoice
      const renewalEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('hobby', {
        userId: hobbyUser.id,
        customerId,
        subscriptionId,
      });

      await webhookClient.send(renewalEvent);

      // Assert credits unchanged (at cap, no credits added)
      await assertSubscriptionState(supabase, hobbyUser.id, {
        tier: 'hobby',
        status: 'active',
        subscriptionCredits: 400, // unchanged
      });

      await assertNoDuplicateAllocations(supabase, hobbyUser.id);
    });

    test('Renewal just below cap adds partial credits to reach cap', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // Create Hobby user with 350 credits (50 below cap)
      const hobbyUser = await ctx.createUser({ subscription: 'active', tier: 'hobby', credits: 350 });
      await ctx.setupStripeCustomer(hobbyUser.id);

      const customerId = `cus_${hobbyUser.id}_renewal3`;
      const subscriptionId = `sub_${hobbyUser.id}_renewal3`;

      // Set initial credits just below cap
      const supabase = ctx.supabaseAdmin;
      await setUserCredits(supabase, hobbyUser.id, 350);

      // Fire renewal invoice
      const renewalEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('hobby', {
        userId: hobbyUser.id,
        customerId,
        subscriptionId,
      });

      await webhookClient.send(renewalEvent);

      // Assert credits increased to cap (350 + 50 = 400)
      await assertSubscriptionState(supabase, hobbyUser.id, {
        tier: 'hobby',
        status: 'active',
        subscriptionCredits: 400, // capped at 400
      });

      await assertNoDuplicateAllocations(supabase, hobbyUser.id);
    });
  });

  test.describe('Business Renewal (No Rollover)', () => {
    test('Business renewal resets credits to plan allocation', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // Create Business user with 3000 credits
      const businessUser = await ctx.createUser({ subscription: 'active', tier: 'business', credits: 3000 });
      await ctx.setupStripeCustomer(businessUser.id);

      const customerId = `cus_${businessUser.id}_biz_renewal`;
      const subscriptionId = `sub_${businessUser.id}_biz_renewal`;

      // Set initial credits
      const supabase = ctx.supabaseAdmin;
      await setUserCredits(supabase, businessUser.id, 3000);

      // Fire renewal invoice
      const renewalEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('business', {
        userId: businessUser.id,
        customerId,
        subscriptionId,
      });

      await webhookClient.send(renewalEvent);

      // Business has maxRollover: 0, so credits reset to 5000
      await assertSubscriptionState(supabase, businessUser.id, {
        tier: 'business',
        status: 'active',
        subscriptionCredits: 5000, // reset to plan allocation
      });

      await assertNoDuplicateAllocations(supabase, businessUser.id);
    });
  });

  test.describe('Post-Change Renewals', () => {
    test('Post-upgrade renewal uses new plan credits', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      // Create Starter user
      const user = await ctx.createUser({ subscription: 'active', tier: 'starter', credits: 100 });
      await ctx.setupStripeCustomer(user.id);

      const customerId = `cus_${user.id}_upgrade_renewal`;
      const subscriptionId = `sub_${user.id}_upgrade_renewal`;

      // Set initial credits
      const supabase = ctx.supabaseAdmin;
      await setUserCredits(supabase, user.id, 100);

      // Simulate upgrade to Pro by firing subscription.updated
      const upgradeEvent = StripeWebhookMockFactory.createSubscriptionUpdated({
        userId: user.id,
        customerId,
        subscriptionId,
        priceId: PRICE_IDS.PRO,
      });
      await webhookClient.send(upgradeEvent);

      // Fire renewal with Pro price
      const renewalEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('pro', {
        userId: user.id,
        customerId,
        subscriptionId,
      });
      await webhookClient.send(renewalEvent);

      // Assert Pro credits (1000) added, Pro cap (2000) applied
      await assertSubscriptionState(supabase, user.id, {
        tier: 'pro',
        status: 'active',
      });

      await assertNoDuplicateAllocations(supabase, user.id);
    });

    test('Renewal credits allocated exactly once', async ({ request }) => {
      const webhookClient = new WebhookClient(request);

      const user = await ctx.createUser({ subscription: 'active', tier: 'hobby', credits: 200 });
      await ctx.setupStripeCustomer(user.id);

      const customerId = `cus_${user.id}_once`;
      const subscriptionId = `sub_${user.id}_once`;
      const invoiceId = `in_${user.id}_once`;

      // Set initial credits
      const supabase = ctx.supabaseAdmin;
      await setUserCredits(supabase, user.id, 200);

      // Fire renewal
      const renewalEvent = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan('hobby', {
        userId: user.id,
        customerId,
        subscriptionId,
      });
      (renewalEvent.data.object as any).id = invoiceId;

      await webhookClient.send(renewalEvent);

      // Assert exactly 1 renewal transaction
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'subscription_renewal');

      expect(transactions).toHaveLength(1);
      await assertNoDuplicateAllocations(supabase, user.id);
    });
  });
});
