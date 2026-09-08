import { createHash, randomBytes } from 'node:crypto';

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { AppError, ErrorCodes } from '@shared/utils/errors';
import { UUID_V4_PATTERN } from '@shared/validation/uuid';

const DEFAULT_RETRY_AFTER_MS = 2_000;
const MAX_LIST_LIMIT = 50;

const SAFE_STATUS_COLUMNS = [
  'job_id',
  'stage',
  'config',
  'quality_tier',
  'scale',
  'resolved_model_id',
  'credits_reserved',
  'retryable',
  'output_storage_path',
  'output_mime_type',
  'output_size_bytes',
  'output_width',
  'output_height',
  'output_expires_at',
  'failure_reason',
  'created_at',
  'started_at',
  'ready_at',
  'completed_at',
  'failed_at',
  'refunded_at',
  'deadline_at',
  'updated_at',
].join(',');

const SAFE_FAILURE_REASONS = new Set([
  'processing_failed',
  'provider_unavailable',
  'provider_timeout',
  'provider_rate_limited',
  'invalid_input',
  'safety',
  'output_staging_failed',
  'submission_unknown_expired',
  'delivery_expired',
  'expired',
]);

const PUBLIC_STAGES = [
  'queued',
  'submitting',
  'submission_unknown',
  'processing',
  'staging',
  'ready',
  'completed',
  'failed',
  'expired',
] as const;

export type UpscaleJobStage = (typeof PUBLIC_STAGES)[number];
export type UpscaleJobStatus =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'completed'
  | 'failed'
  | 'expired';

/** The admission route has already validated customer input and resolved account policy. */
export interface IUpscaleAdmissionInput {
  userId: string;
  jobId: string;
  requestFingerprint: string;
  requestConfig: Record<string, unknown>;
  inputObjectPath: string;
  inputMimeType: string;
  inputSizeBytes: number;
  inputWidth: number | null;
  inputHeight: number | null;
  scale: 2 | 4 | 8;
  selectionMode: 'explicit' | 'auto';
  requestedQualityTier: string;
  resolvedQualityTier: string;
  billingModelId: string;
  resolvedModelId: string;
  resolvedProvider: 'replicate' | 'gemini' | 'deferred';
  resolvedModelVersion?: string | null;
  exactCharge: number;
  batchLimit: number;
  deadlineAt: Date;
  submissionDeadlineAt: Date;
  buildId: string;
}

export interface IUpscaleAdmissionResult {
  outcome: 'admitted' | 'replay';
  replayed: boolean;
  jobId: string;
  stage: UpscaleJobStage;
  status: UpscaleJobStatus;
  exactCharge: number;
  creditsRemaining: number | null;
  batchCurrent: number | null;
  batchLimit: number;
  statusUrl: string;
  retryAfterMs: number;
  httpStatus: 200 | 202;
}

export interface IUpscaleJobStatus {
  jobId: string;
  stage: UpscaleJobStage;
  status: UpscaleJobStatus;
  requestedQualityTier: string | null;
  resolvedQualityTier: string | null;
  modelId: string | null;
  scale: 2 | 4 | 8 | null;
  exactCharge: number | null;
  creditsRemaining: number | null;
  retryable: boolean;
  refunded: boolean;
  outputAvailable: boolean;
  outputMimeType: string | null;
  outputSizeBytes: number | null;
  outputWidth: number | null;
  outputHeight: number | null;
  outputExpiresAt: string | null;
  deliveryToken?: string;
  failureReason: string | null;
  timestamps: {
    createdAt: string | null;
    startedAt: string | null;
    readyAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
    refundedAt: string | null;
    deadlineAt: string | null;
    updatedAt: string | null;
  };
  statusUrl: string;
}

export interface IUpscaleJobListResult {
  jobs: IUpscaleJobStatus[];
  nextCursor: string | null;
}

export class UpscaleJobError extends AppError {
  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(code, message, statusCode, details);
    this.name = 'UpscaleJobError';
  }
}

interface IAdmissionRpcRow {
  result_code?: unknown;
  job_id?: unknown;
  status?: unknown;
  stage?: unknown;
  credits_remaining?: unknown;
  reserved_credits?: unknown;
  retry_after_ms?: unknown;
  batch_limit?: unknown;
  output_available?: unknown;
  failure_reason?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

interface IExecutionRow {
  job_id?: unknown;
  stage?: unknown;
  config?: unknown;
  quality_tier?: unknown;
  scale?: unknown;
  resolved_model_id?: unknown;
  credits_reserved?: unknown;
  retryable?: unknown;
  output_storage_path?: unknown;
  output_mime_type?: unknown;
  output_size_bytes?: unknown;
  output_width?: unknown;
  output_height?: unknown;
  output_expires_at?: unknown;
  failure_reason?: unknown;
  created_at?: unknown;
  started_at?: unknown;
  ready_at?: unknown;
  completed_at?: unknown;
  failed_at?: unknown;
  refunded_at?: unknown;
  deadline_at?: unknown;
  updated_at?: unknown;
}

function firstRow<T>(data: T | T[] | null | undefined): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function asNullablePositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return asPositiveInteger(value);
}

function asIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function publicStatusForStage(stage: UpscaleJobStage): UpscaleJobStatus {
  if (stage === 'queued') return 'queued';
  if (stage === 'ready') return 'ready';
  if (stage === 'completed') return 'completed';
  if (stage === 'failed') return 'failed';
  if (stage === 'expired') return 'expired';
  return 'processing';
}

function parseStage(value: unknown): UpscaleJobStage {
  if (typeof value === 'string' && (PUBLIC_STAGES as readonly string[]).includes(value)) {
    return value as UpscaleJobStage;
  }
  throw new UpscaleJobError(
    ErrorCodes.INTERNAL_ERROR,
    'Unable to read upscale job state. Please try again shortly.',
    503
  );
}

function safePublicIdentifier(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return null;
  if (value.includes('://') || !/^[A-Za-z0-9._:/-]+$/.test(value)) return null;
  return value;
}

function safeFailureReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().split(':', 1)[0];
  return SAFE_FAILURE_REASONS.has(candidate)
    ? candidate
    : value.trim()
      ? 'processing_failed'
      : null;
}

function safeMimeType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const mimeType = value.split(';', 1)[0]?.trim().toLowerCase();
  return /^(image\/(?:png|jpe?g|webp|gif|avif|heic))$/.test(mimeType) ? mimeType : null;
}

function safeScale(value: unknown): 2 | 4 | 8 | null {
  return value === 2 || value === 4 || value === 8 ? value : null;
}

function safeJsonString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || value.length > maxLength) return null;
  return value;
}

function sanitizeRequestConfig(value: unknown): Record<string, unknown> {
  const source = isRecord(value) ? value : {};
  const nestedConfig = isRecord(source.config) ? source.config : source;
  const result: Record<string, unknown> = {};

  for (const key of ['qualityTier', 'scale', 'targetResolution']) {
    const field = nestedConfig[key];
    if (typeof field === 'string' || typeof field === 'number') result[key] = field;
  }

  const additionalOptions = isRecord(nestedConfig.additionalOptions)
    ? nestedConfig.additionalOptions
    : null;
  if (additionalOptions) {
    const safeOptions: Record<string, unknown> = {};
    for (const key of ['smartAnalysis', 'enhance', 'enhanceFaces', 'preserveText']) {
      if (typeof additionalOptions[key] === 'boolean') safeOptions[key] = additionalOptions[key];
    }
    const customInstructions = safeJsonString(additionalOptions.customInstructions, 2_000);
    if (customInstructions !== null) safeOptions.customInstructions = customInstructions;

    const enhancement = isRecord(additionalOptions.enhancement)
      ? additionalOptions.enhancement
      : null;
    if (enhancement) {
      const safeEnhancement: Record<string, boolean> = {};
      for (const key of ['clarity', 'color', 'lighting', 'denoise', 'artifacts', 'details']) {
        if (typeof enhancement[key] === 'boolean') safeEnhancement[key] = enhancement[key];
      }
      if (Object.keys(safeEnhancement).length > 0) safeOptions.enhancement = safeEnhancement;
    }
    if (Object.keys(safeOptions).length > 0) result.additionalOptions = safeOptions;
  }

  const nanoBananaProConfig = isRecord(nestedConfig.nanoBananaProConfig)
    ? nestedConfig.nanoBananaProConfig
    : null;
  if (nanoBananaProConfig) {
    const safeStudioConfig: Record<string, string> = {};
    for (const key of ['aspectRatio', 'resolution', 'outputFormat', 'safetyFilterLevel']) {
      const field = nanoBananaProConfig[key];
      if (typeof field === 'string' && field.length <= 64) safeStudioConfig[key] = field;
    }
    if (Object.keys(safeStudioConfig).length > 0) {
      result.nanoBananaProConfig = safeStudioConfig;
    }
  }

  const enhancementPrompt = safeJsonString(
    source.enhancementPrompt ?? nestedConfig.enhancementPrompt,
    2_000
  );
  if (enhancementPrompt !== null) result.enhancementPrompt = enhancementPrompt;

  return result;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!isRecord(value)) return JSON.stringify(value) ?? 'null';
  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

/** Hash only normalized customer input, never mutable pricing/model resolution. */
export function createUpscaleRequestFingerprint(input: {
  storagePath: string;
  mimeType: string;
  config: unknown;
  enhancementPrompt?: string;
}): string {
  return createHash('sha256')
    .update(
      stableStringify({
        storagePath: input.storagePath.trim(),
        mimeType: input.mimeType.toLowerCase(),
        config: sanitizeRequestConfig({
          config: input.config,
          enhancementPrompt: input.enhancementPrompt,
        }),
      })
    )
    .digest('hex');
}

function statusUrl(jobId: string): string {
  return `/api/upscale/jobs?jobId=${encodeURIComponent(jobId)}`;
}

function getRpcErrorMessage(error: unknown): string {
  if (!isRecord(error)) return '';
  return typeof error.message === 'string' ? error.message : '';
}

function mapRpcError(error: unknown, operation: string): UpscaleJobError {
  const message = getRpcErrorMessage(error);
  const normalized = message.toLowerCase();

  if (normalized.includes('upscale_job_not_found')) {
    return new UpscaleJobError(ErrorCodes.NOT_FOUND, 'Upscale job was not found.', 404);
  }
  if (normalized.includes('upscale_job_conflict')) {
    return new UpscaleJobError(
      ErrorCodes.INVALID_REQUEST,
      'This job ID is already associated with different request settings.',
      409
    );
  }
  if (normalized.includes('batch_limit_exceeded')) {
    const parts = message.split(':');
    const current = Number(parts[1]);
    const limit = Number(parts[2]);
    const resetAt = parts.slice(3).join(':');
    const details: Record<string, unknown> = {};
    if (Number.isSafeInteger(current) && current >= 0) details.current = current;
    if (Number.isSafeInteger(limit) && limit > 0) details.limit = limit;
    if (resetAt && !Number.isNaN(new Date(resetAt).getTime())) details.resetAt = resetAt;
    return new UpscaleJobError(
      ErrorCodes.BATCH_LIMIT_EXCEEDED,
      'Your processing limit has been reached. Please try again later.',
      429,
      details
    );
  }
  if (normalized.includes('insufficient credits')) {
    return new UpscaleJobError(
      ErrorCodes.INSUFFICIENT_CREDITS,
      'You do not have enough credits for this image.',
      402
    );
  }
  if (
    normalized.includes('invalid_admission') ||
    normalized.includes('invalid_request_fingerprint') ||
    normalized.includes('invalid upscale input')
  ) {
    return new UpscaleJobError(
      ErrorCodes.VALIDATION_ERROR,
      'The upscale admission request is invalid.',
      400
    );
  }
  if (normalized.includes('duplicate') || normalized.includes('unique constraint')) {
    return new UpscaleJobError(
      ErrorCodes.INVALID_REQUEST,
      'This job ID is already associated with another request.',
      409
    );
  }

  // Keep PostgREST/provider/database details out of the response and logs.
  void operation;
  return new UpscaleJobError(
    ErrorCodes.INTERNAL_ERROR,
    'Durable upscale service is temporarily unavailable. Please try again shortly.',
    503
  );
}

function mapExecutionRow(row: IExecutionRow): IUpscaleJobStatus {
  const jobId = safePublicIdentifier(row.job_id);
  if (!jobId || !UUID_V4_PATTERN.test(jobId)) {
    throw new UpscaleJobError(
      ErrorCodes.INTERNAL_ERROR,
      'Unable to read upscale job state. Please try again shortly.',
      503
    );
  }
  const stage = parseStage(row.stage);
  const config = isRecord(row.config) ? row.config : {};
  const scale = safeScale(row.scale) ?? safeScale(config.scale);
  const outputExpiresAt = asIsoTimestamp(row.output_expires_at);
  const hasOutputPath =
    typeof row.output_storage_path === 'string' && row.output_storage_path.length > 0;
  const outputAvailable =
    (stage === 'ready' || stage === 'completed') &&
    hasOutputPath &&
    outputExpiresAt !== null &&
    new Date(outputExpiresAt).getTime() > Date.now();
  const outputMimeType = outputAvailable ? safeMimeType(row.output_mime_type) : null;
  const outputSizeBytes = outputAvailable ? asNullablePositiveInteger(row.output_size_bytes) : null;
  return {
    jobId,
    stage,
    status: publicStatusForStage(stage),
    requestedQualityTier: safePublicIdentifier(
      config.requestedQualityTier ?? config.qualityTier ?? row.quality_tier
    ),
    resolvedQualityTier: safePublicIdentifier(row.quality_tier),
    modelId: safePublicIdentifier(row.resolved_model_id),
    scale,
    exactCharge: asPositiveInteger(row.credits_reserved),
    creditsRemaining: null,
    retryable:
      typeof row.retryable === 'boolean'
        ? row.retryable
        : stage === 'failed' || stage === 'expired',
    refunded: Boolean(row.refunded_at),
    outputAvailable: outputAvailable && outputMimeType !== null && outputSizeBytes !== null,
    outputMimeType,
    outputSizeBytes,
    outputWidth: asNullablePositiveInteger(row.output_width),
    outputHeight: asNullablePositiveInteger(row.output_height),
    outputExpiresAt: outputAvailable ? outputExpiresAt : null,
    failureReason: safeFailureReason(row.failure_reason),
    timestamps: {
      createdAt: asIsoTimestamp(row.created_at),
      startedAt: asIsoTimestamp(row.started_at),
      readyAt: asIsoTimestamp(row.ready_at),
      completedAt: asIsoTimestamp(row.completed_at),
      failedAt: asIsoTimestamp(row.failed_at),
      refundedAt: asIsoTimestamp(row.refunded_at),
      deadlineAt: asIsoTimestamp(row.deadline_at),
      updatedAt: asIsoTimestamp(row.updated_at),
    },
    statusUrl: statusUrl(jobId),
  };
}

export class UpscaleJobService {
  async getReplay(
    userId: string,
    jobId: string,
    fingerprint: string
  ): Promise<IUpscaleAdmissionResult | null> {
    this.validateLookup(userId, jobId);
    const { data, error } = await supabaseAdmin
      .from('upscale_executions')
      .select('user_id,job_id,request_fingerprint,stage,credits_reserved,batch_limit')
      .eq('job_id', jobId)
      .maybeSingle();
    if (error) throw mapRpcError(error, 'replay_upscale_execution');
    if (!data) return null;
    if (data.user_id !== userId)
      throw new UpscaleJobError(ErrorCodes.NOT_FOUND, 'Upscale job was not found.', 404);
    if (data.request_fingerprint !== fingerprint)
      throw new UpscaleJobError(
        ErrorCodes.INVALID_REQUEST,
        'This job ID is already associated with different request settings.',
        409
      );
    const stage = parseStage(data.stage);
    const terminal = ['completed', 'failed', 'expired'].includes(stage);
    return {
      outcome: 'replay',
      replayed: true,
      jobId,
      stage,
      status: publicStatusForStage(stage),
      exactCharge: asPositiveInteger(data.credits_reserved) ?? 0,
      creditsRemaining: await this.getBalance(userId),
      batchCurrent: null,
      batchLimit: asPositiveInteger(data.batch_limit) ?? 1,
      statusUrl: statusUrl(jobId),
      retryAfterMs: terminal ? 0 : DEFAULT_RETRY_AFTER_MS,
      httpStatus: terminal ? 200 : 202,
    };
  }

  private async getBalance(userId: string): Promise<number | null> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('subscription_credits_balance,purchased_credits_balance')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    const subscription = Number(data.subscription_credits_balance);
    const purchased = Number(data.purchased_credits_balance);
    return Number.isSafeInteger(subscription) && Number.isSafeInteger(purchased)
      ? subscription + purchased
      : null;
  }

  async admit(input: IUpscaleAdmissionInput): Promise<IUpscaleAdmissionResult> {
    const normalized = input;
    const { data, error } = await supabaseAdmin.rpc('admit_upscale_execution', {
      p_user_id: normalized.userId,
      p_job_id: normalized.jobId,
      p_request_fingerprint: normalized.requestFingerprint,
      p_input_storage_path: normalized.inputObjectPath,
      p_input_mime_type: normalized.inputMimeType,
      p_input_size_bytes: normalized.inputSizeBytes,
      p_input_width: normalized.inputWidth,
      p_input_height: normalized.inputHeight,
      p_quality_tier: normalized.resolvedQualityTier ?? normalized.requestedQualityTier,
      p_scale: normalized.scale,
      p_config: normalized.requestConfig,
      p_billing_model_id: normalized.billingModelId,
      p_resolved_model_id: normalized.resolvedModelId,
      p_provider: normalized.resolvedProvider,
      p_model_version: normalized.resolvedModelVersion ?? null,
      p_amount: normalized.exactCharge,
      p_batch_limit: normalized.batchLimit,
      p_deadline_at: normalized.deadlineAt.toISOString(),
      p_build_id: normalized.buildId,
      p_submission_deadline_at: normalized.submissionDeadlineAt.toISOString(),
    });

    if (error) throw mapRpcError(error, 'admit_upscale_execution');

    const row = firstRow(data as IAdmissionRpcRow | IAdmissionRpcRow[] | null);
    if (!row) {
      throw new UpscaleJobError(
        ErrorCodes.INTERNAL_ERROR,
        'Durable upscale service is temporarily unavailable. Please try again shortly.',
        503
      );
    }

    const resultCode = row.result_code;
    const outcome =
      resultCode === 'replay' ? 'replay' : resultCode === 'admitted' ? 'admitted' : null;
    if (!outcome) {
      if (resultCode === 'executor_unavailable')
        throw new UpscaleJobError(
          ErrorCodes.AI_UNAVAILABLE,
          'Image processing is temporarily unavailable. Your credits have not been charged.',
          503,
          { retryable: true, noDebit: true, admissionPaused: true, jobId: input.jobId }
        );
      if (resultCode === 'not_found')
        throw new UpscaleJobError(ErrorCodes.NOT_FOUND, 'Upscale job was not found.', 404);
      if (resultCode === 'invalid_admission')
        throw new UpscaleJobError(ErrorCodes.VALIDATION_ERROR, 'Invalid upscale admission.', 400);
      if (resultCode === 'batch_limit') {
        throw new UpscaleJobError(
          ErrorCodes.BATCH_LIMIT_EXCEEDED,
          'Your processing limit has been reached. Please try again later.',
          429
        );
      }
      if (resultCode === 'conflict') {
        throw new UpscaleJobError(
          ErrorCodes.INVALID_REQUEST,
          'This job ID is already associated with different request settings.',
          409
        );
      }
      throw new UpscaleJobError(
        ErrorCodes.INTERNAL_ERROR,
        'Durable upscale service is temporarily unavailable. Please try again shortly.',
        503
      );
    }

    const jobId = safePublicIdentifier(row.job_id) ?? normalized.jobId;
    const stage = parseStage(row.stage ?? 'queued');
    const exactCharge = asPositiveInteger(row.reserved_credits) ?? normalized.exactCharge;
    const replayed = outcome === 'replay';
    const terminal = stage === 'completed' || stage === 'failed' || stage === 'expired';

    return {
      outcome,
      replayed,
      jobId,
      stage,
      status: publicStatusForStage(stage),
      exactCharge,
      creditsRemaining: typeof row.credits_remaining === 'number' ? row.credits_remaining : null,
      batchCurrent: null,
      batchLimit: asPositiveInteger(row.batch_limit) ?? normalized.batchLimit,
      statusUrl: statusUrl(jobId),
      retryAfterMs:
        typeof row.retry_after_ms === 'number' && row.retry_after_ms >= 0
          ? row.retry_after_ms
          : terminal
            ? 0
            : DEFAULT_RETRY_AFTER_MS,
      httpStatus: replayed && terminal ? 200 : 202,
    };
  }

  async getStatus(userId: string, jobId: string): Promise<IUpscaleJobStatus | null> {
    this.validateLookup(userId, jobId);

    const { data, error } = await supabaseAdmin
      .from('upscale_executions')
      .select(SAFE_STATUS_COLUMNS)
      .eq('user_id', userId)
      .eq('job_id', jobId)
      .maybeSingle();

    if (error) throw mapRpcError(error, 'get_upscale_execution');
    if (!data) return null;

    const status = mapExecutionRow(data as IExecutionRow);
    status.creditsRemaining = await this.getBalance(userId);
    if ((status.stage === 'ready' || status.stage === 'completed') && status.outputAvailable) {
      const deliveryToken = await this.issueDeliveryCapability(userId, jobId);
      if (deliveryToken) status.deliveryToken = deliveryToken;
    }
    return status;
  }

  async issueDeliveryCapability(userId: string, jobId: string): Promise<string | null> {
    this.validateLookup(userId, jobId);

    const deliveryToken = randomBytes(32).toString('base64url');
    const deliveryTokenHash = createHash('sha256').update(deliveryToken).digest('hex');
    const { data, error } = await supabaseAdmin.rpc('issue_upscale_delivery_capability', {
      p_user_id: userId,
      p_job_id: jobId,
      p_delivery_token_hash: deliveryTokenHash,
    });

    if (error) throw mapRpcError(error, 'issue_upscale_delivery_capability');
    const issued: unknown = Array.isArray(data) ? data[0] : data;
    return (typeof issued === 'boolean' && issued) ||
      (isRecord(issued) && typeof issued.output_storage_path === 'string')
      ? deliveryToken
      : null;
  }

  async list(
    userId: string,
    before?: string,
    limit = MAX_LIST_LIMIT
  ): Promise<IUpscaleJobListResult> {
    if (!asNonEmptyString(userId)) {
      throw new UpscaleJobError(ErrorCodes.UNAUTHORIZED, 'Authentication required.', 401);
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
      throw new UpscaleJobError(ErrorCodes.VALIDATION_ERROR, 'The job list limit is invalid.', 400);
    }

    const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const eligible = `stage.in.(queued,submitting,submission_unknown,processing,staging,ready),created_at.gte.${recent}`;
    let filter = eligible;
    if (before) {
      let cursor: { createdAt: string; jobId: string };
      try {
        cursor = JSON.parse(Buffer.from(before, 'base64url').toString('utf8'));
        if (!UUID_V4_PATTERN.test(cursor.jobId) || !asIsoTimestamp(cursor.createdAt))
          throw new Error('Invalid cursor');
      } catch {
        throw new UpscaleJobError(
          ErrorCodes.VALIDATION_ERROR,
          'The job list cursor is invalid.',
          400
        );
      }
      const timestamp = asIsoTimestamp(cursor.createdAt);
      filter = `and(or(${eligible}),or(created_at.lt.${timestamp},and(created_at.eq.${timestamp},job_id.lt.${cursor.jobId})))`;
    }
    const query = supabaseAdmin
      .from('upscale_executions')
      .select(SAFE_STATUS_COLUMNS)
      .eq('user_id', userId)
      .or(filter)
      .order('created_at', { ascending: false })
      .order('job_id', { ascending: false })
      .limit(limit + 1);

    const { data, error } = await query;
    if (error) throw mapRpcError(error, 'list_upscale_executions');

    const rows = (Array.isArray(data) ? data : []) as IExecutionRow[];
    const hasMore = rows.length > limit;
    const jobs = rows.slice(0, limit).map(row => mapExecutionRow(row));
    const last = jobs.at(-1);
    return {
      jobs,
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({ createdAt: last.timestamps.createdAt, jobId: last.jobId })
            ).toString('base64url')
          : null,
    };
  }

  private validateLookup(userId: string, jobId: string): void {
    if (!asNonEmptyString(userId)) {
      throw new UpscaleJobError(ErrorCodes.UNAUTHORIZED, 'Authentication required.', 401);
    }
    if (!asNonEmptyString(jobId) || !UUID_V4_PATTERN.test(jobId)) {
      throw new UpscaleJobError(ErrorCodes.VALIDATION_ERROR, 'The job ID is invalid.', 400);
    }
  }
}

export const upscaleJobService = new UpscaleJobService();
