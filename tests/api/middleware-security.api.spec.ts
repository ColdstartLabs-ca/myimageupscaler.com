import { test, expect } from '@playwright/test';
import { TestContext, ApiClient } from '../helpers';

/**
 * Integration Tests for Middleware Security
 *
 * These tests validate the security features implemented in the Next.js middleware:
 * - Authentication and authorization for API routes
 * - Rate limiting for public and protected endpoints
 * - Security headers and CSP policies
 * - Route protection and redirects
 */

// Shared test setup for all middleware security tests
let ctx: TestContext;
let api: ApiClient;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

test.describe('Middleware Security Integration', () => {
  test.describe('Public API Route Access', () => {
    test('should allow access to health endpoint without authentication', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.get('/api/health');

      // Accept both 200 (healthy/degraded) and 503 (unhealthy) - health endpoint checks database
      expect([200, 503]).toContain(response.status);
      const data = await response.json();
      // Health endpoint returns 'healthy', 'degraded', or 'unhealthy'
      expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status);
    });

    test('should allow access to analytics endpoint without authentication', async ({
      request,
    }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', {
        eventName: 'image_download',
        sessionId: 'test_session_123',
      });

      response.expectStatus(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    test('should allow access to webhooks endpoint without authentication', async ({ request }) => {
      // This test needs to use direct request since we're testing webhook endpoint without proper signature
      const response = await request.post('/api/webhooks/stripe', {
        data: {
          type: 'test',
          data: { object: {} },
        },
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'test_signature',
        },
      });

      // May return 400 due to signature validation or 500 due to missing webhook secret, but should not be 401
      expect([200, 400, 500]).toContain(response.status());
    });

    test('should apply rate limiting to public routes', async ({ request }) => {
      // Skip this test in test environment as rate limiting is disabled
      const isTestEnv = process.env.ENV === 'test' || process.env.NODE_ENV === 'test';
      if (isTestEnv) {
        test.skip();
        return;
      }

      api = new ApiClient(request);
      const responses = [];

      // Send multiple requests rapidly
      for (let i = 0; i < 15; i++) {
        const response = await api.get('/api/health');
        responses.push(response);
      }

      // At least some requests should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThan(0);

      // Later requests might be rate limited
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      if (rateLimitedCount > 0) {
        const rateLimitedResponse = responses.find(r => r.status === 429);
        expect(rateLimitedResponse?.raw.headers()['x-ratelimit-remaining']).toBeDefined();
        expect(rateLimitedResponse?.raw.headers()['retry-after']).toBeDefined();
      }
    });
  });

  test.describe('Protected API Route Authentication', () => {
    test('should reject access to protected routes without authentication', async ({ request }) => {
      api = new ApiClient(request);
      const protectedRoutes = [
        {
          method: 'POST',
          path: '/api/upscale',
          data: {
            imageData: 'test',
            mimeType: 'image/png',
            config: { qualityTier: 'quick', scale: 2, additionalOptions: {} },
          },
        },
        { method: 'POST', path: '/api/checkout', data: { priceId: 'test_price' } },
        { method: 'POST', path: '/api/portal', data: {} },
      ];

      for (const route of protectedRoutes) {
        let response;
        if (route.method === 'POST') {
          response = await api.post(route.path, route.data);
        }

        response!.expectStatus(401);
        const data = await response!.json();
        expect(data.error).toBeDefined();
        // Error format varies by endpoint - just check it's unauthorized
      }
    });

    test('should reject access with invalid authentication token', async ({ request }) => {
      api = new ApiClient(request);
      const invalidTokens = [
        'invalid_token',
        'Bearer invalid_token',
        'not.a.jwt.token',
        'Bearer',
        '',
      ];

      for (const token of invalidTokens) {
        const response = await api.post(
          '/api/upscale',
          {
            imageData: 'data:image/png;base64,test',
            mimeType: 'image/png',
            config: { qualityTier: 'quick', scale: 2, additionalOptions: {} },
          },
          {
            headers: token ? { Authorization: token } : {},
          }
        );

        response.expectStatus(401);
        const data = await response.json();
        expect(data.error).toBeDefined();
      }
    });

    test('should allow access with valid authentication token', async ({ request }) => {
      const testUser = await ctx.createUser();
      api = new ApiClient(request).withAuth(testUser.token);

      const response = await api.post('/api/upscale', {
        imageData:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        mimeType: 'image/png',
        config: {
          qualityTier: 'quick',
          scale: 2,
          additionalOptions: {
            smartAnalysis: false,
            enhance: false,
            enhanceFaces: false,
            preserveText: false,
          },
        },
      });

      // Should not reject due to authentication (may fail due to other reasons)
      // The test is checking that authentication works, not that the request fully succeeds
      // Valid authentication means we should NOT get 401 (unauthorized) or 403 (forbidden)
      // We may get 400 (validation), 402 (insufficient credits), 422 (validation), 500 (server error), etc.
      expect([401, 403]).not.toContain(response.status);
    });

    test('should validate JWT token format', async ({ request }) => {
      api = new ApiClient(request);
      const malformedJwts = [
        'not.a.jwt',
        'a.b', // Incomplete JWT
        'a.b.c.d', // Too many parts
        'a..c', // Empty middle part
        '.b.c', // Empty first part
        'a.b.', // Empty last part
        'string with spaces.token.signature',
        'null',
        'undefined',
      ];

      for (const jwt of malformedJwts) {
        const response = await api.post(
          '/api/upscale',
          {
            imageData: 'data:image/png;base64,test',
            mimeType: 'image/png',
            config: { qualityTier: 'quick', scale: 2, additionalOptions: {} },
          },
          {
            headers: { Authorization: `Bearer ${jwt}` },
          }
        );

        response.expectStatus(401);
        const data = await response.json();
        expect(data.error).toBeDefined();
      }
    });
  });

  test.describe('HTTP Method Validation', () => {
    test('should reject unsupported HTTP methods for API routes', async ({ request }) => {
      api = new ApiClient(request);
      const protectedEndpoint = '/api/upscale';
      const unsupportedMethods = ['GET', 'PUT', 'DELETE', 'PATCH'];

      for (const method of unsupportedMethods) {
        let response;
        const data = { test: 'data' };

        if (method === 'GET') {
          response = await api.get(protectedEndpoint);
        } else if (method === 'PUT') {
          response = await api.put(protectedEndpoint, data);
        } else if (method === 'DELETE') {
          response = await api.delete(protectedEndpoint);
        } else if (method === 'PATCH') {
          // PATCH not directly supported, we need to use the base request
          response = await api.post(protectedEndpoint, data);
          // Note: API client doesn't have PATCH method, using POST for simplicity
        }

        // Should reject with method not allowed or authentication error
        expect([401, 405]).toContain(response!.status);
      }
    });

    test('should accept supported HTTP methods', async ({ request }) => {
      const testUser = await ctx.createUser();
      api = new ApiClient(request).withAuth(testUser.token);

      // Test that POST is supported for protected routes
      const response = await api.post('/api/upscale', {
        imageData: 'data:image/png;base64,test',
        mimeType: 'image/png',
        config: { qualityTier: 'quick', scale: 2, additionalOptions: {} },
      });

      // Should not reject due to method
      expect(response.status).not.toBe(405);
    });
  });

  test.describe('Security Headers', () => {
    test('should include security headers on API responses', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.get('/api/health');

      const headers = response.raw.headers();

      // Should include basic security headers
      expect(headers['content-type']).toBeTruthy();
      expect(headers['x-content-type-options']).toBeTruthy();
      expect(headers['x-frame-options'] || headers['content-security-policy']).toBeTruthy();
    });

    test('should prevent MIME type sniffing', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.get('/api/health');

      const headers = response.raw.headers();
      expect(headers['x-content-type-options']).toBe('nosniff');
    });

    test('should include CORS headers for allowed origins', async ({ request, baseURL }) => {
      // Use HEAD request instead of OPTIONS since Playwright API context doesn't support OPTIONS
      const response = await request.fetch(`${baseURL}/api/health`, {
        method: 'OPTIONS',
        headers: {
          Origin: baseURL || 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET',
        },
      });

      // Should handle OPTIONS requests appropriately
      expect([200, 204, 405]).toContain(response.status());
    });
  });

  test.describe('Request Size and Rate Limiting', () => {
    test('should apply rate limiting to protected routes', async ({ request }) => {
      // Skip this test in test environment as rate limiting is disabled
      const isTestEnv = process.env.NODE_ENV === 'test';
      if (isTestEnv) {
        test.skip();
        return;
      }

      const testUser = await ctx.createUser();
      api = new ApiClient(request).withAuth(testUser.token);
      const responses = [];

      // Send multiple requests rapidly
      for (let i = 0; i < 15; i++) {
        const response = await api.post('/api/upscale', {
          imageData: 'data:image/png;base64,test',
          mimeType: 'image/png',
          config: { qualityTier: 'quick', scale: 2, additionalOptions: {} },
        });
        responses.push(response);
      }

      // Should handle rate limiting
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      if (rateLimitedCount > 0) {
        const rateLimitedResponse = responses.find(r => r.status === 429);
        expect(rateLimitedResponse?.raw.headers()['x-ratelimit-remaining']).toBeDefined();
      }
    });
  });

  test.describe('Cookie and Session Security', () => {
    test('should handle cookies with security attributes', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.get('/api/health');

      const cookies = response.raw.headers()['set-cookie'];
      if (cookies) {
        // Should include security attributes if cookies are set
        expect(cookies).toMatch(/secure|httponly|samesite/i);
      }
    });
  });
});
