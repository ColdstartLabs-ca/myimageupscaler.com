import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: mocks.from },
}));

import {
  CRON_JOB_KEYS,
  CRON_JOB_STALENESS_MINUTES,
  getCronJobHealth,
} from '@server/services/cronHealth.service';

function healthRows(rows: Array<Record<string, unknown>>) {
  return { select: () => Promise.resolve({ data: rows, error: null }) };
}

const NOW = new Date('2026-10-10T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

describe('cron job health expected jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue(healthRows([]));
  });

  it('does not expect the obsolete upscale input cleanup job', async () => {
    const jobs = await getCronJobHealth(NOW);

    const keys = jobs.map(job => job.jobKey);
    expect(keys).not.toContain('upscale-input-cleanup');
    expect(keys).toEqual([CRON_JOB_KEYS.databaseRetention, CRON_JOB_KEYS.galleryCleanup]);
  });

  it('ignores a stale row for a job that is no longer expected', async () => {
    mocks.from.mockReturnValue(
      healthRows([
        {
          job_key: 'upscale-input-cleanup',
          last_success_at: minutesAgo(500),
          counts: { deleted: 0, failed: 0 },
        },
      ])
    );

    const jobs = await getCronJobHealth(NOW);

    expect(jobs.map(job => job.jobKey)).not.toContain('upscale-input-cleanup');
  });
});

describe('cron job health staleness thresholds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a gallery row fresh at 25 hours and stale only past 26 hours', async () => {
    mocks.from.mockReturnValue(
      healthRows([
        {
          job_key: CRON_JOB_KEYS.galleryCleanup,
          last_success_at: minutesAgo(25 * 60),
          counts: {},
        },
      ])
    );

    const fresh = await getCronJobHealth(NOW);
    expect(fresh.find(job => job.jobKey === CRON_JOB_KEYS.galleryCleanup)?.stale).toBe(false);

    mocks.from.mockReturnValue(
      healthRows([
        {
          job_key: CRON_JOB_KEYS.galleryCleanup,
          last_success_at: minutesAgo(26 * 60 + 1),
          counts: {},
        },
      ])
    );

    const stale = await getCronJobHealth(NOW);
    expect(stale.find(job => job.jobKey === CRON_JOB_KEYS.galleryCleanup)?.stale).toBe(true);
  });

  it('keeps the database retention threshold at two hours', async () => {
    expect(CRON_JOB_STALENESS_MINUTES['database-retention']).toBe(120);

    mocks.from.mockReturnValue(
      healthRows([
        {
          job_key: CRON_JOB_KEYS.databaseRetention,
          last_success_at: minutesAgo(60),
          counts: {},
        },
      ])
    );
    const fresh = await getCronJobHealth(NOW);
    expect(fresh.find(job => job.jobKey === CRON_JOB_KEYS.databaseRetention)?.stale).toBe(false);

    mocks.from.mockReturnValue(
      healthRows([
        {
          job_key: CRON_JOB_KEYS.databaseRetention,
          last_success_at: minutesAgo(130),
          counts: {},
        },
      ])
    );
    const stale = await getCronJobHealth(NOW);
    expect(stale.find(job => job.jobKey === CRON_JOB_KEYS.databaseRetention)?.stale).toBe(true);
  });

  it('treats a missing row as stale', async () => {
    mocks.from.mockReturnValue(healthRows([]));

    const jobs = await getCronJobHealth(NOW);

    expect(jobs).toHaveLength(2);
    expect(jobs.every(job => job.stale)).toBe(true);
  });
});
