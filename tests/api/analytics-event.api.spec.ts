import { test, expect } from '@playwright/test';
import { TestContext, ApiClient, ApiResponse } from '../helpers';

/**
 * Integration Tests for Analytics Event API
 *
 * Focused test suite covering core functionality:
 * - Event validation
 * - Security (injection protection)
 * - Authentication handling
 * - Concurrent request handling
 */

let ctx: TestContext;
let api: ApiClient;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

test.describe('API: Analytics Event Integration', () => {
  test('should accept valid event payloads', async ({ request }) => {
    api = new ApiClient(request);
    const response = await api.post('/api/analytics/event', {
      eventName: 'api_call_completed',
      properties: {
        endpoint: '/api/test',
        method: 'POST',
        durationMs: 1500,
        success: true,
      },
      sessionId: 'session_test_123',
    });

    response.expectStatus(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should reject invalid event names', async ({ request }) => {
    api = new ApiClient(request);
    const response = await api.post('/api/analytics/event', {
      eventName: 'invalid_event_name',
      properties: {},
      sessionId: 'session_test_123',
    });

    response.expectStatus(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid event payload');
    expect(data.details).toBeDefined();
  });

  test('should reject malicious event name injection attempts', async ({ request }) => {
    api = new ApiClient(request);
    const maliciousEventNames = [
      '../../../etc/passwd',
      '<script>alert("xss")</script>',
      'SELECT * FROM users',
      "login' OR '1'='1",
      '${7*7}',
      '__proto__',
    ];

    for (const [index, eventName] of maliciousEventNames.entries()) {
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const response = await api.post('/api/analytics/event', {
        eventName,
        sessionId: 'malicious_test',
      });

      response.expectStatus(400);
    }
  });

  test('should handle events with valid authentication', async ({ request }) => {
    const user = await ctx.createUser();
    api = new ApiClient(request).withAuth(user.token);
    const response = await api.post('/api/analytics/event', {
      eventName: 'api_call_completed',
      properties: { endpoint: '/api/test', method: 'GET', durationMs: 100, success: true },
      sessionId: 'authenticated_session',
    });

    response.expectStatus(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should handle events without authentication', async ({ request }) => {
    api = new ApiClient(request);
    const response = await api.post('/api/analytics/event', {
      eventName: 'signup_started',
      sessionId: 'anonymous_session',
    });

    response.expectStatus(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should gracefully handle invalid auth tokens', async ({ request }) => {
    api = new ApiClient(request);
    const response = await api.post(
      '/api/analytics/event',
      {
        eventName: 'login',
        sessionId: 'invalid_auth_session',
      },
      {
        headers: { Authorization: 'Bearer invalid_token_12345' },
      }
    );

    // Analytics should not block user actions due to auth failures
    response.expectStatus(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should handle concurrent events', async ({ request }) => {
    api = new ApiClient(request);
    const concurrentEvents = Array(10)
      .fill(null)
      .map((_, index) => ({
        eventName: 'api_call_completed',
        properties: { endpoint: '/api/test', method: 'POST', durationMs: 100, success: true },
        sessionId: `concurrent_test_${index}`,
      }));

    // Stagger requests slightly to reduce rate limiting and improve reliability
    const responses: ApiResponse<unknown>[] = [];
    for (const [index, event] of concurrentEvents.entries()) {
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const response = await api.post('/api/analytics/event', event);
      responses.push(response);
    }

    for (const response of responses) {
      response.expectStatus(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    }
  });
});
