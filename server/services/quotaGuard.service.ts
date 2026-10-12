import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { getEmailService } from '@server/services/email.service';
import { getCronJobHealth } from '@server/services/cronHealth.service';
import { measureR2AccountPayloadBytes } from '@server/services/r2-quota-metrics.service';
import { serverEnv } from '@shared/config/env';

dayjs.extend(utc);

const DECIMAL_MB = 1_000_000;
const DECIMAL_GB = 1_000_000_000;

// Free-plan budgets from docs/PRDs/supabase-quota-recovery/README.md. Decimal
// units, matching the audit evidence.
export const MIU_QUOTA_BUDGETS = {
  databaseBytes: 450 * DECIMAL_MB,
  storageBytes: 50 * DECIMAL_MB,
  r2Bytes: 10 * DECIMAL_GB,
} as const;

export const QUOTA_ALERT_THRESHOLD = 0.8;
export const QUOTA_GROWTH_WINDOW_DAYS = 30;

export type QuotaResource = 'database' | 'storage' | 'r2';

export interface IQuotaSample {
  day: string;
  databaseBytes: number;
  storageBytes: number;
  r2Bytes: number | null;
}

export interface IQuotaResourceStatus {
  resource: QuotaResource;
  currentBytes: number | null;
  budgetBytes: number;
  utilization: number | null;
  growthBytesPerDay: number | null;
  daysLeft: number | null;
  measured: boolean;
  alert: boolean;
}

export interface IQuotaGuardResult {
  day: string;
  alertCount: number;
  alerted: boolean;
  r2Measured: boolean;
  staleCronJobs: string[];
  resources: IQuotaResourceStatus[];
}

function isByteCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

export function computeUtilization(currentBytes: number, budgetBytes: number): number {
  if (!Number.isFinite(currentBytes) || currentBytes < 0) {
    throw new Error('currentBytes must be a nonnegative finite number');
  }
  if (!Number.isFinite(budgetBytes) || budgetBytes <= 0) {
    throw new Error('budgetBytes must be a positive finite number');
  }
  return currentBytes / budgetBytes;
}

/** Linear byte growth per day across the oldest and newest samples. */
export function computeGrowthBytesPerDay(
  points: ReadonlyArray<{ day: string; bytes: number }>
): number | null {
  const valid = points.filter(point => Number.isFinite(point.bytes));
  if (valid.length < 2) return null;
  const sorted = [...valid].sort((left, right) => left.day.localeCompare(right.day));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  // Plain UTC midnights keep this pure and independent of the date library.
  const spanDays = Math.round(
    (Date.parse(`${last.day}T00:00:00.000Z`) - Date.parse(`${first.day}T00:00:00.000Z`)) / 86_400_000
  );
  if (!Number.isFinite(spanDays) || spanDays <= 0) return null;
  return (last.bytes - first.bytes) / spanDays;
}

/** Days until the budget is reached at the current growth rate. */
export function computeDaysLeft(
  currentBytes: number,
  budgetBytes: number,
  growthBytesPerDay: number | null
): number | null {
  if (growthBytesPerDay === null || growthBytesPerDay <= 0) return null;
  const remaining = budgetBytes - currentBytes;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / growthBytesPerDay);
}

async function measureRpcByteCount(rpcName: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc(rpcName);
  if (error || !isByteCount(data)) {
    throw new Error(`Failed to measure quota bytes via ${rpcName}: ${error?.message ?? 'invalid value'}`);
  }
  return data;
}

async function loadSamples(now: Date): Promise<IQuotaSample[]> {
  const since = dayjs(now).utc().subtract(QUOTA_GROWTH_WINDOW_DAYS, 'day').format('YYYY-MM-DD');
  const { data, error } = await supabaseAdmin
    .from('quota_guard_samples')
    .select('sample_day,database_bytes,storage_bytes,r2_bytes')
    .gte('sample_day', since)
    .order('sample_day', { ascending: true });
  if (error) {
    throw new Error(`Failed to load quota guard samples: ${error.message}`);
  }
  return (data ?? []).map(row => ({
    day: String(row.sample_day),
    databaseBytes: Number(row.database_bytes),
    storageBytes: Number(row.storage_bytes),
    r2Bytes: row.r2_bytes === null ? null : Number(row.r2_bytes),
  }));
}

function buildStatus(
  resource: QuotaResource,
  currentBytes: number | null,
  budgetBytes: number,
  points: ReadonlyArray<{ day: string; bytes: number }>
): IQuotaResourceStatus {
  if (currentBytes === null) {
    return {
      resource,
      currentBytes: null,
      budgetBytes,
      utilization: null,
      growthBytesPerDay: null,
      daysLeft: null,
      measured: false,
      alert: false,
    };
  }
  const utilization = computeUtilization(currentBytes, budgetBytes);
  const growthBytesPerDay = computeGrowthBytesPerDay(points);
  return {
    resource,
    currentBytes,
    budgetBytes,
    utilization,
    growthBytesPerDay,
    daysLeft: computeDaysLeft(currentBytes, budgetBytes, growthBytesPerDay),
    measured: true,
    alert: utilization >= QUOTA_ALERT_THRESHOLD,
  };
}

async function sendQuotaAlert(
  day: string,
  alerts: IQuotaResourceStatus[],
  staleCronJobs: string[]
): Promise<void> {
  const delivery = await getEmailService().send({
    to: serverEnv.PROVIDER_ALERT_EMAIL,
    type: 'transactional',
    template: 'quota-guard-alert',
    data: {
      day,
      thresholdPercent: Math.round(QUOTA_ALERT_THRESHOLD * 100),
      staleCronJobs,
      alerts: alerts.map(alert => ({
        resource: alert.resource,
        utilizationPercent: Math.round((alert.utilization ?? 0) * 100),
        currentBytes: alert.currentBytes,
        budgetBytes: alert.budgetBytes,
        growthBytesPerDay: alert.growthBytesPerDay,
        daysLeft: alert.daysLeft,
      })),
    },
  });
  if (!delivery.success) {
    throw new Error(delivery.error || 'Quota guard alert email was not accepted');
  }
}

/**
 * Daily MIU quota guard (PRD-SQR-03 AC-6). Measures database and Supabase
 * Storage bytes, persists one sample per UTC day, computes the 30-day growth
 * rate and days-left runway, and emails PROVIDER_ALERT_EMAIL when any resource
 * reaches 80% of budget or a scheduled cron job is stale. The stale-cron leg
 * covers the deploy gate, which sees HTTP 200 and cannot alert on a degraded
 * body. R2 bytes come from one account-level Cloudflare metrics request; when
 * that measurement is unavailable its value stays unmeasured rather than a
 * fabricated zero.
 */
export async function runDailyQuotaGuard(now: Date = new Date()): Promise<IQuotaGuardResult> {
  const day = dayjs(now).utc().format('YYYY-MM-DD');

  const databaseBytes = await measureRpcByteCount('measure_current_database_bytes');
  const storageBytes = await measureRpcByteCount('measure_supabase_storage_bytes');
  const r2Bytes = await measureR2AccountPayloadBytes();

  const { error: persistError } = await supabaseAdmin.rpc('record_quota_guard_sample', {
    p_sample_day: day,
    p_database_bytes: databaseBytes,
    p_storage_bytes: storageBytes,
    p_r2_bytes: r2Bytes,
  });
  if (persistError) {
    throw new Error(`Failed to persist quota guard sample: ${persistError.message}`);
  }

  const samples = await loadSamples(now);
  const resources: IQuotaResourceStatus[] = [
    buildStatus(
      'database',
      databaseBytes,
      MIU_QUOTA_BUDGETS.databaseBytes,
      samples.map(sample => ({ day: sample.day, bytes: sample.databaseBytes }))
    ),
    buildStatus(
      'storage',
      storageBytes,
      MIU_QUOTA_BUDGETS.storageBytes,
      samples.map(sample => ({ day: sample.day, bytes: sample.storageBytes }))
    ),
    buildStatus(
      'r2',
      r2Bytes,
      MIU_QUOTA_BUDGETS.r2Bytes,
      samples
        .filter(sample => sample.r2Bytes !== null)
        .map(sample => ({ day: sample.day, bytes: sample.r2Bytes as number }))
    ),
  ];

  const cronJobs = await getCronJobHealth(now);
  const staleCronJobs = cronJobs.filter(job => job.stale).map(job => job.jobKey);

  const alerts = resources.filter(resource => resource.alert);
  const alertCount = alerts.length + staleCronJobs.length;
  if (alertCount > 0) {
    await sendQuotaAlert(day, alerts, staleCronJobs);
  }

  return {
    day,
    alertCount,
    alerted: alertCount > 0,
    r2Measured: r2Bytes !== null,
    staleCronJobs,
    resources,
  };
}
