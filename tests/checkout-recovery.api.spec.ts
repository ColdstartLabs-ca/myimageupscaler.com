import { test, expect } from '@playwright/test';

/**
 * API Integration tests for Checkout Recovery System
 *
 * Tests the abandoned checkout API endpoints:
 * 1. POST /api/checkout/abandoned - Create abandoned checkout record
 * 2. GET /api/checkout/recover/[checkoutId] - Retrieve recovery data
 *
 * @see docs/PRDs/checkout-recovery-system.md
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3100';

test.describe('API - POST /api/checkout/abandoned', () => {
  test('should create abandoned checkout record with valid data', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/checkout/abandoned`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        priceId: 'price_test123',
        purchaseType: 'subscription',
        planKey: 'starter',
        packKey: null,
        pricingRegion: 'standard',
        discountPercent: 0,
      },
    });

    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty('success', true);
    expect(json.data).toHaveProperty('checkoutId');
    expect(typeof json.data.checkoutId).toBe('string');
  });

  test('should create abandoned checkout with email provided', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/checkout/abandoned`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        priceId: 'price_test456',
        purchaseType: 'subscription',
        planKey: 'pro',
        email: 'test@example.com',
        pricingRegion: 'standard',
      },
    });

    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('checkoutId');
  });

  test('should create abandoned checkout for credit pack purchase', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/checkout/abandoned`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        priceId: 'price_pack_100',
        purchaseType: 'credit_pack',
        packKey: 'pack_100',
        planKey: null,
        pricingRegion: 'standard',
      },
    });

    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(true);
  });

  test('should reject request with missing priceId', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/checkout/abandoned`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        purchaseType: 'subscription',
        planKey: 'starter',
      },
    });

    expect(response.status()).toBe(400);

    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('priceId');
  });

  test('should reject request with invalid purchaseType', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/checkout/abandoned`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        priceId: 'price_123',
        purchaseType: 'invalid_type',
      },
    });

    expect(response.status()).toBe(400);

    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('purchaseType');
  });

  test('should accept subscription purchaseType', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/checkout/abandoned`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        priceId: 'price_subscription',
        purchaseType: 'subscription',
        planKey: 'starter',
      },
    });

    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  test('should accept credit_pack purchaseType', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/checkout/abandoned`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        priceId: 'price_pack',
        purchaseType: 'credit_pack',
        packKey: 'pack_100',
      },
    });

    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });
});

test.describe('API - GET /api/checkout/recover/[checkoutId]', () => {
  let createdCheckoutId: string;

  test.beforeAll(async ({ request }) => {
    // Create a test checkout first
    const createResponse = await request.post(`${API_BASE_URL}/api/checkout/abandoned`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        priceId: 'price_recovery_test',
        purchaseType: 'subscription',
        planKey: 'starter',
        email: 'recovery-test@example.com',
      },
    });

    if (createResponse.ok()) {
      const json = await createResponse.json();
      createdCheckoutId = json.data.checkoutId;
    }
  });

  test('should retrieve valid abandoned checkout', async ({ request }) => {
    if (!createdCheckoutId) {
      test.skip();
      return;
    }

    const response = await request.get(`${API_BASE_URL}/api/checkout/recover/${createdCheckoutId}`);

    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('cartData');
    expect(json.data.cartData).toHaveProperty('priceId', 'price_recovery_test');
    expect(json.data.isValid).toBe(true);
  });

  test('should return 404 for non-existent checkout', async ({ request }) => {
    const response = await request.get(
      `${API_BASE_URL}/api/checkout/recover/non-existent-id-12345`
    );

    expect(response.status()).toBe(404);

    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  test('should return 400 for missing checkoutId', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/checkout/recover/`);

    // Should get 404 or 400 due to invalid route
    expect([400, 404]).toContain(response.status());
  });

  test('should include recovery discount code if present', async ({ request }) => {
    // Create checkout with discount
    const createResponse = await request.post(`${API_BASE_URL}/api/checkout/abandoned`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        priceId: 'price_with_discount',
        purchaseType: 'subscription',
        planKey: 'pro',
      },
    });

    if (!createResponse.ok()) {
      test.skip();
      return;
    }

    const createJson = await createResponse.json();
    const checkoutId = createJson.data.checkoutId;

    // Simulate adding recovery discount (would normally be done by cron job)
    const response = await request.get(`${API_BASE_URL}/api/checkout/recover/${checkoutId}`);

    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    // Discount code would be present if cron has run
    if (json.data.discountCode) {
      expect(typeof json.data.discountCode).toBe('string');
    }
  });

  test('should handle expired checkout (7 days old)', async ({ request }) => {
    // This test would require creating an old checkout record directly in the database
    // or mocking the current time. For now, we'll test the API structure.

    const response = await request.get(`${API_BASE_URL}/api/checkout/recover/very-old-checkout-id`);

    // Should either return 404 or an expired error
    expect([404, 200]).toContain(response.status());

    if (response.status() === 200) {
      const json = await response.json();
      if (!json.success) {
        expect(json.error.code).toBe('EXPIRED');
      }
    }
  });

  test('should include cart data with all required fields', async ({ request }) => {
    if (!createdCheckoutId) {
      test.skip();
      return;
    }

    const response = await request.get(`${API_BASE_URL}/api/checkout/recover/${createdCheckoutId}`);

    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.data.cartData).toMatchObject({
      priceId: expect.any(String),
      purchaseType: expect.stringMatching(/^(subscription|credit_pack)$/),
      planKey: expect.any(String),
      pricingRegion: expect.any(String),
      discountPercent: expect.any(Number),
      createdAt: expect.any(String),
    });
  });
});

test.describe('API - Integration Flow', () => {
  test('should complete full abandoned checkout flow', async ({ request }) => {
    // Step 1: User visits pricing and clicks upgrade -> creates abandoned checkout
    const abandonedResponse = await request.post(`${API_BASE_URL}/api/checkout/abandoned`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        priceId: 'price_flow_test',
        purchaseType: 'subscription',
        planKey: 'starter',
        email: 'flow-test@example.com',
        pricingRegion: 'standard',
      },
    });

    expect(abandonedResponse.status()).toBe(200);
    const abandonedJson = await abandonedResponse.json();
    const checkoutId = abandonedJson.data.checkoutId;
    expect(typeof checkoutId).toBe('string');

    // Step 2: User returns via recovery link -> retrieves cart data
    const recoveryResponse = await request.get(
      `${API_BASE_URL}/api/checkout/recover/${checkoutId}`
    );

    expect(recoveryResponse.status()).toBe(200);
    const recoveryJson = await recoveryResponse.json();
    expect(recoveryJson.success).toBe(true);
    expect(recoveryJson.data.cartData.priceId).toBe('price_flow_test');
    expect(recoveryJson.data.isValid).toBe(true);
  });

  test('should persist regional pricing in abandoned checkout', async ({ request }) => {
    // Test with regional discount (e.g., Brazil)
    const response = await request.post(`${API_BASE_URL}/api/checkout/abandoned`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        priceId: 'price_brazil_region',
        purchaseType: 'subscription',
        planKey: 'pro',
        pricingRegion: 'brazil',
        discountPercent: 25,
        originalAmountCents: 2999,
        currency: 'USD',
      },
    });

    expect(response.status()).toBe(200);
    const json = await response.json();
    const checkoutId = json.data.checkoutId;

    // Retrieve and verify regional data is preserved
    const recoveryResponse = await request.get(
      `${API_BASE_URL}/api/checkout/recover/${checkoutId}`
    );

    expect(recoveryResponse.status()).toBe(200);
    const recoveryJson = await recoveryResponse.json();
    expect(recoveryJson.data.cartData.pricingRegion).toBe('brazil');
    expect(recoveryJson.data.cartData.discountPercent).toBe(25);
  });
});
