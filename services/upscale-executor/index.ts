import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { serverEnv } from '@shared/config/env';

import {
  advanceExecution,
  createStreamingOutputStager,
  ExecutorCallbackIdentityError,
  ExecutorConfigurationError,
  handleReplicateCallback,
  type ExecutorAction,
  type IClaimedOutboxRow,
  type IExecutorAttempt,
  type IExecutorExecution,
  type IExecutorInputResolver,
  type IExecutorOutputStager,
  type IExecutorRpc,
  type IOutputStorage,
  type IProviderAdapter,
} from './advance';
import { dispatchDueOutbox } from './dispatch';
import { createOidcAuthorizer } from './oidc';
import { createExecutorHealthProbe } from './health';
import { createExecutionPreparer } from './prepare';
import { ReplicateAdapter, type IReplicateWebhookHeaders } from './replicate-adapter';
import { GeminiAdapter, type IGeminiPublishedOutput } from './gemini-adapter';

const EXECUTOR_ACTIONS = new Set<ExecutorAction>([
  'advance',
  'poll',
  'reconcile',
  'stage',
  'expire_output',
]);
const DEFAULT_REQUEST_BODY_BYTES = 1024 * 1024;
const DEFAULT_CALLBACK_BODY_BYTES = 512 * 1024;
const DEFAULT_WAKE_BODY_BYTES = 64 * 1024;
const DEFAULT_OUTPUT_MAX_BYTES = 128 * 1024 * 1024;
const AUTH_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
const GEMINI_OUTPUT_SIGNED_URL_SECONDS = 24 * 60 * 60;
declare const __UPSCALE_BUILD_ID__: string | undefined;
const artifactBuildId =
  typeof __UPSCALE_BUILD_ID__ === 'undefined' ? undefined : __UPSCALE_BUILD_ID__;
const EXECUTOR_HEALTH_INTERVAL_MS = 60_000;

export interface IExecutorRpcResult<T> {
  data: T | null;
  error: { message: string } | null;
}

/** Minimal database surface used by the default RPC adapter. */
export interface IExecutorDatabaseQuery {
  select(columns?: string): IExecutorDatabaseQuery;
  eq(column: string, value: unknown): IExecutorDatabaseQuery;
  in(column: string, values: readonly unknown[]): IExecutorDatabaseQuery;
  order(column: string, options?: { ascending?: boolean }): IExecutorDatabaseQuery;
  limit(count: number): IExecutorDatabaseQuery;
  maybeSingle<T = unknown>(): Promise<IExecutorRpcResult<T>>;
}

export interface IExecutorDatabase {
  rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<IExecutorRpcResult<T>>;
  from(table: string): IExecutorDatabaseQuery;
  storage: IExecutorStorageClient;
}

export interface IExecutorStorageBucket {
  createSignedUrl(
    path: string,
    expiresIn: number
  ): Promise<IExecutorRpcResult<{ signedUrl: string }>>;
  upload(
    path: string,
    body: ReadableStream<Uint8Array>,
    options: { contentType: string; cacheControl: string; upsert: boolean }
  ): Promise<IExecutorRpcResult<unknown>>;
  list(
    path?: string,
    options?: { limit?: number; search?: string }
  ): Promise<IExecutorRpcResult<Array<{ name: string; metadata?: Record<string, unknown> }>>>;
}

export interface IExecutorStorageClient {
  from(bucket: string): IExecutorStorageBucket;
}

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Executor database row is missing ${field}`);
  }
  return value;
}

function normalizeExecution(value: unknown): IExecutorExecution | null {
  const row = asRecord(value);
  if (!row) return null;
  const config = row.config ?? row.request_config ?? {};
  const configRecord = asRecord(config) ?? {};
  return {
    ...row,
    lease_generation: Number(row.lease_generation),
    credits_reserved: Number(row.credits_reserved),
    input_storage_path: row.input_storage_path ?? row.input_object_path,
    quality_tier: row.quality_tier ?? row.requested_quality_tier,
    scale: row.scale ?? configRecord.scale ?? 2,
    config,
    billing_model_id: row.billing_model_id,
    resolved_model_id: row.resolved_model_id ?? row.billing_model_id,
    provider: row.provider ?? row.resolved_provider,
    model_version: row.model_version ?? row.resolved_model_version ?? null,
    output_storage_path: row.output_storage_path ?? row.output_object_path ?? null,
    output_mime_type: row.output_mime_type ?? null,
    output_size_bytes: row.output_size_bytes ?? null,
    output_expires_at: row.output_expires_at ?? null,
    failure_reason: row.failure_reason ?? null,
  } as unknown as IExecutorExecution;
}

function normalizeAttempt(value: unknown): IExecutorAttempt | null {
  const row = asRecord(value);
  if (!row) return null;
  const rawState = row.submission_state;
  const submissionState =
    rawState === 'persisted' || rawState === 'creating'
      ? 'pending'
      : rawState === 'bound' || rawState === 'processing'
        ? 'accepted'
        : rawState === 'failed'
          ? 'terminal'
          : rawState;
  return {
    ...row,
    may_create: row.may_create === true,
    poll_count: Number(row.poll_count ?? 0),
    attempt_id: row.attempt_id ?? row.id,
    model_id: row.model_id ?? '',
    model_version: row.model_version ?? null,
    submission_state: submissionState,
    provider_output_url: row.provider_output_url ?? null,
    provider_output_mime_type: row.provider_output_mime_type ?? null,
    provider_output_expires_at: row.provider_output_expires_at ?? null,
    failure_reason: row.failure_reason ?? null,
    next_poll_at: row.next_poll_at ?? null,
  } as unknown as IExecutorAttempt;
}

function normalizeOutbox(value: unknown): IClaimedOutboxRow | null {
  const row = asRecord(value);
  if (!row) return null;
  const action = row.action;
  if (!EXECUTOR_ACTIONS.has(action as ExecutorAction)) return null;
  const id = row.id ?? row.outbox_id;
  if (typeof id !== 'string' && typeof id !== 'number') return null;
  return {
    id: String(id),
    job_id: requiredString(row.job_id, 'outbox job ID'),
    action: action as ExecutorAction,
    generation: Number(row.generation),
    payload: (asRecord(row.payload) ?? {}) as Record<string, unknown>,
  };
}

function databaseError(name: string, error: { message: string } | null): Error | null {
  return error ? new Error(`${name} failed: ${error.message}`) : null;
}

function booleanResult(data: unknown): boolean {
  if (typeof data === 'boolean') return data;
  if (Array.isArray(data)) return data[0] === true;
  return false;
}

async function callBooleanRpc(
  database: IExecutorDatabase,
  name: string,
  args: Record<string, unknown>
): Promise<boolean> {
  const result = await database.rpc<unknown>(name, args);
  const error = databaseError(name, result.error);
  if (error) throw error;
  return booleanResult(result.data);
}

/**
 * Default Supabase implementation. It is constructed lazily by the standalone
 * bootstrap; importing this module never creates a client or performs a query.
 */
export function createSupabaseExecutorRpc(database: IExecutorDatabase): IExecutorRpc {
  return {
    async getExecution(jobId) {
      const result = await database
        .from('upscale_executions')
        .select('*')
        .eq('job_id', jobId)
        .maybeSingle<unknown>();
      const error = databaseError('get upscale execution', result.error);
      if (error) throw error;
      return normalizeExecution(result.data);
    },

    async findAttemptByCorrelation(correlation) {
      const result = await database
        .from('upscale_attempts')
        .select('*')
        .eq('callback_correlation', correlation)
        .maybeSingle<unknown>();
      const error = databaseError('find upscale attempt', result.error);
      if (error) throw error;
      return normalizeAttempt(result.data);
    },

    async getActiveAttempt(jobId) {
      const result = await database
        .from('upscale_attempts')
        .select('*')
        .eq('job_id', jobId)
        .in('submission_state', ['persisted', 'creating', 'unknown', 'bound', 'processing'])
        .order('ordinal', { ascending: false })
        .limit(1)
        .maybeSingle<unknown>();
      const error = databaseError('get active upscale attempt', result.error);
      if (error) throw error;
      return normalizeAttempt(result.data);
    },

    async getLatestTerminalAttempt(jobId) {
      const result = await database
        .from('upscale_attempts')
        .select('*')
        .eq('job_id', jobId)
        .eq('submission_state', 'terminal')
        .order('ordinal', { ascending: false })
        .limit(1)
        .maybeSingle<unknown>();
      const error = databaseError('get terminal upscale attempt', result.error);
      if (error) throw error;
      return normalizeAttempt(result.data);
    },

    async createAttempt(input) {
      const result = await database.rpc<unknown>('create_upscale_attempt', {
        p_job_id: input.jobId,
        p_provider: input.provider,
        p_model_id: input.modelId,
        p_model_version: input.modelVersion,
        p_callback_correlation: input.callbackCorrelation,
      });
      const error = databaseError('create upscale attempt', result.error);
      if (error) throw error;
      const row = firstRow(result.data);
      const attempt = normalizeAttempt(row);
      if (!attempt) return null;
      return {
        ...attempt,
        job_id: attempt.job_id || input.jobId,
        provider: attempt.provider || input.provider,
        model_id: attempt.model_id || input.modelId,
        model_version: attempt.model_version ?? input.modelVersion,
      };
    },

    async bindPrediction(input) {
      return callBooleanRpc(database, 'bind_upscale_prediction', {
        p_job_id: input.jobId,
        p_attempt_id: input.attemptId,
        p_prediction_id: input.predictionId,
        p_provider_status: input.providerStatus,
        p_next_poll_at: input.nextPollAt ?? null,
      });
    },

    async markSubmissionUnknown(input) {
      return callBooleanRpc(database, 'mark_upscale_submission_unknown', {
        p_job_id: input.jobId,
        p_attempt_id: input.attemptId,
        p_failure_reason: input.failureReason,
      });
    },

    async markProviderTerminal(input) {
      return callBooleanRpc(database, 'mark_upscale_provider_terminal', {
        p_job_id: input.jobId,
        p_attempt_id: input.attemptId,
        p_provider_status: input.providerStatus,
        p_output_url: input.outputUrl ?? null,
        p_output_mime_type: input.outputMimeType ?? null,
        p_output_expires_at: input.outputExpiresAt ?? null,
        p_failure_reason: input.failureReason ?? null,
      });
    },

    async markReady(input) {
      return callBooleanRpc(database, 'mark_upscale_ready', {
        p_job_id: input.jobId,
        p_storage_path: input.storagePath,
        p_output_mime_type: input.outputMimeType,
        p_output_size_bytes: input.outputSizeBytes,
        p_output_expires_at: input.outputExpiresAt,
        p_delivery_token_hash: input.deliveryTokenHash,
        p_output_width: input.outputWidth ?? null,
        p_output_height: input.outputHeight ?? null,
      });
    },

    async settleFailure(input) {
      return callBooleanRpc(database, 'settle_upscale_execution_failure', {
        p_job_id: input.jobId,
        p_failure_reason: input.failureReason,
        p_expire: input.expire ?? false,
      });
    },

    async retryOutbox(input) {
      return callBooleanRpc(database, 'retry_upscale_outbox', {
        p_id: input.outboxId,
        p_error: input.error,
        p_due_at: input.dueAt,
        p_claimant: input.claimant ?? null,
      });
    },

    async acknowledgeOutbox(input) {
      return callBooleanRpc(database, 'ack_upscale_outbox', {
        p_id: input.outboxId,
        p_claimant: input.claimant ?? null,
      });
    },

    async scheduleAction(input) {
      return callBooleanRpc(database, 'schedule_upscale_action', {
        p_job_id: input.jobId,
        p_action: input.action,
        p_due_at: input.dueAt,
        p_expected_generation: input.expectedGeneration ?? null,
      });
    },

    async getExpiredPredictions() {
      const result = await database.rpc<
        Array<{ job_id: string; prediction_id: string; provider: string; model_id: string }>
      >('get_expired_upscale_predictions', { p_limit: 50 });
      if (result.error) throw databaseError('get expired predictions', result.error);
      return result.data ?? [];
    },

    async reconcileDeadlines(limit = 100) {
      const result = await database.rpc<unknown>('reconcile_upscale_deadlines', {
        p_limit: limit,
      });
      const error = databaseError('reconcile upscale deadlines', result.error);
      if (error) throw error;
      const value = Array.isArray(result.data) ? result.data[0] : result.data;
      return typeof value === 'number' ? value : Number(value ?? 0);
    },

    async claimOutbox(input) {
      const result = await database.rpc<unknown>('claim_upscale_outbox', {
        p_limit: input.limit,
        p_claimant: input.claimant,
        p_claim_seconds: input.claimSeconds,
      });
      const error = databaseError('claim upscale outbox', result.error);
      if (error) throw error;
      return (Array.isArray(result.data) ? result.data : [])
        .map(normalizeOutbox)
        .filter((row): row is IClaimedOutboxRow => row !== null);
    },
  };
}

export function createStorageInputResolver(
  storage: IExecutorStorageClient
): IExecutorInputResolver {
  return {
    async resolve(execution) {
      const expectedPrefix = `${execution.user_id}/`;
      if (
        !execution.input_storage_path.startsWith(expectedPrefix) ||
        execution.input_storage_path.includes('..')
      ) {
        throw new Error('Stored input path is not owned by the execution user');
      }
      const result = await storage
        .from('upscale-inputs')
        .createSignedUrl(execution.input_storage_path, 10 * 60);
      const error = databaseError('create input signed URL', result.error);
      if (error) throw error;
      const url = result.data?.signedUrl;
      if (!url) throw new Error('Input signed URL was not returned');
      return url;
    },
  };
}

export function createStorageOutputStorage(storage: IExecutorStorageClient): IOutputStorage {
  return {
    async upload(
      storagePath: string,
      body: ReadableStream<Uint8Array>,
      options: { contentType: string; cacheControl: string; upsert: boolean }
    ): Promise<void> {
      const result = await storage.from('upscale-inputs').upload(storagePath, body, options);
      const error = databaseError('upload staged output', result.error);
      if (error) throw error;
    },
    async stat(storagePath: string): Promise<{ sizeBytes: number; mimeType?: string } | null> {
      const separator = storagePath.lastIndexOf('/');
      const path = separator === -1 ? '' : storagePath.slice(0, separator);
      const name = separator === -1 ? storagePath : storagePath.slice(separator + 1);
      const result = await storage.from('upscale-inputs').list(path, { limit: 10, search: name });
      const error = databaseError('inspect staged output', result.error);
      if (error) throw error;
      const object = result.data?.find(candidate => candidate.name === name);
      if (!object) return null;
      const size = Number(object.metadata?.size);
      if (!Number.isSafeInteger(size) || size <= 0) return null;
      const mimeType = object.metadata?.mimetype;
      return { sizeBytes: size, mimeType: typeof mimeType === 'string' ? mimeType : undefined };
    },
  };
}

function geminiOutputExtension(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic') return 'heic';
  return 'jpg';
}

function bytesAsReadableStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function geminiOutputPath(
  output: Pick<IGeminiPublishedOutput, 'userId' | 'jobId' | 'attemptId' | 'mimeType'>
): string {
  return `${output.userId}/outputs/${output.jobId}/${output.attemptId}.${geminiOutputExtension(output.mimeType)}`;
}

function isSafeGeminiOutputPath(
  storagePath: string,
  output: Pick<IGeminiPublishedOutput, 'jobId' | 'attemptId' | 'mimeType'>
): boolean {
  const segments = storagePath.split('/');
  return (
    segments.length === 4 &&
    /^[0-9a-f-]{36}$/i.test(segments[0] ?? '') &&
    segments[1] === 'outputs' &&
    segments[2] === output.jobId &&
    segments[3] === `${output.attemptId}.${geminiOutputExtension(output.mimeType)}` &&
    /^[0-9a-f-]{36}\.[a-z]+$/i.test(segments[3] ?? '') &&
    !output.attemptId.includes('/')
  );
}

async function signedGeminiOutputUrl(
  storage: IExecutorStorageClient,
  storagePath: string
): Promise<string> {
  const result = await storage
    .from('upscale-inputs')
    .createSignedUrl(storagePath, GEMINI_OUTPUT_SIGNED_URL_SECONDS);
  const error = databaseError('create Gemini output signed URL', result.error);
  if (error) throw error;
  const signedUrl = result.data?.signedUrl;
  if (!signedUrl) throw new Error('Gemini output signed URL was not returned');
  return signedUrl;
}

/** Store Gemini inline bytes before the generic streaming stager reads them. */
export function createGeminiStoragePublisher(
  storage: IExecutorStorageClient
): (output: IGeminiPublishedOutput) => Promise<{ url: string; storagePath: string }> {
  const outputStorage = createStorageOutputStorage(storage);
  return async output => {
    const storagePath = geminiOutputPath(output);
    if (output.signal?.aborted) throw output.signal.reason;
    if (!(await outputStorage.stat(storagePath))) {
      await outputStorage.upload(storagePath, bytesAsReadableStream(output.bytes), {
        contentType: output.mimeType,
        cacheControl: String(GEMINI_OUTPUT_SIGNED_URL_SECONDS),
        upsert: false,
      });
    }
    const metadata = await outputStorage.stat(storagePath);
    if (
      !metadata ||
      metadata.sizeBytes !== output.bytes.byteLength ||
      metadata.mimeType !== output.mimeType
    )
      throw new Error('Gemini staged output metadata mismatch');
    return {
      url: await signedGeminiOutputUrl(storage, storagePath),
      storagePath,
    };
  };
}

export function createGeminiStorageOutputResolver(
  storage: IExecutorStorageClient
): (
  storagePath: string,
  output: Pick<IGeminiPublishedOutput, 'jobId' | 'attemptId' | 'mimeType'>
) => Promise<string> {
  return async (storagePath, output) => {
    if (!isSafeGeminiOutputPath(storagePath, output)) {
      throw new Error('Gemini stored output path is invalid');
    }
    return signedGeminiOutputUrl(storage, storagePath);
  };
}

interface IRuntimeProcess {
  argv?: string[];
  exitCode?: number;
}

function runtimeProcess(): IRuntimeProcess | undefined {
  return (globalThis as typeof globalThis & { process?: IRuntimeProcess }).process;
}

export interface IExecutorRuntimeConfig {
  mode: 'executor' | 'dispatcher' | 'callbacks';
  healthServiceAccount?: string;
  imageDigest?: string;
  buildId?: string;
  dispatchAudience?: string;
  dispatchServiceAccount?: string;
  wakePreviousSecret?: string;
  taskQueueName?: string;
  taskTargetUrl?: string;
  taskServiceAccount?: string;
  taskAudience?: string;
  wakeSecret?: string;
  callbackSecret?: string;
  callbackBaseUrl?: string;
  requestBodyBytes: number;
  callbackBodyBytes: number;
  wakeBodyBytes: number;
  outputMaxBytes: number;
  port: number;
  host: string;
}

export function readExecutorRuntimeConfig(
  env: Record<string, unknown> = serverEnv
): IExecutorRuntimeConfig {
  if (artifactBuildId && (env.UPSCALE_BUILD_ID ?? 'local') !== artifactBuildId)
    throw new Error('Executor runtime build ID differs from the artifact');
  const integer = (name: string, fallback: number): number => {
    const value = Number(env[name]);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  };
  const string = (name: string): string | undefined =>
    typeof env[name] === 'string' ? (env[name] as string) : undefined;
  return {
    mode:
      env.UPSCALE_EXECUTOR_MODE === 'callbacks'
        ? 'callbacks'
        : env.UPSCALE_EXECUTOR_MODE === 'dispatcher'
          ? 'dispatcher'
          : 'executor',
    healthServiceAccount: string('UPSCALE_EXECUTOR_HEALTH_SERVICE_ACCOUNT'),
    imageDigest: string('UPSCALE_EXECUTOR_IMAGE_DIGEST'),
    buildId: artifactBuildId ?? string('UPSCALE_BUILD_ID'),
    dispatchAudience: string('UPSCALE_EXECUTOR_DISPATCH_AUDIENCE'),
    dispatchServiceAccount: string('UPSCALE_EXECUTOR_DISPATCH_SERVICE_ACCOUNT'),
    wakePreviousSecret: string('UPSCALE_EXECUTOR_WAKE_PREVIOUS_SECRET'),
    taskQueueName: string('UPSCALE_EXECUTOR_TASK_QUEUE'),
    taskTargetUrl: string('UPSCALE_EXECUTOR_TASK_TARGET_URL'),
    taskServiceAccount: string('UPSCALE_EXECUTOR_TASK_SERVICE_ACCOUNT'),
    taskAudience: string('UPSCALE_EXECUTOR_TASK_AUDIENCE'),
    wakeSecret: string('UPSCALE_EXECUTOR_WAKE_SECRET'),
    callbackSecret: string('REPLICATE_WEBHOOK_SIGNING_SECRET'),
    callbackBaseUrl: string('UPSCALE_EXECUTOR_CALLBACK_BASE_URL'),
    requestBodyBytes: integer('UPSCALE_EXECUTOR_REQUEST_BODY_BYTES', DEFAULT_REQUEST_BODY_BYTES),
    callbackBodyBytes: integer('UPSCALE_EXECUTOR_CALLBACK_BODY_BYTES', DEFAULT_CALLBACK_BODY_BYTES),
    wakeBodyBytes: integer('UPSCALE_EXECUTOR_WAKE_BODY_BYTES', DEFAULT_WAKE_BODY_BYTES),
    outputMaxBytes: integer('UPSCALE_EXECUTOR_OUTPUT_MAX_BYTES', DEFAULT_OUTPUT_MAX_BYTES),
    port: integer('PORT', 8080),
    host: string('HOST') ?? '0.0.0.0',
  };
}

export interface IExecutorTaskPublisher {
  publish(task: {
    outboxId: string;
    jobId: string;
    action: ExecutorAction;
    generation: number;
  }): Promise<void>;
}

export interface ICloudTasksPublisherOptions {
  queueName: string;
  targetUrl: string;
  serviceAccountEmail?: string;
  audience?: string;
  fetch?: typeof fetch;
  accessToken?: string;
}

async function cloudTasksAccessToken(
  fetcher: typeof fetch,
  configuredToken?: string
): Promise<string> {
  if (configuredToken) return configuredToken;
  const response = await fetcher(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } }
  );
  if (!response.ok)
    throw new Error(`Cloud Tasks token request failed with HTTP ${response.status}`);
  const payload = asRecord(await response.json());
  const token = payload?.access_token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Cloud Tasks token response did not contain an access token');
  }
  return token;
}

/** Publish deterministic Cloud Tasks names so a publisher crash is harmless. */
export function createCloudTasksPublisher(
  options: ICloudTasksPublisherOptions
): IExecutorTaskPublisher {
  const fetcher = options.fetch ?? globalThis.fetch;
  return {
    async publish(task) {
      if (!/^projects\/[^/]+\/locations\/[^/]+\/queues\/[^/]+$/.test(options.queueName)) {
        throw new Error('Cloud Tasks queue name is invalid');
      }
      const target = new URL(options.targetUrl);
      if (target.protocol !== 'https:') throw new Error('Cloud Tasks target URL must use HTTPS');
      const accessToken = await cloudTasksAccessToken(fetcher, options.accessToken);
      const taskName = `${options.queueName}/tasks/upscale-${task.outboxId}-${task.generation}`;
      if (!options.serviceAccountEmail || !options.audience)
        throw new Error('Cloud Tasks OIDC identity is not configured');
      const requestBody: Record<string, unknown> = {
        task: {
          name: taskName,
          dispatchDeadline: '900s',
          httpRequest: {
            httpMethod: 'POST',
            url: `${target.toString().replace(/\/$/, '')}/tasks/advance`,
            headers: {
              'Content-Type': 'application/json',
            },
            body: Buffer.from(JSON.stringify(task)).toString('base64'),
            ...(options.serviceAccountEmail
              ? {
                  oidcToken: {
                    serviceAccountEmail: options.serviceAccountEmail,
                    audience: options.audience ?? target.toString(),
                  },
                }
              : {}),
          },
        },
      };
      const response = await fetcher(
        `https://cloudtasks.googleapis.com/v2/${options.queueName}/tasks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );
      if (response.ok || response.status === 409) return;
      throw new Error(`Cloud Tasks publish failed with HTTP ${response.status}`);
    },
  };
}

export interface IExecutorServerOptions {
  rpc: IExecutorRpc;
  prepareExecution?: (execution: IExecutorExecution) => Promise<IExecutorExecution>;
  provider?: IProviderAdapter;
  providerForExecution?: (execution: IExecutorExecution) => IProviderAdapter | undefined;
  inputResolver?: IExecutorInputResolver;
  outputStager?: IExecutorOutputStager;
  taskPublisher?: IExecutorTaskPublisher;
  config?: Partial<IExecutorRuntimeConfig>;
  authorizeTask?: (request: Request) => boolean | Promise<boolean>;
  authorizeDispatch?: (request: Request) => boolean | Promise<boolean>;
  authorizeHealth?: (request: Request) => boolean | Promise<boolean>;
  refreshHealth?: () => Promise<void>;
  claimWake?: (signature: string, expiresAt: string) => Promise<boolean>;
  authorizeWake?: (request: Request, rawBody: string) => boolean | Promise<boolean>;
  verifyReplicateCallback?: (input: {
    body: string;
    headers: IReplicateWebhookHeaders;
  }) => boolean | Promise<boolean>;
  now?: () => number;
}

export interface IExecutorServer {
  handleRequest(request: Request): Promise<Response>;
  readonly requestHandler: (request: Request) => Promise<Response>;
  readonly refreshHealth?: () => Promise<void>;
}

function mergedConfig(config?: Partial<IExecutorRuntimeConfig>): IExecutorRuntimeConfig {
  return { ...readExecutorRuntimeConfig(), ...config };
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function validTimestamp(timestamp: string | null, now: number): boolean {
  const seconds = Number(timestamp);
  return (
    timestamp !== null &&
    Number.isSafeInteger(seconds) &&
    Math.abs(now - seconds * 1000) <= AUTH_TIMESTAMP_TOLERANCE_MS
  );
}

function wakeSignatureAuthorized(
  request: Request,
  rawBody: string,
  secret: string | undefined,
  now: number
): boolean {
  if (!secret) return false;
  const timestamp = request.headers.get('x-executor-timestamp');
  const signature = request.headers.get('x-executor-signature');
  if (!validTimestamp(timestamp, now) || !signature) return false;
  const supplied = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return constantTimeEqual(supplied, expected);
}

async function readBody(request: Request, maxBytes: number): Promise<string> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0 || declared > maxBytes) {
      throw new Error('request_body_too_large');
    }
  }
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value) continue;
      total += next.value.byteLength;
      if (total > maxBytes) throw new Error('request_body_too_large');
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function readJson(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const raw = await readBody(request, maxBytes);
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('invalid_json');
  }
  const record = asRecord(parsed);
  if (!record) throw new Error('json_object_required');
  return record;
}

function taskFromPayload(payload: Record<string, unknown>): {
  jobId: string;
  action: ExecutorAction;
  generation?: number;
  outboxId?: string;
  claimant?: string;
} | null {
  const jobId = payload.jobId;
  const action = payload.action;
  if (typeof jobId !== 'string' || !EXECUTOR_ACTIONS.has(action as ExecutorAction)) return null;
  const generation = payload.generation;
  const outboxId = payload.outboxId;
  if (
    generation !== undefined &&
    (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0)
  ) {
    return null;
  }
  if (
    (outboxId !== undefined && typeof outboxId !== 'string' && typeof outboxId !== 'number') ||
    (typeof outboxId === 'string' && outboxId.length === 0) ||
    (typeof outboxId === 'number' && (!Number.isSafeInteger(outboxId) || outboxId <= 0))
  ) {
    return null;
  }
  return {
    jobId,
    action: action as ExecutorAction,
    generation: generation as number | undefined,
    outboxId: outboxId === undefined ? undefined : String(outboxId),
    claimant: typeof payload.claimant === 'string' ? payload.claimant : undefined,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'executor request failed';
}

function retryAfterSeconds(now: number, retryAt?: string): string {
  if (!retryAt) return '5';
  const delta = Date.parse(retryAt) - now;
  return String(Math.max(1, Math.ceil(delta / 1000)));
}

async function scheduleTaskRetry(
  rpc: IExecutorRpc,
  task: { jobId: string; action: ExecutorAction; generation?: number },
  dueAt: string
): Promise<boolean> {
  return rpc.scheduleAction({
    jobId: task.jobId,
    action: task.action,
    dueAt,
    expectedGeneration: task.generation,
  });
}

/**
 * Build the external executor HTTP handler. No database or provider client is
 * created here; pass fakes for every dependency in unit tests.
 */
export function createExecutorServer(options: IExecutorServerOptions): IExecutorServer {
  const config = mergedConfig(options.config);
  const now = options.now ?? (() => Date.now());
  const dependencies = {
    rpc: options.rpc,
    prepareExecution: options.prepareExecution,
    provider: options.provider,
    providerForExecution: options.providerForExecution,
    inputResolver: options.inputResolver,
    outputStager: options.outputStager,
    outputMaxBytes: config.outputMaxBytes,
    clock: { now },
  };

  const authorizeTask =
    options.authorizeTask ??
    createOidcAuthorizer({
      audience: config.taskAudience,
      serviceAccountEmail: config.taskServiceAccount,
    });
  const authorizeDispatch =
    options.authorizeDispatch ??
    createOidcAuthorizer({
      audience: config.dispatchAudience,
      serviceAccountEmail: config.dispatchServiceAccount,
    });
  const authorizeHealth =
    options.authorizeHealth ??
    createOidcAuthorizer({
      audience: config.taskAudience,
      serviceAccountEmail: config.healthServiceAccount,
    });
  const authorizeWake =
    options.authorizeWake ??
    (async (request: Request, rawBody: string) => {
      const valid = [config.wakeSecret, config.wakePreviousSecret].some(secret =>
        wakeSignatureAuthorized(request, rawBody, secret, now())
      );
      if (!valid || !options.claimWake) return false;
      return options.claimWake(
        request.headers.get('x-executor-signature')!.replace(/^sha256=/, ''),
        new Date(now() + AUTH_TIMESTAMP_TOLERANCE_MS).toISOString()
      );
    });

  const handleTask = async (request: Request): Promise<Response> => {
    if (!(await authorizeTask(request))) return jsonResponse({ error: 'unauthorized' }, 401);
    let task: ReturnType<typeof taskFromPayload>;
    try {
      task = taskFromPayload(await readJson(request, config.requestBodyBytes));
    } catch (error) {
      return jsonResponse({ error: messageOf(error) }, 413, { 'Retry-After': '0' });
    }
    if (!task) return jsonResponse({ error: 'invalid_task' }, 400);

    try {
      const result = await advanceExecution(task, dependencies);
      if (result.disposition === 'retry' && result.retryAt) {
        // Publishing acknowledgement belongs to the dispatcher. A task only
        // commits its next generation; duplicate/stale generations are no-ops.
        await scheduleTaskRetry(options.rpc, { ...task, action: result.action }, result.retryAt);
      }
      return jsonResponse(
        {
          ok: true,
          ...result,
        },
        result.disposition === 'retry' ? 202 : 200,
        result.retryAt ? { 'Retry-After': retryAfterSeconds(now(), result.retryAt) } : undefined
      );
    } catch (error) {
      try {
        await scheduleTaskRetry(options.rpc, task, new Date(now() + 5000).toISOString());
      } catch {
        /* Cloud Tasks retries and scheduled reconciliation repair database outages. */
      }
      const status = error instanceof ExecutorConfigurationError ? 503 : 500;
      return jsonResponse(
        { error: status === 503 ? 'executor_not_configured' : 'executor_failed' },
        status,
        { 'Retry-After': '5' }
      );
    }
  };

  const handleWake = async (request: Request, scheduler = false): Promise<Response> => {
    const rawBody = await readBody(request, config.wakeBodyBytes).catch(() => null);
    if (rawBody === null) return jsonResponse({ error: 'request_body_too_large' }, 413);
    if (scheduler ? !(await authorizeDispatch(request)) : !(await authorizeWake(request, rawBody)))
      return jsonResponse({ error: 'unauthorized' }, 401);
    if (!options.taskPublisher)
      return jsonResponse({ error: 'task_publisher_not_configured' }, 503);

    let payload: Record<string, unknown>;
    try {
      payload = rawBody ? (asRecord(JSON.parse(rawBody)) ?? {}) : {};
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }
    const limitValue = payload.limit;
    const limit =
      typeof limitValue === 'number' && Number.isSafeInteger(limitValue)
        ? Math.max(1, Math.min(50, limitValue))
        : 50;
    const claimant =
      typeof payload.claimant === 'string' && payload.claimant.length > 0
        ? payload.claimant
        : `executor-${Math.random().toString(16).slice(2)}`;

    try {
      if (scheduler) await options.refreshHealth?.();
      const taskPublisher = options.taskPublisher;
      const result = await dispatchDueOutbox({
        rpc: options.rpc,
        taskPublisher,
        claimant,
        limit,
        now,
        reconcileDeadlines: options.rpc.reconcileDeadlines
          ? async () => {
              const expired = (await options.rpc.getExpiredPredictions?.()) ?? [];
              const signal = AbortSignal.timeout(5000);
              await Promise.allSettled(
                expired.map(async item => {
                  const execution = await options.rpc.getExecution(item.job_id);
                  if (!execution) return;
                  const provider = options.providerForExecution?.(execution) ?? options.provider;
                  await provider?.cancelPrediction?.(item.prediction_id, signal);
                })
              );
              return { reconciled: (await options.rpc.reconcileDeadlines?.(100)) ?? 0 };
            }
          : undefined,
      });
      return jsonResponse({ ok: true, ...result });
    } catch {
      return jsonResponse({ error: 'dispatcher_failed' }, 503, { 'Retry-After': '5' });
    }
  };

  const handleCallback = async (request: Request): Promise<Response> => {
    const rawBody = await readBody(request, config.callbackBodyBytes).catch(() => null);
    if (rawBody === null) return jsonResponse({ error: 'request_body_too_large' }, 413);
    const verify = options.verifyReplicateCallback;
    if (!verify) return jsonResponse({ error: 'callback_verifier_not_configured' }, 503);

    const headers: IReplicateWebhookHeaders = {
      id: request.headers.get('webhook-id'),
      timestamp: request.headers.get('webhook-timestamp'),
      signature: request.headers.get('webhook-signature'),
    };
    if (!(await verify({ body: rawBody, headers }))) {
      return jsonResponse({ error: 'invalid_callback_signature' }, 401);
    }

    let payload: Record<string, unknown>;
    try {
      payload = asRecord(JSON.parse(rawBody)) ?? {};
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }
    const predictionId = payload.id;
    const correlation = new URL(request.url).searchParams.get('correlation');
    if (typeof predictionId !== 'string' || !predictionId || !correlation) {
      return jsonResponse({ error: 'invalid_callback_identity' }, 400);
    }

    try {
      const result = await handleReplicateCallback({ correlation, predictionId }, dependencies);
      return jsonResponse({ ok: true, ...result }, result.disposition === 'retry' ? 202 : 200);
    } catch (error) {
      if (error instanceof ExecutorCallbackIdentityError) {
        return jsonResponse({ error: 'callback_identity_mismatch' }, 400);
      }
      return jsonResponse({ error: 'callback_processing_failed' }, 503, { 'Retry-After': '5' });
    }
  };

  const handleRequest = async (request: Request): Promise<Response> => {
    const pathname = new URL(request.url).pathname.replace(/\/$/, '') || '/';
    if (request.method === 'GET' && (pathname === '/healthz' || pathname === '/health')) {
      if (config.mode === 'executor' && !(await authorizeHealth(request)))
        return jsonResponse({ error: 'unauthorized' }, 401);
      return jsonResponse({
        ok: true,
        service: 'upscale-executor',
        providerExecution: 'external',
        mode: config.mode,
        buildId: config.buildId,
        imageDigest: config.imageDigest,
      });
    }
    if (request.method === 'POST' && pathname === '/tasks/advance' && config.mode === 'executor')
      return handleTask(request);
    if (request.method === 'POST' && pathname === '/dispatch' && config.mode === 'dispatcher')
      return handleWake(request, true);
    if (request.method === 'POST' && pathname === '/wake' && config.mode === 'callbacks')
      return handleWake(request);
    if (
      request.method === 'POST' &&
      pathname === '/webhooks/replicate' &&
      config.mode === 'callbacks'
    )
      return handleCallback(request);
    return jsonResponse({ error: 'not_found' }, 404);
  };

  return {
    handleRequest,
    requestHandler: handleRequest,
    refreshHealth: config.mode === 'dispatcher' ? options.refreshHealth : undefined,
  };
}

export function createExecutorRequestHandler(
  options: IExecutorServerOptions
): (request: Request) => Promise<Response> {
  return createExecutorServer(options).handleRequest;
}

export interface IDefaultExecutorServerOptions {
  provider?: IProviderAdapter;
  geminiProvider?: IProviderAdapter;
  providerForExecution?: IExecutorServerOptions['providerForExecution'];
  inputResolver?: IExecutorInputResolver;
  outputStager?: IExecutorOutputStager;
  taskPublisher?: IExecutorTaskPublisher;
  config?: Partial<IExecutorRuntimeConfig>;
  authorizeTask?: IExecutorServerOptions['authorizeTask'];
  authorizeWake?: IExecutorServerOptions['authorizeWake'];
  now?: () => number;
}

/** Lazy production wiring for the Node service. It is never run during import. */
export async function createDefaultExecutorServer(
  options: IDefaultExecutorServerOptions = {}
): Promise<IExecutorServer> {
  const [{ supabaseAdmin }, { serverEnv }] = await Promise.all([
    // The standalone process must not create a database client during module import.
    // eslint-disable-next-line no-restricted-syntax
    import('@server/supabase/supabaseAdmin'),
    // eslint-disable-next-line no-restricted-syntax
    import('@shared/config/env'),
  ]);
  const database = supabaseAdmin as unknown as IExecutorDatabase;
  const config = mergedConfig(options.config);
  const storage = database.storage;
  const replicateProvider =
    options.provider ??
    new ReplicateAdapter({
      token: serverEnv.REPLICATE_API_TOKEN,
      callbackBaseUrl: config.callbackBaseUrl,
      webhookSecret: config.callbackSecret,
    });
  const geminiProvider =
    options.geminiProvider ??
    (serverEnv.GEMINI_API_KEY
      ? new GeminiAdapter({
          apiKey: serverEnv.GEMINI_API_KEY,
          publishOutput: createGeminiStoragePublisher(storage),
          resolveOutputUrl: createGeminiStorageOutputResolver(storage),
          maxOutputBytes: config.outputMaxBytes,
        })
      : undefined);
  const inputResolver = options.inputResolver ?? createStorageInputResolver(storage);
  const supabaseOutputHost = (() => {
    try {
      return new URL(serverEnv.SUPABASE_URL).hostname;
    } catch {
      return undefined;
    }
  })();
  const outputStager =
    options.outputStager ??
    createStreamingOutputStager({
      storage: createStorageOutputStorage(storage),
      maxBytes: config.outputMaxBytes,
      allowedHosts: [
        'replicate.delivery',
        'replicate.com',
        ...(supabaseOutputHost ? [supabaseOutputHost] : []),
      ],
    });

  const taskPublisher =
    options.taskPublisher ??
    (config.taskQueueName && config.taskTargetUrl
      ? createCloudTasksPublisher({
          queueName: config.taskQueueName,
          targetUrl: config.taskTargetUrl,
          serviceAccountEmail: config.taskServiceAccount,
          audience: config.taskAudience,
        })
      : undefined);

  const rpc = createSupabaseExecutorRpc(database);
  return createExecutorServer({
    rpc,
    prepareExecution: createExecutionPreparer({ database, rpc, inputResolver }),
    provider: replicateProvider,
    providerForExecution:
      options.providerForExecution ??
      (execution => {
        if (execution.provider === 'replicate') return replicateProvider;
        if (execution.provider === 'gemini') return geminiProvider;
        return undefined;
      }),
    inputResolver,
    outputStager,
    taskPublisher,
    config,
    authorizeTask: options.authorizeTask,
    authorizeWake: options.authorizeWake,
    claimWake: (signature, expiresAt) =>
      callBooleanRpc(database, 'claim_upscale_wake', {
        p_signature: signature,
        p_expires_at: expiresAt,
      }),
    refreshHealth: createExecutorHealthProbe({
      targetUrl: config.taskTargetUrl,
      audience: config.taskAudience,
      imageDigest: config.imageDigest,
      record: (imageDigest, healthy) =>
        callBooleanRpc(database, 'record_upscale_executor_health', {
          p_image_digest: imageDigest,
          p_healthy: healthy,
        }),
    }),
    verifyReplicateCallback:
      replicateProvider instanceof ReplicateAdapter
        ? input => replicateProvider.verifyWebhook(input)
        : undefined,
    now: options.now,
  });
}

async function readIncomingBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = request.headers['content-length'];
  if (declared) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > maxBytes) {
      throw new Error('request_body_too_large');
    }
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) throw new Error('request_body_too_large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

async function toFetchRequest(request: IncomingMessage, maxBytes: number): Promise<Request> {
  const host = request.headers.host ?? 'localhost';
  const body = await readIncomingBody(request, maxBytes);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return new Request(`http://${host}${request.url ?? '/'}`, {
    method: request.method ?? 'GET',
    headers,
    body: body.length > 0 ? body.toString('utf8') : undefined,
  });
}

async function writeFetchResponse(response: Response, nodeResponse: ServerResponse): Promise<void> {
  nodeResponse.statusCode = response.status;
  response.headers.forEach((value, key) => nodeResponse.setHeader(key, value));
  nodeResponse.end(Buffer.from(await response.arrayBuffer()));
}

export async function startExecutorHttpServer(options?: IExecutorServerOptions): Promise<Server> {
  const config = mergedConfig(options?.config);
  const executor = options
    ? createExecutorServer(options)
    : await createDefaultExecutorServer({ config });
  const server = createServer(async (request, response) => {
    try {
      const fetchRequest = await toFetchRequest(request, config.requestBodyBytes);
      await writeFetchResponse(await executor.handleRequest(fetchRequest), response);
    } catch (error) {
      response.statusCode = messageOf(error) === 'request_body_too_large' ? 413 : 500;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          error: response.statusCode === 413 ? 'request_body_too_large' : 'server_error',
        })
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  if (executor.refreshHealth) {
    const refreshHealth = () =>
      executor.refreshHealth!().catch(error => {
        console.error('[upscale-executor] health heartbeat failed', messageOf(error));
      });
    void refreshHealth();
    const timer = setInterval(refreshHealth, EXECUTOR_HEALTH_INTERVAL_MS);
    server.once('close', () => clearInterval(timer));
  }
  return server;
}

function isMainModule(): boolean {
  const entry = runtimeProcess()?.argv?.[1];
  return Boolean(entry && fileURLToPath(import.meta.url) === entry);
}

if (isMainModule()) {
  void startExecutorHttpServer().catch(error => {
    console.error('[upscale-executor] failed to start', messageOf(error));
    const processValue = runtimeProcess();
    if (processValue) processValue.exitCode = 1;
  });
}

export { ReplicateAdapter } from './replicate-adapter';
export { GeminiAdapter } from './gemini-adapter';
export type { IReplicateWebhookHeaders } from './replicate-adapter';
