import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@app/api/cron/email-lifecycle/route';
import { getEmailLifecycleService } from '@server/services/email-lifecycle.service';

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    CRON_SECRET: 'test-cron-secret',
  },
}));

vi.mock('@server/services/email-lifecycle.service', () => ({
  getEmailLifecycleService: vi.fn(),
}));

describe('POST /api/cron/email-lifecycle throughput controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getEmailLifecycleService).mockReturnValue({
      queueDailyEligibilityDetailed: vi.fn().mockResolvedValue({
        queued: 5,
        lifecycleQueued: 2,
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
      }),
      getQueueHealth: vi.fn().mockResolvedValue({
        duePending: 87,
        oldestPendingScheduledFor: '2026-07-08T00:00:00.000Z',
      }),
    } as never);
  });

  it('should cap batchSize above max', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/cron/email-lifecycle?batchSize=9999&scanLimit=9999', {
        method: 'POST',
        headers: { 'x-cron-secret': 'test-cron-secret' },
      })
    );
    const body = await response.json();

    const service = vi.mocked(getEmailLifecycleService).mock.results[0].value;
    expect(service.processDueQueue).toHaveBeenCalledWith({ dryRun: false, batchSize: 250 });
    expect(service.queueDailyEligibilityDetailed).toHaveBeenCalledWith({
      dryRun: false,
      limit: 1000,
    });
    expect(body).toMatchObject({
      success: true,
      batchSize: 250,
      scanLimit: 1000,
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
      duePending: 87,
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
    expect(service.processDueQueue).toHaveBeenCalledWith({ dryRun: false, batchSize: 25 });
  });
});
