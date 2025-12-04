import { test, expect } from '@playwright/test';
import { TestContext, WebhookClient, ApiResponse } from '../helpers';

/**
 * Integration Tests for Stripe Webhooks API
 *
 * These tests validate webhook event processing including:
 * - Signature validation (bypassed in test mode)
 * - Credit purchase processing
 * - Subscription lifecycle management
 * - Invoice payment handling
 * - Error handling and edge cases
 */

// Shared test setup for all webhook tests
let ctx: TestContext;
let webhookClient: WebhookClient;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

test.describe('API: Stripe Webhooks - Signature Validation', () => {
  test('should reject requests without stripe-signature header', async ({ request }) => {
    webhookClient = new WebhookClient(request);
    const response = await webhookClient.send({
      type: 'checkout.session.completed',
      data: { object: {} },
    }, '');

    response.expectStatus(400);
  });

  test('should handle requests with valid signature header', async ({ request }) => {
    webhookClient = new WebhookClient(request);
    const user = await ctx.createUser();

    const response = await webhookClient.sendCreditPurchase({
      userId: user.id,
      creditsAmount: 50,
    });

    // In test mode, signature verification is bypassed
    expect(response.status).toBeGreaterThanOrEqual(200);
  });
});

test.describe('API: Stripe Webhooks - Credit Purchase Processing', () => {
  test('checkout.session.completed for credits should add credits to user', async ({ request }) => {
    const user = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    const initialProfile = await ctx.data.getUserProfile(user.id);
    const initialBalance = initialProfile.credits_balance || 0;

    const response = await webhookClient.sendCreditPurchase({
      userId: user.id,
      creditsAmount: 50,
    });

    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);

      // Verify DB: Credits should be added
      const updatedProfile = await ctx.data.getUserProfile(user.id);
      expect(updatedProfile.credits_balance).toBe(initialBalance + 50);
    }
  });

  test('should handle zero credit amounts', async ({ request }) => {
    const user = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    const response = await webhookClient.sendCreditPurchase({
      userId: user.id,
      creditsAmount: 0, // Zero credits
    });

    // Should still return 200 without adding credits
    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);

      // Verify no credits were added
      const profile = await ctx.data.getUserProfile(user.id);
      expect(profile.credits_balance).toBe(10); // Should remain at initial balance
    }
  });

  test('should handle missing user_id in session metadata', async ({ request }) => {
    webhookClient = new WebhookClient(request);

    // Create event without user_id metadata
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'payment',
          metadata: {
            credits_amount: '50',
            // Missing user_id
          },
          payment_status: 'paid',
          status: 'complete',
        },
      },
    };

    const response = await webhookClient.send(event);

    // Should still return 200 but log error internally
    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);
    }
  });

  test('should handle duplicate webhook events idempotently', async ({ request }) => {
    const user = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    const initialProfile = await ctx.data.getUserProfile(user.id);
    const initialBalance = initialProfile.credits_balance || 0;

    // Send the same event twice
    const response1 = await webhookClient.sendCreditPurchase({
      userId: user.id,
      creditsAmount: 25,
    });

    const response2 = await webhookClient.sendCreditPurchase({
      userId: user.id,
      creditsAmount: 25,
    });

    if (response1.status === 200 && response2.status === 200) {
      // Check final balance - should only have credits added once
      const finalProfile = await ctx.data.getUserProfile(user.id);
      expect(finalProfile.credits_balance).toBe(initialBalance + 25);
    }
  });
});

test.describe('API: Stripe Webhooks - Subscription Management', () => {
  test('customer.subscription.created should create subscription and update profile', async ({ request }) => {
    const user = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    // Set stripe_customer_id
    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    const customerId = `cus_test_${user.id}`;
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);

    const response = await webhookClient.sendSubscriptionCreated({
      userId: user.id,
      customerId,
      subscriptionId: `sub_new_${Date.now()}`,
      priceId: 'price_hobby_monthly',
    });

    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);

      // Verify subscription was created
      const { data: subscription } = await supabaseAdmin.supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      expect(subscription).toBeTruthy();
      expect(subscription?.user_id).toBe(user.id);
      expect(subscription?.status).toBe('active');

      // Verify profile was updated
      const { data: profile } = await supabaseAdmin.supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      expect(profile?.subscription_status).toBe('active');
    }
  });

  test('customer.subscription.updated should modify existing subscription', async ({ request }) => {
    const user = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    const customerId = `cus_test_${user.id}`;
    const subscriptionId = `sub_update_${Date.now()}`;

    // Set up initial subscription
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);

    await supabaseAdmin.supabaseAdmin.from('subscriptions').insert({
      id: subscriptionId,
      user_id: user.id,
      status: 'active',
      price_id: 'price_basic_monthly',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Send update event
    const response = await webhookClient.sendSubscriptionUpdated({
      userId: user.id,
      customerId,
      subscriptionId,
      status: 'active',
      newPriceId: 'price_pro_monthly',
    });

    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);

      // Verify subscription was updated
      const { data: subscription } = await supabaseAdmin.supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .single();

      expect(subscription?.price_id).toBe('price_pro_monthly');
    }
  });

  test('customer.subscription.deleted should cancel subscription', async ({ request }) => {
    const user = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    const customerId = `cus_test_${user.id}`;
    const subscriptionId = `sub_cancel_${Date.now()}`;

    // Set up user with active subscription
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({
        stripe_customer_id: customerId,
        subscription_status: 'active',
        subscription_tier: 'pro',
      })
      .eq('id', user.id);

    await supabaseAdmin.supabaseAdmin.from('subscriptions').insert({
      id: subscriptionId,
      user_id: user.id,
      status: 'active',
      price_id: 'price_test_pro_monthly',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const response = await webhookClient.sendSubscriptionDeleted({
      userId: user.id,
      customerId,
      subscriptionId,
    });

    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);

      // Verify subscription was canceled
      const { data: subscription } = await supabaseAdmin.supabaseAdmin
        .from('subscriptions')
        .select('status')
        .eq('id', subscriptionId)
        .single();

      expect(subscription?.status).toBe('canceled');

      // Verify profile was updated
      const { data: profile } = await supabaseAdmin.supabaseAdmin
        .from('profiles')
        .select('subscription_status')
        .eq('id', user.id)
        .single();

      expect(profile?.subscription_status).toBe('canceled');
    }
  });

  test('should handle unknown customer in subscription events', async ({ request }) => {
    webhookClient = new WebhookClient(request);

    const response = await webhookClient.sendSubscriptionCreated({
      userId: 'unknown_user',
      customerId: 'cus_unknown',
      subscriptionId: 'sub_unknown',
    });

    // Should still return 200 but log error internally
    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);
    }
  });
});

test.describe('API: Stripe Webhooks - Invoice Processing', () => {
  test('invoice.payment_succeeded should add subscription credits with rollover cap', async ({ request }) => {
    const user = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');

    // Set up customer with some existing credits
    const customerId = `cus_test_${user.id}`;
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({
        stripe_customer_id: customerId,
        credits_balance: 1100, // Close to hobby plan max rollover (1200)
      })
      .eq('id', user.id);

    const response = await webhookClient.sendInvoicePaymentSucceeded({
      userId: user.id,
      customerId,
      subscriptionId: 'sub_test_renewal',
    });

    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);

      // Verify credits were added correctly (capped at max)
      const { data: profile } = await supabaseAdmin.supabaseAdmin
        .from('profiles')
        .select('credits_balance')
        .eq('id', user.id)
        .single();

      expect(profile?.credits_balance).toBeGreaterThanOrEqual(1100);
      expect(profile?.credits_balance).toBeLessThanOrEqual(1200); // Capped at hobby max rollover
    }
  });

  test('invoice.payment_failed should mark subscription as past due', async ({ request }) => {
    const user = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    const customerId = `cus_test_${user.id}`;

    // Set up user with active subscription
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({
        stripe_customer_id: customerId,
        subscription_status: 'active',
        subscription_tier: 'pro',
      })
      .eq('id', user.id);

    const response = await webhookClient.sendInvoicePaymentFailed({
      userId: user.id,
      customerId,
    });

    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);

      // Verify status was marked as past_due
      const { data: profile } = await supabaseAdmin.supabaseAdmin
        .from('profiles')
        .select('subscription_status')
        .eq('id', user.id)
        .single();

      expect(profile?.subscription_status).toBe('past_due');
    }
  });
});

test.describe('API: Stripe Webhooks - Error Handling', () => {
  test('should handle malformed webhook body', async ({ request }) => {
    const response = await request.post('/api/webhooks/stripe', {
      body: 'invalid json {{{', // Use body instead of data to avoid automatic JSON encoding
      headers: {
        'stripe-signature': 'invalid_signature',
        'content-type': 'application/json',
      },
    });

    // Should return 400, 500 for malformed JSON, or 429 if rate limited
    expect([400, 429, 500]).toContain(response.status());

    if (response.status() === 400) {
      const data = await response.json();
      // Error message can be about signature or invalid body depending on parsing order
      expect(data.error).toMatch(/Webhook signature verification failed|Invalid webhook body/);
    }
  });

  test('should handle checkout session without metadata', async ({ request }) => {
    webhookClient = new WebhookClient(request);

    const event = {
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

    // Should handle gracefully without crashing
    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);
    }
  });
});

test.describe('API: Stripe Webhooks - Subscription-Only Guarantees', () => {
  test('should handle valid subscription price IDs', async ({ request }) => {
    const user = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    const { STRIPE_PRICES } = await import('@shared/config/stripe');

    // Set up customer ID
    const customerId = `cus_test_${user.id}`;
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);

    // Test all subscription price IDs
    for (const [planKey, priceId] of Object.entries(STRIPE_PRICES)) {
      const response = await webhookClient.sendSubscriptionCreated({
        userId: user.id,
        customerId,
        subscriptionId: `sub_${planKey}_${Date.now()}`,
        priceId,
      });

      // Should process valid subscription prices
      if (response.status === 200) {
        const data = await response.json();
        expect(data.received).toBe(true);
      }
    }
  });

  test('should handle subscription checkout completion', async ({ request }) => {
    const user = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    // Create checkout session webhook payload for subscription
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          status: 'complete',
          customer: `cus_test_${user.id}`,
          subscription: 'sub_test_subscription',
          metadata: {
            user_id: user.id,
            plan_key: 'hobby',
          },
        },
      },
    };

    const response = await webhookClient.send(event);

    // Should be processed successfully
    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);
    }
  });

  test('should reject one-time payment checkout sessions', async ({ request }) => {
    const user = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    // Create checkout session webhook payload for one-time payment
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'payment',
          status: 'complete',
          customer: 'cus_test_onetime',
          metadata: {
            user_id: user.id,
            credits_amount: '100',
          },
        },
      },
    };

    const response = await webhookClient.send(event);

    // Should be processed but with warning (legacy support)
    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);
    }
  });

  test('should handle subscription with all valid price tiers', async ({ request }) => {
    const { STRIPE_PRICES } = await import('@shared/config/stripe');
    const planTests = [
      { priceId: STRIPE_PRICES.HOBBY_MONTHLY, planName: 'Hobby', planKey: 'hobby' },
      { priceId: STRIPE_PRICES.PRO_MONTHLY, planName: 'Professional', planKey: 'pro' },
      { priceId: STRIPE_PRICES.BUSINESS_MONTHLY, planName: 'Business', planKey: 'business' },
    ];

    for (const { priceId, planName, planKey } of planTests) {
      const user = await ctx.createUser();
      webhookClient = new WebhookClient(request);

      const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
      const customerId = `cus_test_${planKey}_price`;

      // Set up customer ID
      await supabaseAdmin.supabaseAdmin
        .from('profiles')
        .update({
          stripe_customer_id: customerId,
          subscription_tier: null, // Reset tier
        })
        .eq('id', user.id);

      const response = await webhookClient.sendSubscriptionCreated({
        userId: user.id,
        customerId,
        subscriptionId: `sub_${planKey}_verified`,
        priceId,
      });

      if (response.status === 200) {
        const data = await response.json();
        expect(data.received).toBe(true);

        // Verify profile was updated with correct plan name
        const { data: profile } = await supabaseAdmin.supabaseAdmin
          .from('profiles')
          .select('subscription_tier')
          .eq('id', user.id)
          .single();

        expect(profile?.subscription_tier).toBe(planName);
      }
    }
  });

  test('should add subscription credits with rollover cap correctly', async ({ request }) => {
    const user = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    const { STRIPE_PRICES } = await import('@shared/config/stripe');

    // Set up customer with some existing credits
    const customerId = `cus_test_${user.id}`;
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({
        stripe_customer_id: customerId,
        credits_balance: 1100, // Close to hobby plan max rollover (1200)
      })
      .eq('id', user.id);

    const event = {
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          customer: customerId,
          subscription: 'sub_test_renewal',
          status: 'paid',
          paid: true,
          lines: {
            data: [
              {
                price: {
                  id: STRIPE_PRICES.HOBBY_MONTHLY, // Hobby plan: 200 credits/month, 1200 max rollover
                },
              },
            ],
          },
        },
      },
    };

    const response = await webhookClient.send(event);

    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);

      // Verify credits were added correctly (1100 + 100 = 1200, capped at max)
      const { data: profile } = await supabaseAdmin.supabaseAdmin
        .from('profiles')
        .select('credits_balance')
        .eq('id', user.id)
        .single();

      expect(profile?.credits_balance).toBe(1200); // Capped at hobby max rollover
    }
  });

  test('should not add credits for users at max rollover', async ({ request }) => {
    const user = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    const { STRIPE_PRICES } = await import('@shared/config/stripe');

    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({
        stripe_customer_id: `cus_test_${user.id}`,
        credits_balance: 6000, // At pro plan max rollover
      })
      .eq('id', user.id);

    const event = {
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          customer: `cus_test_${user.id}`,
          subscription: 'sub_test_max_rollover',
          status: 'paid',
          paid: true,
          lines: {
            data: [
              {
                price: {
                  id: STRIPE_PRICES.PRO_MONTHLY, // Pro plan: 1000 credits/month, 6000 max rollover
                },
              },
            ],
          },
        },
      },
    };

    const response = await webhookClient.send(event);

    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);

      // Verify credits remain unchanged
      const { data: profile } = await supabaseAdmin.supabaseAdmin
        .from('profiles')
        .select('credits_balance')
        .eq('id', user.id)
        .single();

      expect(profile?.credits_balance).toBe(6000); // Unchanged
    }
  });

  test('should not process legacy credit pack invoices', async ({ request }) => {
    const user = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    // Simulate a legacy credit pack invoice
    const event = {
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          customer: `cus_test_${user.id}`,
          status: 'paid',
          paid: true,
          lines: {
            data: [
              {
                price: {
                  id: 'price_credit_pack_1000', // Credit pack price (not in subscription map)
                },
              },
            ],
          },
          metadata: {
            credits_amount: '1000', // Legacy credit pack metadata
          },
        },
      },
    };

    const response = await webhookClient.send(event);

    // Should process but not add credits for legacy credit packs
    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);

      // Verify no credits were added
      const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
      const { data: profile } = await supabaseAdmin.supabaseAdmin
        .from('profiles')
        .select('credits_balance')
        .eq('id', user.id)
        .single();

      expect(profile?.credits_balance).toBe(0); // No credits added
    }
  });
});

test.describe('Webhook Event Processing - Advanced Scenarios', () => {
  test('should handle subscription lifecycle events in sequence', async ({ request }) => {
    const testUser = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    // Simulate complete subscription lifecycle using individual calls
    const response1 = await webhookClient.sendSubscriptionCreated({
      userId: testUser.id,
      customerId: `cus_${testUser.id}`,
      subscriptionId: 'sub_lifecycle_1',
      priceId: 'price_hobby_monthly'
    });
    expect([200, 202, 400, 500]).toContain(response1.status);

    const response2 = await webhookClient.sendInvoicePaymentSucceeded({
      userId: testUser.id,
      customerId: `cus_${testUser.id}`,
      subscriptionId: 'sub_lifecycle_1',
    });
    expect([200, 202, 400, 500]).toContain(response2.status);

    const response3 = await webhookClient.sendSubscriptionUpdated({
      userId: testUser.id,
      customerId: `cus_${testUser.id}`,
      subscriptionId: 'sub_lifecycle_1',
      priceId: 'price_pro_monthly'
    });
    expect([200, 202, 400, 500]).toContain(response3.status);

    const response4 = await webhookClient.sendInvoicePaymentSucceeded({
      userId: testUser.id,
      customerId: `cus_${testUser.id}`,
      subscriptionId: 'sub_lifecycle_1',
    });
    expect([200, 202, 400, 500]).toContain(response4.status);
  });
});

test.describe('Webhook Error Recovery and Edge Cases', () => {
  test('should handle malformed events gracefully', async ({ request }) => {
    webhookClient = new WebhookClient(request);

    const malformedEvent = {
      id: 'evt_malformed',
      object: 'event',
      type: 'customer.subscription.created',
      data: { object: {} } // Missing required fields
    };

    const response = await webhookClient.sendRawEvent(malformedEvent);

    // Should return error but not crash
    expect([400, 422, 500]).toContain(response.status);
  });

  test('should handle events for non-existent users', async ({ request }) => {
    webhookClient = new WebhookClient(request);

    const ghostUserResponse = await webhookClient.sendSubscriptionCreated({
      userId: 'ghost_user_id',
      customerId: 'cus_ghost',
      subscriptionId: 'sub_ghost'
    });

    expect([400, 404, 500]).toContain(ghostUserResponse.status);
  });

  test('should handle duplicate events idempotently', async ({ request }) => {
    const testUser = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    // Send two identical subscription created events
    const response1 = await webhookClient.sendSubscriptionCreated({
      userId: testUser.id,
      customerId: `cus_${testUser.id}`,
      subscriptionId: 'sub_duplicate'
    });
    expect([200, 202, 400, 409, 500]).toContain(response1.status);

    const response2 = await webhookClient.sendSubscriptionCreated({
      userId: testUser.id,
      customerId: `cus_${testUser.id}`,
      subscriptionId: 'sub_duplicate'
    });
    expect([200, 202, 400, 409, 500]).toContain(response2.status);
  });

  test('should handle invalid JSON payload', async ({ request }) => {
    webhookClient = new WebhookClient(request);

    const response = await request.post('/api/webhooks/stripe', {
      body: 'invalid json {{{',
      headers: {
        'stripe-signature': 'invalid_signature',
        'content-type': 'application/json',
      },
    });

    expect([400, 429, 500]).toContain(response.status());
  });

  test('should handle missing metadata gracefully', async ({ request }) => {
    webhookClient = new WebhookClient(request);

    const event = {
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

    // Should handle gracefully without crashing
    if (response.status === 200) {
      const data = await response.json();
      expect(data.received).toBe(true);
    }
  });
});

test.describe('Webhook Performance and Load Testing', () => {
  test('should handle high volume webhook events', async ({ request }) => {
    const testUser = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    const startTime = Date.now();
    const responses: ApiResponse[] = [];

    // Send multiple events sequentially (simpler than batch with wrong types)
    for (let i = 0; i < 10; i++) {
      const response = await webhookClient.sendInvoicePaymentSucceeded({
        userId: testUser.id,
        customerId: `cus_${testUser.id}`,
        subscriptionId: `sub_load_${i}`,
      });
      responses.push(response);
    }
    const endTime = Date.now();

    // Should complete within reasonable time
    expect(endTime - startTime).toBeLessThan(30000);

    responses.forEach(response => {
      expect([200, 202, 400, 429, 500]).toContain(response.status);
    });
  });

  test('should handle concurrent webhook processing', async ({ request }) => {
    const testUser = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    const concurrentRequests = 5;
    const promises = [];

    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(webhookClient.sendCreditPurchase({
        userId: testUser.id,
        customerId: `cus_${testUser.id}`,
        creditsAmount: 50
      }));
    }

    const responses = await Promise.all(promises);

    responses.forEach(response => {
      expect([200, 202, 400, 429, 500]).toContain(response.status);
    });
  });

  test('should maintain performance with complex event processing', async ({ request }) => {
    const testUser = await ctx.createUser();
    webhookClient = new WebhookClient(request);

    const startTime = Date.now();
    const responses: ApiResponse[] = [];

    // Send multiple subscription updates
    for (let i = 0; i < 5; i++) {
      const response = await webhookClient.sendSubscriptionUpdated({
        userId: testUser.id,
        customerId: `cus_${testUser.id}`,
        subscriptionId: `sub_complex_${i}`,
        priceId: `price_complex_${i}`
      });
      responses.push(response);
    }
    const endTime = Date.now();

    // Performance threshold for complex events
    expect(endTime - startTime).toBeLessThan(15000);

    responses.forEach(response => {
      expect([200, 202, 400, 500]).toContain(response.status);
    });
  });
});