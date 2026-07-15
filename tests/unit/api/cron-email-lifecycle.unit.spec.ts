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

describe('POST /api/cron/email-lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEmailLifecycleService).mockReturnValue({
      queueDailyEligibilityDetailed: vi.fn().mockResolvedValue({
        queued: 2,
        lifecycleQueued: 1,
        recovery: {
          scanned: 2,
          eligible: 1,
          queued: 1,
          skippedPurchased: 0,
          skippedPriority: 1,
          skippedMissingEmail: 0,
          dryRun: true,
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
              scanned: 0,
              eligible: 0,
              queued: 0,
              skippedPurchased: 0,
              skippedPriority: 0,
              skippedMissingEmail: 0,
            },
            credit_wall_dismissed: {
              scanned: 1,
              eligible: 0,
              queued: 0,
              skippedPurchased: 0,
              skippedPriority: 1,
              skippedMissingEmail: 0,
            },
            high_usage_free_user: {
              scanned: 0,
              eligible: 0,
              queued: 0,
              skippedPurchased: 0,
              skippedPriority: 0,
              skippedMissingEmail: 0,
            },
          },
        },
      }),
      processDueQueue: vi.fn().mockResolvedValue({
        queued: 3,
        sent: 0,
        skipped: 1,
        failed: 0,
        eligible: 4,
        dryRun: true,
        recipientValueBandCounts: {
          protected: 0,
          high: 2,
          medium: 2,
          experiment: 0,
          cancel: 0,
        },
        stoppedByHealth: false,
        stoppedByProviderCapacity: false,
      }),
      getQueueHealth: vi.fn().mockResolvedValue({
        duePending: 12,
        oldestPendingScheduledFor: '2026-07-08T00:00:00.000Z',
      }),
    } as never);
  });

  it('rejects invalid cron secret', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/cron/email-lifecycle', {
        method: 'POST',
        headers: { 'x-cron-secret': 'wrong' },
      })
    );

    expect(response.status).toBe(401);
  });

  it('dry run does not send email', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/cron/email-lifecycle?dryRun=true', {
        method: 'POST',
        headers: { 'x-cron-secret': 'test-cron-secret' },
      })
    );
    const body = await response.json();

    const service = vi.mocked(getEmailLifecycleService).mock.results[0].value;
    expect(service.processDueQueue).toHaveBeenCalledWith({ dryRun: true, batchSize: 50 });
    expect(service.queueDailyEligibilityDetailed).toHaveBeenCalledWith({
      dryRun: true,
      limit: 100,
    });
    expect(service.getQueueHealth).toHaveBeenCalled();
    expect(body).toMatchObject({
      success: true,
      dryRun: true,
      queued: 5,
      sent: 0,
      skipped: 1,
      recipientValueBandCounts: {
        protected: 0,
        high: 2,
        medium: 2,
        experiment: 0,
        cancel: 0,
      },
      stoppedByHealth: false,
      stoppedByProviderCapacity: false,
      duePending: 12,
      oldestPendingScheduledFor: '2026-07-08T00:00:00.000Z',
      recoveryEligibility: {
        dryRun: true,
        byAudience: {
          checkout_abandoner: {
            eligible: 1,
            queued: 1,
          },
          credit_wall_dismissed: {
            skippedPriority: 1,
          },
        },
      },
    });
  });
});
