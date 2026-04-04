/**
 * Integration Tests for Campaign Cron API Endpoints
 *
 * Tests cover:
 * - Queue Campaigns endpoint (authentication, response structure)
 * - Send Campaigns endpoint (authentication, response structure)
 *
 * Note: Tests that require valid CRON_SECRET depend on environment setup.
 * The cron secret must be set in both process.env.CRON_SECRET and loaded by serverEnv.
 */

import { test, expect } from '@playwright/test';

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
  });

  test.describe('Response Format', () => {
    test('should return 401 for missing auth with proper error structure', async ({ request }) => {
      const response = await request.post('/api/cron/queue-campaigns', {
        data: {},
      });

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('success');
      expect(data.success).toBe(false);
      expect(data).toHaveProperty('error');
    });
  });

  test.describe('HTTP Methods', () => {
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
  });

  test.describe('Response Format', () => {
    test('should return 401 for missing auth with proper error structure', async ({ request }) => {
      const response = await request.post('/api/cron/send-campaigns', {
        data: {},
      });

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('success');
      expect(data.success).toBe(false);
      expect(data).toHaveProperty('error');
    });
  });

  test.describe('HTTP Methods', () => {
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
});

// =============================================================================
// SECURITY HEADERS TESTS
// =============================================================================

test.describe('API: Campaign Cron Security Headers', () => {
  test('should include security headers on queue-campaigns endpoint', async ({ request }) => {
    const response = await request.post('/api/cron/queue-campaigns', {
      data: {},
    });

    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-frame-options']).toBe('DENY');
  });

  test('should include security headers on send-campaigns endpoint', async ({ request }) => {
    const response = await request.post('/api/cron/send-campaigns', {
      data: {},
    });

    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-frame-options']).toBe('DENY');
  });

  test('should have correct content-type for JSON responses', async ({ request }) => {
    const response = await request.post('/api/cron/queue-campaigns', {
      data: {},
    });

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
  });
});

// =============================================================================
// REQUEST BODY HANDLING TESTS
// =============================================================================

test.describe('API: Cron Request Body Handling', () => {
  test('should handle empty JSON body on queue-campaigns', async ({ request }) => {
    const response = await request.post('/api/cron/queue-campaigns', {
      data: {},
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Should return 401 (auth required) - body parsing should work
    expect(response.status()).toBe(401);
  });

  test('should handle empty JSON body on send-campaigns', async ({ request }) => {
    const response = await request.post('/api/cron/send-campaigns', {
      data: {},
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Should return 401 (auth required) - body parsing should work
    expect(response.status()).toBe(401);
  });

  test('should handle malformed JSON body on send-campaigns', async ({ request }) => {
    const response = await request.post('/api/cron/send-campaigns', {
      data: 'not valid json',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Should return 401 (auth required first) or 400 (bad request)
    expect([400, 401]).toContain(response.status());
  });
});
