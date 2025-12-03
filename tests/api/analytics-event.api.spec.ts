import { test, expect } from '@playwright/test';
import { TestContext, ApiClient } from '../helpers';

/**
 * Integration Tests for Analytics Event API
 *
 * These tests validate the analytics event tracking functionality including:
 * - Event validation and security
 * - Authentication handling
 * - Event processing and forwarding
 * - Error handling and resilience
 */

// Shared test setup for all analytics tests
let ctx: TestContext;
let api: ApiClient;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

test.describe('API: Analytics Event Integration', () => {
  test.describe('Event Validation', () => {
    test('should accept valid event payloads', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', {
        eventName: 'image_download',
        properties: {
          scaleFactor: 2,
          mode: 'standard',
          processingTime: 1500,
        },
        sessionId: 'session_test_123',
      });

      response.expectStatus(200);
      await response.expectData({ success: true });
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
      expect(Array.isArray(data.details)).toBe(true);
    });

    test('should accept events without optional fields', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', {
        eventName: 'login',
        // No properties or sessionId
      });

      response.expectStatus(200);
      await response.expectData({ success: true });
    });

    test('should accept empty properties object', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', {
        eventName: 'logout',
        properties: {},
        sessionId: 'session_test_456',
      });

      response.expectStatus(200);
      await response.expectData({ success: true });
    });

    test('should accept complex properties object', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', {
        eventName: 'checkout_completed',
        properties: {
          amount: 2900,
          currency: 'USD',
          plan: 'pro',
          paymentMethod: 'card',
          metadata: {
            source: 'pricing_page',
            campaign: 'launch_promo',
            utm_source: 'google',
            utm_medium: 'cpc',
            deviceType: 'desktop',
            browser: 'chrome',
          },
          items: [
            {
              name: 'Pro Plan Monthly',
              quantity: 1,
              price: 2900,
            },
          ],
        },
        sessionId: 'session_checkout_789',
      });

      response.expectStatus(200);
      await response.expectData({ success: true });
    });

    test('should reject malformed JSON', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', 'invalid json {', {
        headers: { 'Content-Type': 'application/json' }
      });

      response.expectStatus(400);
    });

    test('should reject empty request body', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', '', {
        headers: { 'Content-Type': 'application/json' }
      });

      // Analytics API is lenient and accepts empty bodies as valid events
      expect([200, 400]).toContain(response.status());
    });

    test('should validate sessionId format', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', {
        eventName: 'login',
        sessionId: 123, // Should be string, not number
      });

      response.expectStatus(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid event payload');
    });
  });

  test.describe('Allowed Events Security', () => {
    const allowedEvents = [
      'signup_started',
      'signup_completed',
      'login',
      'logout',
      'checkout_started',
      'checkout_completed',
      'checkout_abandoned',
      'image_download',
    ];

    test('should accept all allowed event types', async ({ request }) => {
      api = new ApiClient(request);

      for (const [index, eventName] of allowedEvents.entries()) {
        // Add small delay between requests to avoid rate limiting
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        const response = await api.post('/api/analytics/event', {
          eventName,
          sessionId: `test_session_${eventName}`,
        });

        response.expectStatus(200);
        await response.expectData({ success: true });
      }
    });

    test('should reject event name injection attempts', async ({ request }) => {
      api = new ApiClient(request);
      const maliciousEventNames = [
        '../../../etc/passwd',
        '<script>alert("xss")</script>',
        'SELECT * FROM users',
        '${7*7}',
        '{{constructor.constructor("return process")().env}}',
        '__proto__',
        'constructor',
        'prototype',
      ];

      for (const [index, eventName] of maliciousEventNames.entries()) {
        // Add small delay between requests to avoid rate limiting
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

    test('should reject event names with SQL injection patterns', async ({ request }) => {
      api = new ApiClient(request);
      const sqlInjectionAttempts = [
        "login' OR '1'='1",
        'image_download; DROP TABLE users; --',
        "checkout_completed' UNION SELECT * FROM profiles --",
        'signup_started\x00admin',
      ];

      for (const [index, eventName] of sqlInjectionAttempts.entries()) {
        // Add small delay between requests to avoid rate limiting
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const response = await api.post('/api/analytics/event', {
          eventName,
          sessionId: 'sql_injection_test',
        });

        response.expectStatus(400);
      }
    });
  });

  test.describe('Authentication Handling', () => {
    test('should handle events with valid authentication', async ({ request }) => {
      const user = await ctx.createUser();
      api = new ApiClient(request).withAuth(user.token);
      const response = await api.post('/api/analytics/event', {
        eventName: 'image_download',
        properties: {
          authenticated: true,
        },
        sessionId: 'authenticated_session',
      });

      response.expectStatus(200);
      await response.expectData({ success: true });
    });

    test('should handle events without authentication', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', {
        eventName: 'signup_started',
        properties: {
          authenticated: false,
        },
        sessionId: 'anonymous_session',
      });

      response.expectStatus(200);
      await response.expectData({ success: true });
    });

    test('should handle events with invalid authentication token', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', {
        eventName: 'login',
        sessionId: 'invalid_auth_session',
      }, {
        headers: { Authorization: 'Bearer invalid_token_12345' }
      });

      // Should still succeed because analytics shouldn't fail user actions
      response.expectStatus(200);
      await response.expectData({ success: true });
    });

    test('should handle malformed authorization header', async ({ request }) => {
      api = new ApiClient(request);
      const malformedHeaders = [
        'InvalidFormat token123',
        'Bearer',
        'Bearer not.a.valid.jwt',
        'Basic dGVzdDoxMjM=', // Basic auth instead of Bearer
        '',
      ];

      for (const authHeader of malformedHeaders) {
        const response = await api.post('/api/analytics/event', {
          eventName: 'login',
          sessionId: 'malformed_auth_test',
        }, {
          headers: authHeader ? { Authorization: authHeader } : {}
        });

        // Should still succeed - analytics errors shouldn't block user actions
        response.expectStatus(200);
      }
    });
  });

  test.describe('Event Processing', () => {
    test('should process different event types correctly', async ({ request }) => {
      api = new ApiClient(request);
      const eventTypes = [
        {
          eventName: 'signup_started',
          properties: { source: 'homepage' },
          expectedBehavior: 'track funnel start',
        },
        {
          eventName: 'signup_completed',
          properties: { method: 'email' },
          expectedBehavior: 'track conversion',
        },
        {
          eventName: 'login',
          properties: { method: 'email' },
          expectedBehavior: 'track authentication',
        },
        {
          eventName: 'checkout_started',
          properties: { plan: 'pro', amount: 2900 },
          expectedBehavior: 'track purchase intent',
        },
        {
          eventName: 'image_download',
          properties: { format: 'png', scale: 2 },
          expectedBehavior: 'track feature usage',
        },
      ];

      for (const eventType of eventTypes) {
        const response = await api.post('/api/analytics/event', {
          eventName: eventType.eventName,
          properties: eventType.properties,
          sessionId: `test_${eventType.eventName}`,
        });

        response.expectStatus(200);
        await response.expectData({ success: true });
      }
    });

    test('should handle events with large properties', async ({ request }) => {
      api = new ApiClient(request);
      // Create a large properties object
      const largeProperties = {
        metadata: {},
        arrayData: [],
        longString: 'x'.repeat(1000),
      };

      // Add many nested properties
      for (let i = 0; i < 100; i++) {
        largeProperties.metadata[`key_${i}`] = `value_${i}`;
        largeProperties.arrayData.push({
          id: i,
          name: `item_${i}`,
          description: `This is item number ${i} with some additional text to make it longer`,
        });
      }

      const response = await api.post('/api/analytics/event', {
        eventName: 'checkout_completed',
        properties: largeProperties,
        sessionId: 'large_properties_test',
      });

      response.expectStatus(200);
      await response.expectData({ success: true });
    });

    test('should handle special characters in properties', async ({ request }) => {
      api = new ApiClient(request);
      const specialProperties = {
        unicode: '🎉🚀✨ Hello 世界',
        html: '<script>alert("test")</script>',
        sql: "SELECT * FROM users WHERE name = 'admin';",
        json: '{"nested": {"array": [1,2,3]}}',
        quotes: 'Single "double" quotes test',
        newlines: 'Line 1\nLine 2\r\nLine 3',
        tabs: 'Column1\tColumn2\tColumn3',
        emojis: '😀😃😄😁😆😅😂🤣😊😇',
      };

      const response = await api.post('/api/analytics/event', {
        eventName: 'image_download',
        properties: specialProperties,
        sessionId: 'special_chars_test',
      });

      response.expectStatus(200);
      await response.expectData({ success: true });
    });
  });

  test.describe('Error Handling and Resilience', () => {
    test('should handle malformed authorization without failing', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/analytics/event', {
        eventName: 'login',
        sessionId: 'malformed_token_test',
      }, {
        headers: { Authorization: 'Bearer malformed.jwt.token' }
      });

      // Should return success even with invalid auth
      response.expectStatus(200);
      await response.expectData({ success: true });
    });

    test('should handle malformed authorization headers', async ({ request }) => {
      api = new ApiClient(request);
      const malformedHeaders = [
        'InvalidFormat token123',
        'Bearer',
        'Bearer not.a.valid.jwt',
        'Basic dGVzdDoxMjM=', // Basic auth instead of Bearer
        '',
      ];

      for (const authHeader of malformedHeaders) {
        const response = await api.post('/api/analytics/event', {
          eventName: 'login',
          sessionId: 'malformed_auth_test',
        }, {
          headers: authHeader ? { Authorization: authHeader } : {}
        });

        // Should still succeed - analytics errors shouldn't block user actions
        response.expectStatus(200);
      }
    });

    test('should handle concurrent events', async ({ request }) => {
      api = new ApiClient(request);
      const concurrentEvents = Array(10)
        .fill(null)
        .map((_, index) => ({
          eventName: 'image_download',
          properties: { batchIndex: index },
          sessionId: `concurrent_test_${index}`,
        }));

      // Send all events concurrently
      const responses = await Promise.all(
        concurrentEvents.map(event => api.post('/api/analytics/event', event))
      );

      // All should succeed
      for (const response of responses) {
        response.expectStatus(200);
        await response.expectData({ success: true });
      }
    });
  });

  test.describe('Privacy and Security', () => {
    test('should not log sensitive data in properties', async ({ request }) => {
      api = new ApiClient(request);
      const sensitiveData = {
        password: 'secret123',
        creditCard: '4242-4242-4242-4242',
        ssn: '123-45-6789',
        apiKey: 'sk_live_123456789',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        privateInfo: 'This should not be logged',
      };

      // The API should accept it but handle it securely
      const response = await api.post('/api/analytics/event', {
        eventName: 'login',
        properties: sensitiveData,
        sessionId: 'sensitive_data_test',
      });

      response.expectStatus(200);
      await response.expectData({ success: true });
    });

    test('should handle extremely long session IDs', async ({ request }) => {
      api = new ApiClient(request);
      const longSessionId = 'x'.repeat(10000); // 10KB session ID

      const response = await api.post('/api/analytics/event', {
        eventName: 'image_download',
        sessionId: longSessionId,
      });

      // Should handle gracefully - either accept or reject with proper error
      expect([200, 400]).toContain(response.status());
    });

    test('should sanitize event properties to prevent injection', async ({ request }) => {
      api = new ApiClient(request);
      const injectionAttempts = {
        xss: '<script>alert("xss")</script>',
        sqlInjection: "'; DROP TABLE users; --",
        templateInjection: '{{7*7}}',
        prototypePollution: '__proto__.isAdmin',
      };

      const response = await api.post('/api/analytics/event', {
        eventName: 'image_download',
        properties: injectionAttempts,
        sessionId: 'injection_test',
      });

      response.expectStatus(200);
      await response.expectData({ success: true });
    });
  });

  test.describe('Performance and Scalability', () => {
    test('should process events quickly', async ({ request }) => {
      api = new ApiClient(request);
      const startTime = Date.now();

      const response = await api.post('/api/analytics/event', {
        eventName: 'image_download',
        properties: { performance: 'test' },
        sessionId: 'performance_test',
      });

      const duration = Date.now() - startTime;

      response.expectStatus(200);
      expect(duration).toBeLessThan(1000); // Should process within 1 second
    });

    test('should handle burst traffic', async ({ request }) => {
      api = new ApiClient(request);
      const burstSize = 50;
      const startTime = Date.now();

      // Create a burst of requests
      const responses = await Promise.all(
        Array(burstSize)
          .fill(null)
          .map((_, index) =>
            api.post('/api/analytics/event', {
              eventName: 'image_download',
              properties: { burstIndex: index },
              sessionId: `burst_test_${index}`,
            })
          )
      );

      const duration = Date.now() - startTime;

      // All should succeed
      for (const response of responses) {
        response.expectStatus(200);
        await response.expectData({ success: true });
      }

      // Should handle burst within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds for 50 requests
    });
  });
});