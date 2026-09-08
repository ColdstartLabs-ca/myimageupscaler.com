import { IUpscaleConfig, ProcessingStage } from '@/shared/types/coreflow.types';
import { TIMEOUTS } from '@shared/config/timeouts.config';
import { createClient } from '@shared/utils/supabase/client';
import { analytics } from '@client/analytics';
import { normalizeCoreEventProperties } from '@server/analytics/core-event-contract';

/**
 * Error class for batch limit violations
 */
export class BatchLimitError extends Error {
  public readonly current: number;
  public readonly limit: number;
  public readonly resetAt?: Date;
  public readonly upgradeUrl?: string;

  constructor(options: {
    current: number;
    limit: number;
    resetAt?: Date;
    upgradeUrl?: string;
    message?: string;
  }) {
    const message =
      options.message ||
      `Batch limit exceeded. Your plan allows ${options.limit} images, but you've attempted to process ${options.current}. Upgrade for higher limits.`;

    super(message);
    this.name = 'BatchLimitError';
    this.current = options.current;
    this.limit = options.limit;
    this.resetAt = options.resetAt;
    this.upgradeUrl = options.upgradeUrl;
  }
}

/** Server-confirmed free-tier depletion. This must not be inferred from copy. */
export class FreeLimitExceededError extends Error {
  public readonly requiredCredits?: number;
  public readonly availableCredits?: number;

  constructor(options: { message?: string; requiredCredits?: number; availableCredits?: number }) {
    super(options.message || 'You have used all of your free credits. Upgrade to continue.');
    this.name = 'FreeLimitExceededError';
    this.requiredCredits = options.requiredCredits;
    this.availableCredits = options.availableCredits;
  }
}

/** Server-confirmed provider outage. This state must never open a purchase flow. */
export class ProviderUnavailableError extends Error {
  public readonly retryAt?: Date;
  public readonly suppressPurchaseCtas: boolean;

  constructor(options: { message?: string; retryAt?: Date; suppressPurchaseCtas?: boolean }) {
    super(
      options.message ||
        'Image processing is temporarily unavailable due to a provider issue. Your credits have not been charged. Please try again shortly or contact our support team.'
    );
    this.name = 'ProviderUnavailableError';
    this.retryAt = options.retryAt;
    this.suppressPurchaseCtas = options.suppressPurchaseCtas ?? true;
  }
}

/** A non-JSON response from the edge, with enough metadata to support a retry. */
export class UpscaleEdgeError extends Error {
  public readonly status: number;
  public readonly rayId: string | null;
  public readonly bodyPreview: string;

  constructor(options: { status: number; rayId?: string | null; bodyPreview?: string }) {
    const rayId = options.rayId || null;
    super(`Upscale failed (HTTP ${options.status}, ref: ${rayId ?? 'unknown'}). Please retry.`);
    this.name = 'UpscaleEdgeError';
    this.status = options.status;
    this.rayId = rayId;
    this.bodyPreview = options.bodyPreview ?? '';
  }
}

interface IApiErrorDetails {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

interface IApiErrorResponse {
  error?: IApiErrorDetails | string;
}

interface IProcessImageApiResponse {
  success?: boolean;
  jobId?: string;
  status?: string;
  retryAfterMs?: number;
  executionDeadline?: number;
  expiresAt?: number;
  mimeType?: string;
  processing?: {
    creditsRemaining?: number;
    creditsUsed?: number;
    modelDisplayName?: string;
    dimensionPreservingFallback?: boolean;
    reservationJobId?: string;
    deliveryToken?: string;
  };
}

export interface IAsyncUpscaleStatus extends IProcessImageApiResponse, IApiErrorResponse {
  jobId: string;
  status: 'submitting' | 'processing' | 'ready' | 'completed' | 'refunded';
  retryAfterMs?: number;
  executionDeadline?: number;
}

export class AsyncUpscalePendingError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly reason: 'transient' | 'deadline' = 'transient'
  ) {
    super('Image processing is still running. Check the same job again.');
    this.name = 'AsyncUpscalePendingError';
  }
}

export class AsyncUpscaleTerminalError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly status: string,
    message: string,
    public readonly refunded: boolean,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'AsyncUpscaleTerminalError';
  }
}

export interface IAsyncUpscaleJobSummary {
  jobId: string;
  status: IAsyncUpscaleStatus['status'];
  createdAt: number;
  executionDeadline: number;
  deliveryDeadline?: number;
  display?: {
    modelDisplayName?: string;
    dimensionPreservingFallback?: boolean;
    mimeType?: string;
    dimensions?: {
      input: { width: number; height: number };
      output: { width: number; height: number };
      actualScale: number;
    };
  };
  statusUrl: string;
}

export interface IAsyncUpscaleJobListResponse {
  success: true;
  jobs: IAsyncUpscaleJobSummary[];
}

export interface IProcessImageOptions {
  signal?: AbortSignal;
  onConnectionChange?: (reconnecting: boolean) => void;
  onJobStatus?: (status: IAsyncUpscaleStatus) => void;
  executionDeadline?: number;
  /** Reuse this UUID when retrying an admission after a lost response. */
  jobId?: string;
  /** Called as soon as the server confirms a durable admission or replay. */
  onJobAccepted?: (jobId: string) => void;
}

function statusRetryDelay(response: Response, fallbackMs: number): number {
  const retryAfter = response.headers.get('Retry-After');
  if (!retryAfter) return fallbackMs;
  const seconds = Number(retryAfter);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
  return Number.isFinite(delay) ? Math.max(fallbackMs, delay) : fallbackMs;
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function isClientAvailable(): boolean {
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
  return online && visible;
}

function waitForAsyncPoll(delayMs: number, options: IProcessImageOptions): Promise<void> {
  const signal = options.signal;
  signal?.throwIfAborted();
  const browser = typeof window !== 'undefined' && typeof document !== 'undefined';

  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (browser) {
        window.removeEventListener('online', connectionChanged);
        window.removeEventListener('offline', connectionChanged);
        window.removeEventListener('focus', connectionChanged);
        document.removeEventListener('visibilitychange', connectionChanged);
      }
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      options.onConnectionChange?.(false);
      resolve();
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const connectionChanged = () => {
      if (isClientAvailable()) finish();
      else {
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        options.onConnectionChange?.(true);
      }
    };

    signal?.addEventListener('abort', abort, { once: true });
    if (browser) {
      window.addEventListener('online', connectionChanged);
      window.addEventListener('offline', connectionChanged);
      window.addEventListener('focus', connectionChanged);
      document.addEventListener('visibilitychange', connectionChanged);
    }
    if (!isClientAvailable()) {
      options.onConnectionChange?.(true);
    } else if (delayMs <= 0) {
      finish();
    } else {
      timer = setTimeout(finish, delayMs);
    }
  });
}

async function pollAsyncUpscale(
  jobId: string,
  initial: IAsyncUpscaleStatus,
  options: IProcessImageOptions = {},
  initialDelayMs = initial.retryAfterMs ?? 3000
): Promise<IProcessImageApiResponse> {
  const startedAt = Date.now();
  const deadline = Math.min(startedAt + 15 * 60 * 1000, initial.executionDeadline ?? Infinity);
  let delayMs = Math.max(0, initialDelayMs);
  while (Date.now() < deadline) {
    // Visibility and network interruptions pause observation; they never resubmit.
    await waitForAsyncPoll(Math.min(delayMs, Math.max(0, deadline - Date.now())), options);
    if (Date.now() >= deadline) break;
    const accessToken = await getAccessToken();
    if (!accessToken) throw new AsyncUpscalePendingError(jobId);
    let response: Response;
    try {
      response = await fetch(`/api/upscale?jobId=${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
        signal: requestSignal(options.signal, 10_000),
      });
    } catch {
      options.signal?.throwIfAborted();
      options.onConnectionChange?.(true);
      delayMs = 10_000;
      continue;
    }
    options.onConnectionChange?.(false);
    const cadence = Date.now() - startedAt >= 30_000 ? 10_000 : 5000;
    delayMs = statusRetryDelay(response, cadence + Math.floor(Math.random() * 500));
    if (response.status === 401) throw new AsyncUpscalePendingError(jobId);
    const state = await parseJsonResponse<IAsyncUpscaleStatus>(response).catch(() => undefined);
    if (state?.jobId === jobId) options.onJobStatus?.(state);
    if (state?.jobId === jobId && state.status === 'refunded') {
      throw new AsyncUpscaleTerminalError(
        jobId,
        state.status,
        getApiErrorMessage(state.error) || 'Image processing failed',
        true,
        false
      );
    }
    if (response.status === 429 || response.status >= 500) continue;
    if (!response.ok || state?.jobId !== jobId) throw new AsyncUpscalePendingError(jobId);
    if (state.status === 'ready' || state.status === 'completed') return state;
  }
  throw new AsyncUpscalePendingError(jobId, 'deadline');
}

const DELIVERED_IMAGE_LOAD_TIMEOUT_MS = 15_000;
const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_RETRY_DELAY_MS = 100;
const OUTPUT_BUSY_RETRY_DELAY_MS = 1000;

class OutputCapabilityError extends Error {}

async function verifyDeliveredImageIsUsable(imageUrl: string): Promise<void> {
  if (typeof Image === 'undefined') {
    throw new Error('Received image URL could not be loaded');
  }

  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    timeout = setTimeout(
      () => finish(new Error('Received image URL could not be loaded')),
      DELIVERED_IMAGE_LOAD_TIMEOUT_MS
    );

    image.onload = () => finish();
    image.onerror = () => finish(new Error('Received image URL could not be loaded'));
    image.src = imageUrl;
  });
}

async function fetchRetryableOutputBlobUrl(
  capability: { reservationJobId: string; deliveryToken: string },
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch('/api/upscale/output', {
        method: 'POST',
        headers,
        body: JSON.stringify(capability),
        signal: requestSignal(signal, TIMEOUTS.REPLICATE_TIMEOUT),
      });

      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          const errorData = await parseJsonResponse<IApiErrorResponse>(response).catch(
            () => undefined
          );
          throw new OutputCapabilityError(
            getApiErrorMessage(errorData?.error) || 'Unable to retrieve generated output'
          );
        }

        if (response.status === 503) {
          const errorData = await parseJsonResponse<IApiErrorResponse>(response).catch(
            () => undefined
          );
          const outputBusy = getApiErrorDetails(errorData?.error)?.details?.outputBusy === true;
          if (outputBusy && attempt < 3) {
            const retryAfterMs = statusRetryDelay(response, OUTPUT_BUSY_RETRY_DELAY_MS);
            await new Promise<void>(resolve => setTimeout(resolve, retryAfterMs));
          }
        }
        lastError = new Error('Unable to retrieve generated output');
        continue;
      }

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      try {
        await verifyDeliveredImageIsUsable(imageUrl);
      } catch (error) {
        URL.revokeObjectURL(imageUrl);
        throw error;
      }
      return imageUrl;
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof OutputCapabilityError) {
        throw error;
      }
      lastError = error;
      if (attempt === 3) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to retrieve generated output');
}

function getUploadErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return 'Unknown storage error';
}

function isCommittedUploadConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const details = error as {
    status?: unknown;
    statusCode?: unknown;
    message?: unknown;
    error?: unknown;
  };
  const status = details.statusCode ?? details.status;
  if (status === 409 || status === '409') return true;

  return [details.message, details.error].some(
    value => typeof value === 'string' && /already exists|duplicate/i.test(value)
  );
}

async function uploadToSignedUrlWithRetry(
  storagePath: string,
  uploadToken: string,
  file: File
): Promise<void> {
  const bucket = createClient().storage.from('upscale-inputs');
  let lastError: unknown;

  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      const { error } = await bucket.uploadToSignedUrl(storagePath, uploadToken, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });
      if (!error) return;
      // With an immutable grant, a response-loss after the storage commit is
      // reported as a conflict. The server validates the stored object before
      // it signs the provider-facing read URL.
      if (isCommittedUploadConflict(error)) return;
      lastError = error;
    } catch (error) {
      lastError = error;
    }

    if (attempt < UPLOAD_MAX_ATTEMPTS) {
      await new Promise<void>(resolve => setTimeout(resolve, UPLOAD_RETRY_DELAY_MS * attempt));
    }
  }

  throw new Error(`Failed to upload image: ${getUploadErrorMessage(lastError)}`);
}

function getApiErrorDetails(error: IApiErrorResponse['error']): IApiErrorDetails | undefined {
  return typeof error === 'object' && error !== null ? error : undefined;
}

function getApiErrorMessage(error: IApiErrorResponse['error']): string | undefined {
  return typeof error === 'string' ? error : getApiErrorDetails(error)?.message;
}

/** Parse a JSON API response without letting an edge-generated HTML page leak a SyntaxError. */
export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');
  const body = await response.text().catch(() => '');
  const bodyPreview = body.slice(0, 200);

  if (!contentType?.includes('application/json')) {
    throw new UpscaleEdgeError({
      status: response.status,
      rayId: response.headers.get('cf-ray'),
      bodyPreview,
    });
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new UpscaleEdgeError({
      status: response.status,
      rayId: response.headers.get('cf-ray'),
      bodyPreview,
    });
  }
}

/**
 * Best-effort server observation for edge failures that may terminate the
 * upscale Worker before its in-process failure telemetry can run.
 */
export async function reportUpscaleEdgeFailure(
  error: Pick<UpscaleEdgeError, 'status' | 'rayId'>,
  metadata: Pick<IUpscaleConfig, 'qualityTier' | 'scale'>
): Promise<void> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    const response = await fetch('/api/upscale/failure-observation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        status: error.status,
        rayId: error.rayId,
        qualityTier: metadata.qualityTier,
        scale: metadata.scale,
      }),
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) {
      console.warn('Upscale edge-failure observation was not accepted', {
        status: response.status,
      });
    }
  } catch (observationError) {
    console.warn('Upscale edge-failure observation failed', {
      error:
        observationError instanceof Error ? observationError.message : String(observationError),
    });
  }
}

// Extend Window interface for test environment markers
declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface Window {
    playwrightTest?: boolean;
    __TEST_ENV__?: boolean;
  }
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error(`Image input was empty or invalid before processing: ${file.name}`));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Failed to read image file: ${file.name}`));
  });
};

/**
 * Get the current user's access token for API requests
 */
async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export interface IAnalyzeImageResult {
  analysis: {
    issues: Array<{ type: string; severity: string; description: string }>;
    contentType: string;
  };
  recommendation: {
    model: string;
    reason: string;
    creditCost: number;
    confidence: number;
    alternativeModel: string | null;
    alternativeCost: number | null;
  };
  enhancementPrompt: string;
  provider: 'replicate' | 'gemini' | 'fallback';
  processingTimeMs?: number;
}

export interface IProcessImageResult {
  jobId?: string;
  durable?: boolean;
  imageData?: string; // Base64 data URL (legacy, from Gemini)
  imageUrl?: string; // Direct URL to image (from Replicate - use in <img> tag)
  creditsRemaining: number;
  creditsUsed: number;
  /** Display name of the model that actually ran, for disclosing a size-driven model swap */
  modelDisplayName?: string;
  /** The source exceeded the selected model's size limit, so a tiled model ran instead */
  dimensionPreservingFallback?: boolean;
}

/**
 * Converts an image URL to base64 by drawing it to a canvas
 * Use this when you need base64 (e.g., for download with custom filename)
 * Note: The image must be loaded in an <img> tag first to avoid CORS issues
 */
export function imageToBase64(img: HTMLImageElement, mimeType = 'image/png'): string {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL(mimeType);
}

export interface IAnalyzeImageOptions {
  allowExpensiveModels?: boolean;
}

/**
 * Analyzes an image to get model recommendation and enhancement prompt
 * Only available for paid users (auto mode restriction)
 */
export const analyzeImage = async (
  file: File,
  options: IAnalyzeImageOptions = {}
): Promise<IAnalyzeImageResult> => {
  const base64Data = await fileToBase64(file);
  const accessToken = await getAccessToken();

  if (!accessToken) {
    throw new Error('You must be logged in to use auto model selection');
  }

  const response = await fetch('/api/analyze-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      imageData: base64Data,
      mimeType: file.type || 'image/jpeg',
      allowExpensiveModels: options.allowExpensiveModels ?? false,
    }),
  });

  if (!response.ok) {
    const errorData = await parseJsonResponse<IApiErrorResponse>(response);
    // Handle error object or string
    const errorMessage = getApiErrorMessage(errorData.error);
    throw new Error(errorMessage || 'Failed to analyze image');
  }

  return await parseJsonResponse<IAnalyzeImageResult>(response);
};

// Update callback type
type ProgressCallback = (progress: number, stage?: ProcessingStage) => void;

export const processImage = async (
  file: File,
  config: IUpscaleConfig,
  onProgress: ProgressCallback,
  options: IProcessImageOptions = {}
): Promise<IProcessImageResult> => {
  try {
    // Client-side processing for bg-removal
    // Processing runs in-browser, but we deduct 1 credit server-side
    if (config.qualityTier === 'bg-removal') {
      // Pre-deduct credit before processing
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Authentication required for background removal');
      }

      const deductRes = await fetch('/api/bg-removal/deduct', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!deductRes.ok) {
        let errorData: IApiErrorResponse | undefined;
        try {
          errorData = await parseJsonResponse<IApiErrorResponse>(deductRes);
        } catch (error) {
          if (error instanceof UpscaleEdgeError) throw error;
        }

        const errorDetails = getApiErrorDetails(errorData?.error);
        if (errorDetails?.code === 'FREE_LIMIT_EXCEEDED') {
          throw new FreeLimitExceededError({
            message: errorDetails.message,
            requiredCredits: errorDetails.details?.required as number | undefined,
            availableCredits: errorDetails.details?.available as number | undefined,
          });
        }
        const message =
          getApiErrorMessage(errorData?.error) || 'Failed to deduct credits for background removal';
        throw new Error(message);
      }

      const deductData = await parseJsonResponse<{ creditsRemaining: number; creditsUsed: number }>(
        deductRes
      );
      const processingStartedAt = Date.now();

      const { processBackgroundRemoval } = await import('@/client/utils/bg-removal');
      const result = await processBackgroundRemoval(file, onProgress);
      analytics.track('image_upscaled', {
        ...normalizeCoreEventProperties('image_upscaled', {
          qualityTier: 'bg-removal',
          scaleFactor: 1,
          fileType: file.type,
          fileSizeBytes: file.size,
          durationMs: Date.now() - processingStartedAt,
        }),
      });
      return {
        imageUrl: result.imageUrl,
        imageData: undefined,
        creditsRemaining: deductData.creditsRemaining,
        creditsUsed: deductData.creditsUsed,
      };
    }

    // Stage 1: Preparing. Upload bytes directly to private temporary storage so
    // the Cloudflare Worker never buffers a base64 JSON payload in its 128MB heap.
    onProgress(10, ProcessingStage.PREPARING);
    const jobId = options.jobId ?? crypto.randomUUID();

    let enhancementPrompt: string | undefined;
    let resolvedModel: string;

    // Handle different quality tiers
    if (config.qualityTier === 'auto') {
      resolvedModel = 'auto'; // Server will determine the best model
      onProgress(30, ProcessingStage.PREPARING);
    } else {
      // Use the model associated with the quality tier
      const { QUALITY_TIER_CONFIG } = await import('@/shared/types/coreflow.types');
      const tierConfig = QUALITY_TIER_CONFIG[config.qualityTier];
      resolvedModel = tierConfig.modelId || 'real-esrgan';
      onProgress(30, ProcessingStage.PREPARING);
    }

    // Use custom instructions if provided
    if (config.additionalOptions.customInstructions) {
      enhancementPrompt = config.additionalOptions.customInstructions;
    }

    // Get auth token for the API request
    const accessToken = await getAccessToken();

    // MEDIUM-20 FIX: Remove client-side test bypass - server enforces auth properly
    // Client-side test bypass is a security risk as window variables can be manipulated
    // Authentication is enforced on the server side, which is the proper security boundary
    if (!accessToken) {
      throw new Error('You must be logged in to process images');
    }

    // Stage 3: Enhancing (main API call)
    onProgress(50, ProcessingStage.ENHANCING);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add Authorization header only if we have a token
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const uploadGrantResponse = await fetch('/api/upscale/upload', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type || 'image/jpeg',
        sizeBytes: file.size,
        jobId,
      }),
      signal: requestSignal(options.signal, 10_000),
    });
    if (!uploadGrantResponse.ok) {
      const errorData = await parseJsonResponse<IApiErrorResponse>(uploadGrantResponse);
      throw new Error(getApiErrorMessage(errorData.error) || 'Failed to prepare image upload');
    }
    const uploadGrant = await parseJsonResponse<{
      storagePath: string;
      uploadToken: string;
    }>(uploadGrantResponse);
    await uploadToSignedUrlWithRetry(uploadGrant.storagePath, uploadGrant.uploadToken, file);

    const response = await fetch('/api/upscale', {
      method: 'POST',
      headers: {
        ...headers,
        // Tail Workers receive request headers even when the producer is killed
        // before it can run catch/finally refund logic.
        'X-Upscale-Job-Id': jobId,
      },
      body: JSON.stringify({
        storagePath: uploadGrant.storagePath,
        jobId,
        mimeType: file.type || 'image/jpeg',
        // Pass enhancement prompt if available
        enhancementPrompt,
        config,
        resolvedModel, // Pass the resolved model for server processing
      }),
      signal: requestSignal(options.signal, TIMEOUTS.REPLICATE_TIMEOUT),
    }).catch(() => {
      // The server may have committed the debit and prediction before the
      // response disappeared. Recovery must read this job, never resubmit it.
      throw new AsyncUpscalePendingError(jobId);
    });

    if (!response.ok) {
      const errorData = await parseJsonResponse<
        IApiErrorResponse & { jobId?: string; status?: string }
      >(response).catch(() => {
        throw new AsyncUpscalePendingError(jobId);
      });
      const errorDetails = getApiErrorDetails(errorData.error);

      if (errorData.jobId === jobId && errorData.status === 'refunded') {
        throw new AsyncUpscaleTerminalError(
          jobId,
          'refunded',
          getApiErrorMessage(errorData.error) || 'Processing failed and credits were refunded.',
          true,
          false
        );
      }

      if (errorDetails?.code === 'FREE_LIMIT_EXCEEDED') {
        throw new FreeLimitExceededError({
          message: errorDetails.message,
          requiredCredits: errorDetails.details?.required as number | undefined,
          availableCredits: errorDetails.details?.available as number | undefined,
        });
      }

      if (errorDetails?.code === 'AI_UNAVAILABLE') {
        throw new ProviderUnavailableError({
          message: errorDetails.message,
          retryAt: errorDetails.details?.retryAt
            ? new Date(errorDetails.details.retryAt as string)
            : undefined,
          suppressPurchaseCtas:
            (errorDetails.details?.suppressPurchaseCtas as boolean | undefined) ?? true,
        });
      }

      // Handle batch limit exceeded errors specifically
      if (errorDetails?.code === 'BATCH_LIMIT_EXCEEDED') {
        throw new BatchLimitError({
          current: (errorDetails.details?.current as number | undefined) ?? 0,
          limit: (errorDetails.details?.limit as number | undefined) ?? 0,
          resetAt: errorDetails.details?.resetAt
            ? new Date(errorDetails.details.resetAt as string)
            : undefined,
          upgradeUrl: errorDetails.details?.upgradeUrl as string | undefined,
          message: errorDetails.message,
        });
      }

      // Handle error object or string
      const errorMessage = getApiErrorMessage(errorData.error);
      throw new Error(errorMessage || 'Failed to process image');
    }

    const initial = await parseJsonResponse<IProcessImageApiResponse | IAsyncUpscaleStatus>(
      response
    ).catch(() => {
      throw new AsyncUpscalePendingError(jobId);
    });
    const durable =
      response.status === 202 ||
      ('status' in initial && 'jobId' in initial && initial.jobId === jobId);
    if (durable) {
      const acceptedJobId = (initial as IAsyncUpscaleStatus).jobId ?? jobId;
      options.onJobAccepted?.(acceptedJobId);
      if (initial && 'status' in initial) {
        const status = initial as IAsyncUpscaleStatus;
        if (status.jobId === acceptedJobId) options.onJobStatus?.(status);
      }
    }
    const data =
      response.status === 202
        ? await pollAsyncUpscale(
            jobId,
            initial as IAsyncUpscaleStatus,
            options,
            initial.retryAfterMs ?? 3000
          )
        : initial;

    // Finalization starts only after a usable output capability is available.
    onProgress(95, ProcessingStage.FINALIZING);

    // Validate we got either a legacy inline image or a retryable output capability.
    const outputCapability =
      data.processing?.reservationJobId && data.processing?.deliveryToken
        ? {
            reservationJobId: data.processing.reservationJobId,
            deliveryToken: data.processing.deliveryToken,
          }
        : null;
    if (!outputCapability) {
      throw new Error('No image data received from server');
    }

    const imageUrl = await fetchRetryableOutputBlobUrl(
      outputCapability,
      headers,
      options.signal
    ).catch(error => {
      if (durable) throw new AsyncUpscalePendingError(jobId);
      throw error;
    });

    onProgress(100, ProcessingStage.FINALIZING);

    return {
      jobId: durable ? jobId : undefined,
      durable,
      imageUrl,
      creditsRemaining: data.processing?.creditsRemaining ?? 0,
      creditsUsed: data.processing?.creditsUsed ?? 0,
      modelDisplayName: data.processing?.modelDisplayName,
      dimensionPreservingFallback: data.processing?.dimensionPreservingFallback,
    };
  } catch (error) {
    console.error('AI Processing Error:', error);

    // Handle timeout errors specifically
    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.message.includes('timed out')) {
        throw new Error(
          'Request timeout: The image processing request timed out. Please try again.'
        );
      }
      if (error.name === 'AbortError') {
        throw new Error(
          'Request timeout: The image processing request timed out. Please try again.'
        );
      }
    }

    throw error;
  }
};

async function deliverAsyncUpscaleResult(
  status: IAsyncUpscaleStatus,
  headers: Record<string, string>,
  onProgress: ProgressCallback,
  options: IProcessImageOptions
): Promise<IProcessImageResult> {
  if (status.status === 'refunded') {
    throw new AsyncUpscaleTerminalError(
      status.jobId,
      status.status,
      getApiErrorMessage(status.error) || 'Image processing failed and credits were refunded.',
      true,
      false
    );
  }
  if (status.status !== 'ready' && status.status !== 'completed') {
    throw new AsyncUpscalePendingError(status.jobId);
  }

  const outputCapability =
    status.processing?.reservationJobId && status.processing?.deliveryToken
      ? {
          reservationJobId: status.processing.reservationJobId,
          deliveryToken: status.processing.deliveryToken,
        }
      : null;
  if (!outputCapability) throw new AsyncUpscalePendingError(status.jobId);

  onProgress(95, ProcessingStage.FINALIZING);
  const imageUrl = await fetchRetryableOutputBlobUrl(
    outputCapability,
    headers,
    options.signal
  ).catch(() => {
    throw new AsyncUpscalePendingError(status.jobId);
  });
  options.signal?.throwIfAborted();
  onProgress(100, ProcessingStage.FINALIZING);
  return {
    jobId: status.jobId,
    durable: true,
    imageUrl,
    creditsRemaining: status.processing?.creditsRemaining ?? 0,
    creditsUsed: status.processing?.creditsUsed ?? 0,
    modelDisplayName: status.processing?.modelDisplayName,
    dimensionPreservingFallback: status.processing?.dimensionPreservingFallback,
  };
}

/** Read the bounded owner-only list used to discover jobs after a reload. */
export async function listActiveAsyncUpscaleJobs(
  options: IProcessImageOptions = {}
): Promise<IAsyncUpscaleJobListResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Authentication required to list upscale jobs');

  const response = await fetch('/api/upscale?active=1', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: requestSignal(options.signal, 10_000),
  });
  if (!response.ok) throw new Error(`Active upscale job list failed (${response.status})`);
  const data = await parseJsonResponse<IAsyncUpscaleJobListResponse>(response);
  if (data.success !== true || !Array.isArray(data.jobs)) {
    throw new Error('Invalid active upscale job list response');
  }
  return data;
}

/** Resume a saved job without an upload or a second provider admission. */
export async function resumeAsyncUpscale(
  jobId: string,
  onProgress: ProgressCallback = () => undefined,
  options: IProcessImageOptions = {}
): Promise<IProcessImageResult> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Authentication required to resume upscale job');

  const headers = { Authorization: `Bearer ${accessToken}` };
  const statusUrl = `/api/upscale?jobId=${encodeURIComponent(jobId)}`;
  let response: Response;
  try {
    response = await fetch(statusUrl, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: requestSignal(options.signal, 10_000),
    });
  } catch {
    options.signal?.throwIfAborted();
    throw new AsyncUpscalePendingError(jobId);
  }

  const state = await parseJsonResponse<IAsyncUpscaleStatus>(response).catch(() => undefined);
  if (state?.jobId && state.jobId !== jobId) throw new AsyncUpscalePendingError(jobId);
  if (state?.jobId === jobId) {
    options.onJobStatus?.(state);
    if (state.status === 'refunded') {
      throw new AsyncUpscaleTerminalError(
        jobId,
        state.status,
        getApiErrorMessage(state.error) || 'Image processing failed and credits were refunded.',
        true,
        false
      );
    }
    if (state.status === 'ready' || state.status === 'completed') {
      return deliverAsyncUpscaleResult(state, headers, onProgress, options);
    }
    const initial: IAsyncUpscaleStatus = {
      ...state,
      executionDeadline: state.executionDeadline ?? options.executionDeadline,
    };
    const completed = await pollAsyncUpscale(
      jobId,
      initial,
      options,
      statusRetryDelay(response, state.retryAfterMs ?? 3000)
    );
    return deliverAsyncUpscaleResult(
      completed as IAsyncUpscaleStatus,
      headers,
      onProgress,
      options
    );
  }

  if (response.status === 404 || response.status === 410 || response.status === 400) {
    throw new AsyncUpscaleTerminalError(
      jobId,
      'not_found',
      'This processing job is no longer available.',
      false,
      false
    );
  }
  if (response.status === 401) throw new AsyncUpscalePendingError(jobId);
  if (response.status === 429 || response.status >= 500) {
    const initial: IAsyncUpscaleStatus = {
      jobId,
      status: 'processing',
      retryAfterMs: statusRetryDelay(response, 3000),
      executionDeadline: options.executionDeadline,
    };
    const completed = await pollAsyncUpscale(jobId, initial, options, initial.retryAfterMs);
    return deliverAsyncUpscaleResult(
      completed as IAsyncUpscaleStatus,
      headers,
      onProgress,
      options
    );
  }
  throw new AsyncUpscalePendingError(jobId);
}

export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};
