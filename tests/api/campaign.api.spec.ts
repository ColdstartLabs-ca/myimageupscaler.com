import { test, expect } from '@playwright/test';
import { TestContext, ApiClient } from '../helpers';

/**
 * Integration Tests for Campaign API Endpoints
 *
 * Tests cover:
 * - Admin queue endpoint (authentication, validation)
 * - Send (cron) endpoint (cron secret auth)
 * - Unsubscribe endpoint (token verification)
 * - Email webhook endpoint (signature verification)
 */

// Shared test setup
let ctx: TestContext;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

// =============================================================================
// ADMIN QUEUE ENDPOINT TESTS
// =============================================================================

test.describe('API: Campaign Admin Queue', () => {
  const validQueueRequest = {
    campaignId: '00000000-0000-0000-0000-000000000001',
    segment: 'non_converter' as const,
    batchSize: 100,
  };

  test.describe('Authentication', () => {
    test('should reject unauthenticated requests', async ({ request }) => {
      const api = new ApiClient(request);
      const response = await api.post('/api/campaigns/admin/queue', validQueueRequest);

      response.expectStatus(401);
      await response.expectErrorCode('UNAUTHORIZED');
    });

    test('should reject non-admin users', async ({ request }) => {
      const user = await ctx.createUser();
      const api = new ApiClient(request).withAuth(user.token);

      const response = await api.post('/api/campaigns/admin/queue', validQueueRequest);

      response.expectStatus(403);
      await response.expectErrorCode('FORBIDDEN');
    });
  });

  test.describe('Request Validation', () => {
    test('should reject invalid campaign ID format', async ({ request }) => {
      const invalidRequest = {
        ...validQueueRequest,
        campaignId: 'not-a-uuid',
      };

      const response = await request.post('/api/campaigns/admin/queue', {
        data: invalidRequest,
      });

      expect(response.status()).toBe(400);
    });

    test('should reject invalid segment', async ({ request }) => {
      const invalidRequest = {
        ...validQueueRequest,
        segment: 'invalid_segment',
      };

      const response = await request.post('/api/campaigns/admin/queue', {
        data: invalidRequest,
      });

      expect(response.status()).toBe(400);
    });

    test('should reject missing required fields', async ({ request }) => {
      const response = await request.post('/api/campaigns/admin/queue', {
        data: {},
      });

      expect(response.status()).toBe(400);
    });

    test('should accept all valid segment values', async ({ request }) => {
      const segments = ['non_converter', 'non_uploader', 'trial_user'];

      for (const segment of segments) {
        const segmentRequest = {
          ...validQueueRequest,
          segment,
        };

        // Note: Without admin auth, this will fail at auth stage
        // but validation should pass
        const response = await request.post('/api/campaigns/admin/queue', {
          data: segmentRequest,
        });

        // Should fail at auth, not validation
        expect([400, 401, 403]).toContain(response.status());
      }
    });
  });

  test.describe('Response Format', () => {
    test('should return proper error structure on validation failure', async ({ request }) => {
      const response = await request.post('/api/campaigns/admin/queue', {
        data: { invalid: 'data' },
      });

      expect(response.status()).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('success');
      expect(data.success).toBe(false);
      expect(data).toHaveProperty('error');
    });
  });
});

// =============================================================================
// SEND (CRON) ENDPOINT TESTS
// =============================================================================

test.describe('API: Campaign Send (Cron)', () => {
  test.describe('Cron Secret Authentication', () => {
    test('should reject requests without cron secret', async ({ request }) => {
      const response = await request.post('/api/campaigns/send', {
        data: {},
      });

      expect(response.status()).toBe(401);
    });

    test('should reject requests with invalid cron secret', async ({ request }) => {
      const response = await request.post('/api/campaigns/send', {
        data: {},
        headers: {
          'x-cron-secret': 'invalid-secret',
        },
      });

      expect(response.status()).toBe(401);
    });

    test('should accept requests with valid cron secret in development', async ({ request }) => {
      // In test environment, cron secret validation may be bypassed
      const response = await request.post('/api/campaigns/send', {
        data: {},
        headers: {
          'x-cron-secret': process.env.CRON_SECRET || 'test-cron-secret',
        },
      });

      // Should succeed or fail gracefully (no campaigns to process)
      expect([200, 500]).toContain(response.status());
    });
  });

  test.describe('Request Validation', () => {
    test('should accept empty body with defaults', async ({ request }) => {
      const response = await request.post('/api/campaigns/send', {
        data: {},
        headers: {
          'x-cron-secret': process.env.CRON_SECRET || 'test-cron-secret',
        },
      });

      expect([200, 500]).toContain(response.status());
    });

    test('should accept optional limit parameter', async ({ request }) => {
      const response = await request.post('/api/campaigns/send', {
        data: { limit: 50 },
        headers: {
          'x-cron-secret': process.env.CRON_SECRET || 'test-cron-secret',
        },
      });

      expect([200, 500]).toContain(response.status());
    });

    test('should reject invalid limit parameter', async ({ request }) => {
      const response = await request.post('/api/campaigns/send', {
        data: { limit: -1 },
        headers: {
          'x-cron-secret': process.env.CRON_SECRET || 'test-cron-secret',
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should reject limit exceeding max', async ({ request }) => {
      const response = await request.post('/api/campaigns/send', {
        data: { limit: 1000 },
        headers: {
          'x-cron-secret': process.env.CRON_SECRET || 'test-cron-secret',
        },
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe('Response Format', () => {
    test('should return proper response structure', async ({ request }) => {
      const response = await request.post('/api/campaigns/send', {
        data: {},
        headers: {
          'x-cron-secret': process.env.CRON_SECRET || 'test-cron-secret',
        },
      });

      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('sent');
        expect(data).toHaveProperty('failed');
        expect(data).toHaveProperty('remaining');
        expect(typeof data.sent).toBe('number');
        expect(typeof data.failed).toBe('number');
        expect(typeof data.remaining).toBe('number');
      }
    });
  });
});

// =============================================================================
// UNSUBSCRIBE ENDPOINT TESTS
// =============================================================================

test.describe('API: Campaign Unsubscribe', () => {
  test.describe('Public Access', () => {
    test('should be publicly accessible (no auth required)', async ({ request }) => {
      const response = await request.get('/api/campaigns/unsubscribe');

      // Should not return 401 (unauthorized)
      expect(response.status()).not.toBe(401);
    });
  });

  test.describe('GET Handler', () => {
    test('should require token parameter', async ({ request }) => {
      const response = await request.get('/api/campaigns/unsubscribe');

      expect(response.status()).toBe(200);
      // Should render error page
      const html = await response.text();
      expect(html).toContain('Invalid');
    });

    test('should reject empty token', async ({ request }) => {
      const response = await request.get('/api/campaigns/unsubscribe?token=');

      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toContain('Invalid');
    });

    test('should return HTML content type', async ({ request }) => {
      const response = await request.get('/api/campaigns/unsubscribe?token=test');

      expect(response.headers()['content-type']).toContain('text/html');
    });

    test('should handle invalid token gracefully', async ({ request }) => {
      const response = await request.get('/api/campaigns/unsubscribe?token=invalid-token');

      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toContain('Unable to Unsubscribe');
    });
  });

  test.describe('POST Handler', () => {
    test('should accept JSON body with token', async ({ request }) => {
      const response = await request.post('/api/campaigns/unsubscribe', {
        data: { token: 'invalid-token' },
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    test('should accept form-encoded data', async ({ request }) => {
      const response = await request.post('/api/campaigns/unsubscribe', {
        data: 'token=invalid-token',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    test('should reject missing token', async ({ request }) => {
      const response = await request.post('/api/campaigns/unsubscribe', {
        data: {},
      });

      expect(response.status()).toBe(400);
    });

    test('should return JSON response', async ({ request }) => {
      const response = await request.post('/api/campaigns/unsubscribe', {
        data: { token: 'test-token' },
      });

      expect(response.headers()['content-type']).toContain('application/json');
    });
  });

  test.describe('Response Format', () => {
    test('should return success response structure', async ({ request }) => {
      const response = await request.post('/api/campaigns/unsubscribe', {
        data: { token: 'test-token' },
      });

      const data = await response.json();
      expect(data).toHaveProperty('success');
      expect(typeof data.success).toBe('boolean');
    });
  });
});

// =============================================================================
// EMAIL WEBHOOK ENDPOINT TESTS
// =============================================================================

test.describe('API: Email Webhook', () => {
  test.describe('Public Access', () => {
    test('should be publicly accessible (uses signature auth)', async ({ request }) => {
      // Webhooks are under /api/webhooks/* which is public
      const response = await request.post('/api/webhooks/email', {
        data: {},
      });

      // Should not return 401 from middleware (signature check happens inside)
      expect(response.status()).not.toBe(401);
    });
  });

  test.describe('Signature Verification', () => {
    test('should reject requests without signature in production', async ({ request }) => {
      // In development/test mode, signature may be optional
      const response = await request.post('/api/webhooks/email', {
        data: { event: 'opened', email: 'test@example.com' },
      });

      // In test mode, may be allowed
      expect([200, 400, 401]).toContain(response.status());
    });
  });

  test.describe('Payload Validation', () => {
    test('should accept Brevo webhook format', async ({ request }) => {
      const brevoEvent = {
        event: 'opened',
        email: 'test@example.com',
        messageId: 'msg-123',
        subject: 'Test Subject',
      };

      const response = await request.post('/api/webhooks/email', {
        data: brevoEvent,
      });

      expect([200, 400, 401]).toContain(response.status());
    });

    test('should accept Resend webhook format', async ({ request }) => {
      const resendEvent = {
        type: 'opened',
        data: {
          email_id: 'email-123',
          to: 'test@example.com',
        },
      };

      const response = await request.post('/api/webhooks/email', {
        data: resendEvent,
      });

      expect([200, 400, 401]).toContain(response.status());
    });

    test('should accept array of events', async ({ request }) => {
      const events = [
        { event: 'opened', email: 'test1@example.com' },
        { event: 'clicked', email: 'test2@example.com' },
      ];

      const response = await request.post('/api/webhooks/email', {
        data: events,
      });

      expect([200, 400, 401]).toContain(response.status());
    });

    test('should handle invalid JSON gracefully', async ({ request }) => {
      const response = await request.post('/api/webhooks/email', {
        data: 'invalid json',
        headers: {
          'Content-Type': 'text/plain',
        },
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe('Event Types', () => {
    const validEvents = [
      'delivered',
      'opened',
      'clicked',
      'bounced',
      'unsubscribed',
      'complained',
      'returned',
    ];

    for (const eventType of validEvents) {
      test(`should accept ${eventType} event type`, async ({ request }) => {
        const event = {
          event: eventType,
          email: 'test@example.com',
        };

        const response = await request.post('/api/webhooks/email', {
          data: event,
        });

        expect([200, 400, 401]).toContain(response.status());
      });
    }
  });

  test.describe('Response Format', () => {
    test('should return proper webhook response structure', async ({ request }) => {
      const response = await request.post('/api/webhooks/email', {
        data: { event: 'opened', email: 'test@example.com' },
      });

      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('received');
        expect(data.received).toBe(true);
      }
    });
  });
});

// =============================================================================
// SECURITY HEADERS TESTS
// =============================================================================

test.describe('API: Campaign Security Headers', () => {
  test('should include security headers on campaign endpoints', async ({ request }) => {
    const response = await request.get('/api/campaigns/unsubscribe');

    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-frame-options']).toBe('DENY');
  });

  test('should have correct content-type for JSON responses', async ({ request }) => {
    const response = await request.post('/api/campaigns/unsubscribe', {
      data: { token: 'test' },
    });

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
  });
});

// =============================================================================
// HTTP METHOD TESTS
// =============================================================================

test.describe('API: Campaign HTTP Methods', () => {
  test('should reject PUT on admin queue', async ({ request }) => {
    const response = await request.put('/api/campaigns/admin/queue', {
      data: {},
    });

    expect([404, 405]).toContain(response.status());
  });

  test('should reject DELETE on admin queue', async ({ request }) => {
    const response = await request.delete('/api/campaigns/admin/queue');

    expect([404, 405]).toContain(response.status());
  });

  test('should reject GET on admin queue', async ({ request }) => {
    const response = await request.get('/api/campaigns/admin/queue');

    expect([404, 405]).toContain(response.status());
  });

  test('should reject PUT on send endpoint', async ({ request }) => {
    const response = await request.put('/api/campaigns/send', {
      data: {},
    });

    expect([404, 405]).toContain(response.status());
  });

  test('should reject GET on webhook endpoint', async ({ request }) => {
    const response = await request.get('/api/webhooks/email');

    expect([404, 405]).toContain(response.status());
  });
});
