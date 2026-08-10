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
  imageData?: string;
  imageUrl?: string;
  processing?: {
    creditsRemaining?: number;
    creditsUsed?: number;
    modelDisplayName?: string;
    dimensionPreservingFallback?: boolean;
  };
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
  onProgress: ProgressCallback
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

    // Stage 1: Preparing
    onProgress(10, ProcessingStage.PREPARING);
    const base64Data = await fileToBase64(file);

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

    const response = await fetch('/api/upscale', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        imageData: base64Data,
        mimeType: file.type || 'image/jpeg',
        // Pass enhancement prompt if available
        enhancementPrompt,
        config,
        resolvedModel, // Pass the resolved model for server processing
      }),
      signal: AbortSignal.timeout(TIMEOUTS.REPLICATE_TIMEOUT),
    });

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

    // Validate we got image data in some form
    if (!data.imageUrl && !data.imageData) {
      throw new Error('No image data received from server');
    }

    onProgress(100, ProcessingStage.FINALIZING);

    // Return both URL and base64 - consumer decides which to use
    // imageUrl: Direct URL for <img> display (no CORS issues, faster)
    // imageData: Base64 for legacy support or when base64 is needed
    return {
      imageUrl: data.imageUrl,
      imageData: data.imageData,
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

export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};
