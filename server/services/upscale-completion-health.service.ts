import { getEmailService } from '@server/services/email.service';
import {
  getAmplitudeEventTotals,
  type IAmplitudeEventTotalsResult,
} from '@server/analytics/dashboardApi';
import { serverEnv } from '@shared/config/env';

export const UPSCALE_COMPLETION_RATE_THRESHOLD = 0.95;

const UPSCALE_EVENTS = {
  started: 'image_upscale_started',
  completed: 'upscale_completed',
  failed: 'processing_failed',
} as const;

export interface IUpscaleHealthDay {
  date: string;
  started: number;
  completed: number;
  processingFailed: number;
  completionRate: number | null;
  unaccounted: number;
}

export interface IUpscaleHealthReport {
  startDate: string;
  endDate: string;
  days: IUpscaleHealthDay[];
  lastCompleteDay: IUpscaleHealthDay | null;
  threshold: number;
}

export interface IUpscaleHealthDateRange {
  startDate: string;
  endDate: string;
}

function formatAmplitudeDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('');
}

function normalizeDate(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value.slice(0, 10);
}

function getYesterdayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
}

export function getCompleteDayRange(now = new Date(), dayCount = 10): IUpscaleHealthDateRange {
  if (!Number.isInteger(dayCount) || dayCount < 1) {
    throw new Error('dayCount must be a positive integer.');
  }

  const end = getYesterdayUtc(now);
  const start = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - dayCount + 1)
  );
  return {
    startDate: formatAmplitudeDate(start),
    endDate: formatAmplitudeDate(end),
  };
}

export function calculateUpscaleCompletionRate(started: number, completed: number): number | null {
  if (started <= 0) return null;
  return completed / started;
}

export function buildUpscaleHealthReport(
  results: Readonly<Record<keyof typeof UPSCALE_EVENTS, IAmplitudeEventTotalsResult>>,
  threshold = UPSCALE_COMPLETION_RATE_THRESHOLD
): IUpscaleHealthReport {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('threshold must be between 0 and 1.');
  }

  const values = new Map<
    string,
    { started: number; completed: number; processingFailed: number }
  >();
  const addResult = (
    result: IAmplitudeEventTotalsResult,
    key: 'started' | 'completed' | 'processingFailed'
  ) => {
    result.xValues.forEach((date, index) => {
      const normalizedDate = normalizeDate(date);
      const current = values.get(normalizedDate) ?? {
        started: 0,
        completed: 0,
        processingFailed: 0,
      };
      current[key] = result.dailyTotals[index] ?? 0;
      values.set(normalizedDate, current);
    });
  };

  addResult(results.started, 'started');
  addResult(results.completed, 'completed');
  addResult(results.failed, 'processingFailed');

  const days = [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, counts]) => ({
      date,
      started: counts.started,
      completed: counts.completed,
      processingFailed: counts.processingFailed,
      completionRate: calculateUpscaleCompletionRate(counts.started, counts.completed),
      unaccounted: counts.started - counts.completed - counts.processingFailed,
    }));

  return {
    startDate: results.started.start,
    endDate: results.started.end,
    days,
    lastCompleteDay: [...days].reverse().find(day => day.started > 0) ?? null,
    threshold,
  };
}

export async function getUpscaleHealthReport(
  range: IUpscaleHealthDateRange = getCompleteDayRange(),
  threshold = UPSCALE_COMPLETION_RATE_THRESHOLD
): Promise<IUpscaleHealthReport> {
  if (!serverEnv.AMPLITUDE_API_KEY || !serverEnv.AMPLITUDE_SECRET_KEY) {
    throw new Error(
      'Amplitude Dashboard REST API requires both AMPLITUDE_API_KEY and AMPLITUDE_SECRET_KEY.'
    );
  }

  const authOptions = {
    apiKey: serverEnv.AMPLITUDE_API_KEY,
    secretKey: serverEnv.AMPLITUDE_SECRET_KEY,
  };
  const [started, completed, failed] = await Promise.all([
    getAmplitudeEventTotals(
      { eventType: UPSCALE_EVENTS.started, startDate: range.startDate, endDate: range.endDate },
      authOptions
    ),
    getAmplitudeEventTotals(
      { eventType: UPSCALE_EVENTS.completed, startDate: range.startDate, endDate: range.endDate },
      authOptions
    ),
    getAmplitudeEventTotals(
      { eventType: UPSCALE_EVENTS.failed, startDate: range.startDate, endDate: range.endDate },
      authOptions
    ),
  ]);

  return buildUpscaleHealthReport({ started, completed, failed }, threshold);
}

export async function monitorUpscaleCompletionRate(
  reportLoader: () => Promise<IUpscaleHealthReport> = getUpscaleHealthReport
): Promise<boolean> {
  const report = await reportLoader();
  const latest = report.lastCompleteDay;
  const completionRate = latest
    ? calculateUpscaleCompletionRate(latest.started, latest.completed)
    : null;

  if (completionRate === null || completionRate >= report.threshold) return false;

  const failedAttempts = Math.max(0, latest!.started - latest!.completed);
  const delivery = await getEmailService().send({
    to: serverEnv.PROVIDER_ALERT_EMAIL,
    type: 'transactional',
    template: 'provider-incident',
    data: {
      severity: 'critical',
      attempts: latest!.started,
      failures: failedAttempts,
      failureRatioPercent: Math.round((1 - completionRate) * 100),
      baselineRatioPercent: Math.round(completionRate * 100),
      billingFailures: latest!.processingFailed,
      circuitStatus: `upscale_completion_rate_below_${report.threshold.toFixed(2)}`,
      completionRatePercent: Math.round(completionRate * 100),
      completionRateDate: latest!.date,
    },
  });
  if (!delivery.success) {
    throw new Error(delivery.error || 'Upscale completion-rate alert email was not accepted');
  }
  return true;
}
