import { createHash, randomBytes } from 'node:crypto';
import { decodeImageDimensions, validateMagicBytes } from '@shared/validation/upscale.schema';
import { fetchPublicOutput } from './output-http';

export type ExecutorAction = 'advance' | 'poll' | 'reconcile' | 'stage' | 'expire_output';

export type ExecutorStage =
  | 'queued'
  | 'submitting'
  | 'submission_unknown'
  | 'processing'
  | 'staging'
  | 'ready'
  | 'completed'
  | 'failed'
  | 'expired';

export type AttemptSubmissionState = 'pending' | 'accepted' | 'unknown' | 'terminal';

export interface IExecutorExecution {
  job_id: string;
  user_id: string;
  input_storage_path: string;
  input_mime_type: string;
  input_size_bytes: number;
  input_width: number | null;
  input_height: number | null;
  quality_tier: string;
  scale: number;
  config: unknown;
  billing_model_id: string;
  resolved_model_id: string;
  provider: string;
  model_version: string | null;
  stage: ExecutorStage;
  lease_generation: number;
  deadline_at: string;
  submission_deadline_at?: string;
  credits_reserved?: number;
  next_action_at: string | null;
  output_storage_path: string | null;
  output_mime_type: string | null;
  output_size_bytes: number | null;
  output_expires_at: string | null;
  failure_reason: string | null;
  updated_at: string;
}

export interface IExecutorAttempt {
  attempt_id: string;
  may_create?: boolean;
  poll_count?: number;
  job_id: string;
  ordinal: number;
  provider: string;
  model_id: string;
  model_version: string | null;
  callback_correlation: string;
  submission_state: AttemptSubmissionState;
  provider_prediction_id: string | null;
  provider_status: string | null;
  provider_output_url: string | null;
  provider_output_mime_type: string | null;
  provider_output_expires_at: string | null;
  failure_reason: string | null;
  next_poll_at: string | null;
}

export interface IProviderPrediction {
  id: string;
  status: string;
  model?: string;
  version?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  webhook?: string;
  retryAfterMs?: number;
  completedAt?: string;
}

export interface IProviderAdapter {
  readonly providerName: string;
  createPrediction(
    execution: IExecutorExecution,
    attempt: IExecutorAttempt,
    inputUrl: string,
    signal?: AbortSignal
  ): Promise<IProviderPrediction>;
  getPrediction(predictionId: string, signal?: AbortSignal): Promise<IProviderPrediction>;
  cancelPrediction?(predictionId: string, signal?: AbortSignal): Promise<void>;
  findPredictionForAttempt(
    execution: IExecutorExecution,
    attempt: IExecutorAttempt,
    inputUrl: string,
    signal?: AbortSignal
  ): Promise<IProviderPrediction | null>;
  matchesAttempt(
    prediction: IProviderPrediction,
    execution: IExecutorExecution,
    attempt: IExecutorAttempt,
    inputUrl: string
  ): boolean;
}

export interface IExecutorInputResolver {
  resolve(execution: IExecutorExecution): Promise<string>;
}

export interface IStagedExecutorOutput {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  expiresAt: string;
  deliveryTokenHash: string;
}

export interface IExecutorOutputStager {
  stage(
    execution: IExecutorExecution,
    attempt: IExecutorAttempt,
    signal?: AbortSignal
  ): Promise<IStagedExecutorOutput>;
}

export interface IExecutorRpc {
  getExecution(jobId: string): Promise<IExecutorExecution | null>;
  findAttemptByCorrelation(correlation: string): Promise<IExecutorAttempt | null>;
  getActiveAttempt(jobId: string): Promise<IExecutorAttempt | null>;
  getLatestTerminalAttempt(jobId: string): Promise<IExecutorAttempt | null>;
  createAttempt(input: {
    jobId: string;
    provider: string;
    modelId: string;
    modelVersion: string | null;
    callbackCorrelation: string;
  }): Promise<IExecutorAttempt | null>;
  bindPrediction(input: {
    jobId: string;
    attemptId: string;
    predictionId: string;
    providerStatus: string;
    nextPollAt?: string;
  }): Promise<boolean>;
  markSubmissionUnknown(input: {
    jobId: string;
    attemptId: string;
    failureReason: string;
  }): Promise<boolean>;
  markProviderTerminal(input: {
    jobId: string;
    attemptId: string;
    providerStatus: string;
    outputUrl?: string;
    outputMimeType?: string;
    outputExpiresAt?: string;
    failureReason?: string;
  }): Promise<boolean>;
  markReady(input: {
    jobId: string;
    storagePath: string;
    outputMimeType: string;
    outputSizeBytes: number;
    outputExpiresAt: string;
    deliveryTokenHash: string;
    outputWidth?: number;
    outputHeight?: number;
  }): Promise<boolean>;
  settleFailure(input: {
    jobId: string;
    failureReason: string;
    expire?: boolean;
  }): Promise<boolean>;
  retryOutbox(input: {
    outboxId: string;
    dueAt: string;
    error: string;
    claimant?: string;
  }): Promise<boolean>;
  acknowledgeOutbox(input: { outboxId: string; claimant?: string }): Promise<boolean>;
  scheduleAction(input: {
    jobId: string;
    action: ExecutorAction;
    dueAt: string;
    expectedGeneration?: number;
  }): Promise<boolean>;
  getExpiredPredictions?(): Promise<
    Array<{ job_id: string; prediction_id: string; provider: string; model_id: string }>
  >;
  reconcileDeadlines?(limit?: number): Promise<number>;
  claimOutbox(input: {
    claimant: string;
    limit: number;
    claimSeconds: number;
  }): Promise<IClaimedOutboxRow[]>;
}

export interface IClaimedOutboxRow {
  id: string;
  job_id: string;
  action: ExecutorAction;
  generation: number;
  payload: Record<string, unknown>;
}

export interface IExecutorClock {
  now(): number;
}

export interface IAdvanceDependencies {
  rpc: IExecutorRpc;
  prepareExecution?: (execution: IExecutorExecution) => Promise<IExecutorExecution>;
  provider?: IProviderAdapter;
  providerForExecution?: (execution: IExecutorExecution) => IProviderAdapter | undefined;
  inputResolver?: IExecutorInputResolver;
  outputStager?: IExecutorOutputStager;
  clock?: IExecutorClock;
  randomCorrelation?: () => string;
  pollDelayMs?: (attempt: IExecutorAttempt, prediction?: IProviderPrediction) => number;
  outputMaxBytes?: number;
}

export interface IAdvanceRequest {
  jobId: string;
  action: ExecutorAction;
  generation?: number;
  outboxId?: string;
  claimant?: string;
}

export type AdvanceDisposition = 'ack' | 'retry' | 'ignored';

export interface IAdvanceResult {
  disposition: AdvanceDisposition;
  jobId: string;
  action: ExecutorAction;
  stage?: ExecutorStage;
  reason?: string;
  retryAt?: string;
}

export class ExecutorConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutorConfigurationError';
  }
}

export class ExecutorCallbackIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutorCallbackIdentityError';
  }
}

export class ExecutorRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutorRetryableError';
  }
}

/** A provider output cannot be safely delivered and should not be retried forever. */
export class ExecutorOutputRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutorOutputRejectedError';
  }
}

const TERMINAL_STAGES = new Set<ExecutorStage>(['completed', 'failed', 'expired']);
const PROVIDER_TERMINAL_STATUSES = new Set([
  'succeeded',
  'success',
  'completed',
  'failed',
  'canceled',
  'cancelled',
  'aborted',
]);
const PROVIDER_SUCCESS_STATUSES = new Set(['succeeded', 'success', 'completed']);
const DEFAULT_MAX_OUTPUT_BYTES = 128 * 1024 * 1024;
const DEFAULT_POLL_DELAY_MS = 5000;
function defaultPollDelay(attempt: IExecutorAttempt): number {
  return (
    Math.min(30_000, 5000 * 2 ** Math.min(attempt.poll_count ?? 0, 3)) * (0.8 + Math.random() * 0.4)
  );
}
const MAX_POLL_DELAY_MS = 30_000;
const OUTPUT_RETENTION_MS = 24 * 60 * 60 * 1000;

function defaultClock(): IExecutorClock {
  return { now: () => Date.now() };
}

function createCorrelation(): string {
  return randomBytes(32).toString('hex');
}

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function providerStatusIsTerminal(status: string): boolean {
  return PROVIDER_TERMINAL_STATUSES.has(status.toLowerCase());
}

function providerStatusIsSuccessful(status: string): boolean {
  return PROVIDER_SUCCESS_STATUSES.has(status.toLowerCase());
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'executor operation failed';
  }
}

function isPermanentOutputError(error: unknown): boolean {
  if (error instanceof ExecutorOutputRejectedError) return true;
  const message = errorMessage(error).toLowerCase();
  return /provider output (?:url|is not|exceeds|response has no|redirect|mime)|staged output metadata|generated output (?:is not|exceeds|was empty)/i.test(
    message
  );
}

function getRetryAt(
  attempt: IExecutorAttempt,
  prediction: IProviderPrediction | undefined,
  clock: IExecutorClock,
  delayCalculator: (attempt: IExecutorAttempt, prediction?: IProviderPrediction) => number
): string {
  const providerDelay = prediction?.retryAfterMs;
  const delay = Number.isFinite(providerDelay)
    ? Math.max(1000, Number(providerDelay))
    : Math.max(1000, Math.min(MAX_POLL_DELAY_MS, delayCalculator(attempt, prediction)));
  return toIso(clock.now() + delay);
}

function isDeadlineExceeded(execution: IExecutorExecution, clock: IExecutorClock): boolean {
  const deadline = Date.parse(execution.deadline_at);
  return Number.isFinite(deadline) && deadline <= clock.now();
}

async function settleProviderPrediction(
  execution: IExecutorExecution,
  attempt: IExecutorAttempt,
  prediction: IProviderPrediction,
  dependencies: Required<Pick<IAdvanceDependencies, 'rpc' | 'clock' | 'pollDelayMs'>>
): Promise<IAdvanceResult> {
  const normalizedStatus = prediction.status.toLowerCase();

  if (!providerStatusIsTerminal(normalizedStatus)) {
    return {
      disposition: 'retry',
      jobId: execution.job_id,
      action: 'poll',
      stage: 'processing',
      reason: 'provider_prediction_not_terminal',
      retryAt: getRetryAt(attempt, prediction, dependencies.clock, dependencies.pollDelayMs),
    };
  }

  const outputUrl = providerStatusIsSuccessful(normalizedStatus)
    ? extractProviderOutputUrl(prediction.output)
    : undefined;

  if (providerStatusIsSuccessful(normalizedStatus) && !outputUrl) {
    const markedFailed = await dependencies.rpc.markProviderTerminal({
      jobId: execution.job_id,
      attemptId: attempt.attempt_id,
      providerStatus: normalizedStatus,
      failureReason: 'provider_success_without_output',
    });
    if (!markedFailed) {
      throw new ExecutorRetryableError('Database rejected missing provider output transition');
    }
    return {
      disposition: 'ack',
      jobId: execution.job_id,
      action: 'poll',
      stage: 'failed',
      reason: 'provider_success_without_output',
    };
  }

  const accepted = await dependencies.rpc.markProviderTerminal({
    jobId: execution.job_id,
    attemptId: attempt.attempt_id,
    providerStatus: normalizedStatus,
    outputUrl,
    outputMimeType: outputUrl ? detectMimeType(outputUrl) : undefined,
    outputExpiresAt: prediction.completedAt
      ? toIso(Date.parse(prediction.completedAt) + 60 * 60 * 1000)
      : undefined,
    failureReason: stringifyProviderError(prediction.error),
  });

  if (!accepted) {
    const current = await dependencies.rpc.getExecution(execution.job_id);
    if (current && TERMINAL_STAGES.has(current.stage)) {
      return {
        disposition: 'ignored',
        jobId: execution.job_id,
        action: 'poll',
        stage: current.stage,
        reason: 'terminal_transition_already_applied',
      };
    }
    throw new ExecutorRetryableError('Database rejected provider terminal transition');
  }

  return {
    disposition: 'ack',
    jobId: execution.job_id,
    action: 'poll',
    stage: providerStatusIsSuccessful(normalizedStatus) ? 'staging' : 'failed',
    reason: 'provider_terminal_persisted',
  };
}

function extractProviderOutputUrl(output: unknown): string | undefined {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return extractProviderOutputUrl(output[0]);
  if (!output || typeof output !== 'object') return undefined;

  const record = output as Record<string, unknown>;
  const direct = record.url ?? record.href;
  if (typeof direct === 'string') return direct;
  if (typeof direct === 'function') {
    const result = direct();
    return typeof result === 'string' ? result : undefined;
  }
  return undefined;
}

function stringifyProviderError(error: unknown): string | undefined {
  if (error === undefined || error === null) return undefined;
  if (typeof error === 'string') return error.slice(0, 500);
  try {
    return JSON.stringify(error).slice(0, 500);
  } catch {
    return 'provider_failed';
  }
}

function detectMimeType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.heic') || lower.includes('.heif')) return 'image/heic';
  return 'image/jpeg';
}

async function requireExecutionInput(
  execution: IExecutorExecution,
  dependencies: IAdvanceDependencies
): Promise<string> {
  if (!dependencies.inputResolver) {
    throw new ExecutorConfigurationError('Executor input resolver is not configured');
  }
  return dependencies.inputResolver.resolve(execution);
}

function requireProvider(
  dependencies: IAdvanceDependencies,
  execution: IExecutorExecution
): IProviderAdapter {
  const provider = dependencies.providerForExecution?.(execution) ?? dependencies.provider;
  if (!provider) {
    throw new ExecutorConfigurationError('Executor provider adapter is not configured');
  }
  if (provider.providerName !== execution.provider) {
    throw new ExecutorConfigurationError(
      `Executor provider adapter does not match ${execution.provider}`
    );
  }
  return provider;
}

async function startOrResumePrediction(
  execution: IExecutorExecution,
  attempt: IExecutorAttempt,
  dependencies: IAdvanceDependencies,
  action: ExecutorAction
): Promise<IAdvanceResult> {
  const provider = requireProvider(dependencies, execution);
  const clock = dependencies.clock ?? defaultClock();
  const pollDelayMs = dependencies.pollDelayMs ?? defaultPollDelay;

  if (attempt.provider_prediction_id) {
    if (action === 'advance' || action === 'reconcile') {
      return {
        disposition: 'retry',
        jobId: execution.job_id,
        action: 'poll',
        stage: 'processing',
        reason: 'prediction_already_bound',
        retryAt: getRetryAt(attempt, undefined, clock, pollDelayMs),
      };
    }

    let prediction: IProviderPrediction;
    try {
      prediction = await provider.getPrediction(
        attempt.provider_prediction_id,
        AbortSignal.timeout(
          Math.max(1, Math.min(10_000, Date.parse(execution.deadline_at) - clock.now()))
        )
      );
    } catch (error) {
      const retryAfterMs =
        typeof error === 'object' && error !== null && 'retryAfterMs' in error
          ? Number(error.retryAfterMs)
          : undefined;
      return {
        disposition: 'retry',
        jobId: execution.job_id,
        action: 'poll',
        stage: 'processing',
        reason: 'provider_status_unavailable',
        retryAt: getRetryAt(
          attempt,
          retryAfterMs === undefined
            ? undefined
            : { id: attempt.provider_prediction_id, status: 'processing', retryAfterMs },
          clock,
          pollDelayMs
        ),
      };
    }
    return settleProviderPrediction(execution, attempt, prediction, {
      rpc: dependencies.rpc,
      clock,
      pollDelayMs,
    });
  }

  if (attempt.submission_state === 'unknown') {
    if (action !== 'reconcile') {
      return {
        disposition: 'ack',
        jobId: execution.job_id,
        action,
        stage: 'submission_unknown',
        reason: 'provider_creation_is_ambiguous',
      };
    }

    const inputUrl = await requireExecutionInput(execution, dependencies);
    const recovered = await provider.findPredictionForAttempt(execution, attempt, inputUrl);
    if (!recovered) {
      if (isDeadlineExceeded(execution, clock)) {
        await dependencies.rpc.settleFailure({
          jobId: execution.job_id,
          failureReason: 'provider_prediction_not_found_before_deadline',
          expire: true,
        });
        return {
          disposition: 'ack',
          jobId: execution.job_id,
          action,
          stage: 'expired',
          reason: 'provider_prediction_not_found_before_deadline',
        };
      }
      return {
        disposition: 'retry',
        jobId: execution.job_id,
        action,
        stage: 'submission_unknown',
        reason: 'provider_prediction_not_found_yet',
        retryAt: toIso(clock.now() + DEFAULT_POLL_DELAY_MS),
      };
    }

    if (!provider.matchesAttempt(recovered, execution, attempt, inputUrl)) {
      throw new ExecutorCallbackIdentityError(
        'Recovered prediction does not match the stored attempt'
      );
    }

    const bound = await dependencies.rpc.bindPrediction({
      jobId: execution.job_id,
      attemptId: attempt.attempt_id,
      predictionId: recovered.id,
      providerStatus: recovered.status,
      nextPollAt: getRetryAt(attempt, recovered, clock, pollDelayMs),
    });
    if (!bound) {
      const current = await dependencies.rpc.getExecution(execution.job_id);
      if (current && TERMINAL_STAGES.has(current.stage)) {
        return {
          disposition: 'ignored',
          jobId: execution.job_id,
          action,
          stage: current.stage,
          reason: 'prediction_recovery_raced_terminal_state',
        };
      }
      throw new ExecutorRetryableError('Database rejected recovered prediction binding');
    }

    const reboundAttempt = { ...attempt, provider_prediction_id: recovered.id };
    if (providerStatusIsTerminal(recovered.status)) {
      return settleProviderPrediction(execution, reboundAttempt, recovered, {
        rpc: dependencies.rpc,
        clock,
        pollDelayMs,
      });
    }
    return {
      disposition: 'ack',
      jobId: execution.job_id,
      action,
      stage: 'processing',
      reason: 'prediction_recovered',
    };
  }

  if (attempt.may_create !== true) {
    // A persisted create lease is not evidence that the provider rejected it.
    // Only the transaction that inserted the attempt receives creation authority.
    const due = Date.parse(execution.submission_deadline_at ?? execution.deadline_at);
    if (due <= clock.now()) {
      await dependencies.rpc.markSubmissionUnknown({
        jobId: execution.job_id,
        attemptId: attempt.attempt_id,
        failureReason: 'submission_lease_expired',
      });
    }
    return {
      disposition: 'retry',
      jobId: execution.job_id,
      action: 'reconcile',
      stage: due <= clock.now() ? 'submission_unknown' : 'submitting',
      reason: 'creation_owned_by_original_task',
      retryAt: toIso(Math.max(clock.now() + 1000, due)),
    };
  }

  const inputUrl = await requireExecutionInput(execution, dependencies);
  let prediction: IProviderPrediction;
  try {
    prediction = await provider.createPrediction(
      execution,
      attempt,
      inputUrl,
      AbortSignal.timeout(
        Math.max(1, Math.min(900_000, Date.parse(execution.deadline_at) - clock.now()))
      )
    );
  } catch (error) {
    const isAmbiguous =
      typeof error === 'object' &&
      error !== null &&
      'ambiguous' in error &&
      (error as { ambiguous?: unknown }).ambiguous === true;

    if (isAmbiguous) {
      const markedUnknown = await dependencies.rpc.markSubmissionUnknown({
        jobId: execution.job_id,
        attemptId: attempt.attempt_id,
        failureReason: errorMessage(error).slice(0, 500),
      });
      if (!markedUnknown)
        throw new ExecutorRetryableError('Database rejected ambiguous submission state');
      return {
        disposition: 'ack',
        jobId: execution.job_id,
        action,
        stage: 'submission_unknown',
        reason: 'provider_creation_outcome_unknown',
      };
    }

    const markedFailed = await dependencies.rpc.markProviderTerminal({
      jobId: execution.job_id,
      attemptId: attempt.attempt_id,
      providerStatus: 'failed',
      failureReason: errorMessage(error).slice(0, 500),
    });
    if (!markedFailed) {
      throw new ExecutorRetryableError('Database rejected provider creation failure transition');
    }
    return {
      disposition: 'ack',
      jobId: execution.job_id,
      action,
      stage: 'failed',
      reason: 'provider_creation_failed',
    };
  }

  const nextPollAt = getRetryAt(attempt, prediction, clock, pollDelayMs);
  const bound = await dependencies.rpc.bindPrediction({
    jobId: execution.job_id,
    attemptId: attempt.attempt_id,
    predictionId: prediction.id,
    providerStatus: prediction.status,
    nextPollAt,
  });
  if (!bound) {
    const current = await dependencies.rpc.getExecution(execution.job_id);
    if (current && TERMINAL_STAGES.has(current.stage)) {
      return {
        disposition: 'ignored',
        jobId: execution.job_id,
        action,
        stage: current.stage,
        reason: 'prediction_binding_raced_terminal_state',
      };
    }
    throw new ExecutorRetryableError('Database rejected provider prediction binding');
  }

  if (providerStatusIsTerminal(prediction.status)) {
    return settleProviderPrediction(
      execution,
      { ...attempt, provider_prediction_id: prediction.id },
      prediction,
      {
        rpc: dependencies.rpc,
        clock,
        pollDelayMs,
      }
    );
  }

  return {
    disposition: 'ack',
    jobId: execution.job_id,
    action,
    stage: 'processing',
    reason: 'prediction_bound',
  };
}

async function stagePrediction(
  execution: IExecutorExecution,
  dependencies: IAdvanceDependencies
): Promise<IAdvanceResult> {
  if (!dependencies.outputStager) {
    throw new ExecutorConfigurationError('Executor output stager is not configured');
  }
  const attempt = await dependencies.rpc.getLatestTerminalAttempt(execution.job_id);
  if (!attempt?.provider_output_url) {
    const settled = await dependencies.rpc.settleFailure({
      jobId: execution.job_id,
      failureReason: 'provider_output_missing_during_staging',
    });
    if (!settled) throw new ExecutorRetryableError('Database rejected missing output settlement');
    return {
      disposition: 'ack',
      jobId: execution.job_id,
      action: 'stage',
      stage: 'failed',
      reason: 'provider_output_missing_during_staging',
    };
  }

  let staged: IStagedExecutorOutput;
  try {
    staged = await dependencies.outputStager.stage(execution, attempt);
  } catch (error) {
    if (!isPermanentOutputError(error)) throw error;
    const settled = await dependencies.rpc.settleFailure({
      jobId: execution.job_id,
      failureReason: 'output_staging_rejected',
    });
    if (!settled)
      throw new ExecutorRetryableError('Database rejected output staging failure settlement');
    return {
      disposition: 'ack',
      jobId: execution.job_id,
      action: 'stage',
      stage: 'failed',
      reason: 'output_staging_rejected',
    };
  }
  if (staged.sizeBytes > (dependencies.outputMaxBytes ?? DEFAULT_MAX_OUTPUT_BYTES)) {
    const settled = await dependencies.rpc.settleFailure({
      jobId: execution.job_id,
      failureReason: 'output_staging_rejected',
    });
    if (!settled) throw new ExecutorRetryableError('Database rejected oversized output settlement');
    return {
      disposition: 'ack',
      jobId: execution.job_id,
      action: 'stage',
      stage: 'failed',
      reason: 'output_staging_rejected',
    };
  }

  const markedReady = await dependencies.rpc.markReady({
    jobId: execution.job_id,
    storagePath: staged.storagePath,
    outputMimeType: staged.mimeType,
    outputSizeBytes: staged.sizeBytes,
    outputExpiresAt: staged.expiresAt,
    deliveryTokenHash: staged.deliveryTokenHash,
    outputWidth: staged.width,
    outputHeight: staged.height,
  });
  if (!markedReady) {
    const current = await dependencies.rpc.getExecution(execution.job_id);
    if (current && TERMINAL_STAGES.has(current.stage)) {
      return {
        disposition: 'ignored',
        jobId: execution.job_id,
        action: 'stage',
        stage: current.stage,
        reason: 'staging_raced_terminal_state',
      };
    }
    if (current?.stage === 'ready' || current?.stage === 'completed') {
      return {
        disposition: 'ignored',
        jobId: execution.job_id,
        action: 'stage',
        stage: current.stage,
        reason: 'output_already_staged',
      };
    }
    throw new ExecutorRetryableError('Database rejected staged output');
  }
  return {
    disposition: 'ack',
    jobId: execution.job_id,
    action: 'stage',
    stage: 'ready',
    reason: 'output_staged',
  };
}

async function advanceExecutionInternal(
  request: IAdvanceRequest,
  dependencies: IAdvanceDependencies
): Promise<IAdvanceResult> {
  let execution = await dependencies.rpc.getExecution(request.jobId);
  if (!execution) {
    return {
      disposition: 'ignored',
      jobId: request.jobId,
      action: request.action,
      reason: 'execution_not_found',
    };
  }

  if (TERMINAL_STAGES.has(execution.stage)) {
    return {
      disposition: 'ignored',
      jobId: execution.job_id,
      action: request.action,
      stage: execution.stage,
      reason: 'execution_already_terminal',
    };
  }

  if (
    request.generation !== undefined &&
    Number.isInteger(request.generation) &&
    request.generation !== execution.lease_generation
  ) {
    return {
      disposition: 'ignored',
      jobId: execution.job_id,
      action: request.action,
      stage: execution.stage,
      reason: 'stale_execution_generation',
    };
  }

  const clock = dependencies.clock ?? defaultClock();
  // A ready output remains deliverable until its own retention deadline. The
  // admission deadline governs provider execution, not a slow customer read.
  if (execution.stage !== 'ready' && isDeadlineExceeded(execution, clock)) {
    const active = await dependencies.rpc.getActiveAttempt(execution.job_id);
    if (active?.provider_prediction_id) {
      await requireProvider(dependencies, execution)
        .cancelPrediction?.(active.provider_prediction_id, AbortSignal.timeout(5000))
        .catch(() => undefined);
    }
    const settled = await dependencies.rpc.settleFailure({
      jobId: execution.job_id,
      failureReason: 'durable_execution_deadline_exceeded',
      expire: true,
    });
    if (!settled) {
      const current = await dependencies.rpc.getExecution(execution.job_id);
      if (current && TERMINAL_STAGES.has(current.stage)) {
        return {
          disposition: 'ignored',
          jobId: execution.job_id,
          action: request.action,
          stage: current.stage,
          reason: 'deadline_settlement_raced_terminal_state',
        };
      }
      throw new ExecutorRetryableError('Database rejected execution deadline settlement');
    }
    return {
      disposition: 'ack',
      jobId: execution.job_id,
      action: request.action,
      stage: 'expired',
      reason: 'durable_execution_deadline_exceeded',
    };
  }

  if (request.action === 'expire_output') {
    if (
      execution.stage !== 'ready' ||
      !execution.output_expires_at ||
      Date.parse(execution.output_expires_at) > clock.now()
    ) {
      return {
        disposition: 'ignored',
        jobId: execution.job_id,
        action: request.action,
        stage: execution.stage,
        reason: 'output_expiration_not_due',
      };
    }
    const settled = await dependencies.rpc.settleFailure({
      jobId: execution.job_id,
      failureReason: 'durable_output_expired',
      expire: true,
    });
    if (!settled) throw new ExecutorRetryableError('Database rejected expired output settlement');
    return {
      disposition: 'ack',
      jobId: execution.job_id,
      action: request.action,
      stage: 'expired',
      reason: 'durable_output_expired',
    };
  }

  if (execution.stage === 'ready')
    return {
      disposition: 'ignored',
      jobId: execution.job_id,
      action: request.action,
      stage: 'ready',
      reason: 'output_already_staged',
    };
  if (request.action === 'stage' && execution.stage === 'staging') {
    return stagePrediction(execution, dependencies);
  }

  if (
    request.action === 'reconcile' &&
    !['submission_unknown', 'submitting'].includes(execution.stage)
  ) {
    if (execution.stage === 'processing') {
      return {
        disposition: 'retry',
        jobId: execution.job_id,
        action: 'poll',
        stage: execution.stage,
        reason: 'reconcile_found_bound_prediction',
        retryAt: toIso(clock.now() + DEFAULT_POLL_DELAY_MS),
      };
    }
    return {
      disposition: 'ignored',
      jobId: execution.job_id,
      action: request.action,
      stage: execution.stage,
      reason: 'reconcile_not_applicable',
    };
  }

  let attempt = await dependencies.rpc.getActiveAttempt(execution.job_id);
  if (!attempt) {
    if (execution.provider === 'deferred') {
      if (!dependencies.prepareExecution)
        throw new ExecutorConfigurationError('Deferred analysis is not configured');
      execution = await dependencies.prepareExecution(execution);
      if (TERMINAL_STAGES.has(execution.stage))
        return {
          disposition: 'ack',
          jobId: execution.job_id,
          action: request.action,
          stage: execution.stage,
          reason: 'deferred_plan_rejected',
        };
    }
    if (request.action === 'poll') {
      throw new ExecutorRetryableError('No active attempt exists for poll action');
    }
    const correlation = (dependencies.randomCorrelation ?? createCorrelation)();
    attempt = await dependencies.rpc.createAttempt({
      jobId: execution.job_id,
      provider: execution.provider,
      modelId: execution.resolved_model_id,
      modelVersion: execution.model_version,
      callbackCorrelation: correlation,
    });
    if (!attempt) {
      const current = await dependencies.rpc.getExecution(execution.job_id);
      if (current && TERMINAL_STAGES.has(current.stage)) {
        return {
          disposition: 'ignored',
          jobId: execution.job_id,
          action: request.action,
          stage: current.stage,
          reason: 'attempt_creation_raced_terminal_state',
        };
      }
      throw new ExecutorRetryableError('Database did not return a persisted attempt');
    }
  }

  return startOrResumePrediction(execution, attempt, dependencies, request.action);
}

/**
 * Advance one durable executor action. This function is deliberately free of
 * Supabase, HTTP-server, and provider SDK imports; all side effects arrive via
 * typed dependencies so a crashed/retried task can be tested deterministically.
 */
export async function advanceExecution(
  request: IAdvanceRequest,
  dependencies: IAdvanceDependencies
): Promise<IAdvanceResult> {
  return advanceExecutionInternal(request, dependencies);
}

export const advanceOutboxAction = advanceExecution;

export interface IReplicateCallbackInput {
  correlation: string;
  predictionId: string;
}

/**
 * Handle a signed callback after the HTTP layer has verified its signature.
 * The callback body is only a hint: the provider is read authoritatively before
 * an unknown prediction ID can be bound to an attempt.
 */
export async function handleReplicateCallback(
  input: IReplicateCallbackInput,
  dependencies: IAdvanceDependencies
): Promise<IAdvanceResult> {
  const attempt = await dependencies.rpc.findAttemptByCorrelation(input.correlation);
  if (!attempt) {
    return {
      disposition: 'ignored',
      jobId: '',
      action: 'poll',
      reason: 'callback_correlation_not_found',
    };
  }

  const execution = await dependencies.rpc.getExecution(attempt.job_id);
  if (!execution) {
    return {
      disposition: 'ignored',
      jobId: attempt.job_id,
      action: 'poll',
      reason: 'callback_execution_not_found',
    };
  }
  if (TERMINAL_STAGES.has(execution.stage)) {
    return {
      disposition: 'ignored',
      jobId: execution.job_id,
      action: 'poll',
      stage: execution.stage,
      reason: 'callback_after_terminal_state',
    };
  }

  if (isDeadlineExceeded(execution, dependencies.clock ?? defaultClock())) {
    await dependencies.rpc.settleFailure({
      jobId: execution.job_id,
      failureReason: 'durable_execution_deadline_exceeded',
      expire: true,
    });
    return {
      disposition: 'ignored',
      jobId: execution.job_id,
      action: 'poll',
      stage: 'expired',
      reason: 'late_callback',
    };
  }
  const provider = requireProvider(dependencies, execution);
  const inputUrl = await requireExecutionInput(execution, dependencies);
  const prediction = await provider.getPrediction(input.predictionId);
  if (prediction.id !== input.predictionId) {
    throw new ExecutorCallbackIdentityError('Provider returned a different prediction ID');
  }
  if (!provider.matchesAttempt(prediction, execution, attempt, inputUrl)) {
    throw new ExecutorCallbackIdentityError('Provider callback does not match the stored attempt');
  }

  if (attempt.provider_prediction_id && attempt.provider_prediction_id !== prediction.id) {
    throw new ExecutorCallbackIdentityError(
      'Callback prediction conflicts with the stored prediction'
    );
  }

  if (!attempt.provider_prediction_id) {
    const bound = await dependencies.rpc.bindPrediction({
      jobId: execution.job_id,
      attemptId: attempt.attempt_id,
      predictionId: prediction.id,
      providerStatus: prediction.status,
      nextPollAt: toIso((dependencies.clock ?? defaultClock()).now() + DEFAULT_POLL_DELAY_MS),
    });
    if (!bound) {
      const current = await dependencies.rpc.getExecution(execution.job_id);
      if (current && TERMINAL_STAGES.has(current.stage)) {
        return {
          disposition: 'ignored',
          jobId: execution.job_id,
          action: 'poll',
          stage: current.stage,
          reason: 'callback_binding_raced_terminal_state',
        };
      }
      if (current && ['staging', 'ready'].includes(current.stage)) {
        const terminal = await dependencies.rpc.getLatestTerminalAttempt(execution.job_id);
        if (
          terminal?.attempt_id === attempt.attempt_id &&
          terminal.provider_prediction_id === prediction.id
        ) {
          return {
            disposition: 'ignored',
            jobId: execution.job_id,
            action: 'poll',
            stage: current.stage,
            reason: 'duplicate_callback_already_persisted',
          };
        }
      }
      throw new ExecutorRetryableError('Database rejected callback prediction binding');
    }
  }

  const clock = dependencies.clock ?? defaultClock();
  const pollDelayMs = dependencies.pollDelayMs ?? defaultPollDelay;
  return settleProviderPrediction(
    execution,
    { ...attempt, provider_prediction_id: prediction.id },
    prediction,
    {
      rpc: dependencies.rpc,
      clock,
      pollDelayMs,
    }
  );
}

export interface IOutputStorage {
  upload(
    storagePath: string,
    body: ReadableStream<Uint8Array>,
    options: { contentType: string; cacheControl: string; upsert: boolean }
  ): Promise<void>;
  stat(storagePath: string): Promise<{ sizeBytes: number; mimeType?: string } | null>;
}

export interface IStreamingOutputStagerOptions {
  storage: IOutputStorage;
  fetch?: typeof fetch;
  now?: () => number;
  maxBytes?: number;
  retentionMs?: number;
  maxRedirects?: number;
  allowedHosts?: readonly string[];
}

function isAllowedOutputHost(hostname: string, allowedHosts: readonly string[]): boolean {
  const normalized = hostname.toLowerCase();
  return allowedHosts.some(host => {
    const suffix = host.toLowerCase();
    return normalized === suffix || normalized.endsWith(`.${suffix}`);
  });
}

function assertSafeProviderUrl(value: string, allowedHosts: readonly string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ExecutorOutputRejectedError('Provider output URL is invalid');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== '443') ||
    !isAllowedOutputHost(parsed.hostname, allowedHosts)
  ) {
    throw new ExecutorOutputRejectedError('Provider output URL host is not allowed');
  }
  return parsed;
}

async function fetchWithCheckedRedirects(
  value: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  allowedHosts: readonly string[],
  maxRedirects: number
): Promise<Response> {
  let url = assertSafeProviderUrl(value, allowedHosts);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const response = await fetcher(url, { redirect: 'manual', signal });
    if (response.status < 300 || response.status >= 400) return response;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location || redirect === maxRedirects) {
      throw new ExecutorOutputRejectedError('Provider output redirect chain is invalid');
    }
    url = assertSafeProviderUrl(new URL(location, url).toString(), allowedHosts);
  }
  throw new ExecutorOutputRejectedError('Provider output redirect chain is too long');
}

function normalizeOutputMimeType(header: string | null, _outputUrl: string): string {
  const declared = header?.split(';', 1)[0]?.trim().toLowerCase();
  if (declared) {
    if (!declared.startsWith('image/'))
      throw new ExecutorOutputRejectedError('Provider output is not an image');
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'].includes(declared)) {
      throw new ExecutorOutputRejectedError(
        `Provider output MIME type is not supported: ${declared}`
      );
    }
    return declared === 'image/jpg' ? 'image/jpeg' : declared;
  }
  throw new ExecutorOutputRejectedError('Provider output MIME type is missing');
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic') return 'heic';
  return 'jpg';
}

/**
 * Create a bounded, redirect-checked staging implementation. Supabase Storage
 * receives the provider response stream directly; no full output buffer is
 * created in the executor process.
 */
export function createStreamingOutputStager(
  options: IStreamingOutputStagerOptions
): IExecutorOutputStager {
  const fetcher = options.fetch ?? fetchPublicOutput;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const retentionMs = options.retentionMs ?? OUTPUT_RETENTION_MS;
  const maxRedirects = options.maxRedirects ?? 3;
  const allowedHosts = options.allowedHosts ?? ['replicate.delivery', 'replicate.com'];
  const clock = options.now ?? (() => Date.now());

  return {
    async stage(execution, attempt, signal) {
      const outputUrl = attempt.provider_output_url;
      if (!outputUrl) throw new ExecutorOutputRejectedError('Provider output URL is missing');
      const boundedSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(120_000)])
        : AbortSignal.timeout(120_000);
      const response = await fetchWithCheckedRedirects(
        outputUrl,
        fetcher,
        boundedSignal,
        allowedHosts,
        maxRedirects
      );
      if (!response.ok) {
        if (
          response.status >= 400 &&
          response.status < 500 &&
          ![408, 429].includes(response.status)
        ) {
          throw new ExecutorOutputRejectedError(
            `Provider output fetch failed with HTTP ${response.status}`
          );
        }
        throw new Error(`Provider output fetch failed with HTTP ${response.status}`);
      }
      const contentLength = response.headers.get('content-length');
      if (contentLength !== null) {
        const length = Number(contentLength);
        if (!Number.isSafeInteger(length) || length <= 0 || length > maxBytes) {
          await response.body?.cancel();
          throw new ExecutorOutputRejectedError('Provider output exceeds the executor byte limit');
        }
      }
      if (!response.body)
        throw new ExecutorOutputRejectedError('Provider output response has no body');

      const mimeType = normalizeOutputMimeType(response.headers.get('content-type'), outputUrl);
      let observedBytes = 0;
      const prefix = Buffer.alloc(64 * 1024);
      let prefixBytes = 0;
      const countedStream = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            observedBytes += chunk.byteLength;
            if (observedBytes > maxBytes) {
              controller.error(
                new ExecutorOutputRejectedError('Provider output exceeds the executor byte limit')
              );
              return;
            }
            const count = Math.min(chunk.byteLength, prefix.length - prefixBytes);
            if (count > 0) {
              prefix.set(chunk.subarray(0, count), prefixBytes);
              prefixBytes += count;
            }
            controller.enqueue(chunk);
          },
        })
      );

      // Keep the object name deterministic for this provider attempt. The
      // ready-state RPC validates this exact user/job/attempt-owned path before
      // recording the output, and a retry of the same attempt converges on the
      // same object key without allowing another attempt to overwrite it.
      const storagePath = `${execution.user_id}/outputs/${execution.job_id}/${attempt.attempt_id}.${extensionForMimeType(mimeType)}`;
      try {
        const existing = await options.storage.stat(storagePath);
        if (existing) {
          await countedStream.pipeTo(new WritableStream({ write() {} }));
        } else {
          await options.storage.upload(storagePath, countedStream, {
            contentType: mimeType,
            cacheControl: String(Math.floor(retentionMs / 1000)),
            upsert: false,
          });
        }
      } catch (error) {
        await countedStream.cancel().catch(() => undefined);
        throw error;
      }
      if (observedBytes <= 0 || observedBytes > maxBytes) {
        throw new ExecutorOutputRejectedError('Provider output size is invalid');
      }

      const stored = await options.storage.stat(storagePath);
      if (!stored) throw new ExecutorRetryableError('Staged output metadata is not yet available');
      if (
        stored.sizeBytes !== observedBytes ||
        stored.sizeBytes > maxBytes ||
        stored.mimeType !== mimeType ||
        (contentLength !== null && Number(contentLength) !== observedBytes)
      ) {
        throw new ExecutorOutputRejectedError(
          'Staged output metadata does not match the streamed bytes'
        );
      }
      const encodedPrefix = prefix.subarray(0, prefixBytes).toString('base64');
      const magic = validateMagicBytes(encodedPrefix);
      if (!magic.valid || magic.detectedMimeType !== mimeType)
        throw new ExecutorOutputRejectedError(
          'Provider output MIME does not match image signature'
        );
      let dimensions = decodeImageDimensions(encodedPrefix);
      if (
        !dimensions &&
        mimeType === 'image/webp' &&
        prefix.subarray(12, 16).toString() === 'VP8X' &&
        prefixBytes >= 30
      ) {
        dimensions = { width: 1 + prefix.readUIntLE(24, 3), height: 1 + prefix.readUIntLE(27, 3) };
      }
      if (!dimensions && mimeType === 'image/heic') {
        const index = prefix.indexOf('ispe');
        if (index >= 4 && index + 16 <= prefixBytes)
          dimensions = {
            width: prefix.readUInt32BE(index + 8),
            height: prefix.readUInt32BE(index + 12),
          };
      }
      if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0)
        throw new ExecutorOutputRejectedError('Provider output image dimensions are invalid');

      const deliveryTokenHash = createHash('sha256').update(randomBytes(32)).digest('hex');
      return {
        storagePath,
        mimeType,
        sizeBytes: stored.sizeBytes,
        width: dimensions.width,
        height: dimensions.height,
        expiresAt: new Date(clock() + retentionMs).toISOString(),
        deliveryTokenHash,
      };
    },
  };
}

export { assertSafeProviderUrl, extractProviderOutputUrl, normalizeOutputMimeType };
