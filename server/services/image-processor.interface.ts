import type { IUpscaleInput } from '@shared/validation/upscale.schema';
import type { IProcessingCostAttribution } from './cost-telemetry.service';

/**
 * Result from a successful image processing operation
 */
export interface IImageProcessorResult {
  imageData?: string; // base64 data URL (legacy, deprecated for Workers)
  imageUrl?: string; // Direct URL to result image (preferred for Cloudflare Workers)
  mimeType: string; // e.g., 'image/png'
  creditsRemaining: number;
  expiresAt?: number; // Timestamp when URL expires (for imageUrl)
}

export interface ICreditDeduction {
  amount: number;
  jobId: string;
  newBalance: number;
  subscriptionAmount: number;
  purchasedAmount: number;
}

/**
 * Options passed to processImage
 */
export interface IProcessImageOptions {
  /** Pre-calculated credit cost from the route. If provided, processor uses this instead of recalculating. */
  creditCost?: number;
  /** Provider-cost details resolved by the API route from the same inputs used for billing. */
  costAttribution?: IProcessingCostAttribution;
  /**
   * Called immediately after credits are deducted. API routes use this to refund
   * if a later route-level failure occurs after the provider has already charged.
   */
  onCreditsDeducted?: (deduction: ICreditDeduction) => void;
}

/**
 * Common interface for all image processing providers
 *
 * This abstraction allows swapping between different AI providers
 * (Replicate, Gemini, etc.) while maintaining consistent behavior.
 *
 * Design Principles:
 * - Single Responsibility: Each provider handles only its own API integration
 * - Open/Closed: New providers can be added without modifying existing code
 * - Dependency Inversion: Routes depend on the interface, not concrete implementations
 */
export interface IImageProcessor {
  /**
   * Process an image upscale/enhancement request
   *
   * Implementations must:
   * 1. Deduct credits atomically before processing
   * 2. Process the image via their specific API
   * 3. Refund credits if processing fails
   * 4. Return consistent result format
   *
   * @param userId - The authenticated user's ID
   * @param input - The validated upscale input
   * @param options - Optional processing options (e.g., pre-calculated credit cost)
   * @returns The processed image data and remaining credits
   * @throws InsufficientCreditsError if user has no credits
   * @throws Provider-specific error for processing failures
   */
  processImage(
    userId: string,
    input: IUpscaleInput,
    options?: IProcessImageOptions
  ): Promise<IImageProcessorResult>;

  /**
   * Get the provider name for logging/debugging
   */
  readonly providerName: string;

  /**
   * Check if this provider can handle the given processing mode
   *
   * @param mode - The processing mode (upscale, enhance, both, custom)
   * @returns true if this provider supports the mode
   */
  supportsMode(mode: string): boolean;
}
