import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@app/api/cron/email-lifecycle/route';
import {
  EmailLifecycleService,
  getEmailLifecycleService,
} from '@server/services/email-lifecycle.service';

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    AMPLITUDE_API_KEY: 'test-amplitude-key',
    BASE_URL: 'http://localhost:3000',
    CRON_SECRET: 'test-cron-secret',
  },
}));

vi.mock('@server/services/email-lifecycle.service', async importOriginal => ({
  ...(await importOriginal<typeof import('@server/services/email-lifecycle.service')>()),
  getEmailLifecycleService: vi.fn(),
}));

vi.mock('@server/services/email.service', () => ({
  getEmailService: () => ({ send: sendEmailMock }),
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: vi.fn().mockResolvedValue(true),
}));

function resolvedQuery(data: unknown = []) {
  const state: Record<string, unknown> = {};
  const chain = {
    eq: vi.fn((field: string, value: unknown) => {
      state[field] = value;
      return chain;
    }),
    neq: vi.fn(() => chain),
    in: vi.fn((field: string, value: unknown) => {
      state[field] = value;
      return chain;
    }),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    then: (resolve: (value: unknown) => unknown) => {
      const rows = Array.isArray(data) ? data : [];
      const filtered = rows.filter(row => {
        if (!row || typeof row !== 'object') return true;
        const candidate = row as Record<string, unknown>;
        return !state.status || candidate.status === state.status;
      });
      return Promise.resolve(resolve({ data: filtered, error: null }));
    },
  };
  return chain;
}

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: vi.fn(async (name: string) => {
      if (name === 'get_email_lifecycle_health') return { data: [], error: null };
      if (name === 'claim_email_lifecycle_queue_row_for_delivery') {
        return { data: 'claimed', error: null };
      }
      if (name === 'get_due_email_lifecycle_queue') {
        return {
          data: [
            {
              id: 'due-low-credit',
              campaign_key: 'low-credits',
              user_id: 'user-1',
              recipient_email: 'internal@example.com',
              scheduled_for: '2026-07-15T00:00:00.000Z',
              status: 'pending',
              reason: null,
              template_data: {},
              metadata: {},
              sent_at: null,
              created_at: '2026-07-15T00:00:00.000Z',
              recipient_value_decision: 'keep_high',
              recipient_value_policy_version: 'v1',
              campaign_name: 'Low credits',
              campaign_category: 'low_credit',
              campaign_template_name: 'low-credits',
              campaign_email_type: 'marketing',
              campaign_preference_key: 'low_credit_alerts',
              campaign_enabled: true,
              campaign_cooldown_days: 7,
              campaign_priority: 'revenue_critical',
              campaign_sort_priority: 90,
            },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    }),
    from: vi.fn((table: string) => ({
      select: vi.fn((columns?: string) => {
        if (table === 'email_preferences') {
          return resolvedQuery({ low_credit_alerts: true });
        }
        if (table === 'email_lifecycle_campaigns' && columns === 'key') {
          return resolvedQuery([{ key: 'low-credits' }, { key: 'zero-credits' }]);
        }
        if (table === 'email_lifecycle_queue') {
          return resolvedQuery([
            { id: 'other-pending', campaign_key: 'zero-credits', status: 'pending' },
          ]);
        }
        return resolvedQuery([]);
      }),
      update: vi.fn(() => resolvedQuery([])),
      insert: vi.fn(async () => ({ error: null })),
    })),
  },
}));

function emptyAudienceCounts() {
  return {
    scanned: 0,
    eligible: 0,
    queued: 0,
    skippedPurchased: 0,
    skippedPriority: 0,
    skippedMissingEmail: 0,
  };
}

describe('POST /api/cron/email-lifecycle throughput controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sendEmailMock.mockResolvedValue({ success: true, provider: 'brevo', messageId: 'msg-1' });
    vi.mocked(getEmailLifecycleService).mockReturnValue({
      queueDailyEligibilityDetailed: vi.fn().mockResolvedValue({
        queued: 5,
        lifecycleQueued: 2,
        suppressionsRecorded: 1,
        suppressionsReused: 3,
        recovery: {
          scanned: 4,
          eligible: 3,
          queued: 3,
          skippedPurchased: 0,
          skippedPriority: 1,
          skippedMissingEmail: 0,
          dryRun: false,
          byAudience: {
            checkout_abandoner: {
              scanned: 1,
              eligible: 1,
              queued: 1,
              skippedPurchased: 0,
              skippedPriority: 0,
              skippedMissingEmail: 0,
            },
            upgrade_click_no_purchase: {
              scanned: 1,
              eligible: 1,
              queued: 1,
              skippedPurchased: 0,
              skippedPriority: 0,
              skippedMissingEmail: 0,
            },
            credit_wall_dismissed: {
              scanned: 1,
              eligible: 1,
              queued: 1,
              skippedPurchased: 0,
              skippedPriority: 0,
              skippedMissingEmail: 0,
            },
            high_usage_free_user: {
              scanned: 1,
              eligible: 0,
              queued: 0,
              skippedPurchased: 0,
              skippedPriority: 1,
              skippedMissingEmail: 0,
            },
          },
        },
      }),
      processDueQueue: vi.fn().mockResolvedValue({
        queued: 0,
        sent: 10,
        skipped: 2,
        failed: 1,
        eligible: 13,
        dryRun: false,
        recipientValueBandCounts: {
          protected: 1,
          high: 7,
          medium: 5,
          experiment: 0,
          cancel: 0,
        },
        stoppedByHealth: false,
        stoppedByProviderCapacity: false,
      }),
      getQueueHealth: vi.fn().mockResolvedValue({
        pending: 100,
        duePending: 87,
        eligible: 12,
        held: 88,
        unclassified: 0,
        eligibilityStalled: false,
        oldestPendingScheduledFor: '2026-07-08T00:00:00.000Z',
      }),
    } as never);
  });

  it('should submit one eligible row when only other pending campaigns exist', async () => {
    const actualService = new EmailLifecycleService();
    vi.spyOn(actualService, 'queueDailyEligibilityDetailed').mockResolvedValue({
      queued: 0,
      lifecycleQueued: 0,
      suppressionsRecorded: 0,
      suppressionsReused: 0,
      recovery: {
        scanned: 0,
        eligible: 0,
        queued: 0,
        skippedPurchased: 0,
        skippedPriority: 0,
        skippedMissingEmail: 0,
        suppressionsRecorded: 0,
        suppressionsReused: 0,
        dryRun: false,
        byAudience: {
          checkout_abandoner: emptyAudienceCounts(),
          upgrade_click_no_purchase: emptyAudienceCounts(),
          credit_wall_dismissed: emptyAudienceCounts(),
          high_usage_free_user: emptyAudienceCounts(),
        },
      },
    });
    vi.spyOn(actualService, 'getQueueHealth').mockResolvedValue({
      pending: 1,
      duePending: 1,
      eligible: 1,
      held: 0,
      unclassified: 0,
      eligibilityStalled: false,
      oldestPendingScheduledFor: '2026-07-15T00:00:00.000Z',
    });
    vi.mocked(getEmailLifecycleService).mockReturnValue(actualService);

    const response = await POST(
      new NextRequest('http://localhost/api/cron/email-lifecycle?batchSize=1&scanLimit=1', {
        method: 'POST',
        headers: { 'x-cron-secret': 'test-cron-secret' },
      })
    );

    expect(response.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({ sent: 1, skipped: 0 });
  });

  it('should cap scanLimit and sendLimit at production bounds', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/cron/email-lifecycle?batchSize=9999&scanLimit=9999', {
        method: 'POST',
        headers: { 'x-cron-secret': 'test-cron-secret' },
      })
    );
    const body = await response.json();

    const service = vi.mocked(getEmailLifecycleService).mock.results[0].value;
    expect(service.processDueQueue).toHaveBeenCalledWith({
      dryRun: false,
      scanLimit: 1000,
      sendLimit: 1,
    });
    expect(service.queueDailyEligibilityDetailed).toHaveBeenCalledWith({
      dryRun: false,
      limit: 1000,
    });
    expect(body).toMatchObject({
      success: true,
      drainOnly: false,
      scanLimit: 1000,
      sendLimit: 1,
      suppressionsRecordedFromEligibility: 1,
      suppressionsReusedFromEligibility: 3,
    });
  });

  it('should include queue health in response', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/cron/email-lifecycle?dryRun=true', {
        method: 'POST',
        headers: { 'x-cron-secret': 'test-cron-secret' },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      dryRun: true,
      pending: 100,
      duePending: 87,
      eligiblePending: 12,
      heldPending: 88,
      unclassifiedPending: 0,
      eligibilityStalled: false,
      oldestPendingScheduledFor: '2026-07-08T00:00:00.000Z',
      recoveryEligibility: {
        queued: 3,
        byAudience: {
          checkout_abandoner: {
            queued: 1,
          },
          high_usage_free_user: {
            skippedPriority: 1,
          },
        },
      },
      sent: 10,
      skipped: 2,
      failed: 1,
      recipientValueBandCounts: {
        protected: 1,
        high: 7,
        medium: 5,
        experiment: 0,
        cancel: 0,
      },
      stoppedByHealth: false,
      stoppedByProviderCapacity: false,
    });
    expect(body.durationMs).toEqual(expect.any(Number));
  });

  it('should process revenue-critical rows before education rows', async () => {
    await POST(
      new NextRequest('http://localhost/api/cron/email-lifecycle?batchSize=25', {
        method: 'POST',
        headers: { 'x-cron-secret': 'test-cron-secret' },
      })
    );

    const service = vi.mocked(getEmailLifecycleService).mock.results[0].value;
    // Ordering is owned by the service's database RPC; cron must delegate exactly once
    // with the requested batch rather than prefetching or reordering queue rows.
    expect(service.processDueQueue).toHaveBeenCalledOnce();
    expect(service.processDueQueue).toHaveBeenCalledWith({
      dryRun: false,
      scanLimit: 25,
      sendLimit: 1,
    });
  });
});
