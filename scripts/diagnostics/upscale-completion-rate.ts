import { pathToFileURL } from 'node:url';
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

export function formatUpscaleHealthReport(report: IUpscaleHealthReport): string {
  const lines = [
    `Upscale completion health (${report.startDate}–${report.endDate})`,
    'date       started  completed  processing_failed  completion_rate  unaccounted',
  ];

  for (const day of report.days) {
    lines.push(
      [
        day.date,
        String(day.started).padStart(7),
        String(day.completed).padStart(10),
        String(day.processingFailed).padStart(18),
        day.completionRate === null
          ? 'N/A'.padStart(16)
          : day.completionRate.toFixed(2).padStart(16),
        String(day.unaccounted).padStart(12),
      ].join('  ')
    );
  }

  const latest = report.lastCompleteDay;
  lines.push(
    latest
      ? `Last complete day: ${latest.date} ratio=${latest.completionRate?.toFixed(2) ?? 'N/A'} threshold=${report.threshold.toFixed(2)}`
      : 'Last complete day: no upscale attempts found'
  );
  return lines.join('\n');
}

interface IUpscaleHealthCliOptions {
  startDate?: string;
  endDate?: string;
  threshold: number;
  help: boolean;
}

function printHelp(): void {
  console.log(`Usage: yarn diag:upscale-health [options]

Reads the last complete UTC days from Amplitude and exits 1 when the latest
complete-day upscale ratio is below 0.95.

Options:
  --start YYYYMMDD    Override the first day in the report
  --end YYYYMMDD      Override the last day in the report
  --threshold 0.95    Override the completion-rate threshold
  --help              Show this help text
`);
}

function parseCliArgs(argv: string[]): IUpscaleHealthCliOptions {
  let startDate: string | undefined;
  let endDate: string | undefined;
  let threshold = UPSCALE_COMPLETION_RATE_THRESHOLD;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      help = true;
      continue;
    }
    if (argument === '--start') {
      startDate = argv[++index];
      continue;
    }
    if (argument === '--end') {
      endDate = argv[++index];
      continue;
    }
    if (argument === '--threshold') {
      threshold = Number(argv[++index]);
      continue;
    }
    throw new Error(`Unknown argument "${argument}". Use --help for usage.`);
  }

  if (startDate && !/^\d{8}$/.test(startDate)) throw new Error('--start must be YYYYMMDD.');
  if (endDate && !/^\d{8}$/.test(endDate)) throw new Error('--end must be YYYYMMDD.');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('--threshold must be between 0 and 1.');
  }
  if (Boolean(startDate) !== Boolean(endDate)) {
    throw new Error('--start and --end must be provided together.');
  }

  return { startDate, endDate, threshold, help };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const range =
    options.startDate && options.endDate
      ? { startDate: options.startDate, endDate: options.endDate }
      : getCompleteDayRange();
  const report = await getUpscaleHealthReport(range, options.threshold);
  console.log(formatUpscaleHealthReport(report));

  if (!report.lastCompleteDay || report.lastCompleteDay.completionRate === null) {
    process.exitCode = 1;
  } else if (report.lastCompleteDay.completionRate < report.threshold) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
