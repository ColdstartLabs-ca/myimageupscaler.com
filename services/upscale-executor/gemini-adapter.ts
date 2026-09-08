import { Buffer } from 'node:buffer';
import { serverEnv } from '@shared/config/env';
import { readGeminiResponse } from './gemini-response';

import { QUALITY_TIER_CONFIG } from '@shared/types/coreflow.types';
import { upscaleSchema, type IUpscaleConfig } from '@shared/validation/upscale.schema';
import type {
  IExecutorAttempt,
  IExecutorExecution,
  IProviderAdapter,
  IProviderPrediction,
} from './advance';

const GEMINI_API_ORIGIN = 'https://generativelanguage.googleapis.com';
const DEFAULT_INPUT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_OUTPUT_MAX_BYTES = 128 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_RESPONSE_MAX_BYTES = 192 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

export interface IGeminiPublishedOutput {
  userId: string;
  jobId: string;
  attemptId: string;
  mimeType: string;
  bytes: Uint8Array;
  signal?: AbortSignal;
}

export interface IGeminiPublishedOutputReference {
  url: string;
  storagePath?: string;
}

export interface IGeminiAdapterOptions {
  apiKey?: string;
  fetch?: typeof fetch;
  publishOutput?: (
    output: IGeminiPublishedOutput
  ) => Promise<string | IGeminiPublishedOutputReference>;
  resolveOutputUrl?: (
    storagePath: string,
    output: Pick<IGeminiPublishedOutput, 'jobId' | 'attemptId' | 'mimeType'>
  ) => Promise<string>;
  maxInputBytes?: number;
  maxOutputBytes?: number;
  maxResponseBytes?: number;
  requestTimeoutMs?: number;
  apiOrigin?: string;
}

export class GeminiAdapterError extends Error {
  readonly ambiguous: boolean;
  readonly status?: number;

  constructor(message: string, options: { ambiguous?: boolean; status?: number } = {}) {
    super(message);
    this.name = 'GeminiAdapterError';
    this.ambiguous = options.ambiguous ?? false;
    this.status = options.status;
  }
}

interface IGeminiInlineData {
  mimeType?: unknown;
  data?: unknown;
}

interface IGeminiFileData {
  mimeType?: unknown;
  fileUri?: unknown;
}

interface IGeminiPart {
  inlineData?: IGeminiInlineData;
  fileData?: IGeminiFileData;
  text?: unknown;
}

interface IGeminiResponse {
  responseId?: unknown;
  modelVersion?: unknown;
  candidates?: unknown;
  promptFeedback?: unknown;
}

interface IStoredGeminiPrediction {
  responseId: string;
  jobId: string;
  attemptId: string;
  model: string;
  version?: string;
  outputUrl?: string;
  outputPath?: string;
  mimeType: string;
  completedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : 'unknown error';
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizeMimeType(value: unknown, fallback?: string): string {
  const candidate =
    typeof value === 'string' ? value.split(';', 1)[0]?.trim().toLowerCase() : fallback;
  const normalized = candidate === 'image/jpg' ? 'image/jpeg' : candidate;
  if (!normalized || !ALLOWED_IMAGE_MIME_TYPES.has(normalized)) {
    throw new GeminiAdapterError('Gemini returned an unsupported output MIME type');
  }
  return normalized;
}

function requireHttpsUrl(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GeminiAdapterError(`${label} is missing`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new GeminiAdapterError(`${label} is invalid`);
  }
  if (parsed.protocol !== 'https:') throw new GeminiAdapterError(`${label} must use HTTPS`);
  return parsed.toString();
}

async function withTimeout<T>(
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

async function readBoundedBytes(
  response: Response,
  maxBytes: number,
  exceededMessage: string
): Promise<Uint8Array> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > maxBytes) {
      await response.body?.cancel();
      throw new GeminiAdapterError(exceededMessage);
    }
  }
  if (!response.body) throw new GeminiAdapterError('Gemini transport response has no body');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel(exceededMessage);
        throw new GeminiAdapterError(exceededMessage);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, total);
}

function parseStoredConfig(execution: IExecutorExecution): IUpscaleConfig {
  return upscaleSchema.parse({
    storagePath: execution.input_storage_path,
    jobId: execution.job_id,
    mimeType: execution.input_mime_type,
    config: execution.config,
  }).config;
}

export function buildGeminiPrompt(config: IUpscaleConfig): string {
  const customInstructions = config.additionalOptions.customInstructions?.trim();
  if (customInstructions) return customInstructions;

  const tierConfig = QUALITY_TIER_CONFIG[config.qualityTier];
  if (tierConfig?.customPrompt && tierConfig.genericPromptOverride) return tierConfig.customPrompt;

  let prompt =
    'Task: Generate a high-definition version of the provided image with significantly improved quality. ';
  prompt += config.additionalOptions.enhance
    ? `Action: Reconstruct the image at ${config.scale}x resolution. Simultaneously remove noise/artifacts and sharpen fine details. The output must be crisp and photorealistic. `
    : `Action: Reconstruct the image at ${config.scale}x resolution (target 2K/4K). Aggressively sharpen edges and hallucinate plausible fine details to remove blur. `;
  if (config.additionalOptions.enhanceFaces) {
    prompt +=
      "Constraint: Enhance facial features naturally (eyes, skin texture) without altering the person's identity. ";
  }
  if (config.additionalOptions.enhancement?.denoise) {
    prompt += 'Constraint: Apply strong denoising to smooth out flat areas. ';
  }
  if (config.additionalOptions.preserveText) {
    prompt += 'Constraint: Preserve all text, logos, and typography exactly as they appear. ';
  }
  return `${prompt}Output: Return ONLY the generated image.`;
}

function responseParts(response: IGeminiResponse): { parts: IGeminiPart[]; finishReason?: string } {
  if (!Array.isArray(response.candidates) || response.candidates.length === 0) {
    throw new GeminiAdapterError('Gemini response has no candidates');
  }
  const candidate = asRecord(response.candidates[0]);
  const finishReason =
    typeof candidate?.finishReason === 'string' ? candidate.finishReason : undefined;
  if (finishReason && finishReason !== 'STOP') {
    throw new GeminiAdapterError(`Gemini stopped generation: ${finishReason}`);
  }
  const content = asRecord(candidate?.content);
  if (!Array.isArray(content?.parts) || content.parts.length === 0) {
    throw new GeminiAdapterError('Gemini response has no generated content');
  }
  return { parts: content.parts.filter(part => asRecord(part)) as IGeminiPart[], finishReason };
}

function decodeBase64(value: unknown, maxBytes: number): Uint8Array {
  if (value instanceof Uint8Array) {
    if (!value.byteLength || value.byteLength > maxBytes)
      throw new GeminiAdapterError('Gemini output exceeds the executor byte limit');
    return value;
  }
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) {
    throw new GeminiAdapterError('Gemini returned invalid inline image data');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new GeminiAdapterError('Gemini returned invalid inline image data');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const decodedSize = (value.length / 4) * 3 - padding;
  if (decodedSize <= 0 || decodedSize > maxBytes) {
    throw new GeminiAdapterError('Gemini output exceeds the executor byte limit');
  }
  return Buffer.from(value, 'base64');
}

function encodePrediction(value: IStoredGeminiPrediction): string {
  return `gemini:${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
}

function decodePrediction(predictionId: string): IStoredGeminiPrediction {
  if (!predictionId.startsWith('gemini:')) {
    throw new GeminiAdapterError('Gemini prediction ID is invalid');
  }
  try {
    const parsed = JSON.parse(Buffer.from(predictionId.slice(7), 'base64url').toString('utf8'));
    const record = asRecord(parsed);
    if (
      !record ||
      typeof record.responseId !== 'string' ||
      typeof record.jobId !== 'string' ||
      typeof record.attemptId !== 'string' ||
      typeof record.model !== 'string' ||
      (typeof record.outputUrl !== 'string' && typeof record.outputPath !== 'string') ||
      typeof record.mimeType !== 'string' ||
      typeof record.completedAt !== 'string'
    ) {
      throw new Error('invalid payload');
    }
    return record as unknown as IStoredGeminiPrediction;
  } catch {
    throw new GeminiAdapterError('Gemini prediction ID is invalid');
  }
}

function predictionFromStored(stored: IStoredGeminiPrediction): IProviderPrediction {
  if (!stored.outputUrl) throw new GeminiAdapterError('Gemini stored output URL is missing');
  const stableStored = stored.outputPath ? { ...stored, outputUrl: undefined } : stored;
  return {
    id: encodePrediction(stableStored),
    status: 'succeeded',
    model: stored.model,
    version: stored.version,
    output: { url: stored.outputUrl },
    completedAt: stored.completedAt,
  };
}

export class GeminiAdapter implements IProviderAdapter {
  readonly providerName = 'gemini';

  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly publishOutput?: (
    output: IGeminiPublishedOutput
  ) => Promise<string | IGeminiPublishedOutputReference>;
  private readonly resolveOutputUrl?: (
    storagePath: string,
    output: Pick<IGeminiPublishedOutput, 'jobId' | 'attemptId' | 'mimeType'>
  ) => Promise<string>;
  private readonly maxInputBytes: number;
  private readonly maxOutputBytes: number;
  private readonly maxResponseBytes: number;
  private readonly requestTimeoutMs: number;
  private readonly apiOrigin: string;

  constructor(options: IGeminiAdapterOptions = {}) {
    const apiKey = options.apiKey ?? serverEnv.GEMINI_API_KEY;
    if (!apiKey) throw new GeminiAdapterError('GEMINI_API_KEY is not configured');
    this.apiKey = apiKey;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.publishOutput = options.publishOutput;
    this.resolveOutputUrl = options.resolveOutputUrl;
    this.maxInputBytes = positiveInteger(options.maxInputBytes, DEFAULT_INPUT_MAX_BYTES);
    this.maxOutputBytes = positiveInteger(options.maxOutputBytes, DEFAULT_OUTPUT_MAX_BYTES);
    this.maxResponseBytes = Math.min(
      DEFAULT_RESPONSE_MAX_BYTES,
      positiveInteger(options.maxResponseBytes, DEFAULT_RESPONSE_MAX_BYTES)
    );
    this.requestTimeoutMs = positiveInteger(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    this.apiOrigin = options.apiOrigin ?? GEMINI_API_ORIGIN;
  }

  async createPrediction(
    execution: IExecutorExecution,
    attempt: IExecutorAttempt,
    inputUrl: string,
    signal?: AbortSignal
  ): Promise<IProviderPrediction> {
    if (execution.provider !== this.providerName || attempt.provider !== this.providerName) {
      throw new GeminiAdapterError('Gemini adapter received an execution for another provider');
    }
    if (attempt.job_id !== execution.job_id) {
      throw new GeminiAdapterError('Gemini attempt does not belong to the execution');
    }
    const model = execution.model_version?.trim();
    if (!model) throw new GeminiAdapterError('Gemini execution has no stored model version');
    const config = parseStoredConfig(execution);

    let inputBytes: Uint8Array;
    try {
      inputBytes = await withTimeout(
        async requestSignal => {
          const response = await this.fetcher(requireHttpsUrl(inputUrl, 'Gemini input URL'), {
            redirect: 'error',
            signal: requestSignal,
          });
          if (!response.ok) {
            await response.body?.cancel();
            throw new GeminiAdapterError(`Gemini input fetch failed with HTTP ${response.status}`, {
              status: response.status,
            });
          }
          return readBoundedBytes(
            response,
            this.maxInputBytes,
            'Gemini input exceeds the executor byte limit'
          );
        },
        this.requestTimeoutMs,
        signal
      );
    } catch (error) {
      throw new GeminiAdapterError(`Gemini input fetch failed: ${errorMessage(error)}`);
    }
    if (inputBytes.byteLength === 0) throw new GeminiAdapterError('Gemini input was empty');

    const requestBody = JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: execution.input_mime_type,
                data: Buffer.from(inputBytes).toString('base64'),
              },
            },
            { text: buildGeminiPrompt(config) },
          ],
        },
      ],
      generationConfig: { responseModalities: ['IMAGE'], temperature: 0.4 },
    });
    const endpoint = `${this.apiOrigin.replace(/\/$/, '')}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    let response: IGeminiResponse;
    try {
      response = await withTimeout(
        async requestSignal => {
          const generationResponse = await this.fetcher(endpoint, {
            method: 'POST',
            redirect: 'error',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
            body: requestBody,
            signal: requestSignal,
          });
          if (!generationResponse.ok) {
            await generationResponse.body?.cancel();
            const status = generationResponse.status;
            throw new GeminiAdapterError(`Gemini generation failed with HTTP ${status}`, {
              ambiguous: status === 408 || status === 429 || status >= 500,
              status,
            });
          }
          return (await readGeminiResponse(
            generationResponse,
            this.maxResponseBytes,
            this.maxOutputBytes
          )) as IGeminiResponse;
        },
        this.requestTimeoutMs,
        signal
      );
    } catch (error) {
      if (error instanceof GeminiAdapterError && error.status) throw error;
      throw new GeminiAdapterError(`Gemini generation outcome is unknown: ${errorMessage(error)}`, {
        ambiguous: true,
      });
    }
    const { parts } = responseParts(response);
    const inlinePart = parts.find(part => part.inlineData?.data !== undefined);
    const filePart = parts.find(part => part.fileData?.fileUri !== undefined);
    let outputUrl: string;
    let outputPath: string | undefined;
    let outputMimeType: string;

    if (inlinePart?.inlineData) {
      outputMimeType = normalizeMimeType(inlinePart.inlineData.mimeType, 'image/png');
      const bytes = decodeBase64(inlinePart.inlineData.data, this.maxOutputBytes);
      if (!this.publishOutput) {
        throw new GeminiAdapterError('Gemini inline output publisher is not configured');
      }
      try {
        const published = await this.publishOutput({
          userId: execution.user_id,
          jobId: execution.job_id,
          attemptId: attempt.attempt_id,
          mimeType: outputMimeType,
          bytes,
          signal,
        });
        const publishedReference = typeof published === 'string' ? { url: published } : published;
        outputUrl = requireHttpsUrl(publishedReference?.url, 'Gemini staged output URL');
        outputPath = publishedReference?.storagePath;
      } catch (error) {
        if (error instanceof GeminiAdapterError) throw error;
        throw new GeminiAdapterError(
          `Gemini output publication outcome is unknown: ${errorMessage(error)}`,
          {
            ambiguous: true,
          }
        );
      }
    } else if (filePart?.fileData) {
      outputMimeType = normalizeMimeType(filePart.fileData.mimeType, 'image/png');
      outputUrl = requireHttpsUrl(filePart.fileData.fileUri, 'Gemini output URL');
    } else {
      throw new GeminiAdapterError('Gemini response has no image output');
    }

    const responseId =
      typeof response.responseId === 'string' && response.responseId
        ? response.responseId
        : `${attempt.attempt_id}:${Date.now()}`;
    const stored: IStoredGeminiPrediction = {
      responseId,
      jobId: execution.job_id,
      attemptId: attempt.attempt_id,
      model,
      version: typeof response.modelVersion === 'string' ? response.modelVersion : undefined,
      ...(outputPath ? { outputPath } : { outputUrl }),
      mimeType: outputMimeType,
      completedAt: new Date().toISOString(),
    };
    return predictionFromStored({ ...stored, outputUrl });
  }

  async getPrediction(predictionId: string, signal?: AbortSignal): Promise<IProviderPrediction> {
    if (signal?.aborted) throw signal.reason;
    const stored = decodePrediction(predictionId);
    if (!stored.outputUrl && stored.outputPath) {
      if (!this.resolveOutputUrl) {
        throw new GeminiAdapterError('Gemini stored output resolver is not configured');
      }
      stored.outputUrl = requireHttpsUrl(
        await this.resolveOutputUrl(stored.outputPath, {
          jobId: stored.jobId,
          attemptId: stored.attemptId,
          mimeType: stored.mimeType,
        }),
        'Gemini staged output URL'
      );
    }
    return predictionFromStored(stored);
  }

  async findPredictionForAttempt(
    _execution: IExecutorExecution,
    _attempt: IExecutorAttempt,
    _inputUrl: string,
    signal?: AbortSignal
  ): Promise<IProviderPrediction | null> {
    if (signal?.aborted) throw signal.reason;
    // generateContent has no list/idempotency lookup API. Returning null keeps
    // an ambiguous submission from issuing a second billable generation.
    return null;
  }

  matchesAttempt(
    prediction: IProviderPrediction,
    execution: IExecutorExecution,
    attempt: IExecutorAttempt,
    _inputUrl: string
  ): boolean {
    try {
      const stored = decodePrediction(prediction.id);
      return (
        execution.provider === this.providerName &&
        attempt.provider === this.providerName &&
        stored.jobId === execution.job_id &&
        stored.attemptId === attempt.attempt_id &&
        stored.model === execution.model_version
      );
    } catch {
      return false;
    }
  }
}
