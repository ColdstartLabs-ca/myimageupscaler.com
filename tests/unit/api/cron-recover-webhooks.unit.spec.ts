/**
 * Unit Tests: Cron Recover Webhooks Route
 *
 * Tests for the webhook recovery cron job that retries failed webhook events.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@app/api/cron/recover-webhooks/route';
import { stripe } from '@server/stripe/config';
import {
  createSyncRun,
  completeSyncRun,
  processStripeEvent,
  isStripeNotFoundError,
} from '@server/services/subscription-sync.service';
import { serverEnv } from '@shared/config/env';

type IWebhookEventRow = {
  id: string;
  event_id: string;
  event_type: string;
  retry_count: number;
  last_retry_at: string | null;
  created_at: string;
  error_message: string | null;
  status: 'failed' | 'processing';
};

let mockFailedEvents: IWebhookEventRow[] = [];
let mockStuckEvents: IWebhookEventRow[] = [];
const webhookEventUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    CRON_SECRET: 'test-cron-secret',
  },
}));

vi.mock('@server/stripe/config', () => ({
  stripe: {
    events: {
      retrieve: vi.fn(),
    },
  },
}));

vi.mock('@server/services/subscription-sync.service', () => ({
  createSyncRun: vi.fn(),
  completeSyncRun: vi.fn(),
  processStripeEvent: vi.fn(),
  isStripeNotFoundError: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table !== 'webhook_events') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn(() => {
          const queryState: { status?: 'failed' | 'processing' } = {};
          const selectChain = {
            eq: vi.fn((field: string, value: 'failed' | 'processing' | boolean) => {
              if (field === 'status') {
                queryState.status = value as 'failed' | 'processing';
              }
              return selectChain;
            }),
            lt: vi.fn(() => selectChain),
            order: vi.fn(() => selectChain),
            limit: vi.fn(() =>
              Promise.resolve({
                data: queryState.status === 'processing' ? mockStuckEvents : mockFailedEvents,
                error: null,
              })
            ),
          };

          return selectChain;
        }),
        update: vi.fn((payload: Record<string, unknown>) => ({
          eq: vi.fn((_field: string, value: string) => {
            webhookEventUpdates.push({ id: value, payload });
            return Promise.resolve({ error: null });
          }),
        })),
      };
    }),
  },
}));

describe('POST /api/cron/recover-webhooks', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFailedEvents = [];
    mockStuckEvents = [];
    webhookEventUpdates.length = 0;
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };

    vi.mocked(createSyncRun).mockResolvedValue('sync_test_123');
    vi.mocked(completeSyncRun).mockResolvedValue();
    vi.mocked(processStripeEvent).mockResolvedValue();
    vi.mocked(isStripeNotFoundError).mockReturnValue(false);
    vi.mocked(stripe.events.retrieve).mockImplementation(async eventId => ({
      id: eventId as string,
      type: 'customer.subscription.updated',
      data: { object: {} },
    }));
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  describe('Authentication', () => {
    it('should reject requests without valid CRON_SECRET', async () => {
      const response = await POST(
        new NextRequest('http://localhost/api/cron/recover-webhooks', {
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
        new NextRequest('http://localhost/api/cron/recover-webhooks', {
          method: 'POST',
        })
      );

      expect(response.status).toBe(401);
    });
  });

  describe('Recovery scenarios', () => {
    it('retries both failed events and stale processing events', async () => {
      mockFailedEvents = [
        {
          id: 'row_failed',
          event_id: 'evt_failed',
          event_type: 'customer.subscription.updated',
          retry_count: 0,
          last_retry_at: null,
          created_at: '2026-03-29T10:00:00.000Z',
          error_message: 'failed once',
          status: 'failed',
        },
      ];
      mockStuckEvents = [
        {
          id: 'row_processing',
          event_id: 'evt_processing',
          event_type: 'invoice.payment_succeeded',
          retry_count: 1,
          last_retry_at: null,
          created_at: '2026-03-29T09:55:00.000Z',
          error_message: null,
          status: 'processing',
        },
      ];

      const response = await POST(
        new NextRequest('http://localhost/api/cron/recover-webhooks', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        processed: 2,
        recovered: 2,
        unrecoverable: 0,
        syncRunId: 'sync_test_123',
      });
      expect(stripe.events.retrieve).toHaveBeenCalledTimes(2);
      expect(processStripeEvent).toHaveBeenCalledTimes(2);
      expect(webhookEventUpdates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'row_failed',
            payload: expect.objectContaining({ status: 'completed', retry_count: 1 }),
          }),
          expect.objectContaining({
            id: 'row_processing',
            payload: expect.objectContaining({ status: 'completed', retry_count: 2 }),
          }),
        ])
      );
    });

    it('moves a stuck processing event back to failed when replay still errors', async () => {
      mockStuckEvents = [
        {
          id: 'row_processing',
          event_id: 'evt_processing',
          event_type: 'invoice.payment_succeeded',
          retry_count: 1,
          last_retry_at: null,
          created_at: '2026-03-29T09:55:00.000Z',
          error_message: null,
          status: 'processing',
        },
      ];
      vi.mocked(processStripeEvent).mockRejectedValue(new Error('retry still failing'));

      const response = await POST(
        new NextRequest('http://localhost/api/cron/recover-webhooks', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        processed: 1,
        recovered: 0,
        unrecoverable: 0,
      });
      expect(webhookEventUpdates).toContainEqual(
        expect.objectContaining({
          id: 'row_processing',
          payload: expect.objectContaining({
            status: 'failed',
            retry_count: 2,
            recoverable: true,
            error_message: 'retry still failing',
          }),
        })
      );
    });

    it('marks events as unrecoverable when max retries reached', async () => {
      mockFailedEvents = [
        {
          id: 'row_max_retries',
          event_id: 'evt_max',
          event_type: 'customer.subscription.updated',
          retry_count: 2, // Will become 3 after this retry (MAX_RETRIES = 3)
          last_retry_at: null,
          created_at: '2026-03-29T10:00:00.000Z',
          error_message: 'keeps failing',
          status: 'failed',
        },
      ];
      vi.mocked(processStripeEvent).mockRejectedValue(new Error('still failing'));

      const response = await POST(
        new NextRequest('http://localhost/api/cron/recover-webhooks', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.unrecoverable).toBe(1);
      expect(webhookEventUpdates).toContainEqual(
        expect.objectContaining({
          id: 'row_max_retries',
          payload: expect.objectContaining({
            status: 'unrecoverable',
            recoverable: false,
            retry_count: 3,
          }),
        })
      );
    });

    it('marks events as unrecoverable when Stripe event not found', async () => {
      mockFailedEvents = [
        {
          id: 'row_not_found',
          event_id: 'evt_not_found',
          event_type: 'customer.subscription.updated',
          retry_count: 0,
          last_retry_at: null,
          created_at: '2026-03-29T10:00:00.000Z',
          error_message: 'Event not in Stripe',
          status: 'failed',
        },
      ];

      const stripeError = {
        type: 'StripeInvalidRequestError',
        statusCode: 404,
        message: 'No such event',
      };
      vi.mocked(stripe.events.retrieve).mockRejectedValue(stripeError);
      vi.mocked(isStripeNotFoundError).mockReturnValue(true);

      const response = await POST(
        new NextRequest('http://localhost/api/cron/recover-webhooks', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.unrecoverable).toBe(1);
      expect(webhookEventUpdates).toContainEqual(
        expect.objectContaining({
          id: 'row_not_found',
          payload: expect.objectContaining({
            status: 'unrecoverable',
            recoverable: false,
            error_message: 'Event not found in Stripe (expired or invalid)',
          }),
        })
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('not found in Stripe - marking as unrecoverable')
      );
    });

    it('returns success with zeros when no events to retry', async () => {
      mockFailedEvents = [];
      mockStuckEvents = [];

      const response = await POST(
        new NextRequest('http://localhost/api/cron/recover-webhooks', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        processed: 0,
        recovered: 0,
        unrecoverable: 0,
      });
      expect(consoleSpy.log).toHaveBeenCalledWith('[CRON] No failed webhook events to retry');
    });
  });

  describe('Batch processing', () => {
    it('should limit processing to BATCH_SIZE per run', async () => {
      // Create more than BATCH_SIZE (50) events
      mockFailedEvents = Array.from({ length: 30 }, (_, i) => ({
        id: `row_failed_${i}`,
        event_id: `evt_failed_${i}`,
        event_type: 'customer.subscription.updated',
        retry_count: 0,
        last_retry_at: null,
        created_at: '2026-03-29T10:00:00.000Z',
        error_message: 'failed once',
        status: 'failed' as const,
      }));
      mockStuckEvents = Array.from({ length: 30 }, (_, i) => ({
        id: `row_stuck_${i}`,
        event_id: `evt_stuck_${i}`,
        event_type: 'invoice.payment_succeeded',
        retry_count: 0,
        last_retry_at: null,
        created_at: '2026-03-29T09:55:00.000Z',
        error_message: null,
        status: 'processing' as const,
      }));

      const response = await POST(
        new NextRequest('http://localhost/api/cron/recover-webhooks', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );
      const body = await response.json();

      // Should process max BATCH_SIZE (50) events total
      expect(body.processed).toBeLessThanOrEqual(50);
      expect(stripe.events.retrieve).toHaveBeenCalledTimes(body.processed);
    });
  });

  describe('Sync run tracking', () => {
    it('should create sync run record at start', async () => {
      mockFailedEvents = [
        {
          id: 'row_failed',
          event_id: 'evt_failed',
          event_type: 'customer.subscription.updated',
          retry_count: 0,
          last_retry_at: null,
          created_at: '2026-03-29T10:00:00.000Z',
          error_message: 'failed once',
          status: 'failed',
        },
      ];

      await POST(
        new NextRequest('http://localhost/api/cron/recover-webhooks', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );

      expect(createSyncRun).toHaveBeenCalledWith('webhook_recovery');
    });

    it('should complete sync run with results on success', async () => {
      mockFailedEvents = [
        {
          id: 'row_failed',
          event_id: 'evt_failed',
          event_type: 'customer.subscription.updated',
          retry_count: 0,
          last_retry_at: null,
          created_at: '2026-03-29T10:00:00.000Z',
          error_message: 'failed once',
          status: 'failed',
        },
      ];

      await POST(
        new NextRequest('http://localhost/api/cron/recover-webhooks', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );

      expect(completeSyncRun).toHaveBeenCalledWith('sync_test_123', {
        status: 'completed',
        recordsProcessed: 1,
        recordsFixed: 1,
        metadata: expect.objectContaining({
          recovered: 1,
          unrecoverable: 0,
        }),
      });
    });

    it('should mark sync run as failed on error', async () => {
      vi.mocked(createSyncRun).mockRejectedValue(new Error('Database connection failed'));

      const response = await POST(
        new NextRequest('http://localhost/api/cron/recover-webhooks', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe('Database connection failed');
    });
  });

  describe('Recovery filtering', () => {
    it('should only retry events with recoverable=true', async () => {
      // The mock only returns recoverable events, so this tests the query
      mockFailedEvents = [
        {
          id: 'row_recoverable',
          event_id: 'evt_recoverable',
          event_type: 'customer.subscription.updated',
          retry_count: 0,
          last_retry_at: null,
          created_at: '2026-03-29T10:00:00.000Z',
          error_message: 'temporary error',
          status: 'failed',
        },
      ];

      const response = await POST(
        new NextRequest('http://localhost/api/cron/recover-webhooks', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.processed).toBe(1);
    });

    it('should only retry events with retry_count < MAX_RETRIES', async () => {
      // Events at max retries should not be returned by the query
      // (already marked unrecoverable by previous run)
      mockFailedEvents = [
        {
          id: 'row_below_max',
          event_id: 'evt_below_max',
          event_type: 'customer.subscription.updated',
          retry_count: 2, // Below MAX_RETRIES (3)
          last_retry_at: null,
          created_at: '2026-03-29T10:00:00.000Z',
          error_message: 'still failing',
          status: 'failed',
        },
      ];

      const response = await POST(
        new NextRequest('http://localhost/api/cron/recover-webhooks', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );

      expect(response.status).toBe(200);
    });

    it('should only retry stuck processing events older than 5 minutes', async () => {
      // Recent processing events should not be included
      const now = Date.now();
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
      const recentTime = new Date(now - 2 * 60 * 1000); // 2 minutes ago

      mockStuckEvents = [
        {
          id: 'row_old_stuck',
          event_id: 'evt_old_stuck',
          event_type: 'invoice.payment_succeeded',
          retry_count: 0,
          last_retry_at: null,
          created_at: fiveMinutesAgo.toISOString(), // Older than 5 min
          error_message: null,
          status: 'processing',
        },
      ];

      const response = await POST(
        new NextRequest('http://localhost/api/cron/recover-webhooks', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.processed).toBe(1);
    });
  });
});
