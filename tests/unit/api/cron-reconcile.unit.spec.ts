/**
 * Unit Tests: Cron Reconcile Route
 *
 * Tests for the subscription reconciliation cron job that compares
 * database and Stripe data to detect and fix discrepancies.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@app/api/cron/reconcile/route';
import { stripe } from '@server/stripe/config';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import {
  createSyncRun,
  completeSyncRun,
  syncSubscriptionFromStripe,
  markSubscriptionCanceled,
  getUserIdFromCustomerId,
  isStripeNotFoundError,
  sleep,
} from '@server/services/subscription-sync.service';
import { SubscriptionHandler } from '@app/api/webhooks/stripe/handlers/subscription.handler';

const mockDbSubscriptions = [
  {
    id: 'manual_hobby_044c81c8',
    user_id: 'user_manual',
    status: 'active',
    price_id: 'price_hobby',
    current_period_end: '2026-04-29T00:00:00.000Z',
  },
];

const mockSuspiciousProfiles = [
  {
    id: 'user_missing_activation',
    stripe_customer_id: 'cus_missing_activation',
    subscription_status: null,
    subscription_tier: null,
  },
];

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    CRON_SECRET: 'test-cron-secret',
  },
}));

vi.mock('@server/stripe/config', () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(),
      list: vi.fn(),
    },
  },
}));

vi.mock('@server/services/subscription-sync.service', () => ({
  createSyncRun: vi.fn(),
  completeSyncRun: vi.fn(),
  syncSubscriptionFromStripe: vi.fn(),
  markSubscriptionCanceled: vi.fn(),
  getUserIdFromCustomerId: vi.fn(),
  isStripeNotFoundError: vi.fn(),
  sleep: vi.fn(),
}));

vi.mock('@app/api/webhooks/stripe/handlers/subscription.handler', () => ({
  SubscriptionHandler: {
    handleSubscriptionUpdate: vi.fn(),
  },
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'subscriptions') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ data: mockDbSubscriptions, error: null })),
          })),
        };
      }

      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            not: vi.fn(() => ({
              or: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: mockSuspiciousProfiles, error: null })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

describe('POST /api/cron/reconcile', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };

    vi.mocked(createSyncRun).mockResolvedValue('sync_reconcile_123');
    vi.mocked(completeSyncRun).mockResolvedValue();
    vi.mocked(syncSubscriptionFromStripe).mockResolvedValue();
    vi.mocked(markSubscriptionCanceled).mockResolvedValue();
    vi.mocked(getUserIdFromCustomerId).mockResolvedValue('user_missing_activation');
    vi.mocked(isStripeNotFoundError).mockReturnValue(true);
    vi.mocked(sleep).mockResolvedValue();
    vi.mocked(stripe.subscriptions.retrieve).mockRejectedValue(
      Object.assign(new Error('No such subscription'), {
        type: 'StripeInvalidRequestError',
        statusCode: 404,
      })
    );
    vi.mocked(stripe.subscriptions.list).mockResolvedValue({
      data: [
        {
          id: 'sub_live_123',
          customer: 'cus_missing_activation',
          status: 'active',
        },
      ],
    } as never);
    vi.mocked(SubscriptionHandler.handleSubscriptionUpdate).mockResolvedValue();
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  describe('Authentication', () => {
    it('should reject requests without valid CRON_SECRET', async () => {
      const response = await POST(
        new NextRequest('http://localhost/api/cron/reconcile', {
          method: 'POST',
          headers: { 'x-cron-secret': 'invalid_secret' },
        })
      );
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'Unauthorized cron request - invalid CRON_SECRET'
      );
    });

    it('should return 401 when x-cron-secret header is missing', async () => {
      const response = await POST(
        new NextRequest('http://localhost/api/cron/reconcile', {
          method: 'POST',
        })
      );

      expect(response.status).toBe(401);
    });
  });

  describe('Manual placeholder and suspicious profile recovery', () => {
    it('skips manual placeholder subscriptions and replays activation for suspicious profiles', async () => {
      const response = await POST(
        new NextRequest('http://localhost/api/cron/reconcile', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        processed: 2,
        discrepancies: 2,
        fixed: 1,
        syncRunId: 'sync_reconcile_123',
      });
      expect(markSubscriptionCanceled).not.toHaveBeenCalled();
      expect(SubscriptionHandler.handleSubscriptionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'sub_live_123',
          status: 'active',
        })
      );
      expect(body.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            subId: 'manual_hobby_044c81c8',
            action: 'skipped-manual-placeholder',
          }),
          expect.objectContaining({
            subId: 'sub_live_123',
            action: 'replayed-subscription-handler',
          }),
        ])
      );
    });
  });

  describe('Status discrepancy detection', () => {
    beforeEach(() => {
      // Override mock for status discrepancy test
      vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
        id: 'sub_test_123',
        customer: 'cus_test_123',
        status: 'past_due', // Stripe says past_due
        items: { data: [{ price: { id: 'price_test' } }] },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
      } as never);

      // DB says active
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() =>
                Promise.resolve({
                  data: [
                    {
                      id: 'sub_test_123',
                      user_id: 'user_test_123',
                      status: 'active', // DB says active
                      price_id: 'price_test',
                      current_period_end: '2026-04-29T00:00:00.000Z',
                    },
                  ],
                  error: null,
                })
              ),
            })),
          };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              not: vi.fn(() => ({
                or: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      });
      vi.mocked(getUserIdFromCustomerId).mockResolvedValue('user_test_123');
    });

    it('should detect and fix status mismatch between DB and Stripe', async () => {
      const response = await POST(
        new NextRequest('http://localhost/api/cron/reconcile', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );
      const body = await response.json();

      expect(syncSubscriptionFromStripe).toHaveBeenCalledWith(
        'user_test_123',
        expect.objectContaining({
          id: 'sub_test_123',
          status: 'past_due',
        })
      );
      expect(body.discrepancies).toBeGreaterThan(0);
      expect(body.fixed).toBeGreaterThan(0);
    });
  });

  describe('Period end drift detection', () => {
    beforeEach(() => {
      const baseDate = Date.now();
      const dbDate = new Date(baseDate + 2592000000); // ~30 days from now
      const stripeDate = new Date(dbDate.getTime() + 7200000); // 2 hours later (> 1 hour threshold)

      vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
        id: 'sub_test_123',
        customer: 'cus_test_123',
        status: 'active',
        items: { data: [{ price: { id: 'price_test' } }] },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(stripeDate.getTime() / 1000),
      } as never);

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() =>
                Promise.resolve({
                  data: [
                    {
                      id: 'sub_test_123',
                      user_id: 'user_test_123',
                      status: 'active',
                      price_id: 'price_test',
                      current_period_end: dbDate.toISOString(),
                    },
                  ],
                  error: null,
                })
              ),
            })),
          };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              not: vi.fn(() => ({
                or: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      });
      vi.mocked(getUserIdFromCustomerId).mockResolvedValue('user_test_123');
    });

    it('should detect period end drift greater than 1 hour', async () => {
      const response = await POST(
        new NextRequest('http://localhost/api/cron/reconcile', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );
      const body = await response.json();

      expect(syncSubscriptionFromStripe).toHaveBeenCalled();
      expect(body.discrepancies).toBeGreaterThan(0);
    });
  });

  describe('Sync run tracking', () => {
    it('should create sync run record at start', async () => {
      // Use default mocks
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => Promise.resolve({ data: mockDbSubscriptions, error: null })),
            })),
          };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              not: vi.fn(() => ({
                or: vi.fn(() => ({
                  limit: vi.fn(() =>
                    Promise.resolve({ data: mockSuspiciousProfiles, error: null })
                  ),
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      });

      await POST(
        new NextRequest('http://localhost/api/cron/reconcile', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );

      expect(createSyncRun).toHaveBeenCalledWith('full_reconciliation');
    });

    it('should complete sync run with results on success', async () => {
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => Promise.resolve({ data: mockDbSubscriptions, error: null })),
            })),
          };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              not: vi.fn(() => ({
                or: vi.fn(() => ({
                  limit: vi.fn(() =>
                    Promise.resolve({ data: mockSuspiciousProfiles, error: null })
                  ),
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      });

      await POST(
        new NextRequest('http://localhost/api/cron/reconcile', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );

      expect(completeSyncRun).toHaveBeenCalledWith('sync_reconcile_123', {
        status: 'completed',
        recordsProcessed: 2,
        recordsFixed: 1,
        discrepanciesFound: 2,
        metadata: { issues: expect.any(Array) },
      });
    });

    it('should mark sync run as failed on error', async () => {
      vi.mocked(supabaseAdmin.from).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const response = await POST(
        new NextRequest('http://localhost/api/cron/reconcile', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );

      expect(response.status).toBe(500);
      expect(completeSyncRun).toHaveBeenCalledWith('sync_reconcile_123', {
        status: 'failed',
        recordsProcessed: 0,
        recordsFixed: 0,
        discrepanciesFound: 0,
        errorMessage: 'Database connection failed',
        metadata: { issues: [] },
      });
    });
  });

  describe('Rate limiting', () => {
    it('should sleep between Stripe API calls', async () => {
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => Promise.resolve({ data: mockDbSubscriptions, error: null })),
            })),
          };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              not: vi.fn(() => ({
                or: vi.fn(() => ({
                  limit: vi.fn(() =>
                    Promise.resolve({ data: mockSuspiciousProfiles, error: null })
                  ),
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      });

      await POST(
        new NextRequest('http://localhost/api/cron/reconcile', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );

      // Sleep should be called for each subscription processed plus each suspicious profile
      expect(sleep).toHaveBeenCalledWith(100); // RATE_LIMIT_DELAY_MS
    });
  });
});
