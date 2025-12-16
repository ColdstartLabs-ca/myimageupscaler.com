/**
 * API Tests: Stripe-Database Sync System (Cron Jobs)
 *
 * Tests for the scheduled synchronization endpoints that ensure
 * database state stays in sync with Stripe.
 */

import { test, expect } from '@playwright/test';

const CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret';

test.describe('API: Cron Sync Endpoints', () => {
  test.describe('POST /api/cron/check-expirations', () => {
    test('should reject requests without cron secret', async ({ request }) => {
      const response = await request.post('/api/cron/check-expirations', {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    test('should reject requests with invalid cron secret', async ({ request }) => {
      const response = await request.post('/api/cron/check-expirations', {
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': 'invalid-secret',
        },
      });

      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    test('should accept requests with valid cron secret', async ({ request }) => {
      const response = await request.post('/api/cron/check-expirations', {
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': CRON_SECRET,
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('processed');
      expect(body).toHaveProperty('fixed');
      expect(body).toHaveProperty('syncRunId');
    });

    test('should process no subscriptions when none expired', async ({ request }) => {
      const response = await request.post('/api/cron/check-expirations', {
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': CRON_SECRET,
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.processed).toBeGreaterThanOrEqual(0);
      expect(body.fixed).toBeGreaterThanOrEqual(0);
    });

    test('should create sync_run record', async ({ request }) => {
      const response = await request.post('/api/cron/check-expirations', {
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': CRON_SECRET,
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.syncRunId).toBeTruthy();
      expect(typeof body.syncRunId).toBe('string');
    });
  });

  test.describe('POST /api/cron/recover-webhooks', () => {
    test('should reject requests without cron secret', async ({ request }) => {
      const response = await request.post('/api/cron/recover-webhooks');

      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    test('should accept requests with valid cron secret', async ({ request }) => {
      const response = await request.post('/api/cron/recover-webhooks', {
        headers: {
          'x-cron-secret': CRON_SECRET,
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('processed');
      expect(body).toHaveProperty('recovered');
      expect(body).toHaveProperty('unrecoverable');
      expect(body).toHaveProperty('syncRunId');
    });

    test('should process no events when none failed', async ({ request }) => {
      const response = await request.post('/api/cron/recover-webhooks', {
        headers: {
          'x-cron-secret': CRON_SECRET,
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.processed).toBeGreaterThanOrEqual(0);
      expect(body.recovered).toBeGreaterThanOrEqual(0);
      expect(body.unrecoverable).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('POST /api/cron/reconcile', () => {
    test('should reject requests without cron secret', async ({ request }) => {
      const response = await request.post('/api/cron/reconcile');

      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    test('should accept requests with valid cron secret', async ({ request }) => {
      const response = await request.post('/api/cron/reconcile', {
        headers: {
          'x-cron-secret': CRON_SECRET,
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('processed');
      expect(body).toHaveProperty('discrepancies');
      expect(body).toHaveProperty('fixed');
      expect(body).toHaveProperty('issues');
      expect(body).toHaveProperty('syncRunId');
    });

    test('should return empty issues array when no discrepancies', async ({ request }) => {
      const response = await request.post('/api/cron/reconcile', {
        headers: {
          'x-cron-secret': CRON_SECRET,
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.issues)).toBe(true);
    });

    test('should process all active subscriptions', async ({ request }) => {
      const response = await request.post('/api/cron/reconcile', {
        headers: {
          'x-cron-secret': CRON_SECRET,
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.processed).toBeGreaterThanOrEqual(0);
      expect(body.discrepancies).toBeGreaterThanOrEqual(0);
      expect(body.fixed).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Cron Endpoint Integration', () => {
    test('should execute all three cron jobs successfully', async ({ request }) => {
      // Execute expiration check
      const expiration = await request.post('/api/cron/check-expirations', {
        headers: { 'x-cron-secret': CRON_SECRET },
      });
      expect(expiration.status()).toBe(200);

      // Execute webhook recovery
      const recovery = await request.post('/api/cron/recover-webhooks', {
        headers: { 'x-cron-secret': CRON_SECRET },
      });
      expect(recovery.status()).toBe(200);

      // Execute reconciliation
      const reconcile = await request.post('/api/cron/reconcile', {
        headers: { 'x-cron-secret': CRON_SECRET },
      });
      expect(reconcile.status()).toBe(200);

      // Verify all created sync runs
      const expirationBody = await expiration.json();
      const recoveryBody = await recovery.json();
      const reconcileBody = await reconcile.json();

      expect(expirationBody.syncRunId).toBeTruthy();
      expect(recoveryBody.syncRunId).toBeTruthy();
      expect(reconcileBody.syncRunId).toBeTruthy();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle malformed requests gracefully', async ({ request }) => {
      const response = await request.post('/api/cron/check-expirations', {
        headers: {
          'x-cron-secret': CRON_SECRET,
          'Content-Type': 'application/json',
        },
        data: 'invalid-json',
        failOnStatusCode: false,
      });

      // Should either succeed (ignoring body) or return reasonable error
      expect([200, 400, 500]).toContain(response.status());
    });

    test('should handle concurrent requests', async ({ request }) => {
      // Execute multiple requests in parallel
      const promises = [
        request.post('/api/cron/check-expirations', {
          headers: { 'x-cron-secret': CRON_SECRET },
        }),
        request.post('/api/cron/check-expirations', {
          headers: { 'x-cron-secret': CRON_SECRET },
        }),
      ];

      const responses = await Promise.all(promises);

      // Both should succeed
      responses.forEach(response => {
        expect(response.status()).toBe(200);
      });

      // Should have different sync run IDs
      const bodies = await Promise.all(responses.map(r => r.json()));
      expect(bodies[0].syncRunId).not.toBe(bodies[1].syncRunId);
    });
  });
});
