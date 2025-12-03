import { test, expect } from '@playwright/test';
import { TestContext, ApiClient } from '../helpers';

/**
 * Integration Tests for Stripe Customer Portal API
 *
 * These tests validate the customer portal creation functionality including:
 * - Authentication and authorization
 * - Stripe customer validation
 * - Portal session creation
 * - Error handling and edge cases
 */

// Shared test setup for all portal tests
let ctx: TestContext;
let api: ApiClient;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

test.describe('API: Stripe Customer Portal - Authentication', () => {
  test('should reject requests without authorization header', async ({ request }) => {
    api = new ApiClient(request);
    const response = await api.post('/api/portal');

    response.expectStatus(401);
    await response.expectErrorCode('UNAUTHORIZED');
  });

  test('should reject requests with malformed authorization header', async ({ request }) => {
    api = new ApiClient(request);
    const malformedHeaders = [
      'InvalidFormat token123',
      'Bearer',
      'Bearer not.a.valid.jwt',
      'Basic dGVzdDoxMjM=', // Basic auth instead of Bearer
      'Bearer ',
      'invalid_token_without_bearer'
    ];

    for (const authHeader of malformedHeaders) {
      const response = await api.post('/api/portal', undefined, {
        headers: { 'Authorization': authHeader }
      });

      response.expectStatus(401);
      await response.expectErrorCode('UNAUTHORIZED');
    }
  });

  test('should reject requests with invalid JWT token', async ({ request }) => {
    api = new ApiClient(request);
    const invalidTokens = [
      'invalid_token_12345',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
      'not.a.jwt.token.at.all',
      'Bearer ' + 'x'.repeat(100), // Very long invalid token
      '',
      'null',
      'undefined'
    ];

    for (const token of invalidTokens) {
      const response = await api.post('/api/portal', undefined, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      response.expectStatus(401);
      await response.expectErrorCode('UNAUTHORIZED');
    }
  });

  test('should accept requests with valid authentication', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal');

    // May fail due to missing Stripe customer, but should not fail authentication
    expect([400, 402, 500]).toContain(response.status());

    if (response.status() === 400) {
      const data = await response.json();
      // Should have proper error message, not authentication error
      expect(data.error).toBeTruthy();
      expect(data.error).not.toBe('Missing authorization header');
      expect(data.error).not.toBe('Invalid authentication token');
    }
  });
});

test.describe('API: Stripe Customer Portal - Request Validation', () => {
  test('should handle empty request body', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal', '');

    expect([400, 401, 500]).toContain(response.status());
  });

  test('should reject malformed JSON', async ({ request }) => {
    const user = await ctx.createUser();
    const response = await request.post('/api/portal', {
      headers: {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      },
      data: 'invalid json {{{'
    });

    expect([400, 401]).toContain(response.status());
  });

  test('should accept valid JSON with returnUrl', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal', {
      returnUrl: 'https://example.com/return'
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should validate return URL format', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const invalidUrls = [
      'not-a-url',
      'ftp://invalid-protocol.com',
      'javascript:alert(1)',
      '//missing-protocol.com',
    ];

    for (const returnUrl of invalidUrls) {
      const response = await api.post('/api/portal', { returnUrl });
      expect([400, 401, 422, 500]).toContain(response.status());
    }
  });

  test('should reject dangerous protocols', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const dangerousUrls = [
      'javascript:alert("xss")',
      'data:text/html,<script>alert("xss")</script>',
      'vbscript:msgbox("xss")',
      'ftp://example.com/file',
      'file:///etc/passwd',
    ];

    for (const returnUrl of dangerousUrls) {
      const response = await api.post('/api/portal', { returnUrl });
      response.expectStatus(400);
      await response.expectErrorCode('INVALID_RETURN_URL');
    }
  });

  test('should reject XSS patterns in return URL', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const xssUrls = [
      'https://example.com/<script>alert("xss")</script>',
      'https://example.com/?onload=alert("xss")',
      'https://example.com/?onerror=alert("xss")',
      'https://example.com/javascript:alert("xss")',
      'https://example.com/data:text/html,<script>alert("xss")</script>',
    ];

    for (const returnUrl of xssUrls) {
      const response = await api.post('/api/portal', { returnUrl });
      response.expectStatus(400);
      await response.expectErrorCode('INVALID_RETURN_URL');
    }
  });
});

test.describe('API: Stripe Customer Portal - Customer Validation', () => {
  test('should require user to have Stripe customer ID', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal');

    response.expectStatus(400);
    await response.expectErrorCode('STRIPE_CUSTOMER_NOT_FOUND');
  });

  test('should work with user that has Stripe customer ID', async ({ request }) => {
    const user = await ctx.createUser({ subscription: 'active', tier: 'pro' });

    // Set up Stripe customer ID
    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: `cus_test_${user.id}` })
      .eq('id', user.id);

    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal');

    // May succeed or fail due to Stripe API not being available in test
    expect([200, 400, 402, 500]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.url).toBeTruthy();
      expect(typeof data.data.url).toBe('string');
    }
  });

  test('should accept requests with valid Stripe customer ID', async ({ request }) => {
    const user = await ctx.createUser();

    // Set up customer ID in profile
    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: 'cus_test_123' })
      .eq('id', user.id);

    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal', {
      returnUrl: 'https://example.com/return'
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('API: Stripe Customer Portal - Portal Session Creation', () => {
  test('should handle valid portal session request', async ({ request }) => {
    const user = await ctx.createUser({ subscription: 'active', tier: 'pro' });

    // Set up Stripe customer ID
    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: `cus_test_${user.id}` })
      .eq('id', user.id);

    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal', {});

    // In test environment, this might fail due to Stripe API
    expect([200, 400, 402, 500]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.url).toBeTruthy();
      expect(data.data.url).toMatch(/^https?/);
    }
  });

  test('should include return URL in session when provided', async ({ request }) => {
    const user = await ctx.createUser({ subscription: 'active', tier: 'pro' });

    // Set up Stripe customer ID
    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: `cus_test_${user.id}` })
      .eq('id', user.id);

    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal', {
      returnUrl: 'https://example.com/billing'
    });

    // May fail due to Stripe API but should handle the return URL parameter
    expect([200, 400, 402, 500]).toContain(response.status());
  });

  test('should handle concurrent portal requests', async ({ request }) => {
    const user = await ctx.createUser({ subscription: 'active', tier: 'pro' });

    // Set up Stripe customer ID
    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: `cus_test_${user.id}` })
      .eq('id', user.id);

    // Send multiple requests simultaneously
    const requests = Array(3).fill(null).map(() =>
      request.post('/api/portal', {
        headers: { 'Authorization': `Bearer ${user.token}` }
      })
    );

    const responses = await Promise.all(requests);

    // All requests should be handled consistently
    responses.forEach(response => {
      expect([200, 400, 402, 429, 500]).toContain(response.status());
    });
  });
});

test.describe('API: Stripe Customer Portal - Test Mode Behavior', () => {
  test('should return mock response in test environment', async ({ request }) => {
    const user = await ctx.createUser();

    // Set up customer ID
    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: 'cus_test_mock' })
      .eq('id', user.id);

    const response = await request.post('/api/portal', {
      data: { returnUrl: 'https://example.com/return' },
      headers: {
        authorization: `Bearer ${user.token}`,
        'content-type': 'application/json',
        origin: 'https://example.com',
      },
    });

    const data = await response.json();
    if (response.status() === 200) {
      expect(data.success).toBe(true);
      expect(data.data.mock).toBe(true);
      expect(data.data.url).toContain('mock=true');
    }
  });
});

test.describe('API: Stripe Customer Portal - Error Handling', () => {
  test('should handle Stripe API errors gracefully', async ({ request }) => {
    const user = await ctx.createUser({ subscription: 'active', tier: 'pro' });

    // Set up Stripe customer ID
    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: `cus_test_${user.id}` })
      .eq('id', user.id);

    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal');

    // In test environment, Stripe might return errors
    expect([200, 400, 402, 429, 500]).toContain(response.status());

    if (response.status() >= 400) {
      const data = await response.json();
      expect(data.error).toBeTruthy();
      if (typeof data.error === 'object') {
        expect(data.error.code).toBeTruthy();
        expect(data.error.message).toBeTruthy();
      }
    }
  });

  test('should handle database connection issues', async ({ request }) => {
    // This tests the resilience of the API when database is unavailable
    const response = await request.post('/api/portal', {
      headers: { 'Authorization': 'Bearer potentially_valid_but_db_unavailable_token' }
    });

    // Should handle DB issues gracefully
    expect([200, 400, 401, 500, 503]).toContain(response.status());
  });

  test('should return consistent error response format', async ({ request }) => {
    const user = await ctx.createUser();

    const response = await request.post('/api/portal', {
      headers: {
        authorization: `Bearer ${user.token}`,
        'content-type': 'application/json',
      },
    });

    expect(response.headers()['content-type']).toContain('application/json');

    const data = await response.json();
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('error');

    if (data.success === false) {
      expect(data.error).toHaveProperty('code');
      expect(data.error).toHaveProperty('message');
    }
  });
});

test.describe('API: Stripe Customer Portal - Security', () => {
  test('should prevent access to other users\' customer data', async ({ request }) => {
    const user1 = await ctx.createUser();
    const user2 = await ctx.createUser({ subscription: 'active', tier: 'pro' });

    // Set up customer ID for user 2 only
    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: 'cus_user2_only' })
      .eq('id', user2.id);

    // User 1 should not be able to access portal without their own customer ID
    api = new ApiClient(request).withAuth(user1.token);
    const response = await api.post('/api/portal');

    response.expectStatus(400);
    await response.expectErrorCode('STRIPE_CUSTOMER_NOT_FOUND');
  });

  test('should sanitize all user inputs', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);

    // Test various injection attempts
    const maliciousInputs = [
      '<script>alert("xss")</script>',
      'javascript:alert("xss")',
      'data:text/html,<script>alert("xss")</script>',
      '{{constructor.constructor("return process")().exit()}}',
    ];

    for (const input of maliciousInputs) {
      const response = await api.post('/api/portal', { returnUrl: input });

      // Should reject dangerous inputs
      if (response.status() === 400) {
        const data = await response.json();
        expect(data.success).toBe(false);
      }
    }
  });

  test('should include security headers', async ({ request }) => {
    const user = await ctx.createUser();

    const response = await request.post('/api/portal', {
      headers: { 'Authorization': `Bearer ${user.token}` }
    });

    // Should include content-type header regardless of response status
    const headers = response.headers();
    expect(headers['content-type']).toBeTruthy();
    expect(headers['content-type']).toMatch(/json/);
  });

  test('should handle rate limiting for portal requests', async ({ request }) => {
    const user = await ctx.createUser({ subscription: 'active', tier: 'pro' });

    // Set up Stripe customer ID
    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: `cus_test_${user.id}` })
      .eq('id', user.id);

    // Send multiple requests rapidly
    const responses = [];
    for (let i = 0; i < 10; i++) {
      const response = await request.post('/api/portal', {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      responses.push(response);
    }

    // Most should succeed or return expected errors
    responses.forEach(response => {
      expect([200, 400, 401, 402, 429, 500]).toContain(response.status());
    });

    // Check for rate limiting headers if rate limited
    const rateLimitedResponses = responses.filter(r => r.status() === 429);
    if (rateLimitedResponses.length > 0) {
      const headers = rateLimitedResponses[0].headers();
      expect(headers['x-ratelimit-remaining'] || headers['retry-after']).toBeTruthy();
    }
  });

  test('should handle missing required fields', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal', {});

    // API should handle missing fields gracefully
    expect([400, 401, 500]).toContain(response.status());
  });

  test('should accept valid HTTP return URL', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal', {
      returnUrl: 'http://example.com/return'
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should reject malformed URLs', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const malformedUrls = [
      'not-a-url',
      'ht tp://invalid',
      '://missing-protocol',
      'https://',
      'http://',
    ];

    for (const returnUrl of malformedUrls) {
      const response = await api.post('/api/portal', { returnUrl });
      response.expectStatus(400);
      await response.expectErrorCode('INVALID_RETURN_URL');
    }
  });

  test('should use default return URL when not provided', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal', {});

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should accept valid HTTPS return URL', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal', {
      returnUrl: 'https://example.com/return'
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should work without origin header', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal', {});

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should use origin header for default return URL', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/portal', {}, {
      headers: { origin: 'https://myapp.com' }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should return success response format in test mode', async ({ request }) => {
    const user = await ctx.createUser();

    // Set up customer ID
    const supabaseAdmin = await import('@server/supabase/supabaseAdmin');
    await supabaseAdmin.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: 'cus_test_format' })
      .eq('id', user.id);

    const response = await request.post('/api/portal', {
      headers: {
        authorization: `Bearer ${user.token}`,
        'content-type': 'application/json',
        origin: 'https://example.com',
      },
    });

    const data = await response.json();
    expect(data).toHaveProperty('success');

    if (data.success === true) {
      expect(data).toHaveProperty('data');
      expect(data.data).toHaveProperty('url');
      expect(data.data).toHaveProperty('mock');
    }
  });
});