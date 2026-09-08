import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@shared/config/env';

import { ModelRegistry } from '@server/services/model-registry';
import { buildModelInput } from '@server/services/replicate/builders';
import { upscaleSchema } from '@shared/validation/upscale.schema';
import type {
  IExecutorAttempt,
  IExecutorExecution,
  IProviderAdapter,
  IProviderPrediction,
} from './advance';

export interface IReplicatePredictionPage {
  results: unknown[];
  next?: string | null;
}

export interface IReplicateClient {
  predictions: {
    create(options: IReplicateCreateOptions): Promise<unknown>;
    get(predictionId: string, options?: { signal?: AbortSignal }): Promise<unknown>;
    list(options?: { signal?: AbortSignal; cursor?: string }): Promise<IReplicatePredictionPage>;
    cancel?(predictionId: string, options?: { signal?: AbortSignal }): Promise<unknown>;
  };
  paginate?(
    endpoint: () => Promise<IReplicatePredictionPage>,
    options?: { signal?: AbortSignal }
  ): AsyncIterable<unknown[]>;
}

export type IReplicateCreateOptions = {
  input: object;
  webhook: string;
  webhook_events_filter: string[];
  signal?: AbortSignal;
} & ({ model: string } | { version: string });

export interface IReplicateAdapterOptions {
  client?: IReplicateClient;
  token?: string;
  callbackBaseUrl?: string;
  webhookSecret?: string;
  fetch?: typeof fetch;
  createTimeoutMs?: number;
  statusTimeoutMs?: number;
  callbackTimestampToleranceMs?: number;
  maxHistoryPages?: number;
  modelRegistry?: Pick<ModelRegistry, 'getModel'>;
  now?: () => number;
}

export interface IReplicateWebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export interface IReplicateWebhookVerificationInput {
  body: string;
  headers: IReplicateWebhookHeaders;
}

export class ReplicateAdapterError extends Error {
  readonly ambiguous: boolean;
  readonly status?: number;

  constructor(message: string, options: { ambiguous?: boolean; status?: number } = {}) {
    super(message);
    this.name = 'ReplicateAdapterError';
    this.ambiguous = options.ambiguous ?? false;
    this.status = options.status;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ReplicateAdapterError(`Replicate response is missing ${field}`);
  }
  return value;
}

function normalizePrediction(value: unknown): IProviderPrediction {
  const record = asRecord(value);
  if (!record) throw new ReplicateAdapterError('Replicate returned a non-object prediction');

  return {
    id: requiredString(record.id, 'prediction ID'),
    status: requiredString(record.status, 'prediction status'),
    model: typeof record.model === 'string' ? record.model : undefined,
    version: typeof record.version === 'string' ? record.version : undefined,
    input: record.input,
    output: record.output,
    error: record.error,
    webhook: typeof record.webhook === 'string' ? record.webhook : undefined,
    retryAfterMs: typeof record.retryAfterMs === 'number' ? record.retryAfterMs : undefined,
    completedAt: typeof record.completed_at === 'string' ? record.completed_at : undefined,
  };
}

function parseModelReference(reference: string): { model: string } | { version: string } {
  const match = /^(?<model>[^/]+\/[^/:]+)(?::(?<version>.+))?$/.exec(reference.trim());
  if (!match?.groups?.model) {
    throw new ReplicateAdapterError(`Invalid Replicate model reference: ${reference}`);
  }
  return match.groups.version ? { version: match.groups.version } : { model: match.groups.model };
}

function getModelReference(
  execution: IExecutorExecution,
  modelRegistry: Pick<ModelRegistry, 'getModel'>
): string {
  if (execution.model_version) return execution.model_version;
  const configuredModel = modelRegistry.getModel(execution.resolved_model_id);
  if (!configuredModel?.modelVersion) {
    throw new ReplicateAdapterError(
      `No immutable model version is stored for ${execution.resolved_model_id}`
    );
  }
  return configuredModel.modelVersion;
}

function toProcessorInput(
  execution: IExecutorExecution,
  inputUrl: string
): Parameters<typeof buildModelInput>[1] {
  const parsed = upscaleSchema.parse({
    storagePath: execution.input_storage_path,
    jobId: execution.job_id,
    mimeType: execution.input_mime_type,
    config: execution.config,
    enhancementPrompt: asRecord(execution.config)?.enhancementPrompt,
  });

  return {
    ...parsed,
    imageData: inputUrl,
    originalWidth: execution.input_width ?? undefined,
    originalHeight: execution.input_height ?? undefined,
  };
}

function callbackUrl(
  baseUrl: string,
  execution: IExecutorExecution,
  attempt: IExecutorAttempt
): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ReplicateAdapterError('Executor callback base URL is invalid');
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new ReplicateAdapterError(
      'Executor callback URL must use HTTPS outside local development'
    );
  }
  url.searchParams.set('jobId', execution.job_id);
  url.searchParams.set('attemptId', attempt.attempt_id);
  url.searchParams.set('correlation', attempt.callback_correlation);
  return url.toString();
}

function abortError(error: unknown): boolean {
  return (
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'UND_ERR_CONNECT_TIMEOUT')
  );
}

function responseStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== 'object') return undefined;
  const status = (response as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function isAmbiguousCreateFailure(error: unknown): boolean {
  if (abortError(error)) return true;
  const status = responseStatus(error);
  if (status === undefined) return true;
  return status === 408 || status === 429 || status >= 500;
}

async function withAbortTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  const abortFromParent = (): void => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

function extractCorrelation(webhook: string | undefined): string | undefined {
  if (!webhook) return undefined;
  try {
    return new URL(webhook).searchParams.get('correlation') ?? undefined;
  } catch {
    return undefined;
  }
}

function urlLike(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value;
  }
}

function valuesMatch(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'string' && typeof actual === 'string') {
    return expected.startsWith('https://') || actual.startsWith('https://')
      ? urlLike(expected) === urlLike(actual)
      : expected === actual;
  }
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((item, index) => valuesMatch(item, actual[index]))
    );
  }
  if (expected && typeof expected === 'object') {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = asRecord(actual);
    return Boolean(
      actualRecord &&
      Object.entries(expectedRecord).every(([key, value]) => valuesMatch(value, actualRecord[key]))
    );
  }
  return expected === actual;
}

function modelMatchesPrediction(prediction: IProviderPrediction, reference: string): boolean {
  const target = parseModelReference(reference);
  if ('version' in target) {
    return prediction.version === target.version || prediction.version === reference;
  }
  return prediction.model === target.model;
}

export class ReplicateAdapter implements IProviderAdapter {
  readonly providerName = 'replicate';

  private readonly client: IReplicateClient;
  private readonly callbackBaseUrl?: string;
  private readonly webhookSecret?: string;
  private readonly createTimeoutMs: number;
  private readonly statusTimeoutMs: number;
  private readonly callbackTimestampToleranceMs: number;
  private readonly maxHistoryPages: number;
  private readonly modelRegistry: Pick<ModelRegistry, 'getModel'>;
  private readonly now: () => number;

  constructor(options: IReplicateAdapterOptions = {}) {
    this.callbackBaseUrl = options.callbackBaseUrl;
    this.webhookSecret = options.webhookSecret;
    this.createTimeoutMs = options.createTimeoutMs ?? 15_000;
    this.statusTimeoutMs = options.statusTimeoutMs ?? 10_000;
    this.callbackTimestampToleranceMs = options.callbackTimestampToleranceMs ?? 5 * 60 * 1000;
    this.maxHistoryPages = options.maxHistoryPages ?? 3;
    this.modelRegistry = options.modelRegistry ?? ModelRegistry.getInstance();
    this.now = options.now ?? (() => Date.now());

    if (options.client) {
      this.client = options.client;
      return;
    }

    const token = options.token ?? serverEnv.REPLICATE_API_TOKEN;
    if (!token) throw new ReplicateAdapterError('REPLICATE_API_TOKEN is not configured');
    const fetcher = options.fetch ?? globalThis.fetch;
    const request = async (
      path: string,
      init: NonNullable<Parameters<typeof fetch>[1]> = {}
    ): Promise<unknown> => {
      const target = new URL(path, 'https://api.replicate.com');
      if (target.origin !== 'https://api.replicate.com' || !target.pathname.startsWith('/v1/')) {
        throw new ReplicateAdapterError('Replicate history URL is not allowed');
      }
      const response = await fetcher(target.toString(), {
        ...init,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
      const retryAfter = response.headers.get('retry-after');
      const retryAfterMs = retryAfter
        ? /^\d+$/.test(retryAfter)
          ? Number(retryAfter) * 1000
          : Math.max(0, Date.parse(retryAfter) - this.now())
        : undefined;
      if (!response.ok) {
        await response.body?.cancel();
        throw Object.assign(
          new ReplicateAdapterError(`Replicate HTTP ${response.status}`, {
            status: response.status,
            ambiguous: response.status === 408 || response.status === 429 || response.status >= 500,
          }),
          { retryAfterMs }
        );
      }
      const limit = 1024 * 1024;
      const length = response.headers.get('content-length');
      if (length && (!Number.isSafeInteger(Number(length)) || Number(length) > limit)) {
        await response.body?.cancel();
        throw new ReplicateAdapterError('Replicate response exceeds metadata byte limit', {
          ambiguous: true,
        });
      }
      if (!response.body)
        throw new ReplicateAdapterError('Replicate response body missing', { ambiguous: true });
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > limit)
            throw new ReplicateAdapterError('Replicate response exceeds metadata byte limit', {
              ambiguous: true,
            });
          chunks.push(chunk.value);
        }
        const value = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
        if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs))
          value.retryAfterMs = retryAfterMs;
        return value;
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    };
    this.client = {
      predictions: {
        create: ({ signal, ...input }) => {
          const path =
            'model' in input ? `/v1/models/${input.model}/predictions` : '/v1/predictions';
          const { model: _model, ...body } = input as IReplicateCreateOptions & { model?: string };
          return request(path, { method: 'POST', body: JSON.stringify(body), signal });
        },
        get: (id, opts) =>
          request(`/v1/predictions/${encodeURIComponent(id)}`, { signal: opts?.signal }),
        list: async opts =>
          request(opts?.cursor ?? '/v1/predictions', {
            signal: opts?.signal,
          }) as Promise<IReplicatePredictionPage>,
        cancel: (id, opts) =>
          request(`/v1/predictions/${encodeURIComponent(id)}/cancel`, {
            method: 'POST',
            signal: opts?.signal,
          }),
      },
    };
  }

  async createPrediction(
    execution: IExecutorExecution,
    attempt: IExecutorAttempt,
    inputUrl: string,
    signal?: AbortSignal
  ): Promise<IProviderPrediction> {
    if (execution.provider !== 'replicate') {
      throw new ReplicateAdapterError(
        `Unsupported provider for Replicate adapter: ${execution.provider}`
      );
    }
    if (!this.callbackBaseUrl) {
      throw new ReplicateAdapterError('Executor callback base URL is not configured');
    }

    const reference = getModelReference(execution, this.modelRegistry);
    const input = buildModelInput(
      execution.resolved_model_id,
      toProcessorInput(execution, inputUrl)
    );
    const createOptions: IReplicateCreateOptions = {
      ...parseModelReference(reference),
      input: input as object,
      webhook: callbackUrl(this.callbackBaseUrl, execution, attempt),
      webhook_events_filter: ['completed'],
    };

    try {
      const prediction = await withAbortTimeout(
        requestSignal =>
          this.client.predictions.create({ ...createOptions, signal: requestSignal }),
        this.createTimeoutMs,
        signal
      );
      return normalizePrediction(prediction);
    } catch (error) {
      if (error instanceof ReplicateAdapterError) {
        // Once POST starts, malformed success bodies also have an unknown outcome.
        if (!error.status) throw new ReplicateAdapterError(error.message, { ambiguous: true });
        throw error;
      }
      throw new ReplicateAdapterError(
        `Replicate prediction creation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        { ambiguous: isAmbiguousCreateFailure(error), status: responseStatus(error) }
      );
    }
  }

  async getPrediction(predictionId: string, signal?: AbortSignal): Promise<IProviderPrediction> {
    if (!predictionId.trim()) throw new ReplicateAdapterError('Prediction ID is empty');
    try {
      const prediction = await withAbortTimeout(
        requestSignal => this.client.predictions.get(predictionId, { signal: requestSignal }),
        this.statusTimeoutMs,
        signal
      );
      return normalizePrediction(prediction);
    } catch (error) {
      if (error instanceof ReplicateAdapterError) throw error;
      throw new ReplicateAdapterError(
        `Replicate prediction lookup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        { ambiguous: true, status: responseStatus(error) }
      );
    }
  }

  async findPredictionForAttempt(
    execution: IExecutorExecution,
    attempt: IExecutorAttempt,
    inputUrl: string,
    signal?: AbortSignal
  ): Promise<IProviderPrediction | null> {
    return withAbortTimeout(
      async requestSignal => {
        const matches = new Map<string, IProviderPrediction>();
        let cursor: string | undefined;
        for (let pageIndex = 0; pageIndex < this.maxHistoryPages; pageIndex += 1) {
          const page = await this.client.predictions.list({ signal: requestSignal, cursor });
          for (const rawPrediction of page.results) {
            const prediction = normalizePrediction(rawPrediction);
            if (this.matchesAttempt(prediction, execution, attempt, inputUrl))
              matches.set(prediction.id, prediction);
          }
          if (!page.next) return matches.size === 1 ? [...matches.values()][0] : null;
          cursor = page.next;
        }
        // An incomplete history scan cannot prove a unique match.
        return null;
      },
      this.statusTimeoutMs,
      signal
    );
  }

  async cancelPrediction(predictionId: string, signal?: AbortSignal): Promise<void> {
    if (this.client.predictions.cancel) {
      await withAbortTimeout(
        requestSignal => this.client.predictions.cancel!(predictionId, { signal: requestSignal }),
        this.statusTimeoutMs,
        signal
      );
    }
  }

  matchesAttempt(
    prediction: IProviderPrediction,
    execution: IExecutorExecution,
    attempt: IExecutorAttempt,
    inputUrl: string
  ): boolean {
    let reference: string;
    try {
      reference = getModelReference(execution, this.modelRegistry);
    } catch {
      return false;
    }
    if (!modelMatchesPrediction(prediction, reference)) return false;

    const predictionCorrelation = extractCorrelation(prediction.webhook);
    if (attempt.provider_prediction_id) {
      if (attempt.provider_prediction_id !== prediction.id) return false;
      if (predictionCorrelation && predictionCorrelation !== attempt.callback_correlation)
        return false;
    } else if (predictionCorrelation !== attempt.callback_correlation) {
      return false;
    }

    if (prediction.input === undefined) return Boolean(attempt.provider_prediction_id);
    try {
      const expected = buildModelInput(
        execution.resolved_model_id,
        toProcessorInput(execution, inputUrl)
      );
      return valuesMatch(expected, prediction.input);
    } catch {
      return false;
    }
  }

  async verifyWebhook(input: IReplicateWebhookVerificationInput): Promise<boolean> {
    const { id, timestamp, signature } = input.headers;
    if (!id || !timestamp || !signature || !this.webhookSecret) return false;
    const timestampMs = Number(timestamp) * 1000;
    if (
      !Number.isFinite(timestampMs) ||
      Math.abs(this.now() - timestampMs) > this.callbackTimestampToleranceMs
    ) {
      return false;
    }

    try {
      const key = Buffer.from(this.webhookSecret.replace(/^whsec_/, ''), 'base64');
      const expected = createHmac('sha256', key)
        .update(`${id}.${timestamp}.${input.body}`)
        .digest();
      return signature.split(' ').some(candidate => {
        const [version, encoded] = candidate.split(',');
        if (version !== 'v1' || !encoded) return false;
        const supplied = Buffer.from(encoded, 'base64');
        return supplied.length === expected.length && timingSafeEqual(supplied, expected);
      });
    } catch {
      return false;
    }
  }
}

export function createReplicateAdapter(options: IReplicateAdapterOptions = {}): ReplicateAdapter {
  return new ReplicateAdapter(options);
}

export { normalizePrediction, parseModelReference };
