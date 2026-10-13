import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

// Jobs whose freshness the health path checks. The key is the durable
// cron_job_health.job_key value (PRD-SQR-03 AC-1). The obsolete upscale input
// cleanup route is gone in this lane, so it is not an expected job.
export const CRON_JOB_KEYS = {
  databaseRetention: 'database-retention',
  galleryCleanup: 'gallery-cleanup',
} as const;

export type CronJobKey = (typeof CRON_JOB_KEYS)[keyof typeof CRON_JOB_KEYS];

// Freshness budget per job, in minutes, matched to the cron schedule. Hourly
// jobs go stale after two hours; the daily gallery cleanup gets 26 hours
// (24 hours plus a two-hour slack window).
export const CRON_JOB_STALENESS_MINUTES: Record<CronJobKey, number> = {
  'database-retention': 120,
  'gallery-cleanup': 26 * 60,
};

export interface ICronJobHealth {
  jobKey: string;
  lastSuccessAt: string | null;
  counts: Record<string, unknown>;
  stale: boolean;
}

/**
 * Record a durable measured-success marker for a scheduled job. Throws on any
 * write failure so a missing or broken record is visible instead of silent.
 */
export async function recordCronJobSuccess(
  jobKey: CronJobKey,
  counts: Record<string, number>
): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('record_cron_job_success', {
    p_job_key: jobKey,
    p_counts: counts,
  });

  if (error || typeof data !== 'string') {
    throw new Error(
      `Failed to record cron job success for ${jobKey}: ${error?.message ?? 'no timestamp returned'}`
    );
  }
  return data;
}

/**
 * Read freshness for each expected job. A missing row counts as stale, so a job
 * that never succeeded fails the check instead of disappearing from it.
 */
export async function getCronJobHealth(
  now: Date = new Date(),
  expectedKeys: readonly CronJobKey[] = Object.values(CRON_JOB_KEYS),
  maxAgeMinutesByJob: Partial<Record<CronJobKey, number>> = CRON_JOB_STALENESS_MINUTES
): Promise<ICronJobHealth[]> {
  const { data, error } = await supabaseAdmin
    .from('cron_job_health')
    .select('job_key,last_success_at,counts');

  if (error) {
    throw new Error(`Failed to read cron job health: ${error.message}`);
  }

  const rows = new Map<string, { lastSuccessAt: string; counts: Record<string, unknown> }>();
  for (const row of data ?? []) {
    rows.set(row.job_key as string, {
      lastSuccessAt: row.last_success_at as string,
      counts: (row.counts ?? {}) as Record<string, unknown>,
    });
  }

  return expectedKeys.map(jobKey => {
    const row = rows.get(jobKey);
    const lastSuccessAt = row?.lastSuccessAt ?? null;
    const maxAgeMinutes = maxAgeMinutesByJob[jobKey] ?? CRON_JOB_STALENESS_MINUTES[jobKey];
    const cutoff = now.getTime() - maxAgeMinutes * 60_000;
    const stale = lastSuccessAt === null || new Date(lastSuccessAt).getTime() < cutoff;
    return { jobKey, lastSuccessAt, counts: row?.counts ?? {}, stale };
  });
}
