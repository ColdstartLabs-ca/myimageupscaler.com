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
      queueDailyEligibility: vi.fn().mockResolvedValue(2),
      processDueQueue: vi.fn().mockResolvedValue({
        queued: 3,
        sent: 0,
        skipped: 1,
        failed: 0,
        eligible: 4,
        dryRun: true,
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
    expect(body).toMatchObject({
      success: true,
      dryRun: true,
      queued: 5,
      sent: 0,
      skipped: 1,
    });
  });
});
