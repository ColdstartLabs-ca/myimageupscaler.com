import { IUpscaleConfig, ProcessingStage } from '@/shared/types/coreflow.types';
import { TIMEOUTS } from '@shared/config/timeouts.config';
import { createClient } from '@shared/utils/supabase/client';
import { analytics } from '@client/analytics';
import { normalizeCoreEventProperties } from '@server/analytics/core-event-contract';

type FetchRequestInit = NonNullable<Parameters<typeof fetch>[1]>;

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
  accepted?: boolean;
  jobId?: string;
  status?: string;
  exactCharge?: number | null;
  creditsRemaining?: number;
  creditsUsed?: number;
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
  job?: {
    jobId?: string;
    status?: string;
    deliveryToken?: string;
    creditsRemaining?: number;
    creditsUsed?: number;
    modelDisplayName?: string;
    dimensionPreservingFallback?: boolean;
  };
  delivery?: {
    reservationJobId?: string;
    deliveryToken?: string;
  };
}

export interface IDurableUpscaleJobStatus {
  jobId: string;
  stage?: string;
  status?: string;
  requestedQualityTier?: string | null;
  resolvedQualityTier?: string | null;
  modelId?: string | null;
  scale?: number | null;
  exactCharge?: number | null;
  retryable?: boolean;
  refunded?: boolean;
  outputAvailable?: boolean;
  outputMimeType?: string | null;
  outputSizeBytes?: number | null;
  outputExpiresAt?: string | null;
  deliveryToken?: string;
  failureReason?: string | null;
  timestamps?: {
    createdAt?: string | null;
    updatedAt?: string | null;
  };
}

export interface IDurableUpscaleJobListResponse {
  success: boolean;
  jobs: IDurableUpscaleJobStatus[];
  nextCursor: string | null;
}

const DELIVERED_IMAGE_LOAD_TIMEOUT_MS = 15_000;
const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_RETRY_DELAY_MS = 100;

class OutputCapabilityError extends Error {}

/** Only an authoritative job state can make a durable execution fail locally. */
export class DurableUpscaleTerminalError extends Error {
  readonly jobId: string;
  readonly status: string;
  readonly refunded: boolean;
  readonly retryable: boolean;

  constructor(job: IDurableUpscaleJobStatus) {
    super('Image processing did not complete successfully');
    this.name = 'DurableUpscaleTerminalError';
    this.jobId = job.jobId;
    this.status = job.status ?? job.stage ?? 'failed';
    this.refunded = job.refunded === true;
    this.retryable = job.retryable === true;
  }
}

export class DurableUpscaleAccessError extends Error {
  constructor(
    readonly jobId: string,
    readonly status: number
  ) {
    super(
      status === 404
        ? 'Durable upscale job was not found'
        : 'Authentication required to resume upscale job'
    );
    this.name = 'DurableUpscaleAccessError';
  }
}

const DURABLE_POLL_INTERVAL_MS = 2_000;
const DURABLE_POLL_MAX_INTERVAL_MS = 10_000;
const DURABLE_REQUEST_TIMEOUT_MS = 15_000;
const DURABLE_POLL_JITTER_RATIO = 0.2;
const DURABLE_ADMISSION_RECOVERY_DELAYS_MS = [2_000, 5_000, 10_000] as const;

type DurableRequestOptions = Pick<
  IProcessImageOptions,
  'signal' | 'onConnectionChange' | 'onJobStatus'
>;

function isDurableClientAvailable(): boolean {
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
  return online && visible;
}

/** Timers pause in hidden/offline tabs; focus/reconnect performs an immediate lookup. */
function waitForDurablePoll(
  delayMs: number,
  options: DurableRequestOptions = {},
  useJitter = true
): Promise<void> {
  const { signal } = options;
  signal?.throwIfAborted();
  const jitter = useJitter ? 1 + (Math.random() * 2 - 1) * DURABLE_POLL_JITTER_RATIO : 1;
  const interval = Math.min(
    DURABLE_POLL_MAX_INTERVAL_MS,
    Math.max(0, Math.round(delayMs * jitter))
  );

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const browser = typeof window !== 'undefined' && typeof document !== 'undefined';
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (!browser) return;
      window.removeEventListener('online', changed);
      window.removeEventListener('offline', changed);
      window.removeEventListener('focus', changed);
      document.removeEventListener('visibilitychange', changed);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const changed = () => {
      if (isDurableClientAvailable()) finish();
      else {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        options.onConnectionChange?.(true);
      }
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (browser) {
      window.addEventListener('online', changed);
      window.addEventListener('offline', changed);
      window.addEventListener('focus', changed);
      document.addEventListener('visibilitychange', changed);
    }
    if (!isDurableClientAvailable()) options.onConnectionChange?.(true);
    else if (interval === 0) finish();
    else timer = setTimeout(finish, interval);
  });
}

function durableRequestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(DURABLE_REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function isLostUpscaleResponse(error: unknown): boolean {
  return (
    error instanceof UpscaleEdgeError ||
    error instanceof TypeError ||
    (error instanceof Error &&
      (error.name === 'AbortError' ||
        error.name === 'TimeoutError' ||
        /network|fetch|timeout|temporarily unavailable/i.test(error.message)))
  );
}

/** A failed lookup is unknown; only a real 404 permits another same-ID POST. */
async function findDurableJobAfterLostResponse(
  jobId: string,
  headers: Record<string, string>,
  options: DurableRequestOptions
): Promise<Response | null> {
  for (;;) {
    await waitForDurablePoll(0, options);
    try {
      const response = await fetch(`/api/upscale/jobs?jobId=${encodeURIComponent(jobId)}`, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: durableRequestSignal(options.signal),
      });
      if (response.status === 404) return null;
      if (response.status === 401 || response.status === 403)
        throw new DurableUpscaleAccessError(jobId, response.status);
      if (response.ok) {
        const data = await parseJsonResponse<IProcessImageApiResponse>(response);
        const found = data.job ?? data;
        if (found.jobId === jobId && typeof found.status === 'string') {
          return Response.json({ ...data, accepted: true, jobId }, { status: 202 });
        }
      }
    } catch (error) {
      options.signal?.throwIfAborted();
      if (error instanceof DurableUpscaleAccessError) throw error;
    }
    options.onConnectionChange?.(true);
    await waitForDurablePoll(DURABLE_POLL_INTERVAL_MS, options);
  }
}

/** Reuse the immutable request and UUID throughout an ambiguous admission. */
async function submitUpscaleWithRecovery(
  jobId: string,
  request: FetchRequestInit & { headers: Record<string, string> },
  metadata: Pick<IUpscaleConfig, 'qualityTier' | 'scale'>,
  options: DurableRequestOptions = {}
): Promise<Response> {
  let retry = 0;
  let failureObserved = false;
  const observeFailure = (error: Pick<UpscaleEdgeError, 'status' | 'rayId'>) => {
    if (failureObserved || error.status < 500) return;
    failureObserved = true;
    void reportUpscaleEdgeFailure(error, { ...metadata, jobId });
  };
  for (;;) {
    await waitForDurablePoll(0, options);
    let providerOutage: Response | undefined;
    try {
      const response = await fetch('/api/upscale', {
        ...request,
        signal: durableRequestSignal(options.signal),
      });
      // Validate the body too: an interrupted JSON response can have valid headers.
      const body = await parseJsonResponse<IProcessImageApiResponse & IApiErrorResponse>(
        response.clone()
      );
      if (response.status < 500) return response;
      if (response.status === 503 && getApiErrorDetails(body.error)?.code === 'AI_UNAVAILABLE') {
        providerOutage = response;
      } else {
        observeFailure({ status: response.status, rayId: response.headers.get('cf-ray') });
      }
    } catch (error) {
      options.signal?.throwIfAborted();
      if (!isLostUpscaleResponse(error)) throw error;
      if (error instanceof UpscaleEdgeError) observeFailure(error);
    }
    options.onConnectionChange?.(true);
    const recovered = await findDurableJobAfterLostResponse(jobId, request.headers, options);
    if (recovered) return recovered;
    if (providerOutage) return providerOutage;
    const delay =
      DURABLE_ADMISSION_RECOVERY_DELAYS_MS[
        Math.min(retry++, DURABLE_ADMISSION_RECOVERY_DELAYS_MS.length - 1)
      ];
    await waitForDurablePoll(delay, options, false);
  }
}

async function waitForDurableUpscale(
  jobId: string,
  headers: Record<string, string>,
  onProgress: ProgressCallback,
  initialAccounting: { creditsRemaining?: number; creditsUsed?: number } = {},
  options: DurableRequestOptions = {},
  initialDelayMs = 0
): Promise<IProcessImageResult & { jobId: string; imageUrl: string }> {
  let delayMs = initialDelayMs;
  let firstPoll = true;
  for (;;) {
    await waitForDurablePoll(delayMs, options, !firstPoll);
    firstPoll = false;
    try {
      const response = await fetch(`/api/upscale/jobs?jobId=${encodeURIComponent(jobId)}`, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: durableRequestSignal(options.signal),
      });
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        throw new DurableUpscaleAccessError(jobId, response.status);
      }
      if (response.ok) {
        const data = await parseJsonResponse<IProcessImageApiResponse>(response);
        const job = (data.job ?? data) as IDurableUpscaleJobStatus & {
          creditsRemaining?: number;
          creditsUsed?: number;
          modelDisplayName?: string;
          dimensionPreservingFallback?: boolean;
        };
        if (job.jobId !== jobId || typeof (job.status ?? job.stage) !== 'string')
          throw new Error('Invalid job status response');
        const status = job.status ?? job.stage;
        options.onConnectionChange?.(false);
        options.onJobStatus?.(job);
        if (status === 'failed' || status === 'expired' || status === 'refunded') {
          throw new DurableUpscaleTerminalError(job);
        }
        const deliveryToken =
          job.deliveryToken ?? data.delivery?.deliveryToken ?? data.processing?.deliveryToken;
        if ((status === 'ready' || status === 'completed') && deliveryToken) {
          onProgress(95, ProcessingStage.FINALIZING);
          const imageUrl = await fetchRetryableOutputBlobUrl(
            { reservationJobId: jobId, deliveryToken },
            headers,
            options.signal
          );
          options.signal?.throwIfAborted();
          onProgress(100, ProcessingStage.FINALIZING);
          return {
            jobId,
            imageUrl,
            durable: true,
            creditsRemaining:
              job.creditsRemaining ??
              data.creditsRemaining ??
              data.processing?.creditsRemaining ??
              initialAccounting.creditsRemaining ??
              0,
            creditsUsed:
              job.creditsUsed ??
              job.exactCharge ??
              data.creditsUsed ??
              data.processing?.creditsUsed ??
              initialAccounting.creditsUsed ??
              0,
            modelDisplayName: job.modelDisplayName ?? data.processing?.modelDisplayName,
            dimensionPreservingFallback:
              job.dimensionPreservingFallback ?? data.processing?.dimensionPreservingFallback,
          };
        }
        onProgress(55, ProcessingStage.ENHANCING);
      } else {
        options.onConnectionChange?.(true);
        const retryAfter = Number(response.headers.get('retry-after'));
        if (retryAfter > 0) delayMs = Math.min(DURABLE_POLL_MAX_INTERVAL_MS, retryAfter * 1000);
      }
    } catch (error) {
      options.signal?.throwIfAborted();
      if (
        error instanceof DurableUpscaleTerminalError ||
        error instanceof DurableUpscaleAccessError
      )
        throw error;
      // Includes stale output capabilities and interrupted downloads. The next
      // owner status request refreshes capability and checks for a real refund.
      options.onConnectionChange?.(true);
    }
    delayMs = Math.min(
      DURABLE_POLL_MAX_INTERVAL_MS,
      Math.max(DURABLE_POLL_INTERVAL_MS, Math.round(delayMs * 1.25))
    );
  }
}

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
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(capability),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUTS.REPLICATE_TIMEOUT)])
          : AbortSignal.timeout(TIMEOUTS.REPLICATE_TIMEOUT),
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
  file: File,
  signal?: AbortSignal
): Promise<void> {
  const bucket = createClient().storage.from('upscale-inputs');
  let lastError: unknown;

  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    signal?.throwIfAborted();
    try {
      const upload = bucket.uploadToSignedUrl(storagePath, uploadToken, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });
      // This SDK version cannot cancel the storage PUT. Stop the caller
      // immediately; any already-started immutable upload remains with its owner.
      const { error } = signal
        ? await new Promise<Awaited<typeof upload>>((resolve, reject) => {
            const abort = () => reject(signal.reason);
            signal.addEventListener('abort', abort, { once: true });
            upload.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
          })
        : await upload;
      signal?.throwIfAborted();
      if (!error) return;
      // With an immutable grant, a response-loss after the storage commit is
      // reported as a conflict. The server validates the stored object before
      // it signs the provider-facing read URL.
      if (isCommittedUploadConflict(error)) return;
      lastError = error;
    } catch (error) {
      signal?.throwIfAborted();
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
  metadata: Pick<IUpscaleConfig, 'qualityTier' | 'scale'> & { jobId?: string }
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
        jobId: metadata.jobId,
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
  /** Durable job identity; present for both a new admission and a replay. */
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

export interface IProcessImageOptions {
  signal?: AbortSignal;
  onConnectionChange?: (reconnecting: boolean) => void;
  onJobStatus?: (job: IDurableUpscaleJobStatus) => void;
  /** Reuse this UUID when retrying admission after a lost response. */
  jobId?: string;
  /** Called as soon as the server confirms a durable admission/replay. */
  onJobAccepted?: (jobId: string) => void;
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
export type ProgressCallback = (progress: number, stage?: ProcessingStage) => void;

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
        durable: false,
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
      signal: durableRequestSignal(options.signal),
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type || 'image/jpeg',
        sizeBytes: file.size,
        jobId,
      }),
    });
    if (!uploadGrantResponse.ok) {
      const errorData = await parseJsonResponse<IApiErrorResponse>(uploadGrantResponse);
      throw new Error(getApiErrorMessage(errorData.error) || 'Failed to prepare image upload');
    }
    const uploadGrant = await parseJsonResponse<{
      storagePath: string;
      uploadToken: string;
    }>(uploadGrantResponse);
    options.signal?.throwIfAborted();
    await uploadToSignedUrlWithRetry(
      uploadGrant.storagePath,
      uploadGrant.uploadToken,
      file,
      options.signal
    );

    const response = await submitUpscaleWithRecovery(
      jobId,
      {
        method: 'POST',
        headers: {
          ...headers,
          // Tail Workers receive request headers even when the producer is killed
          // before it can run catch/finally refund logic.
          'X-Upscale-Job-Id': jobId,
          'X-Upscale-Protocol': '2',
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
      },
      config,
      options
    );

    if (!response.ok) {
      const errorData = await parseJsonResponse<IApiErrorResponse>(response);
      const errorDetails = getApiErrorDetails(errorData.error);

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

    // Stage 4: Finalizing
    onProgress(95, ProcessingStage.FINALIZING);

    const data = await parseJsonResponse<IProcessImageApiResponse>(response);

    if (
      response.status === 202 ||
      data.accepted === true ||
      (data.jobId === jobId && typeof data.status === 'string')
    ) {
      const durableJobId = data.jobId ?? data.job?.jobId ?? jobId;
      options.onJobAccepted?.(durableJobId);
      const durableResult = await waitForDurableUpscale(
        durableJobId,
        headers,
        onProgress,
        {
          creditsRemaining: data.processing?.creditsRemaining ?? data.job?.creditsRemaining,
          creditsUsed: data.processing?.creditsUsed ?? data.job?.creditsUsed,
        },
        options,
        DURABLE_POLL_INTERVAL_MS
      );
      return {
        jobId: durableResult.jobId,
        durable: true,
        imageUrl: durableResult.imageUrl,
        creditsRemaining: durableResult.creditsRemaining,
        creditsUsed: durableResult.creditsUsed,
        modelDisplayName: durableResult.modelDisplayName,
        dimensionPreservingFallback: durableResult.dimensionPreservingFallback,
      };
    }

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

    const imageUrl = await fetchRetryableOutputBlobUrl(outputCapability, headers);

    onProgress(100, ProcessingStage.FINALIZING);

    return {
      jobId,
      durable: false,
      imageUrl,
      creditsRemaining: data.processing?.creditsRemaining ?? 0,
      creditsUsed: data.processing?.creditsUsed ?? 0,
      modelDisplayName: data.processing?.modelDisplayName,
      dimensionPreservingFallback: data.processing?.dimensionPreservingFallback,
    };
  } catch (error) {
    options.signal?.throwIfAborted();
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

/** Read the authenticated user's durable jobs for reload recovery. */
export async function listDurableUpscaleJobs(
  options: DurableRequestOptions = {}
): Promise<IDurableUpscaleJobListResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Authentication required to list upscale jobs');
  const jobs = new Map<string, IDurableUpscaleJobStatus>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    await waitForDurablePoll(0, options);
    const response: Response = await fetch(
      `/api/upscale/jobs?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
        signal: durableRequestSignal(options.signal),
      }
    );
    if (!response.ok) throw new Error(`Durable job list request failed (${response.status})`);
    const page: IDurableUpscaleJobListResponse =
      await parseJsonResponse<IDurableUpscaleJobListResponse>(response);
    for (const job of page.jobs) jobs.set(job.jobId, job);
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw new Error('Invalid durable job pagination');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return { success: true, jobs: [...jobs.values()], nextCursor: null };
}

/** Resume a durable job without re-uploading or creating a second provider call. */
export async function resumeDurableUpscale(
  jobId: string,
  onProgress: ProgressCallback = () => undefined,
  options: DurableRequestOptions = {}
): Promise<IProcessImageResult> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Authentication required to resume upscale job');
  const durableResult = await waitForDurableUpscale(
    jobId,
    { Authorization: `Bearer ${accessToken}` },
    onProgress,
    {},
    options
  );
  return {
    jobId: durableResult.jobId,
    durable: true,
    imageUrl: durableResult.imageUrl,
    creditsRemaining: durableResult.creditsRemaining,
    creditsUsed: durableResult.creditsUsed,
    modelDisplayName: durableResult.modelDisplayName,
    dimensionPreservingFallback: durableResult.dimensionPreservingFallback,
  };
}

export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};
