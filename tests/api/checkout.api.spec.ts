import { test, expect } from '@playwright/test';

test.describe('API: Stripe Checkout', () => {
  test('should reject unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/checkout', {
      data: {
        priceId: 'price_test_123',
      },
    });

    expect(response.status()).toBe(401);
    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.error).toBe('Unauthorized');
  });

  test('should reject invalid auth token', async ({ request }) => {
    const response = await request.post('/api/checkout', {
      data: {
        priceId: 'price_test_123',
      },
      headers: {
        Authorization: 'Bearer invalid_token_12345',
      },
    });

    expect(response.status()).toBe(401);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  // E2E tests with real Stripe/Supabase credentials are disabled
  // To enable, configure credentials in .env.test and uncomment these tests

  // test('should validate required fields', async ({ request, testUser }) => {
  //   const response = await request.post('/api/checkout', {
  //     data: {},
  //     headers: {
  //       Authorization: `Bearer ${testUser.token}`,
  //     },
  //   });
  //
  //   expect(response.status()).toBe(400);
  //   const data = await response.json();
  //   expect(data.error).toBeDefined();
  //   expect(data.error).toContain('priceId');
  // });
});
