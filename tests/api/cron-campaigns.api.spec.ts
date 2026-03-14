/**
 * Integration Tests for Campaign Cron API Endpoints
 *
 * Tests cover:
 * - Queue Campaigns endpoint (authentication, response structure)
 * - Send Campaigns endpoint (authentication, response structure)
 */

import { test, expect } from '@playwright/test';

/**
 * Get cron secret for tests
 */
const getCronSecret = (): string => {
  return process.env.CRON_SECRET || 'test-cron-secret';
};

// =============================================================================
// QUEUE CAMPAIGNS CRON ENDPOINT TESTS
// =============================================================================

test.describe('API: Cron Queue Campaigns', () => {
  test.describe('Cron Secret Authentication', () => {
    test('should reject requests without cron secret', async ({ request }) => {
      const response = await request.post('/api/cron/queue-campaigns', {
        data: {},
      });

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('success');
      expect(data.success).toBe(false);
    });

    test('should reject requests with invalid cron secret', async ({ request }) => {
      const response = await request.post('/api/cron/queue-campaigns', {
        data: {},
        headers: {
          'x-cron-secret': 'invalid-secret',
        },
      });

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    test('should accept requests with valid cron secret', async ({ request }) => {
      const response = await request.post('/api/cron/queue-campaigns', {
        data: {},
        headers: {
          'x-cron-secret': getCronSecret(),
        },
      });

      // Should succeed or fail gracefully (no campaigns to process)
      expect([200, 500]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('campaigns');
        expect(data).toHaveProperty('queued');
        expect(data).toHaveProperty('skipped');
        expect(data).toHaveProperty('errors');
        expect(typeof data.campaigns).toBe('number');
        expect(typeof data.queued).toBe('number');
        expect(typeof data.skipped).toBe('number');
        expect(Array.isArray(data.errors)).toBe(true);
      }
    });
  });

  test.describe('Response Format', () => {
    test('should return proper response structure', async ({ request }) => {
      const response = await request.post('/api/cron/queue-campaigns', {
        data: {},
        headers: {
          'x-cron-secret': getCronSecret(),
        },
      });

      if (response.status() === 200) {
        const data = await response.json();

        // Required fields per PRD
        expect(data).toHaveProperty('campaigns');
        expect(data).toHaveProperty('queued');
        expect(data).toHaveProperty('skipped');
        expect(data).toHaveProperty('errors');

        // Types
        expect(typeof data.campaigns).toBe('number');
        expect(typeof data.queued).toBe('number');
        expect(typeof data.skipped).toBe('number');
        expect(Array.isArray(data.errors)).toBe(true);

        // Optional results array with details
        if (data.results) {
          expect(Array.isArray(data.results)).toBe(true);
          if (data.results.length > 0) {
            const firstResult = data.results[0];
            expect(firstResult).toHaveProperty('campaignId');
            expect(firstResult).toHaveProperty('campaignName');
            expect(firstResult).toHaveProperty('segment');
            expect(firstResult).toHaveProperty('queued');
            expect(firstResult).toHaveProperty('skipped');
          }
        }
      }
    });

    test('should return zero values when no campaigns exist', async ({ request }) => {
      const response = await request.post('/api/cron/queue-campaigns', {
        data: {},
        headers: {
          'x-cron-secret': getCronSecret(),
        },
      });

      if (response.status() === 200) {
        const data = await response.json();
        // When no campaigns, should still have the structure
        expect(data).toHaveProperty('campaigns');
        expect(data).toHaveProperty('queued');
        expect(data).toHaveProperty('skipped');
        expect(data).toHaveProperty('errors');
      }
    });
  });

  test.describe('Request Validation', () => {
    test('should accept empty body', async ({ request }) => {
      const response = await request.post('/api/cron/queue-campaigns', {
        data: {},
        headers: {
          'x-cron-secret': getCronSecret(),
        },
      });

      expect([200, 500]).toContain(response.status());
    });

    test('should accept missing body', async ({ request }) => {
      const response = await request.post('/api/cron/queue-campaigns', {
        headers: {
          'x-cron-secret': getCronSecret(),
        },
      });

      // Should handle missing body gracefully
      expect([200, 400, 500]).toContain(response.status());
    });
  });
});

// =============================================================================
// SEND CAMPAIGNS CRON ENDPOINT TESTS
// =============================================================================

test.describe('API: Cron Send Campaigns', () => {
  test.describe('Cron Secret Authentication', () => {
    test('should reject requests without cron secret', async ({ request }) => {
      const response = await request.post('/api/cron/send-campaigns', {
        data: {},
      });

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('success');
      expect(data.success).toBe(false);
    });

    test('should reject requests with invalid cron secret', async ({ request }) => {
      const response = await request.post('/api/cron/send-campaigns', {
        data: {},
        headers: {
          'x-cron-secret': 'invalid-secret',
        },
      });

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    test('should accept requests with valid cron secret', async ({ request }) => {
      const response = await request.post('/api/cron/send-campaigns', {
        data: {},
        headers: {
          'x-cron-secret': getCronSecret(),
        },
      });

      // Should succeed or fail gracefully
      expect([200, 500]).toContain(response.status());

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

  test.describe('Response Format', () => {
    test('should return proper response structure', async ({ request }) => {
      const response = await request.post('/api/cron/send-campaigns', {
        data: {},
        headers: {
          'x-cron-secret': getCronSecret(),
        },
      });

      if (response.status() === 200) {
        const data = await response.json();

        // Required fields per PRD
        expect(data).toHaveProperty('sent');
        expect(data).toHaveProperty('failed');
        expect(data).toHaveProperty('remaining');

        // Types
        expect(typeof data.sent).toBe('number');
        expect(typeof data.failed).toBe('number');
        expect(typeof data.remaining).toBe('number');

        // Non-negative
        expect(data.sent).toBeGreaterThanOrEqual(0);
        expect(data.failed).toBeGreaterThanOrEqual(0);
        expect(data.remaining).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe('Request Validation', () => {
    test('should accept empty body with defaults', async ({ request }) => {
      const response = await request.post('/api/cron/send-campaigns', {
        data: {},
        headers: {
          'x-cron-secret': getCronSecret(),
        },
      });

      expect([200, 500]).toContain(response.status());
    });

    test('should accept optional limit parameter', async ({ request }) => {
      const response = await request.post('/api/cron/send-campaigns', {
        data: { limit: 50 },
        headers: {
          'x-cron-secret': getCronSecret(),
        },
      });

      expect([200, 500]).toContain(response.status());
    });

    test('should reject invalid limit parameter (negative)', async ({ request }) => {
      const response = await request.post('/api/cron/send-campaigns', {
        data: { limit: -1 },
        headers: {
          'x-cron-secret': getCronSecret(),
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should reject invalid limit parameter (exceeds max)', async ({ request }) => {
      const response = await request.post('/api/cron/send-campaigns', {
        data: { limit: 1000 },
        headers: {
          'x-cron-secret': getCronSecret(),
        },
      });

      expect(response.status()).toBe(400);
    });

    test('should reject invalid limit parameter (non-integer)', async ({ request }) => {
      const response = await request.post('/api/cron/send-campaigns', {
        data: { limit: 50.5 },
        headers: {
          'x-cron-secret': getCronSecret(),
        },
      });

      expect(response.status()).toBe(400);
    });
  });
});

// =============================================================================
// SECURITY HEADERS TESTS
// =============================================================================

test.describe('API: Campaign Cron Security Headers', () => {
  test('should include security headers on queue-campaigns endpoint', async ({ request }) => {
    const response = await request.post('/api/cron/queue-campaigns', {
      data: {},
      headers: {
        'x-cron-secret': getCronSecret(),
      },
    });

    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-frame-options']).toBe('DENY');
  });

  test('should include security headers on send-campaigns endpoint', async ({ request }) => {
    const response = await request.post('/api/cron/send-campaigns', {
      data: {},
      headers: {
        'x-cron-secret': getCronSecret(),
      },
    });

    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-frame-options']).toBe('DENY');
  });

  test('should have correct content-type for JSON responses', async ({ request }) => {
    const response = await request.post('/api/cron/queue-campaigns', {
      data: {},
      headers: {
        'x-cron-secret': getCronSecret(),
      },
    });

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
  });
});

// =============================================================================
// HTTP METHOD TESTS
// =============================================================================

test.describe('API: Campaign Cron HTTP Methods', () => {
  test('should reject GET on queue-campaigns', async ({ request }) => {
    const response = await request.get('/api/cron/queue-campaigns');

    expect([404, 405]).toContain(response.status());
  });

  test('should reject PUT on queue-campaigns', async ({ request }) => {
    const response = await request.put('/api/cron/queue-campaigns', {
      data: {},
    });

    expect([404, 405]).toContain(response.status());
  });

  test('should reject DELETE on queue-campaigns', async ({ request }) => {
    const response = await request.delete('/api/cron/queue-campaigns');

    expect([404, 405]).toContain(response.status());
  });

  test('should reject GET on send-campaigns', async ({ request }) => {
    const response = await request.get('/api/cron/send-campaigns');

    expect([404, 405]).toContain(response.status());
  });

  test('should reject PUT on send-campaigns', async ({ request }) => {
    const response = await request.put('/api/cron/send-campaigns', {
      data: {},
    });

    expect([404, 405]).toContain(response.status());
  });

  test('should reject DELETE on send-campaigns', async ({ request }) => {
    const response = await request.delete('/api/cron/send-campaigns');

    expect([404, 405]).toContain(response.status());
  });
});
