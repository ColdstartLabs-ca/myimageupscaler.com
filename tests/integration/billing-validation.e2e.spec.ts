import { test, expect } from '@playwright/test';
import { TestContext } from '../helpers';
import { StripeWebhookMockFactory } from '../helpers/stripe-webhook-mocks';

/**
 * Billing Integration Validation Tests
 *
 * These tests validate the TestContext helper and Stripe webhook mocks.
 * Note: Some operations (credit_transactions, subscriptions table) are blocked
 * by RLS policies, so tests focus on profile-level operations which work.
 */
test.describe('Billing Integration Validation', () => {
  let ctx: TestContext;

  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test('should create and manage test users correctly', async () => {
    // Test user creation
    const testUser = await ctx.createUser();
    expect(testUser.id).toBeTruthy();
    expect(testUser.email).toContain('test-');
    expect(testUser.token).toBeTruthy();

    // Test setting subscription status (profile-level, works with RLS)
    await ctx.data.setSubscriptionStatus(testUser.id, 'active', 'pro', 'sub_test_123');

    const profile = await ctx.data.getUserProfile(testUser.id);
    expect(profile.subscription_status).toBe('active');
    expect(profile.subscription_tier).toBe('pro');

    // Test adding credits (balance update works, transaction logging may fail due to RLS)
    const initialBalance = profile.credits_balance;
    await ctx.data.addCredits(testUser.id, 25, 'purchase');

    const updatedProfile = await ctx.data.getUserProfile(testUser.id);
    expect(updatedProfile.credits_balance).toBe(initialBalance + 25);

    // Note: TestContext handles cleanup automatically
  });

  test('should generate valid Stripe webhook mocks', async () => {
    const testUser = await ctx.createUser();

    // Test credit purchase webhook
    const creditPurchaseEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForCredits({
      userId: testUser.id,
      creditsAmount: 100,
    });

    expect(creditPurchaseEvent.type).toBe('checkout.session.completed');
    expect(creditPurchaseEvent.data.object.metadata?.user_id).toBe(testUser.id);
    expect(creditPurchaseEvent.data.object.metadata?.credits_amount).toBe('100');
    expect(creditPurchaseEvent.data.object.mode).toBe('payment');

    // Test subscription webhook
    const subscriptionEvent = StripeWebhookMockFactory.createSubscriptionCreated({
      userId: testUser.id,
      subscriptionId: 'sub_test_456',
      priceId: 'price_pro_monthly',
    });

    expect(subscriptionEvent.type).toBe('customer.subscription.created');
    expect(subscriptionEvent.data.object.id).toBe('sub_test_456');
    expect(subscriptionEvent.data.object.status).toBe('active');
    expect(subscriptionEvent.data.object.items.data[0].price.id).toBe('price_pro_monthly');

    // Test invoice payment webhook
    const invoiceEvent = StripeWebhookMockFactory.createInvoicePaymentSucceeded({
      userId: testUser.id,
      subscriptionId: 'sub_test_456',
    });

    expect(invoiceEvent.type).toBe('invoice.payment_succeeded');
    expect(invoiceEvent.data.object.subscription).toBe('sub_test_456');
    expect(invoiceEvent.data.object.paid).toBe(true);

    // Note: TestContext handles cleanup automatically
  });

  test('should handle different subscription scenarios via profile', async () => {
    // Test creating users with different states
    // Note: subscription_status defaults to null for new profiles,
    // we update it via setSubscriptionStatus

    const testUser = await ctx.createUser();

    // Initial state should have credits
    const initialProfile = await ctx.data.getUserProfile(testUser.id);
    expect(initialProfile.credits_balance).toBeGreaterThanOrEqual(0);

    // Set to active subscription
    await ctx.data.setSubscriptionStatus(testUser.id, 'active', 'pro');
    const activeProfile = await ctx.data.getUserProfile(testUser.id);
    expect(activeProfile.subscription_status).toBe('active');
    expect(activeProfile.subscription_tier).toBe('pro');

    // Set to canceled
    await ctx.data.setSubscriptionStatus(testUser.id, 'canceled');
    const canceledProfile = await ctx.data.getUserProfile(testUser.id);
    expect(canceledProfile.subscription_status).toBe('canceled');

    // Set to past_due
    await ctx.data.setSubscriptionStatus(testUser.id, 'past_due');
    const pastDueProfile = await ctx.data.getUserProfile(testUser.id);
    expect(pastDueProfile.subscription_status).toBe('past_due');

    // Note: TestContext handles cleanup automatically
  });

  test('should update credits balance correctly', async () => {
    const testUser = await ctx.createUser();

    const initialProfile = await ctx.data.getUserProfile(testUser.id);
    const initialBalance = initialProfile.credits_balance;

    // Add credits via different methods
    await ctx.data.addCredits(testUser.id, 20, 'purchase');

    const afterFirstAdd = await ctx.data.getUserProfile(testUser.id);
    expect(afterFirstAdd.credits_balance).toBe(initialBalance + 20);

    await ctx.data.addCredits(testUser.id, 10, 'bonus');

    const finalProfile = await ctx.data.getUserProfile(testUser.id);
    expect(finalProfile.credits_balance).toBe(initialBalance + 30);

    // Note: TestContext handles cleanup automatically
  });

  test('should verify profile state consistency across updates', async () => {
    const testUser = await ctx.createUser();

    // Set initial state
    await ctx.data.setSubscriptionStatus(testUser.id, 'active', 'pro');
    await ctx.data.addCredits(testUser.id, 50, 'purchase');

    // Verify profile
    const profile = await ctx.data.getUserProfile(testUser.id);
    expect(profile.subscription_status).toBe('active');
    expect(profile.subscription_tier).toBe('pro');

    const initialBalance = profile.credits_balance;

    // Update subscription status
    await ctx.data.setSubscriptionStatus(testUser.id, 'canceled');

    const updatedProfile = await ctx.data.getUserProfile(testUser.id);
    expect(updatedProfile.subscription_status).toBe('canceled');
    // Credits should remain unchanged when updating subscription
    expect(updatedProfile.credits_balance).toBe(initialBalance);

    // Note: TestContext handles cleanup automatically
  });
});
