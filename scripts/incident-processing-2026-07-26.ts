/**
 * Local incident-breakdown report for 2026-07-26 UTC.
 *
 * The report is evidence-first: it summarizes supplied terminal-attempt and
 * evidence exports, never queries production, and leaves cause unresolved when
 * external validation was not supplied.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { assertReadOnlyMode, type TEnvironmentMode } from './reconcile-revenue-telemetry';
import {
  buildBoundedFailureSegments,
  type IBoundedFailureSegments,
  type IProcessingTerminalAttempt,
} from './monitor-processing-failure-rate';

export const INCIDENT_DATE_UTC = '2026-07-26';

export interface IIncidentAttempt extends IProcessingTerminalAttempt {
  userId?: string;
  retryOfAttemptId?: string;
  attemptGroupId?: string;
}

export type TIncidentEvidenceValidation = 'not_run' | 'provided_unverified' | 'verified';
export type TIncidentCause = 'provider' | 'application' | 'mixed' | 'unresolved';

export interface IProviderSignal {
  observedAt: string;
  provider: string;
  signal: 'provider_error' | 'provider_recovered' | 'provider_status' | 'other';
}

export interface IApplicationSignal {
  observedAt: string;
  signal: 'application_error' | 'application_recovered' | 'log_gap' | 'other';
}

export interface IDeploymentMarker {
  deployedAt: string;
  commitSha?: string;
}

export interface IIncidentEvidenceInput {
  validationStatus?: TIncidentEvidenceValidation;
  causeCandidate?: TIncidentCause;
  providerSignals?: readonly IProviderSignal[];
  applicationSignals?: readonly IApplicationSignal[];
  deployments?: readonly IDeploymentMarker[];
  remediationOwner?: string;
  followUpDefectId?: string;
}

export interface IIncidentInput {
  mode: TEnvironmentMode;
  incidentDateUtc?: string;
  attempts: readonly IIncidentAttempt[];
  evidence?: IIncidentEvidenceInput;
}

export interface IHourlyIncidentBreakdown {
  hourUtc: string;
  terminalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  failureRate: number;
  segments: IBoundedFailureSegments;
}

export interface IIncidentReport {
  reportType: 'processing_incident_breakdown';
  readOnly: true;
  source: 'local_export';
  mode: TEnvironmentMode;
  incidentDateUtc: string;
  externalValidation: TIncidentEvidenceValidation;
  validationNote: string;
  scope: { startAt: string; endAt: string };
  overall: {
    terminalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    failureRate: number;
  };
  hourly: IHourlyIncidentBreakdown[];
  onsetAndRecovery: {
    lastSuccessBeforeFirstFailureAt: string | null;
    firstFailureAt: string | null;
    lastFailureAt: string | null;
    firstSuccessAfterFinalFailureAt: string | null;
  };
  affected: {
    failedAttempts: number;
    distinctAffectedUsers: number | null;
    stableUserIdsSupplied: boolean;
  };
  retriesLaterSucceeded: {
    failedAttemptsWithLaterSuccess: number;
    laterSuccessfulAttempts: number;
    recoveryRateAmongFailedAttempts: number;
  };
  dominantFailureSegments: IBoundedFailureSegments;
  evidence: {
    likelyCause: TIncidentCause;
    providerSignalCount: number;
    applicationSignalCount: number;
    deploymentCount: number;
    deploymentMarkersInScope: number;
    missingEvidence: string[];
  };
  remediation: {
    owner: string | null;
    followUpDefectId: string | null;
  };
}

export interface IIncidentCliOptions {
  mode?: TEnvironmentMode;
  inputPath?: string;
  allowLiveRead: boolean;
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

function assertIncidentDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('incidentDateUtc must use YYYY-MM-DD.');
  }
  assertTimestamp(`${value}T00:00:00.000Z`, 'incidentDateUtc');
  return value;
}

function getIncidentWindow(date: string): { start: number; end: number } {
  const start = assertTimestamp(`${date}T00:00:00.000Z`, 'Incident start');
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function deduplicateIncidentAttempts(attempts: readonly IIncidentAttempt[]): IIncidentAttempt[] {
  const byAttemptId = new Map<string, IIncidentAttempt>();
  for (const attempt of attempts) {
    if (!attempt.attemptId.trim()) throw new Error('Every incident attempt requires an attemptId.');
    if (attempt.outcome !== 'success' && attempt.outcome !== 'failure') {
      throw new Error(`Unsupported incident outcome for ${attempt.attemptId}.`);
    }
    assertTimestamp(attempt.occurredAt, 'Incident attempt timestamp');
    const existing = byAttemptId.get(attempt.attemptId);
    if (existing && existing.outcome !== attempt.outcome) {
      throw new Error('Conflicting terminal outcomes supplied for one incident attempt.');
    }
    if (!existing) byAttemptId.set(attempt.attemptId, attempt);
  }
  return [...byAttemptId.values()].sort(
    (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
  );
}

function summarizeAttempts(attempts: readonly IIncidentAttempt[]) {
  const successfulAttempts = attempts.filter(attempt => attempt.outcome === 'success').length;
  const failedAttempts = attempts.filter(attempt => attempt.outcome === 'failure').length;
  const terminalAttempts = successfulAttempts + failedAttempts;
  return {
    terminalAttempts,
    successfulAttempts,
    failedAttempts,
    failureRate: terminalAttempts === 0 ? 0 : failedAttempts / terminalAttempts,
  };
}

function formatHour(date: string, hour: number): string {
  return `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`;
}

function buildOnsetAndRecovery(attempts: readonly IIncidentAttempt[]) {
  const failures = attempts.filter(attempt => attempt.outcome === 'failure');
  const successes = attempts.filter(attempt => attempt.outcome === 'success');
  const firstFailure = failures[0];
  const lastFailure = failures[failures.length - 1];
  const lastSuccessBeforeFirstFailure = firstFailure
    ? [...successes]
        .reverse()
        .find(success => Date.parse(success.occurredAt) < Date.parse(firstFailure.occurredAt))
    : undefined;
  const firstSuccessAfterFinalFailure = lastFailure
    ? successes.find(success => Date.parse(success.occurredAt) > Date.parse(lastFailure.occurredAt))
    : undefined;

  return {
    lastSuccessBeforeFirstFailureAt: lastSuccessBeforeFirstFailure?.occurredAt ?? null,
    firstFailureAt: firstFailure?.occurredAt ?? null,
    lastFailureAt: lastFailure?.occurredAt ?? null,
    firstSuccessAfterFinalFailureAt: firstSuccessAfterFinalFailure?.occurredAt ?? null,
  };
}

function buildRetrySummary(attempts: readonly IIncidentAttempt[]) {
  const failures = attempts.filter(attempt => attempt.outcome === 'failure');
  const recoveredFailureIds = new Set<string>();
  let laterSuccessfulAttempts = 0;

  for (const success of attempts.filter(attempt => attempt.outcome === 'success')) {
    const successTimestamp = Date.parse(success.occurredAt);
    const recoveredFailures = failures.filter(failure => {
      if (Date.parse(failure.occurredAt) >= successTimestamp) return false;
      const explicitRetry =
        success.retryOfAttemptId !== undefined && success.retryOfAttemptId === failure.attemptId;
      const groupedRetry =
        success.attemptGroupId !== undefined && success.attemptGroupId === failure.attemptGroupId;
      return explicitRetry || groupedRetry;
    });
    if (recoveredFailures.length === 0) continue;
    laterSuccessfulAttempts += 1;
    for (const failure of recoveredFailures) recoveredFailureIds.add(failure.attemptId);
  }

  return {
    failedAttemptsWithLaterSuccess: recoveredFailureIds.size,
    laterSuccessfulAttempts,
    recoveryRateAmongFailedAttempts:
      failures.length === 0 ? 0 : recoveredFailureIds.size / failures.length,
  };
}

function buildEvidenceSummary(
  evidence: IIncidentEvidenceInput | undefined,
  start: number,
  end: number
): IIncidentReport['evidence'] {
  const providerSignals = evidence?.providerSignals ?? [];
  const applicationSignals = evidence?.applicationSignals ?? [];
  const deployments = evidence?.deployments ?? [];
  const validationStatus = evidence?.validationStatus ?? 'not_run';
  const missingEvidence: string[] = [];
  if (validationStatus !== 'verified') {
    missingEvidence.push('External provider/log validation was not verified by this local report.');
  }
  if (providerSignals.length === 0) missingEvidence.push('No provider signal export was supplied.');
  if (applicationSignals.length === 0) {
    missingEvidence.push('No application log signal export was supplied.');
  }
  if (deployments.length === 0) missingEvidence.push('No deploy-history export was supplied.');

  return {
    likelyCause:
      validationStatus === 'verified' ? (evidence?.causeCandidate ?? 'unresolved') : 'unresolved',
    providerSignalCount: providerSignals.length,
    applicationSignalCount: applicationSignals.length,
    deploymentCount: deployments.length,
    deploymentMarkersInScope: deployments.filter(marker => {
      const timestamp = assertTimestamp(marker.deployedAt, 'Deployment timestamp');
      return timestamp >= start && timestamp < end;
    }).length,
    missingEvidence,
  };
}

export function buildIncidentReport(input: IIncidentInput): IIncidentReport {
  if (input.mode !== 'test' && input.mode !== 'live') {
    throw new Error('Incident mode must be exactly test or live.');
  }
  const incidentDateUtc = assertIncidentDate(input.incidentDateUtc ?? INCIDENT_DATE_UTC);
  const { start, end } = getIncidentWindow(incidentDateUtc);
  const attempts = deduplicateIncidentAttempts(input.attempts).filter(attempt => {
    const timestamp = Date.parse(attempt.occurredAt);
    return timestamp >= start && timestamp < end;
  });
  const overall = summarizeAttempts(attempts);
  const hourly: IHourlyIncidentBreakdown[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const hourStart = start + hour * 60 * 60 * 1000;
    const hourEnd = hourStart + 60 * 60 * 1000;
    const hourAttempts = attempts.filter(attempt => {
      const timestamp = Date.parse(attempt.occurredAt);
      return timestamp >= hourStart && timestamp < hourEnd;
    });
    hourly.push({
      hourUtc: formatHour(incidentDateUtc, hour),
      ...summarizeAttempts(hourAttempts),
      segments: buildBoundedFailureSegments(hourAttempts),
    });
  }

  const stableUserIds = new Set(
    attempts
      .filter(attempt => attempt.outcome === 'failure')
      .map(attempt => attempt.userId?.trim())
      .filter((value): value is string => Boolean(value))
  );
  const stableUserIdsSupplied = attempts
    .filter(attempt => attempt.outcome === 'failure')
    .some(attempt => Boolean(attempt.userId?.trim()));
  const evidence = buildEvidenceSummary(input.evidence, start, end);
  const owner = input.evidence?.remediationOwner?.trim() || null;
  const followUpDefectId = input.evidence?.followUpDefectId?.trim() || null;

  return {
    reportType: 'processing_incident_breakdown',
    readOnly: true,
    source: 'local_export',
    mode: input.mode,
    incidentDateUtc,
    externalValidation: input.evidence?.validationStatus ?? 'not_run',
    validationNote:
      input.evidence?.validationStatus === 'verified'
        ? 'External evidence was marked verified by the export provider; this script does not independently verify it.'
        : 'External provider, application-log, and deploy validation was unavailable or unverified for this local report.',
    scope: {
      startAt: toIso(start),
      endAt: toIso(end),
    },
    overall,
    hourly,
    onsetAndRecovery: buildOnsetAndRecovery(attempts),
    affected: {
      failedAttempts: overall.failedAttempts,
      distinctAffectedUsers: stableUserIdsSupplied ? stableUserIds.size : null,
      stableUserIdsSupplied,
    },
    retriesLaterSucceeded: buildRetrySummary(attempts),
    dominantFailureSegments: buildBoundedFailureSegments(attempts),
    evidence,
    remediation: {
      owner,
      followUpDefectId,
    },
  };
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/incident-processing-2026-07-26.ts --mode test|live --input <incident.json> [--allow-live-read]

Reads a local incident export and prints an evidence-first breakdown. It never calls production APIs or invents a root cause.`);
}

export function parseCliArgs(argv: string[]): IIncidentCliOptions {
  let mode: TEnvironmentMode | undefined;
  let inputPath: string | undefined;
  let allowLiveRead = false;
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
    throw new Error(`Unknown argument ${argument}. Use --help for usage.`);
  }

  if (!help) {
    assertReadOnlyMode({ mode, allowLiveRead });
    if (!inputPath) throw new Error('--input requires a local JSON path.');
  }
  return { mode, inputPath, allowLiveRead, help };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const raw = JSON.parse(await readFile(options.inputPath!, 'utf8')) as IIncidentInput;
  if (raw.mode !== options.mode) {
    throw new Error('Input mode must exactly match the explicit CLI --mode value.');
  }
  console.log(JSON.stringify(buildIncidentReport(raw), null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : 'Unable to build incident report.';
    console.error(message);
    process.exit(1);
  });
}
