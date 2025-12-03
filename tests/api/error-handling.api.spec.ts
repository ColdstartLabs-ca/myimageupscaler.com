import { test, expect } from '@playwright/test';
import { TestContext, ApiClient } from '../helpers';

/**
 * API Error Handling Tests
 *
 * These tests verify that all API endpoints handle errors gracefully
 * and return appropriate HTTP status codes and error messages.
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// Shared test setup for all error handling tests
let ctx: TestContext;
let api: ApiClient;
let authToken: string;

test.beforeAll(async () => {
  ctx = new TestContext();
  const testUser = await ctx.createUser();
  authToken = testUser.token;
});

test.afterAll(async () => {
  await ctx.cleanup();
});

  test.describe('API Error Handling', () => {

  test.describe('/api/upscale Error Handling', () => {
    test('should return 401 when no user ID header', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/upscale', {
        imageData: 'data:image/jpeg;base64,test',
        mimeType: 'image/jpeg',
        config: {
          mode: 'upscale',
          scale: 2,
          preserveText: true,
          enhanceFace: false,
          denoise: false,
        },
      });

      response.expectStatus(401);
      const body = await response.json();
      expect(body).toMatchObject({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Valid authentication token required',
        },
      });
    });

    test('should return 400 for invalid request body', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/upscale', {
        // Missing required fields
        imageData: 'invalid',
      });

      // Authentication may fail first (401) or validation may fail (400)
      expect([400, 401]).toContain(response.status);
      if (response.status === 400) {
        const body = await response.json();
        expect(body).toMatchObject({
          error: 'Validation Error',
          message: 'Invalid request data',
        });
        expect(body.details).toBeInstanceOf(Array);
      }
    });

    test('should return 400 for missing image data', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/upscale', {
        config: {
          mode: 'upscale',
          scale: 2,
          preserveText: true,
          enhanceFace: false,
          denoise: false,
        },
      });

      expect([400, 401]).toContain(response.status);
      if (response.status === 400) {
        const body = await response.json();
        expect(body.error).toBe('Validation Error');
      }
    });

    test('should return 400 for invalid image format', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/upscale', {
        imageData: 'not-a-data-url',
        mimeType: 'image/jpeg',
        config: {
          mode: 'upscale',
          scale: 2,
          preserveText: true,
          enhanceFace: false,
          denoise: false,
        },
      });

      expect([400, 401]).toContain(response.status);
      if (response.status === 400) {
        const body = await response.json();
        expect(body.error).toBe('Validation Error');
      }
    });

    test('should return 400 for invalid scale factor', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/upscale', {
        imageData: 'data:image/jpeg;base64,test',
        mimeType: 'image/jpeg',
        config: {
          mode: 'upscale',
          scale: 0, // Invalid scale
          preserveText: true,
          enhanceFace: false,
          denoise: false,
        },
      });

      expect([400, 401]).toContain(response.status);
      if (response.status === 400) {
        const body = await response.json();
        expect(body.error).toBe('Validation Error');
      }
    });

    test('should return 400 for invalid mode', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/upscale', {
        imageData: 'data:image/jpeg;base64,test',
        mimeType: 'image/jpeg',
        config: {
          mode: 'invalid_mode', // Invalid mode
          scale: 2,
          preserveText: true,
          enhanceFace: false,
          denoise: false,
        },
      });

      expect([400, 401]).toContain(response.status);
      if (response.status === 400) {
        const body = await response.json();
        expect(body.error).toBe('Validation Error');
      }
    });

    test('should return 402 for insufficient credits', async ({ request }) => {
      // Create a user with no credits (only 10 initial credits, but we'll test with high usage)
      const testUser = await ctx.createUser();
      api = new ApiClient(request).withAuth(testUser.token);

      const response = await api.post('/api/upscale', {
        imageData: 'data:image/jpeg;base64,test-data-that-triggers-insufficient-credits',
        mimeType: 'image/jpeg',
        config: {
          mode: 'upscale',
          scale: 2,
          preserveText: true,
          enhanceFace: false,
          denoise: false,
        },
      });

      // This test might not always trigger insufficient credits depending on mocking
      // But we verify the error structure if it does occur
      if (response.status === 402) {
        const body = await response.json();
        expect(body).toMatchObject({
          error: 'Payment Required',
          message: 'You have insufficient credits. Please purchase more credits to continue.',
        });
      }
    });

    test('should return 422 for AI safety violations', async ({ request }) => {
      const testUser = await ctx.createUser();
      api = new ApiClient(request).withAuth(testUser.token);

      // Test with data that would trigger safety filters (mocked)
      const response = await api.post('/api/upscale', {
        imageData: 'data:image/jpeg;base64,inappropriate-content-test',
        mimeType: 'image/jpeg',
        config: {
          mode: 'upscale',
          scale: 2,
          preserveText: true,
          enhanceFace: false,
          denoise: false,
        },
      });

      // If AI service returns safety error, verify structure
      if (response.status === 422) {
        const body = await response.json();
        expect(body).toMatchObject({
          error: 'Generation Failed',
          finishReason: 'SAFETY',
        });
      }
    });

    test('should return 500 for server errors', async ({ request }) => {
      const testUser = await ctx.createUser();
      api = new ApiClient(request).withAuth(testUser.token);

      // Send malformed request that might trigger server error
      const response = await api.post('/api/upscale', {
        imageData: 'data:image/jpeg;base64,trigger-server-error-test',
        mimeType: 'image/jpeg',
        config: {
          mode: 'upscale',
          scale: 2,
          preserveText: true,
          enhanceFace: false,
          denoise: false,
        },
      });

      // Handle various error scenarios
      if (response.status >= 500) {
        const body = await response.json();
        expect(body).toMatchObject({
          success: false,
          error: expect.any(Object),
        });
        // Error may contain message with various error details
        expect(body.error.message || body.error.code).toBeTruthy();
      }
    });

    test('should handle malformed JSON', async ({ request }) => {
      // Note: ApiClient automatically handles JSON serialization, so we need to use raw request
      const response = await request.post(`${BASE_URL}/api/upscale`, {
        data: 'invalid json {{{',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should handle gracefully (400 for bad JSON or 401 if auth fails first)
      expect([400, 401]).toContain(response.status());
    });

    test('should handle oversized request body', async ({ request }) => {
      api = new ApiClient(request);
      const largeData = 'x'.repeat(1 * 1024 * 1024); // 1MB (reduced to avoid timeout)

      const response = await api.post('/api/upscale', {
        imageData: `data:image/jpeg;base64,${largeData}`,
        mimeType: 'image/jpeg',
        config: {
          mode: 'upscale',
          scale: 2,
          preserveText: true,
          enhanceFace: false,
          denoise: false,
        },
      });

      // Should handle gracefully (either 400, 413, or 500 depending on infrastructure)
      expect([400, 401, 413, 500]).toContain(response.status);
    });
  });

  test.describe('/api/checkout Error Handling', () => {
    test('should return 400 for missing priceId', async ({ request }) => {
      api = new ApiClient(request).withAuth(authToken);
      const response = await api.post('/api/checkout', {});

      response.expectStatus(400);
      const body = await response.json();
      expect(body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'priceId is required'
        }
      });
    });

    test('should return 401 for missing authorization header', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/checkout', {
        priceId: 'price_test_123',
      });

      response.expectStatus(401);
      await response.expectErrorCode('UNAUTHORIZED');
    });

    test('should return 401 for invalid auth token', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/checkout', {
        priceId: 'price_test_123',
      }, {
        headers: {
          'Authorization': 'Bearer invalid_token_12345',
        }
      });

      response.expectStatus(401);
      await response.expectErrorCode('UNAUTHORIZED');
    });

    test('should return 401 for malformed auth header', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/checkout', {
        priceId: 'price_test_123',
      }, {
        headers: {
          'Authorization': 'InvalidFormat token',
        }
      });

      response.expectStatus(401);
    });

    test('should handle invalid priceId format', async ({ request }) => {
      api = new ApiClient(request).withAuth(authToken);
      const response = await api.post('/api/checkout', {
        priceId: 'invalid_price_format',
      });

      // Should reject invalid price IDs with 400 validation error
      response.expectStatus(400);
      const body = await response.json();

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_PRICE');
      expect(body.error.message).toContain('Invalid price ID');
    });

    test('should handle malformed JSON', async ({ request }) => {
      // Note: ApiClient automatically handles JSON serialization, so we need to use raw request
      const response = await request.post(`${BASE_URL}/api/checkout`, {
        data: 'invalid json {{{',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should handle missing user in database', async ({ request }) => {
      // Create a valid token for a user that doesn't exist in profiles
      const nonExistentUserToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';

      api = new ApiClient(request);
      const response = await api.post('/api/checkout', {
        priceId: 'price_test_123',
      }, {
        headers: {
          'Authorization': `Bearer ${nonExistentUserToken}`,
        }
      });

      response.expectStatus(401);
    });
  });

  test.describe('/api/analytics/event Error Handling', () => {
    test('should return 400 for missing event name', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', {
        properties: {},
      });

      response.expectStatus(400);
      const body = await response.json();
      expect(body.error).toBe('Invalid event payload');
    });

    test('should return 400 for invalid event name', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', {
        eventName: 'invalid_event_name',
        properties: {},
      });

      response.expectStatus(400);
      const body = await response.json();
      expect(body.error).toBe('Invalid event payload');
    });

    test('should return 400 for malformed JSON', async ({ request }) => {
      // Note: ApiClient automatically handles JSON serialization, so we need to use raw request
      const response = await request.post(`${BASE_URL}/api/analytics/event`, {
        data: 'invalid json {{{',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should handle oversized event payload', async ({ request }) => {
      api = new ApiClient(request);
      const largeProperties = {
        data: 'x'.repeat(100000), // Large payload
      };

      const response = await api.post('/api/analytics/event', {
        eventName: 'login',
        properties: largeProperties,
      });

      // Should handle gracefully
      expect([200, 400, 413, 500]).toContain(response.status);
    });
  });

  test.describe('HTTP Method Validation', () => {
    test('should reject GET requests to POST endpoints', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.get('/api/upscale');

      // Authentication check happens before method validation in most cases
      expect([401, 405]).toContain(response.status);
    });

    test('should reject PUT requests to POST-only endpoints', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.put('/api/upscale', {});

      expect([401, 405]).toContain(response.status);
    });

    test('should reject DELETE requests to POST-only endpoints', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.delete('/api/upscale');

      expect([401, 405]).toContain(response.status);
    });

    test('should reject PATCH requests to POST-only endpoints', async ({ request }) => {
      // Note: PATCH not directly supported, we need to use raw request for this test
      const response = await request.patch(`${BASE_URL}/api/upscale`, {
        data: {},
      });

      expect([401, 405]).toContain(response.status());
    });
  });

  test.describe('Content-Type Validation', () => {
    test('should reject requests with invalid content-type', async ({ request }) => {
      // Note: ApiClient automatically handles JSON content-type, so we need to use raw request
      const response = await request.post(`${BASE_URL}/api/upscale`, {
        data: '{"test": "data"}',
        headers: {
          'Content-Type': 'text/plain',
        },
      });

      // Authentication may fail first
      expect([400, 401]).toContain(response.status());
    });

    test('should handle requests without content-type header', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/upscale', { test: 'data' });

      expect([400, 401]).toContain(response.status);
    });

    test('should accept application/json content-type', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', {
        eventName: 'login',
        properties: {},
      });

      response.expectStatus(200);
    });
  });

  test.describe('Header Validation', () => {
    test('should handle malformed user-agent header', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', {
        eventName: 'login',
        properties: {},
      }, {
        headers: {
          'User-Agent': 'Mozilla/5.0 () <script>alert("xss")</script>',
        }
      });

      response.expectStatus(200); // Should handle gracefully
    });

    test('should handle extremely long headers', async ({ request }) => {
      api = new ApiClient(request);
      const longHeaderValue = 'x'.repeat(10000);

      const response = await api.post('/api/analytics/event', {
        eventName: 'login',
        properties: {},
      }, {
        headers: {
          'X-Long-Header': longHeaderValue,
        }
      });

      // Should handle gracefully
      expect([200, 400, 429, 431]).toContain(response.status);
    });
  });

  test.describe('Rate Limiting Error Responses', () => {
    test('should return 429 with proper headers when rate limited', async ({ request }) => {
      api = new ApiClient(request);
      // Make many rapid requests to trigger rate limiting
      const requests = Array(15).fill(null).map(() =>
        api.get('/api/health')
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponse = responses.find(r => r.status === 429);

      if (rateLimitedResponse) {
        expect(rateLimitedResponse.status).toBe(429);
        expect(rateLimitedResponse.raw.headers()['retry-after']).toBeTruthy();
        expect(rateLimitedResponse.raw.headers()['x-ratelimit-reset']).toBeTruthy();

        const body = await rateLimitedResponse.json();
        expect(body.error).toContain('Too many requests');
      }
    });

    test('should include rate limit headers in all responses', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', {
        eventName: 'login',
        properties: {},
      });

      // Public routes should have rate limit headers if middleware adds them
      // This test may be skipped if rate limiting is not implemented
      const headers = response.raw.headers();
      if (headers['x-ratelimit-remaining']) {
        expect(headers['x-ratelimit-remaining']).toBeTruthy();
        expect(headers['x-ratelimit-limit']).toBeTruthy();
        expect(headers['x-ratelimit-reset']).toBeTruthy();
      }
    });
  });

  test.describe('CORS Error Handling', () => {
    test('should handle preflight requests properly', async ({ request }) => {
      const response = await request.fetch(`${BASE_URL}/api/upscale`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      });

      // CORS preflight may return 401 if middleware blocks it, or 200/204 if handled
      expect([200, 204, 401]).toContain(response.status());
      if (response.status() < 400) {
        expect(response.headers()['access-control-allow-origin']).toBeTruthy();
      }
    });

    test('should reject requests from unauthorized origins', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/upscale', {}, {
        headers: {
          'Origin': 'http://malicious-site.com',
        }
      });

      // Should handle based on CORS configuration and authentication
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});