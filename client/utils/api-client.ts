import { IUpscaleConfig, ProcessingStage } from '@shared/types/pixelperfect';
import { createClient } from '@shared/utils/supabase/client';
import { serverEnv } from '@shared/config/env';

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
      resolve(base64);
    };
    reader.onerror = error => reject(error);
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
    const errorData = await response.json();
    // Handle error object or string
    const errorMessage =
      typeof errorData.error === 'object' ? errorData.error.message : errorData.error;
    throw new Error(errorMessage || 'Failed to analyze image');
  }

  return await response.json();
};

// Update callback type
type ProgressCallback = (progress: number, stage?: ProcessingStage) => void;

export const processImage = async (
  file: File,
  config: IUpscaleConfig,
  onProgress: ProgressCallback
): Promise<IProcessImageResult> => {
  try {
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
      const { QUALITY_TIER_CONFIG } = await import('@shared/types/pixelperfect');
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

    // Check if we're in a test environment and bypass auth for mocked tests
    const isTestEnvironment =
      (typeof window !== 'undefined' &&
        window.location.hostname === 'localhost' &&
        serverEnv.ENV === 'test') ||
      // Check for Playwright test marker
      window.playwrightTest === true ||
      // Check for test environment variable (injected by Playwright)
      window.__TEST_ENV__ === true;

    if (!accessToken && !isTestEnvironment) {
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
    });

    if (!response.ok) {
      const errorData = await response.json();

      // Handle batch limit exceeded errors specifically
      if (errorData.error?.code === 'BATCH_LIMIT_EXCEEDED') {
        throw new BatchLimitError({
          current: errorData.error.details?.current ?? 0,
          limit: errorData.error.details?.limit ?? 0,
          resetAt: errorData.error.details?.resetAt
            ? new Date(errorData.error.details.resetAt)
            : undefined,
          upgradeUrl: errorData.error.details?.upgradeUrl,
          message: errorData.error.message,
        });
      }

      // Handle error object or string
      const errorMessage =
        typeof errorData.error === 'object' ? errorData.error.message : errorData.error;
      throw new Error(errorMessage || 'Failed to process image');
    }

    // Stage 4: Finalizing
    onProgress(95, ProcessingStage.FINALIZING);

    const data = await response.json();

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
    };
  } catch (error) {
    console.error('AI Processing Error:', error);
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
