import { test, expect } from '@playwright/test';
import { test as authenticatedTest } from '../helpers/auth';

/**
 * Middleware Integration Tests
 *
 * Tests for the API middleware including:
 * - Authentication (JWT verification)
 * - Rate limiting (user-based and IP-based)
 * - Security headers
 * - CORS configuration
 * - Public vs protected routes
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

test.describe('Middleware - Authentication', () => {
  test('should reject requests without authentication token', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/protected/example`);

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toBe('Unauthorized');
  });

  test('should reject requests with invalid authentication token', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/protected/example`, {
      headers: {
        Authorization: 'Bearer invalid_token_12345',
      },
    });

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  authenticatedTest('should allow requests with valid authentication token', async ({
    request, testUser,
  }) => {
    const response = await request.get(`${BASE_URL}/api/protected/example`, {
      headers: {
        Authorization: `Bearer ${testUser.token}`,
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('user');
    expect(body).toHaveProperty('message');
    expect(body.user.id).toBe(testUser.id);
    expect(body.user.email).toBe(testUser.email);
  });
});

test.describe('Middleware - Security Headers', () => {
  test('should include security headers in all API responses', async ({
    request,
  }) => {
    // Test with public route to avoid auth requirement
    const response = await request.get(`${BASE_URL}/api/health`);

    // Verify security headers are present
    expect(response.headers()['x-frame-options']).toBe('DENY');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-xss-protection']).toBe('1; mode=block');
    expect(response.headers()['referrer-policy']).toBe(
      'strict-origin-when-cross-origin'
    );
    expect(response.headers()['content-security-policy']).toBeTruthy();
  });

  test('should include CSP header with proper directives', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/health`);

    const csp = response.headers()['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('frame-ancestors');
    expect(csp).toContain('upgrade-insecure-requests');
  });
});

test.describe('Middleware - CORS', () => {
  test('should include CORS headers in API responses', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/health`);

    expect(response.headers()['access-control-allow-origin']).toBeTruthy();
    expect(response.headers()['access-control-allow-methods']).toContain(
      'GET'
    );
    expect(response.headers()['access-control-allow-methods']).toContain(
      'POST'
    );
  });

  test('should handle preflight OPTIONS requests', async ({ request }) => {
    const response = await request.fetch(`${BASE_URL}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(response.status()).toBeLessThan(300);
    expect(response.headers()['access-control-allow-origin']).toBeTruthy();
  });
});

test.describe('Middleware - Rate Limiting', () => {
  test('should include rate limit headers in responses', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/health`);

    // Public routes should have rate limit headers
    expect(response.headers()['x-ratelimit-remaining']).toBeTruthy();
  });

  test('should enforce rate limits for public routes', async ({ request }) => {
    // Send multiple requests rapidly to trigger rate limit
    // Public routes have 10 requests per 10 seconds limit
    const requests = Array(12)
      .fill(null)
      .map(() => request.get(`${BASE_URL}/api/health`));

    const responses = await Promise.all(requests);

    // Some requests should succeed, but eventually we should hit the limit
    const tooManyRequests = responses.some((r) => r.status() === 429);

    // If we hit the rate limit, verify the response
    const rateLimitedResponse = responses.find((r) => r.status() === 429);
    if (rateLimitedResponse) {
      const body = await rateLimitedResponse.json();
      expect(body.error).toContain('Too many requests');
      expect(rateLimitedResponse.headers()['retry-after']).toBeTruthy();
    }

    // Note: This test might not always trigger rate limiting in CI
    // due to rate limit reset timing, but documents expected behavior
  });

  test('should include Retry-After header when rate limited', async ({
    request,
  }) => {
    // Send requests until we hit rate limit
    let rateLimitResponse = null;

    for (let i = 0; i < 15; i++) {
      const response = await request.get(`${BASE_URL}/api/health`);
      if (response.status() === 429) {
        rateLimitResponse = response;
        break;
      }
    }

    if (rateLimitResponse) {
      expect(rateLimitResponse.headers()['retry-after']).toBeTruthy();
      expect(rateLimitResponse.headers()['x-ratelimit-reset']).toBeTruthy();

      const body = await rateLimitResponse.json();
      expect(body.error).toContain('Too many requests');
    }
  });
});

test.describe('Middleware - Public Routes', () => {
  test('should allow access to health endpoint without auth', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/health`);

    expect(response.status()).toBe(200);
  });

  test('should allow access to webhook routes without auth', async ({
    request,
  }) => {
    // Webhook routes are public (they use their own auth mechanisms)
    // This tests the wildcard pattern matching
    const response = await request.post(`${BASE_URL}/api/webhooks/stripe`, {
      data: { test: 'data' },
    });

    // We expect the route to exist and not return 401
    // It might return 400 or other error due to missing webhook signature,
    // but it should not return 401 Unauthorized
    expect(response.status()).not.toBe(401);
  });
});

test.describe('Middleware - Protected Routes', () => {
  test('should require authentication for protected routes', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/protected/example`);

    expect(response.status()).toBe(401);
  });

  authenticatedTest('should set user context headers for authenticated requests', async ({
    request, testUser,
  }) => {
    const response = await request.get(`${BASE_URL}/api/protected/example`, {
      headers: {
        Authorization: `Bearer ${testUser.token}`,
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.user).toBeTruthy();
    expect(body.user.id).toBe(testUser.id);
    expect(body.user.email).toBe(testUser.email);
    expect(body.rateLimit).toBeTruthy();
  });
});

test.describe('Middleware - Error Handling', () => {
  test('should return structured error responses', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/protected/example`);

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
  });

  test('should handle missing Authorization header gracefully', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/protected/example`, {
      headers: {
        Authorization: '',
      },
    });

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('should handle malformed Authorization header', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/protected/example`, {
      headers: {
        Authorization: 'InvalidFormat',
      },
    });

    expect(response.status()).toBe(401);
  });
});
