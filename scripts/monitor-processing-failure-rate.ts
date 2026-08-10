/**
 * Offline processing-health monitor.
 *
 * The monitor consumes terminal-attempt exports only. It calculates the PRD's
 * 15-minute policy and builds a bounded alert payload. In explicit live mode it
 * also checks the Amplitude completion funnel and uses the existing email service
 * when the completion ratio falls below the product threshold.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { monitorUpscaleCompletionRate } from '@server/services/upscale-completion-health.service';
import { assertReadOnlyMode, type TEnvironmentMode } from './reconcile-revenue-telemetry';

export { monitorUpscaleCompletionRate };

export const PROCESSING_FAILURE_MONITOR_POLICY = {
  windowMinutes: 15,
  minimumTerminalAttempts: 20,
  warningRate: 0.05,
  warningConsecutiveWindows: 2,
  criticalRate: 0.1,
  criticalBaselineMultiplier: 3,
  topSegmentLimit: 5,
} as const;

export type TProcessingOutcome = 'success' | 'failure';
export type TFailureMonitorStatus = 'normal' | 'insufficient_data' | 'warning' | 'critical';

export interface IProcessingTerminalAttempt {
  attemptId: string;
  occurredAt: string;
  outcome: TProcessingOutcome;
  errorType?: string;
  reason?: string;
  provider?: string;
  model?: string;
  qualityTier?: string;
}

export interface ITopFailureSegment {
  value: string;
  count: number;
  shareOfFailures: number;
}

export interface IBoundedFailureSegments {
  errorTypes: ITopFailureSegment[];
  reasons: ITopFailureSegment[];
  providers: ITopFailureSegment[];
  models: ITopFailureSegment[];
}

export interface IFailureRateWindow {
  windowStart: string;
  windowEnd: string;
  successfulAttempts: number;
  failedAttempts: number;
  terminalAttempts: number;
  failureRate: number;
  eligible: boolean;
  sevenDayBaselineRate: number | null;
  segments: IBoundedFailureSegments;
}

export interface IProcessingAlertPayload {
  windowStart: string;
  windowEnd: string;
  successfulAttempts: number;
  failures: number;
  terminalAttempts: number;
  failureRate: number;
  sevenDayBaselineRate: number | null;
  topSegments: IBoundedFailureSegments;
}

export interface IFailureRateEvaluation {
  status: TFailureMonitorStatus;
  reason: string;
  currentWindow: IFailureRateWindow;
  previousWindow?: IFailureRateWindow;
  consecutiveWarningWindows: number;
  baselineMultiple: number | null;
  alertPayload?: IProcessingAlertPayload;
}

export interface IFailureMonitorInput {
  attempts: readonly IProcessingTerminalAttempt[];
  asOf: string;
  sevenDayBaselineRate?: number | null;
  sevenDayBaselineAttempts?: readonly IProcessingTerminalAttempt[];
  windowCount?: number;
  stepMinutes?: number;
}

export interface IFailureMonitorDocument extends IFailureMonitorInput {
  mode: TEnvironmentMode;
}

export interface IFailureMonitorCliOptions {
  mode?: TEnvironmentMode;
  inputPath?: string;
  allowLiveRead: boolean;
  testAlert: boolean;
  strict: boolean;
  help: boolean;
}

function assertTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be a valid ISO timestamp.`);
  return timestamp;
}

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Converts a dimension to a bounded, low-cardinality value. Free text and
 * values containing unsafe characters become `unknown` rather than reaching an
 * alert payload.
 */
export function normalizeBoundedSegment(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (!/^[a-z0-9][a-z0-9._/-]{0,63}$/.test(normalized)) return 'unknown';
  return normalized;
}

function countTopSegments(
  failures: readonly IProcessingTerminalAttempt[],
  getValue: (attempt: IProcessingTerminalAttempt) => unknown,
  limit = PROCESSING_FAILURE_MONITOR_POLICY.topSegmentLimit
): ITopFailureSegment[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Segment limit must be a positive integer.');
  }
  const counts = new Map<string, number>();
  for (const failure of failures) {
    const value = normalizeBoundedSegment(getValue(failure));
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => ({
      value,
      count,
      shareOfFailures: failures.length === 0 ? 0 : count / failures.length,
    }));
}

export function buildBoundedFailureSegments(
  attempts: readonly IProcessingTerminalAttempt[],
  limit = PROCESSING_FAILURE_MONITOR_POLICY.topSegmentLimit
): IBoundedFailureSegments {
  const failures = attempts.filter(attempt => attempt.outcome === 'failure');
  return {
    errorTypes: countTopSegments(failures, attempt => attempt.errorType, limit),
    reasons: countTopSegments(failures, attempt => attempt.reason, limit),
    providers: countTopSegments(failures, attempt => attempt.provider, limit),
    models: countTopSegments(failures, attempt => attempt.model ?? attempt.qualityTier, limit),
  };
}

export function deduplicateTerminalAttempts(
  attempts: readonly IProcessingTerminalAttempt[]
): IProcessingTerminalAttempt[] {
  const byAttemptId = new Map<string, IProcessingTerminalAttempt>();
  for (const attempt of attempts) {
    if (!attempt.attemptId.trim()) throw new Error('Every terminal attempt requires an attemptId.');
    if (attempt.outcome !== 'success' && attempt.outcome !== 'failure') {
      throw new Error(`Unsupported terminal outcome for ${attempt.attemptId}.`);
    }
    assertTimestamp(attempt.occurredAt, 'Attempt timestamp');
    const existing = byAttemptId.get(attempt.attemptId);
    if (existing && existing.outcome !== attempt.outcome) {
      throw new Error('Conflicting terminal outcomes supplied for one attemptId.');
    }
    if (!existing) byAttemptId.set(attempt.attemptId, attempt);
  }
  return [...byAttemptId.values()].sort(
    (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
  );
}

export function calculateFailureRate(attempts: readonly IProcessingTerminalAttempt[]): {
  successfulAttempts: number;
  failedAttempts: number;
  terminalAttempts: number;
  failureRate: number;
} {
  const successfulAttempts = attempts.filter(attempt => attempt.outcome === 'success').length;
  const failedAttempts = attempts.filter(attempt => attempt.outcome === 'failure').length;
  const terminalAttempts = successfulAttempts + failedAttempts;
  return {
    successfulAttempts,
    failedAttempts,
    terminalAttempts,
    failureRate: terminalAttempts === 0 ? 0 : failedAttempts / terminalAttempts,
  };
}

export function calculateSevenDayBaseline(
  attempts: readonly IProcessingTerminalAttempt[]
): number | null {
  const summary = calculateFailureRate(deduplicateTerminalAttempts(attempts));
  return summary.terminalAttempts === 0 ? null : summary.failureRate;
}

export function summarizeProcessingWindow({
  attempts,
  windowStart,
  windowEnd,
  sevenDayBaselineRate = null,
}: {
  attempts: readonly IProcessingTerminalAttempt[];
  windowStart: string;
  windowEnd: string;
  sevenDayBaselineRate?: number | null;
}): IFailureRateWindow {
  const start = assertTimestamp(windowStart, 'windowStart');
  const end = assertTimestamp(windowEnd, 'windowEnd');
  if (end <= start) throw new Error('windowEnd must be after windowStart.');
  const deduplicated = deduplicateTerminalAttempts(attempts);
  const inWindow = deduplicated.filter(attempt => {
    const timestamp = Date.parse(attempt.occurredAt);
    return timestamp > start && timestamp <= end;
  });
  const summary = calculateFailureRate(inWindow);
  return {
    windowStart: toIso(start),
    windowEnd: toIso(end),
    ...summary,
    eligible: summary.terminalAttempts >= PROCESSING_FAILURE_MONITOR_POLICY.minimumTerminalAttempts,
    sevenDayBaselineRate,
    segments: buildBoundedFailureSegments(inWindow),
  };
}

export function buildRollingFailureWindows(
  attempts: readonly IProcessingTerminalAttempt[],
  {
    asOf,
    windowCount = 2,
    stepMinutes = PROCESSING_FAILURE_MONITOR_POLICY.windowMinutes,
    sevenDayBaselineRate = null,
  }: {
    asOf: string;
    windowCount?: number;
    stepMinutes?: number;
    sevenDayBaselineRate?: number | null;
  }
): IFailureRateWindow[] {
  const asOfTimestamp = assertTimestamp(asOf, 'asOf');
  if (!Number.isInteger(windowCount) || windowCount < 1) {
    throw new Error('windowCount must be a positive integer.');
  }
  if (!Number.isFinite(stepMinutes) || stepMinutes <= 0) {
    throw new Error('stepMinutes must be greater than zero.');
  }

  const deduplicated = deduplicateTerminalAttempts(attempts);
  const windows: IFailureRateWindow[] = [];
  for (let index = windowCount - 1; index >= 0; index -= 1) {
    const end = asOfTimestamp - index * stepMinutes * 60 * 1000;
    const start = end - PROCESSING_FAILURE_MONITOR_POLICY.windowMinutes * 60 * 1000;
    windows.push(
      summarizeProcessingWindow({
        attempts: deduplicated,
        windowStart: toIso(start),
        windowEnd: toIso(end),
        sevenDayBaselineRate,
      })
    );
  }
  return windows;
}

export function evaluateProcessingFailureRate(
  windows: readonly IFailureRateWindow[]
): IFailureRateEvaluation {
  if (windows.length === 0) throw new Error('At least one rolling window is required.');
  const currentWindow = windows[windows.length - 1];
  const previousWindow = windows.length > 1 ? windows[windows.length - 2] : undefined;
  const baseline = currentWindow.sevenDayBaselineRate;
  const baselineMultiple =
    baseline !== null && baseline > 0 ? currentWindow.failureRate / baseline : null;
  const criticalByRate =
    currentWindow.eligible &&
    currentWindow.failureRate >= PROCESSING_FAILURE_MONITOR_POLICY.criticalRate;
  const criticalByBaseline =
    currentWindow.eligible &&
    baseline !== null &&
    ((baseline > 0 &&
      currentWindow.failureRate >=
        baseline * PROCESSING_FAILURE_MONITOR_POLICY.criticalBaselineMultiplier) ||
      (baseline === 0 && currentWindow.failureRate > 0));
  const consecutiveWarningWindows =
    currentWindow.eligible &&
    previousWindow?.eligible &&
    currentWindow.failureRate >= PROCESSING_FAILURE_MONITOR_POLICY.warningRate &&
    previousWindow.failureRate >= PROCESSING_FAILURE_MONITOR_POLICY.warningRate
      ? PROCESSING_FAILURE_MONITOR_POLICY.warningConsecutiveWindows
      : 0;

  let status: TFailureMonitorStatus = 'normal';
  let reason = 'Current eligible window is below the alert thresholds.';
  if (!currentWindow.eligible) {
    status = 'insufficient_data';
    reason = `Only ${currentWindow.terminalAttempts} terminal attempts; at least ${PROCESSING_FAILURE_MONITOR_POLICY.minimumTerminalAttempts} are required.`;
  } else if (criticalByRate || criticalByBaseline) {
    status = 'critical';
    reason = criticalByRate
      ? 'Failure rate reached the single-window critical threshold.'
      : baseline === 0
        ? 'Failure rate is positive while the comparable seven-day baseline was zero.'
        : 'Failure rate reached at least three times the comparable seven-day baseline.';
  } else if (
    consecutiveWarningWindows >= PROCESSING_FAILURE_MONITOR_POLICY.warningConsecutiveWindows
  ) {
    status = 'warning';
    reason = 'Failure rate reached the warning threshold in two consecutive eligible windows.';
  }

  const alertPayload =
    status === 'warning' || status === 'critical'
      ? {
          windowStart: currentWindow.windowStart,
          windowEnd: currentWindow.windowEnd,
          successfulAttempts: currentWindow.successfulAttempts,
          failures: currentWindow.failedAttempts,
          terminalAttempts: currentWindow.terminalAttempts,
          failureRate: currentWindow.failureRate,
          sevenDayBaselineRate: currentWindow.sevenDayBaselineRate,
          topSegments: currentWindow.segments,
        }
      : undefined;

  return {
    status,
    reason,
    currentWindow,
    previousWindow,
    consecutiveWarningWindows,
    baselineMultiple,
    alertPayload,
  };
}

export function monitorProcessingFailureRate(input: IFailureMonitorInput): IFailureRateEvaluation {
  const baseline =
    input.sevenDayBaselineRate !== undefined
      ? input.sevenDayBaselineRate
      : input.sevenDayBaselineAttempts
        ? calculateSevenDayBaseline(input.sevenDayBaselineAttempts)
        : null;
  if (baseline !== null && (!Number.isFinite(baseline) || baseline < 0 || baseline > 1)) {
    throw new Error('sevenDayBaselineRate must be between 0 and 1.');
  }
  const windows = buildRollingFailureWindows(input.attempts, {
    asOf: input.asOf,
    windowCount: input.windowCount,
    stepMinutes: input.stepMinutes,
    sevenDayBaselineRate: baseline,
  });
  return evaluateProcessingFailureRate(windows);
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/monitor-processing-failure-rate.ts --mode test|live --input <attempts.json> [options]

Reads local terminal-attempt data and prints a bounded alert evaluation. With
--mode live, it also checks the Amplitude upscale funnel and sends the existing
provider-incident email when completion is below the diagnostic threshold.
Options:
  --allow-live-read  Required acknowledgment for an input explicitly labeled live
  --test-alert       Print the same bounded payload used for an alert destination
  --strict           Exit non-zero for warning or critical status`);
}

export function parseCliArgs(argv: string[]): IFailureMonitorCliOptions {
  let mode: TEnvironmentMode | undefined;
  let inputPath: string | undefined;
  let allowLiveRead = false;
  let testAlert = false;
  let strict = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      help = true;
      continue;
    }
    if (argument === '--mode') {
      const value = argv[index + 1];
      if (value !== 'test' && value !== 'live') throw new Error('--mode must be test or live.');
      mode = value;
      index += 1;
      continue;
    }
    if (argument === '--input') {
      inputPath = argv[index + 1];
      if (!inputPath) throw new Error('--input requires a local JSON path.');
      index += 1;
      continue;
    }
    if (argument === '--allow-live-read') {
      allowLiveRead = true;
      continue;
    }
    if (argument === '--test-alert') {
      testAlert = true;
      continue;
    }
    if (argument === '--strict') {
      strict = true;
      continue;
    }
    throw new Error(`Unknown argument ${argument}. Use --help for usage.`);
  }

  if (!help) {
    assertReadOnlyMode({ mode, allowLiveRead });
    if (!inputPath) throw new Error('--input requires a local JSON path.');
  }
  return { mode, inputPath, allowLiveRead, testAlert, strict, help };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const raw = JSON.parse(await readFile(options.inputPath!, 'utf8')) as IFailureMonitorDocument;
  if (raw.mode !== options.mode) {
    throw new Error('Input mode must exactly match the explicit CLI --mode value.');
  }
  const evaluation = monitorProcessingFailureRate(raw);
  const output = options.testAlert ? (evaluation.alertPayload ?? evaluation) : evaluation;
  console.log(JSON.stringify(output, null, 2));
  if (options.mode === 'live') {
    const alerted = await monitorUpscaleCompletionRate();
    console.log(`Upscale completion-rate alert: ${alerted ? 'sent' : 'not sent'}.`);
  }
  if (options.strict && evaluation.status === 'critical') process.exitCode = 2;
  if (options.strict && evaluation.status === 'warning') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    const message =
      error instanceof Error ? error.message : 'Unable to evaluate processing failure rate.';
    console.error(message);
    process.exit(1);
  });
}
