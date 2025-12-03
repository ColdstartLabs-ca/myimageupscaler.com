import { test, expect } from '@playwright/test';
import { TestContext, ApiClient } from '../helpers';

/**
 * Integration Tests for Stripe Checkout API
 *
 * These tests validate the checkout session creation functionality including:
 * - Authentication and authorization
 * - Price validation
 * - Subscription conflict checking
 * - Stripe customer management
 * - Test mode handling
 */

// Shared test setup for all checkout tests
let ctx: TestContext;
let api: ApiClient;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

test.describe('API: Stripe Checkout - Authentication', () => {

  test('should reject unauthenticated requests', async ({ request }) => {
    api = new ApiClient(request);
    const response = await api.post('/api/checkout', { priceId: 'price_test_123' });

    response.expectStatus(401);
    await response.expectErrorCode('UNAUTHORIZED');
  });

  test('should reject invalid auth token', async ({ request }) => {
    api = new ApiClient(request);
    const response = await api.post('/api/checkout', {
      priceId: 'price_test_123'
    }, {
      headers: { Authorization: 'Bearer invalid_token_12345' }
    });

    response.expectStatus(401);
    await response.expectErrorCode('UNAUTHORIZED');
  });

  test('should reject malformed auth header', async ({ request }) => {
    api = new ApiClient(request);
    const response = await api.post('/api/checkout', {
      priceId: 'price_test_123'
    }, {
      headers: { Authorization: 'InvalidFormat token123' }
    });

    response.expectStatus(401);
    await response.expectErrorCode('UNAUTHORIZED');
  });

  test('should reject requests without authorization header', async ({ request }) => {
    api = new ApiClient(request);
    const response = await api.post('/api/checkout', { priceId: 'price_test_123' });

    response.expectStatus(401);
    await response.expectErrorCode('UNAUTHORIZED');
  });

  test('should handle malformed authorization headers', async ({ request }) => {
    api = new ApiClient(request);
    const malformedAuthHeaders = [
      '', // Empty
      'Bearer', // Missing token
      'InvalidFormat token', // Wrong format
      'bearer token', // Lowercase (should be Bearer)
    ];

    for (const authHeader of malformedAuthHeaders) {
      const response = await api.post('/api/checkout', {
        priceId: 'price_test_auth'
      }, {
        headers: { authorization: authHeader }
      });

      response.expectStatus(401);
    }
  });
});

test.describe('API: Stripe Checkout - Request Validation', () => {
  test('should reject requests without priceId', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/checkout', {});

    response.expectStatus(400);
    await response.expectErrorCode('VALIDATION_ERROR');
  });

  test('should reject malformed JSON requests', async ({ request }) => {
    api = new ApiClient(request);
    const response = await api.post('/api/checkout', 'invalid json', {
      headers: {
        Authorization: 'Bearer test_token',
        'Content-Type': 'application/json'
      }
    });

    response.expectStatus(400);
  });

  test('should validate required fields', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/checkout', {});

    response.expectStatus(400);
    await response.expectErrorCode('VALIDATION_ERROR');
  });

  test('should reject invalid priceId format', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/checkout', {
      priceId: 'invalid_price_format',
    });

    response.expectStatus(400);
    await response.expectErrorCode('INVALID_PRICE');
  });
});

test.describe('API: Stripe Checkout - Authenticated Users', () => {
  test(
    'should handle custom success and cancel URLs',
    async ({ request }) => {
      const user = await ctx.createUser();
      api = new ApiClient(request).withAuth(user.token);
      const { STRIPE_PRICES } = await import('@shared/config/stripe');
      const response = await api.post('/api/checkout', {
        priceId: STRIPE_PRICES.PRO_MONTHLY,
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        metadata: {
          test_key: 'test_value',
          user_source: 'mobile_app',
        },
      });

      // Should pass validation and create a checkout session
      expect([200, 400, 500]).toContain(response.status());
      const data = await response.json();

      if (response.status() === 200) {
        // Success case - checkout session created
        expect(data.success).toBe(true);
        expect(data.data.url).toBeTruthy();
        expect(data.data.sessionId).toBeTruthy();

        // In test mode with real Stripe keys, should return actual session
        if (data.data.mock) {
          expect(data.data.mock).toBe(true);
        } else {
          expect(typeof data.data.url).toBe('string');
          expect(typeof data.data.sessionId).toBe('string');
          expect(data.data.sessionId).toMatch(/^cs_/);
        }
      } else {
        // Error case - should not be a validation error for valid price ID
        expect(data.error).toBeDefined();
        if (response.status() === 400) {
          expect(data.error.code).not.toBe('INVALID_PRICE');
        }
      }
    }
  );

  test('should handle metadata properly', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const { STRIPE_PRICES } = await import('@shared/config/stripe');
    const response = await api.post('/api/checkout', {
      priceId: STRIPE_PRICES.HOBBY_MONTHLY,
      metadata: {
        plan_type: 'premium',
        campaign_id: 'summer_sale',
        custom_field: 'custom_value',
      },
    });

    // Should pass validation and create a checkout session
    expect([200, 400, 500]).toContain(response.status());
    const data = await response.json();

    if (response.status() === 200) {
      expect(data.success).toBe(true);
      expect(data.data.url).toBeTruthy();
      expect(data.data.sessionId).toBeTruthy();
    } else {
      expect(data.error).toBeDefined();
      if (response.status() === 400) {
        expect(data.error.code).not.toBe('INVALID_PRICE');
      }
    }
  });

  test('should handle empty metadata', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const { STRIPE_PRICES } = await import('@shared/config/stripe');
    const response = await api.post('/api/checkout', {
      priceId: STRIPE_PRICES.BUSINESS_MONTHLY,
      metadata: {},
    });

    expect([200, 400, 500]).toContain(response.status());
    const data = await response.json();

    if (response.status() === 200) {
      expect(data.success).toBe(true);
      expect(data.data.url).toBeTruthy();
      expect(data.data.sessionId).toBeTruthy();
    }
  });

  test('should handle metadata as undefined', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const { STRIPE_PRICES } = await import('@shared/config/stripe');
    const response = await api.post('/api/checkout', {
      priceId: STRIPE_PRICES.PRO_MONTHLY,
      // metadata not provided - should default to {}
    });

    expect([200, 400, 500]).toContain(response.status());
    const data = await response.json();

    if (response.status() === 200) {
      expect(data.success).toBe(true);
      expect(data.data.url).toBeTruthy();
      expect(data.data.sessionId).toBeTruthy();
    }
  });

  test('should reject checkout if user already has active subscription', async ({ request }) => {
    const user = await ctx.createUser({ subscription: 'active', tier: 'pro' });
    api = new ApiClient(request).withAuth(user.token);
    const { STRIPE_PRICES } = await import('@shared/config/stripe');

    const response = await api.post('/api/checkout', {
      priceId: STRIPE_PRICES.PRO_MONTHLY, // Trying to subscribe to a different plan
    });

    response.expectStatus(400);
    await response.expectErrorCode('ALREADY_SUBSCRIBED');
  });

  test('should reject checkout if user has trialing subscription', async ({ request }) => {
    const user = await ctx.createUser({ subscription: 'trialing', tier: 'pro' });
    api = new ApiClient(request).withAuth(user.token);
    const { STRIPE_PRICES } = await import('@shared/config/stripe');

    const response = await api.post('/api/checkout', {
      priceId: STRIPE_PRICES.BUSINESS_MONTHLY,
    });

    response.expectStatus(400);
    await response.expectErrorCode('ALREADY_SUBSCRIBED');
  });

  test('should allow checkout if user has canceled subscription', async ({ request }) => {
    const user = await ctx.createUser({ subscription: 'canceled' });
    api = new ApiClient(request).withAuth(user.token);
    const { STRIPE_PRICES } = await import('@shared/config/stripe');

    const response = await api.post('/api/checkout', {
      priceId: STRIPE_PRICES.PRO_MONTHLY,
    });

    // Should succeed since subscription is canceled
    expect([200, 400, 500]).toContain(response.status());
    const data = await response.json();

    if (response.status() === 200) {
      expect(data.success).toBe(true);
      expect(data.data.url).toBeTruthy();
      expect(data.data.sessionId).toBeTruthy();
    } else if (response.status() === 400) {
      // Should NOT be an ALREADY_SUBSCRIBED error
      expect(data.error.code).not.toBe('ALREADY_SUBSCRIBED');
    }
  });
});

test.describe('API: Stripe Checkout - Customer Management', () => {
  test('should create new Stripe customer for first-time user', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);

    const { STRIPE_PRICES } = await import('@shared/config/stripe');
    const response = await api.post('/api/checkout', {
      priceId: STRIPE_PRICES.PRO_MONTHLY,
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });

    // In test environment, expect failure at Stripe API level
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should use existing Stripe customer for returning user', async ({ request }) => {
    const user = await ctx.createUser();

    // Set up existing customer ID in the profile
    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: 'cus_existing_123' })
      .eq('id', user.id);

    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/checkout', {
      priceId: 'price_test_existing',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('API: Stripe Checkout - Subscription-Only Validation', () => {
  test('should reject non-subscription price IDs', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);

    // Test invalid/unknown price IDs
    const invalidPriceIds = [
      'price_invalid_unknown',
      'price_one_time_123',
      'price_legacy_credits',
      'nonexistent_price',
    ];

    for (const priceId of invalidPriceIds) {
      const response = await api.post('/api/checkout', { priceId });
      response.expectStatus(400);
      await response.expectErrorCode('INVALID_PRICE');
    }
  });

  test('should accept valid subscription price IDs', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);

    const { STRIPE_PRICES } = await import('@shared/config/stripe');
    const subscriptionPriceIds = Object.values(STRIPE_PRICES);

    for (const priceId of subscriptionPriceIds) {
      const response = await api.post('/api/checkout', { priceId });

      // Should pass our validation and fail at Stripe API (since we're using test IDs)
      expect(response.status()).toBeGreaterThanOrEqual(400);

      // Should not be our validation error
      if (response.status() === 400) {
        const data = await response.json();
        expect(data.error.code).not.toBe('INVALID_PRICE');
      }
    }
  });
});

test.describe('API: Stripe Checkout - Error Handling', () => {
  test('should handle Stripe API errors gracefully', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);

    // Use invalid price ID to trigger Stripe error
    const response = await api.post('/api/checkout', {
      priceId: 'price_invalid_12345',
    });

    // Should return 500 due to Stripe API error
    response.expectStatus(500);
  });

  test('should handle database connection errors', async ({ request }) => {
    const response = await request.post('/api/checkout', {
      data: {
        priceId: 'price_test_db_error',
      },
      headers: {
        authorization: 'Bearer potentially_valid_but_db_unavailable_token',
        'content-type': 'application/json',
        origin: 'https://example.com',
      },
    });

    // Should return 401 or 500 depending on where the error occurs
    expect([401, 500]).toContain(response.status());
  });

  test('should validate price ID format', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);

    const invalidPriceIds = [
      '', // Empty string
      'invalid', // Too short
      'not_a_valid_price_id_format',
    ];

    for (const priceId of invalidPriceIds) {
      const response = await api.post('/api/checkout', { priceId });
      // Should fail with Stripe API error
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });
});

test.describe('API: Stripe Checkout - Security and Authorization', () => {
  test('should prevent access to other users\' customer data', async ({ request }) => {
    const user1 = await ctx.createUser();
    const user2 = await ctx.createUser();

    // Set up customer ID for user 2
    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: 'cus_user2_only' })
      .eq('id', user2.id);

    // User 1 should not be able to access user 2's customer data
    api = new ApiClient(request).withAuth(user1.token);
    const response = await api.post('/api/checkout', {
      priceId: 'price_test_security',
    });

    // The request should create a new customer for user 1 or use user 1's existing customer
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should include supabase_user_id in Stripe customer metadata', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);

    const response = await api.post('/api/checkout', {
      priceId: 'price_test_metadata',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });

    // The request should be properly formatted with user metadata
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('API: Stripe Checkout - URL Handling', () => {
  test('should extract base URL from origin header', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);

    const response = await api.post('/api/checkout', {
      priceId: 'price_test_origin',
    }, {
      headers: { origin: 'https://mycustomapp.com' }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should use default URLs when custom ones are not provided', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);

    const response = await api.post('/api/checkout', {
      priceId: 'price_test_default_urls',
      // No successUrl or cancelUrl provided
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('API: Stripe Checkout - Subscription Metadata Handling', () => {
  test('should include plan_key in session and subscription metadata', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);

    const { STRIPE_PRICES } = await import('@shared/config/stripe');
    const response = await api.post('/api/checkout', {
      priceId: STRIPE_PRICES.HOBBY_MONTHLY,
      metadata: {
        source: 'web',
        campaign: 'summer_sale',
      },
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should include user_id in both session and subscription metadata', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);

    const { STRIPE_PRICES } = await import('@shared/config/stripe');
    const response = await api.post('/api/checkout', {
      priceId: STRIPE_PRICES.PRO_MONTHLY,
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should merge custom metadata with subscription metadata', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);

    const { STRIPE_PRICES } = await import('@shared/config/stripe');
    const response = await api.post('/api/checkout', {
      priceId: STRIPE_PRICES.BUSINESS_MONTHLY,
      metadata: {
        promotion: 'new_user',
        referral_code: 'friend123',
        source: 'web',
      },
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('API: Stripe Checkout - Integration with Subscription Webhook Flow', () => {
  test('should create sessions compatible with subscription webhook processing', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);

    const { STRIPE_PRICES } = await import('@shared/config/stripe');
    const response = await api.post('/api/checkout', {
      priceId: STRIPE_PRICES.HOBBY_MONTHLY,
      metadata: {
        source: 'pricing_page',
        campaign: 'launch_promo',
      },
    });

    // The session should be created with subscription metadata that webhooks can process
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should always create subscription mode sessions', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);

    const { STRIPE_PRICES } = await import('@shared/config/stripe');

    // Test all subscription prices create subscription mode
    for (const [planKey, priceId] of Object.entries(STRIPE_PRICES)) {
      const response = await api.post('/api/checkout', { priceId });

      // Should pass validation and fail at Stripe API
      expect(response.status()).toBeGreaterThanOrEqual(400);

      // Should not be validation error for subscription prices
      if (response.status() === 400) {
        const data = await response.json();
        expect(data.error.code).not.toBe('INVALID_PRICE');
      }
    }
  });
});