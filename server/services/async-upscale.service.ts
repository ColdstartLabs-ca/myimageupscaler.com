import { trackServerEvent } from '@server/analytics';
import { normalizeCoreEventProperties } from '@server/analytics/core-event-contract';
import { createLogger } from '@server/monitoring/logger';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { isGpuContentionError } from '@server/utils/retry';
import { serverEnv } from '@shared/config/env';
import { getHourlyProcessingLimit } from '@shared/config/subscription.utils';
import type { IUpscaleResponse, ModelId, QualityTier } from '@shared/types/coreflow.types';
import { createErrorResponse, ErrorCodes } from '@shared/utils/errors';
import { upscaleSchema, type IUpscaleInput } from '@shared/validation/upscale.schema';
import dayjs from 'dayjs';
import { z } from 'zod';
import { recordProcessingCostTelemetry } from './cost-telemetry.service';
import { getEmailLifecycleService } from './email-lifecycle.service';
import type { IProcessImageOptions } from './image-processor.interface';
import { ModelRegistry } from './model-registry';
import type { SubscriptionTier } from './model-registry.types';
import type { ProviderFailureKind } from './provider-health.service';
import { buildModelInput } from './replicate/builders';
import { replicateErrorMapper, type ReplicateError } from './replicate/utils/error-mapper';
import { parseReplicateResponse } from './replicate/utils/output-parser';
import { isScalePreservingRecoveryEligible } from './scale-preserving-model';

const PROVIDER_API = 'https://api.replicate.com/v1';
const MAX_PROVIDER_BYTES = 1024 * 1024;
const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
const UNAVAILABLE_MESSAGE =
  'Image processing is temporarily unavailable due to a provider issue. Your credits have not been charged. Please try again shortly or contact our support team.';

interface IAsyncUpscaleResultContext extends Pick<
  IUpscaleResponse,
  'usedTier' | 'analysis' | 'dimensions'
> {
  modelDisplayName: string;
  dimensionPreservingFallback?: boolean;
  fileSizeBytes: number;
  mimeType: string;
  isPaidUser?: boolean;
}

interface IAsyncUpscaleTransport {
  body: Record<string, unknown>;
  status: number;
  headers?: Record<string, string>;
}

interface IActiveAsyncUpscaleRow {
  job_id: string;
  status: 'processing' | 'completed';
  provider_phase: 'submitting' | 'processing' | 'succeeded';
  created_at: string;
  execution_deadline_at: string;
  delivery_deadline_at: string | null;
  display?: {
    modelDisplayName?: string;
    dimensionPreservingFallback?: boolean;
    mimeType?: string;
    dimensions?: IAsyncUpscaleResultContext['dimensions'];
  };
}

export class AsyncUpscaleError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
    readonly retryAfter?: number,
    readonly headers?: Record<string, string>
  ) {
    super(message);
    this.name = 'AsyncUpscaleError';
  }
}

interface IJobIdentity {
  userId: string;
  jobId: string;
}

interface IStartInput {
  userId: string;
  request: z.infer<typeof upscaleSchema>;
  processInput: IUpscaleInput;
  modelId: ModelId;
  resolvedTier: QualityTier;
  userTier: SubscriptionTier;
  creditCost: number;
  resultContext: IAsyncUpscaleResultContext;
  costAttribution?: IProcessImageOptions['costAttribution'];
  workerRayId?: string;
  requestId?: string;
  startedAt?: number;
}

interface IStoredContext {
  recovery?: { modelId: 'real-esrgan-large'; path: string; body: string; modelDisplayName: string };
  response: IAsyncUpscaleResultContext;
  costAttribution?: IProcessImageOptions['costAttribution'];
  requestId?: string;
  workerRayId?: string;
  startedAt: number;
  requestedQualityTier: QualityTier;
  scale: number;
  userTier: SubscriptionTier;
}

interface IReservation {
  job_id: string;
  user_id: string;
  status: 'processing' | 'completed' | 'refunded' | 'quarantined';
  amount: number;
  resolved_model: string;
  quality_tier: string;
  result_context: IStoredContext;
  attempt_id: string;
  attempt_started_at: string;
  provider_prediction_id: string | null;
  provider_phase: 'submitting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  execution_deadline_at: string;
  delivery_deadline_at: string | null;
  async_delivery_token: string;
  output_url: string | null;
  output_mime_type: string | null;
  output_expires_at: string | null;
  terminal_at: string | null;
  failure_code: string | null;
  recovery_count?: number;
  recovery_state?: 'queued' | 'submitting' | null;
}

interface IJobResult {
  outcome: string;
  reservation?: IReservation;
  balance?: { subscription: number; purchased: number; total: number };
  claimed?: boolean;
  observation_token?: string;
  retry_at?: string;
  current_count?: number;
  batch_limit?: number;
  available?: number;
}

export interface IAsyncReconciliationResult {
  processedCount: number;
  failedCount: number;
  remainingCount: number;
  oldestDueAgeMs: number | null;
  failedJobIds: string[];
}

interface IDueAsyncJob {
  user_id: string;
  job_id: string;
  next_observation_at: string;
  due_count: number | string;
}

const predictionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  status: z.enum(['starting', 'processing', 'succeeded', 'failed', 'canceled']),
  output: z.unknown().optional(),
  error: z.unknown().optional(),
  completed_at: z.string().max(100).nullable().optional(),
  expires_at: z.string().max(100).nullable().optional(),
});
type IPrediction = z.infer<typeof predictionSchema>;

function unavailable(jobId?: string, retryAfter = 5): AsyncUpscaleError {
  return new AsyncUpscaleError(
    'The processing status is temporarily unavailable. Keep this job open and try again shortly.',
    ErrorCodes.AI_UNAVAILABLE,
    503,
    { retryable: true, ...(jobId && { jobId }), suppressPurchaseCtas: true },
    retryAfter
  );
}

async function rpc<T>(name: string, args: Record<string, unknown>, jobId?: string): Promise<T> {
  try {
    const { data, error } = await supabaseAdmin.rpc(name, args);
    if (error || data === null || data === undefined) throw unavailable(jobId);
    return data as T;
  } catch {
    throw unavailable(jobId);
  }
}

function requireJob(result: IJobResult): IReservation {
  if (result.outcome === 'not_found') {
    throw new AsyncUpscaleError('Processing job not found.', ErrorCodes.NOT_FOUND, 404);
  }
  if (result.outcome === 'conflict') {
    throw new AsyncUpscaleError(
      'This job ID was already used with different settings.',
      ErrorCodes.INVALID_REQUEST,
      409
    );
  }
  if (!result.reservation || !result.balance) throw unavailable();
  return result.reservation;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalize(entry)])
  );
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function fingerprint(request: IStartInput['request']): Promise<string> {
  // Only original schema-accepted metadata is hashed; processInput contains a fresh signed URL.
  return hash(JSON.stringify(canonicalize(request)));
}

function safeFailure(code: string): { code: string; message: string; status: number } {
  switch (code) {
    case 'SAFETY':
      return {
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Image was rejected by the safety filter. Please try a different image.',
        status: 422,
      };
    case 'IMAGE_TOO_LARGE':
      return {
        code: ErrorCodes.IMAGE_TOO_LARGE,
        message:
          'Image is too large for processing. Please try a smaller image or lower resolution.',
        status: 422,
      };
    case 'INVALID_INPUT':
      return {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'The image input is invalid. Please upload the image again.',
        status: 400,
      };
    case 'OUTPUT_EXPIRED':
      return {
        code: ErrorCodes.PROCESSING_FAILED,
        message: 'The result expired before download. Your credits have been refunded.',
        status: 410,
      };
    default:
      return { code: ErrorCodes.AI_UNAVAILABLE, message: UNAVAILABLE_MESSAGE, status: 503 };
  }
}

function transport(result: IJobResult): IAsyncUpscaleTransport {
  const job = requireJob(result);
  const balance = result.balance!;
  if (job.status === 'refunded') {
    const failure = safeFailure(job.failure_code ?? 'PROCESSING_FAILED');
    const error = createErrorResponse(failure.code, failure.message, failure.status, {
      creditsRefunded: true,
      retryable: false,
      suppressPurchaseCtas: true,
    });
    return {
      ...error,
      body: {
        ...error.body,
        jobId: job.job_id,
        status: 'refunded',
        creditsRefunded: true,
        creditsRemaining: balance.total,
        balance: { ...balance, current: balance.total },
      },
      headers: PRIVATE_HEADERS,
    };
  }
  if (job.status === 'quarantined') throw unavailable(job.job_id);
  if (job.provider_phase === 'succeeded' || job.status === 'completed') {
    if (!job.output_mime_type || !job.output_expires_at || !job.async_delivery_token) {
      throw unavailable(job.job_id);
    }
    const context = job.result_context.response;
    return {
      status: 200,
      headers: PRIVATE_HEADERS,
      body: {
        success: true,
        jobId: job.job_id,
        status: job.status === 'completed' ? 'completed' : 'ready',
        expiresAt: dayjs(job.output_expires_at).valueOf(),
        deliveryDeadline: dayjs(job.output_expires_at).valueOf(),
        mimeType: job.output_mime_type,
        processing: {
          modelUsed: job.resolved_model,
          modelDisplayName: job.recovery_count
            ? (job.result_context.recovery?.modelDisplayName ?? context.modelDisplayName)
            : context.modelDisplayName,
          processingTimeMs: duration(job),
          creditsUsed: job.amount,
          creditsRemaining: balance.total,
          reservationJobId: job.job_id,
          deliveryToken: job.async_delivery_token,
          ...((context.dimensionPreservingFallback || job.recovery_count) && {
            dimensionPreservingFallback: true,
          }),
        },
        usedTier: context.usedTier,
        analysis: context.analysis,
        dimensions: context.dimensions,
      },
    };
  }
  return {
    status: 202,
    headers: { ...PRIVATE_HEADERS, 'Retry-After': '3' },
    body: {
      jobId: job.job_id,
      status: job.provider_phase === 'submitting' ? 'submitting' : 'processing',
      checking: job.provider_phase === 'submitting',
      executionDeadline: dayjs(job.execution_deadline_at).valueOf(),
      statusUrl: `/api/upscale?jobId=${encodeURIComponent(job.job_id)}`,
      retryAfterMs: 3000,
    },
  };
}

function duration(job: IReservation): number {
  return Math.max(
    0,
    dayjs(job.terminal_at ?? job.attempt_started_at).valueOf() - job.result_context.startedAt
  );
}

function activeTransport(rows: IActiveAsyncUpscaleRow[]): IAsyncUpscaleTransport {
  const jobs = rows.map(row => ({
    jobId: row.job_id,
    status:
      row.provider_phase === 'submitting'
        ? 'submitting'
        : row.provider_phase === 'processing'
          ? 'processing'
          : row.status === 'completed'
            ? 'completed'
            : 'ready',
    createdAt: dayjs(row.created_at).valueOf(),
    executionDeadline: dayjs(row.execution_deadline_at).valueOf(),
    ...(row.delivery_deadline_at
      ? { deliveryDeadline: dayjs(row.delivery_deadline_at).valueOf() }
      : {}),
    ...(row.display
      ? {
          display: {
            ...(row.display.modelDisplayName && {
              modelDisplayName: row.display.modelDisplayName,
            }),
            ...(row.display.dimensionPreservingFallback !== undefined && {
              dimensionPreservingFallback: row.display.dimensionPreservingFallback,
            }),
            ...(row.display.mimeType && { mimeType: row.display.mimeType }),
            ...(row.display.dimensions && { dimensions: row.display.dimensions }),
          },
        }
      : {}),
    statusUrl: `/api/upscale?jobId=${encodeURIComponent(row.job_id)}`,
  }));
  return {
    status: 200,
    headers: PRIVATE_HEADERS,
    body: { success: true, jobs },
  };
}

function retryDelay(header: string | null): number {
  if (!header) return 5;
  const seconds = Number(header);
  const delay = Number.isFinite(seconds) ? seconds : (dayjs(header).valueOf() - Date.now()) / 1000;
  return Number.isFinite(delay) ? Math.max(1, Math.ceil(delay)) : 5;
}

async function providerRequest(
  path: string,
  method: 'GET' | 'POST',
  body?: string,
  timeoutMs = method === 'POST' ? 8000 : 5000
): Promise<{ status: number; body: unknown; retryAfter: number }> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cancel = (): void => {
    controller.abort();
    void reader?.cancel().catch(() => undefined);
  };
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(`${PROVIDER_API}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${serverEnv.REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json',
            ...(body && { 'Cancel-After': '15m' }),
          },
          ...(body && { body }),
          signal: controller.signal,
          // Cloudflare's Fetch implementation supports only follow/manual.
          // Manual keeps provider-controlled redirects from being followed;
          // the status is rejected explicitly below.
          redirect: 'manual',
          cache: 'no-store',
        });
        if (controller.signal.aborted) {
          void response.body?.cancel().catch(() => undefined);
          throw unavailable();
        }
        if (response.status >= 300 && response.status < 400) {
          void response.body?.cancel().catch(() => undefined);
          throw unavailable();
        }
        reader = response.body?.getReader();
        if (!reader || Number(response.headers.get('Content-Length')) > MAX_PROVIDER_BYTES) {
          throw unavailable();
        }
        const decoder = new TextDecoder();
        const chunks: string[] = [];
        let bytes = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > MAX_PROVIDER_BYTES) throw unavailable();
          chunks.push(decoder.decode(chunk.value, { stream: true }));
        }
        chunks.push(decoder.decode());
        return {
          status: response.status,
          body: JSON.parse(chunks.join('')) as unknown,
          retryAfter: retryDelay(response.headers.get('Retry-After')),
        };
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          cancel();
          reject(unavailable());
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    cancel();
  }
}

function createPredictionRequest(input: IStartInput): { path: string; body: string } {
  if (!serverEnv.REPLICATE_API_TOKEN) throw unavailable(input.request.jobId);
  const modelVersion =
    ModelRegistry.getInstance().getModel(input.modelId)?.modelVersion ??
    serverEnv.REPLICATE_MODEL_VERSION;
  const match = /^(?:([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)(?::([a-f0-9]{64}))?|([a-f0-9]{64}))$/.exec(
    modelVersion
  );
  if (!match) throw unavailable(input.request.jobId);
  const imageData = input.processInput.imageData.trim();
  if (!/^https:\/\//i.test(imageData)) {
    throw new AsyncUpscaleError('The image input is invalid.', ErrorCodes.VALIDATION_ERROR, 400);
  }
  const modelInput = buildModelInput(input.modelId, { ...input.processInput, imageData });
  const version = match[3] ?? match[4];
  return {
    path: version ? '/predictions' : `/models/${match[1]}/${match[2]}/predictions`,
    body: JSON.stringify({ input: modelInput, ...(version && { version }) }),
  };
}

function failureKind(error: ReplicateError): ProviderFailureKind | null {
  if (['SAFETY', 'INVALID_INPUT', 'IMAGE_TOO_LARGE'].includes(error.code)) return null;
  if (error.providerStatus === 402) return 'billing';
  if (error.code === 'RATE_LIMITED') return 'rate_limited';
  if (error.code === 'AUTHENTICATION_FAILED') return 'authentication';
  if (error.code === 'TIMEOUT') return 'timeout';
  return 'provider_unavailable';
}

function failureObservation(error: ReplicateError): Record<string, unknown> {
  return {
    p_provider_status: 'failed',
    p_failure_code: error.code,
    p_failure_message: safeFailure(error.code).message,
    p_failure_kind: failureKind(error),
  };
}

function mapProviderError(error: unknown, status?: number): ReplicateError {
  const fields = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const detail = [error, fields.detail, fields.error, fields.message].find(
    value => typeof value === 'string'
  );
  return replicateErrorMapper.mapError({
    // The incumbent mapper classifies 403 as authentication; HTTP's 401 has the
    // same account-level meaning for the direct prediction transport.
    status: status === 401 ? 403 : status,
    message: `${status ?? ''} ${typeof detail === 'string' ? detail.slice(0, 4096) : 'Processing failed'}`,
  });
}

function predictionObservation(prediction: IPrediction): Record<string, unknown> {
  if (prediction.status === 'failed' || prediction.status === 'canceled') {
    return {
      ...failureObservation(mapProviderError(prediction.error)),
      p_provider_status: prediction.status,
    };
  }
  if (prediction.status !== 'succeeded') return { p_provider_status: 'processing' };
  const output = parseReplicateResponse(prediction.output);
  if (output.imageUrl.length > 8192) throw unavailable();
  const url = new URL(output.imageUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !(url.hostname === 'replicate.delivery' || url.hostname.endsWith('.replicate.delivery'))
  ) {
    throw unavailable();
  }
  const completedAt = prediction.completed_at ? dayjs(prediction.completed_at) : null;
  if (!completedAt?.isValid() || completedAt.valueOf() > Date.now() + 60_000) throw unavailable();
  const explicitExpiry = prediction.expires_at ? dayjs(prediction.expires_at) : null;
  if (explicitExpiry && !explicitExpiry.isValid()) throw unavailable();
  const providerExpiry = Math.min(
    completedAt.add(1, 'hour').valueOf(),
    explicitExpiry?.valueOf() ?? Infinity
  );
  // The parser's rolling expiry is unsuitable for retries. SQL caps the actual
  // provider completion + one hour by its safety margin and observed-now + 30m.
  return {
    p_provider_status: 'succeeded',
    p_output_url: output.imageUrl,
    p_output_mime_type: output.mimeType,
    p_provider_completed_at: completedAt.toISOString(),
    p_provider_expires_at: dayjs(providerExpiry).toISOString(),
  };
}

async function readJob(identity: IJobIdentity, requestFingerprint?: string): Promise<IJobResult> {
  return rpc<IJobResult>(
    'read_async_upscale_job',
    {
      p_user_id: identity.userId,
      p_job_id: identity.jobId,
      p_request_fingerprint: requestFingerprint ?? null,
    },
    identity.jobId
  );
}

async function applyObservation(
  job: IReservation,
  observation: Record<string, unknown>,
  observationToken?: string
): Promise<IJobResult> {
  return rpc<IJobResult>(
    'apply_async_upscale_observation',
    {
      p_user_id: job.user_id,
      p_job_id: job.job_id,
      p_attempt_id: job.attempt_id,
      p_observation_token: observationToken ?? null,
      ...observation,
    },
    job.job_id
  );
}

async function observePrediction(
  job: IReservation,
  prediction: IPrediction,
  observationToken?: string
): Promise<IJobResult> {
  if (
    prediction.status === 'failed' &&
    typeof prediction.error === 'string' &&
    isGpuContentionError(prediction.error) &&
    job.result_context.recovery &&
    (job.recovery_count ?? 0) === 0 &&
    observationToken
  ) {
    return rpc<IJobResult>(
      'prepare_async_upscale_recovery',
      {
        p_user_id: job.user_id,
        p_job_id: job.job_id,
        p_attempt_id: job.attempt_id,
        p_observation_token: observationToken,
      },
      job.job_id
    );
  }
  return applyObservation(job, predictionObservation(prediction), observationToken);
}

async function submitPrediction(
  admitted: IJobResult,
  create: { path: string; body: string }
): Promise<IAsyncUpscaleTransport> {
  const job = requireJob(admitted);
  const identity = { userId: job.user_id, jobId: job.job_id };
  let response: Awaited<ReturnType<typeof providerRequest>>;
  try {
    response = await providerRequest(create.path, 'POST', create.body);
  } catch {
    // The claim remains durable if an accepted create loses its response.
    // Replays cannot create again; the original deadline governs refunds.
    return transport(admitted);
  }
  if (response.status >= 500) return transport(admitted);
  if (response.status >= 400) {
    const failed = await applyObservation(
      job,
      failureObservation(mapProviderError(response.body, response.status))
    );
    await terminalEffects(failed);
    return transport(failed);
  }
  const parsed = predictionSchema.safeParse(response.body);
  if (!parsed.success) return transport(admitted);
  const recorded = await rpc<boolean>(
    'record_async_upscale_prediction',
    {
      p_user_id: job.user_id,
      p_job_id: job.job_id,
      p_attempt_id: job.attempt_id,
      p_prediction_id: parsed.data.id,
    },
    job.job_id
  );
  if (!recorded) return transport(await readJob(identity));
  // Reuse the create response: never a second provider call in this invocation.
  const claimed = await rpc<IJobResult>('claim_async_upscale_observation', {
    p_user_id: job.user_id,
    p_job_id: job.job_id,
  });
  if (!claimed.claimed) return transport(claimed);
  let observed: IJobResult;
  try {
    observed = await observePrediction(requireJob(claimed), parsed.data, claimed.observation_token);
  } catch {
    await applyObservation(requireJob(claimed), {}, claimed.observation_token);
    throw unavailable(job.job_id);
  }
  await terminalEffects(observed);
  return transport(observed);
}

async function terminalEffects(result: IJobResult): Promise<void> {
  const job = requireJob(result);
  if (!job.terminal_at) return;
  const context = job.result_context;
  let logger: ReturnType<typeof createLogger> | undefined;
  try {
    const claimed = await rpc<boolean>('claim_async_upscale_terminal_effects', {
      p_user_id: job.user_id,
      p_job_id: job.job_id,
    });
    if (!claimed) return;
    logger = createLogger(new Request('https://async-upscale.internal/'), 'async-upscale', {
      userId: job.user_id,
      requestId: context.requestId,
      jobId: job.job_id,
    });
    const success = job.provider_phase === 'succeeded';
    const eventOptions = { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: job.user_id };
    const dimensions = context.response.dimensions;
    const effects: Array<() => Promise<unknown>> = [];
    if (success) {
      effects.push(async () => {
        const lifecycle = getEmailLifecycleService();
        await lifecycle.cancelPendingForUser(job.user_id, 'user_processed_image', [
          'signup-no-upload-2h',
          'signup-no-upload-24h',
          'signup-no-upload-3d-blog',
          'winback-never-uploaded-14d',
        ]);
        await lifecycle.queueFirstResultFollowup(job.user_id);
      });
      if (context.costAttribution) {
        effects.push(() =>
          recordProcessingCostTelemetry({
            userId: job.user_id,
            jobId: job.job_id,
            outputImagePath: job.output_url ?? undefined,
            attribution: context.costAttribution!,
          })
        );
      }
      effects.push(() =>
        trackServerEvent(
          'image_upscaled',
          {
            ...normalizeCoreEventProperties('image_upscaled', {
              qualityTier: job.quality_tier,
              scaleFactor: context.scale,
              inputWidth: dimensions?.input.width,
              inputHeight: dimensions?.input.height,
              outputWidth: dimensions?.output.width,
              outputHeight: dimensions?.output.height,
              fileType: context.response.mimeType,
              fileSizeBytes: context.response.fileSizeBytes,
              durationMs: duration(job),
            }),
          },
          eventOptions
        )
      );
    } else {
      effects.push(() =>
        trackServerEvent(
          'processing_failed',
          {
            telemetrySource: 'server',
            ...normalizeCoreEventProperties('processing_failed', {
              provider: 'Replicate',
              model: job.resolved_model,
              qualityTier: job.quality_tier,
              durationMs: duration(job),
              requestId: context.requestId,
              errorType: `replicate_${job.failure_code}`,
              reason: `replicate_${job.failure_code}`,
              retryable: !['SAFETY', 'INVALID_INPUT', 'IMAGE_TOO_LARGE'].includes(
                job.failure_code ?? ''
              ),
            }),
          },
          eventOptions
        )
      );
    }
    effects.push(() =>
      trackServerEvent(
        'upscale_completed',
        {
          telemetrySource: 'server',
          durationMs: duration(job),
          success,
          ...(success
            ? {
                modelUsed: job.resolved_model,
                inputResolution: dimensions
                  ? `${dimensions.input.width}x${dimensions.input.height}`
                  : undefined,
                outputResolution: dimensions
                  ? `${dimensions.output.width}x${dimensions.output.height}`
                  : undefined,
              }
            : { errorType: `replicate_${job.failure_code}` }),
        },
        eventOptions
      )
    );
    const results = await Promise.allSettled(effects.map(effect => Promise.resolve().then(effect)));
    if (results.some(effect => effect.status === 'rejected')) {
      logger.warn('Async upscale terminal telemetry incomplete', { jobId: job.job_id });
    }
  } catch {
    // The committed provider/financial transition remains authoritative even
    // when the best-effort claim or an external telemetry dependency fails.
    logger?.warn('Async upscale terminal effects unavailable', { jobId: job.job_id });
  } finally {
    try {
      await logger?.flush();
    } catch {
      // Logging cannot change the committed result.
    }
  }
}

export const asyncUpscaleService = {
  async replay({
    userId,
    request,
  }: Pick<IStartInput, 'userId' | 'request'>): Promise<IAsyncUpscaleTransport | null> {
    const result = await readJob({ userId, jobId: request.jobId }, await fingerprint(request));
    return result.outcome === 'new' ? null : transport(result);
  },

  async start(input: IStartInput): Promise<IAsyncUpscaleTransport> {
    const identity = { userId: input.userId, jobId: input.request.jobId };
    const requestFingerprint = await fingerprint(input.request);
    const previous = await readJob(identity, requestFingerprint);
    if (previous.outcome !== 'new') return transport(previous);
    const create = createPredictionRequest(input);
    const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const context: IStoredContext = {
      response: input.resultContext,
      costAttribution: input.costAttribution,
      requestId: input.requestId,
      workerRayId: input.workerRayId,
      startedAt: input.startedAt ?? Date.now(),
      requestedQualityTier: input.request.config.qualityTier,
      scale: input.request.config.scale,
      userTier: input.userTier,
      ...(isScalePreservingRecoveryEligible({
        modelId: input.modelId,
        qualityTier: input.resolvedTier,
        scale: input.request.config.scale,
        width: input.resultContext.dimensions?.input.width,
        height: input.resultContext.dimensions?.input.height,
        enhanceFaces: input.request.config.additionalOptions?.enhanceFaces,
      }) && {
        recovery: {
          ...createPredictionRequest({ ...input, modelId: 'real-esrgan-large' }),
          modelId: 'real-esrgan-large' as const,
          modelDisplayName: ModelRegistry.getInstance().getModel('real-esrgan-large')!.displayName,
        },
      }),
    };
    const admitted = await rpc<IJobResult>(
      'admit_async_upscale_job',
      {
        p_user_id: input.userId,
        p_job_id: input.request.jobId,
        p_request_fingerprint: requestFingerprint,
        p_input_storage_path: input.request.storagePath,
        p_resolved_model: input.modelId,
        p_quality_tier: input.resolvedTier,
        p_result_context: context,
        p_amount: input.creditCost,
        p_batch_limit: getHourlyProcessingLimit(input.userTier),
        p_delivery_token: token,
        p_delivery_token_hash: await hash(token),
        p_description: 'Image processing (Replicate)',
        p_worker_ray_id: input.workerRayId ?? null,
      },
      identity.jobId
    );
    if (admitted.outcome === 'batch_limit') {
      const limit = admitted.batch_limit ?? getHourlyProcessingLimit(input.userTier);
      const current = admitted.current_count ?? limit;
      const resetAt = admitted.retry_at;
      throw new AsyncUpscaleError(
        `Batch limit exceeded. Your plan allows ${limit} images per hour. ` +
          `You've processed ${current}. Upgrade for higher limits.`,
        ErrorCodes.BATCH_LIMIT_EXCEEDED,
        429,
        { current, limit, resetAt, upgradeUrl: '/pricing' },
        retryDelay(resetAt ?? null),
        {
          'X-Batch-Limit': String(limit),
          'X-Batch-Current': String(current),
          ...(resetAt && { 'X-Batch-Reset': resetAt }),
        }
      );
    }
    if (admitted.outcome === 'provider_unavailable') throw unavailable(identity.jobId);
    if (admitted.outcome === 'insufficient_credits') {
      throw new AsyncUpscaleError('Insufficient credits.', ErrorCodes.INSUFFICIENT_CREDITS, 402, {
        required: input.creditCost,
        available: admitted.available ?? admitted.balance?.total ?? 0,
      });
    }
    requireJob(admitted);
    if (admitted.outcome !== 'admitted') return transport(admitted);
    // Only the transaction winner emits admission effects. Best-effort helpers
    // cannot strand an admitted job or reverse its financial state.
    await Promise.allSettled([
      Promise.resolve().then(() =>
        trackServerEvent(
          'image_upscale_started',
          {
            telemetrySource: 'server',
            inputWidth: input.resultContext.dimensions?.input.width,
            inputHeight: input.resultContext.dimensions?.input.height,
            scaleFactor: input.request.config.scale,
            qualityTier: input.resolvedTier,
            modelUsed: input.modelId,
          },
          { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: input.userId }
        )
      ),
      ...(admitted.balance!.total <= 3
        ? [
            Promise.resolve().then(() =>
              getEmailLifecycleService().queueLowCreditAlert({
                userId: input.userId,
                creditsRemaining: admitted.balance!.total,
                reason: admitted.balance!.total <= 0 ? 'zero' : 'low',
              })
            ),
          ]
        : []),
    ]);
    return submitPrediction(admitted, create);
  },

  async read(identity: IJobIdentity): Promise<IAsyncUpscaleTransport> {
    const claimed = await rpc<IJobResult>(
      'claim_async_upscale_observation',
      { p_user_id: identity.userId, p_job_id: identity.jobId },
      identity.jobId
    );
    const job = requireJob(claimed);
    const expired =
      job.status === 'processing' &&
      (job.provider_phase === 'succeeded'
        ? job.delivery_deadline_at && dayjs(job.delivery_deadline_at).valueOf() <= Date.now()
        : dayjs(job.execution_deadline_at).valueOf() <= Date.now());
    if (expired) {
      const result = await applyObservation(job, {}, claimed.observation_token);
      await terminalEffects(result);
      if (
        result.reservation?.status === 'refunded' &&
        job.provider_phase === 'processing' &&
        job.provider_prediction_id
      ) {
        // The expired branch has made no provider read, so cancellation remains
        // this invocation's only provider call. Its result cannot undo a refund.
        await providerRequest(
          `/predictions/${encodeURIComponent(job.provider_prediction_id)}/cancel`,
          'POST',
          undefined,
          5000
        ).catch(() => undefined);
      }
      return transport(result);
    }
    if (job.status === 'processing' && job.recovery_state === 'queued') {
      const recovery = await rpc<IJobResult>(
        'claim_async_upscale_recovery',
        {
          p_user_id: identity.userId,
          p_job_id: identity.jobId,
        },
        identity.jobId
      );
      const request = requireJob(recovery).result_context.recovery;
      if (!recovery.claimed || !request) return transport(recovery);
      return submitPrediction(recovery, request);
    }
    if (!claimed.claimed || !job.provider_prediction_id) {
      await terminalEffects(claimed);
      return transport(claimed);
    }
    let result: IJobResult;
    try {
      const response = await providerRequest(
        `/predictions/${encodeURIComponent(job.provider_prediction_id)}`,
        'GET'
      );
      if (response.status >= 400) throw unavailable(identity.jobId, response.retryAfter);
      const prediction = predictionSchema.parse(response.body);
      if (prediction.id !== job.provider_prediction_id) throw unavailable(identity.jobId);
      result = await observePrediction(job, prediction, claimed.observation_token);
    } catch (error) {
      await applyObservation(job, {}, claimed.observation_token);
      throw error instanceof AsyncUpscaleError ? error : unavailable(identity.jobId);
    }
    await terminalEffects(result);
    return transport(result);
  },

  async listActive(userId: string, limit = 20): Promise<IAsyncUpscaleTransport> {
    const rows = await rpc<IActiveAsyncUpscaleRow[]>('list_active_async_upscale_jobs', {
      p_user_id: userId,
      p_limit: Math.min(Math.max(Math.floor(limit), 1), 20),
    });
    return activeTransport(Array.isArray(rows) ? rows : []);
  },

  async reconcileDue(limit = 20, concurrency = 2): Promise<IAsyncReconciliationResult> {
    const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 20);
    const boundedConcurrency = Math.min(Math.max(Math.floor(concurrency), 1), 2);
    const { data, error } = await supabaseAdmin.rpc('list_due_async_upscale_jobs', {
      p_limit: boundedLimit,
    });
    if (error) throw new Error(`Failed to list due async upscale jobs: ${error.message}`);

    const jobs = (Array.isArray(data) ? data : data ? [data] : []) as IDueAsyncJob[];
    const totalDue = Number(jobs[0]?.due_count ?? 0);
    const oldestDue = jobs.reduce<number | null>((oldest, job) => {
      const timestamp = Date.parse(job.next_observation_at);
      if (!Number.isFinite(timestamp)) return oldest;
      return oldest === null ? timestamp : Math.min(oldest, timestamp);
    }, null);
    let cursor = 0;
    let processedCount = 0;
    let failedCount = 0;
    const failedJobIds: string[] = [];
    const worker = async (): Promise<void> => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        try {
          await asyncUpscaleService.read({ userId: job.user_id, jobId: job.job_id });
          processedCount += 1;
        } catch {
          failedCount += 1;
          failedJobIds.push(job.job_id);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(boundedConcurrency, jobs.length) }, () => worker())
    );
    return {
      processedCount,
      failedCount,
      remainingCount: Math.max(0, totalDue - processedCount),
      oldestDueAgeMs: oldestDue === null ? null : Math.max(0, Date.now() - oldestDue),
      failedJobIds,
    };
  },
};
