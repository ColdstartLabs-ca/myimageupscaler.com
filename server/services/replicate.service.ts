import Replicate from 'replicate';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import type { IUpscaleInput } from '@shared/validation/upscale.schema';
import { calculateCreditCost, InsufficientCreditsError } from './image-generation.service';
import type {
  IImageProcessor,
  IImageProcessorResult,
  IProcessImageOptions,
} from './image-processor.interface';
import { serializeError } from '@shared/utils/errors';
import { ModelRegistry } from './model-registry';
import {
  DEFAULT_ENHANCEMENT_SETTINGS,
  type IEnhancementSettings,
} from '@shared/types/pixelperfect';
import { withRetry, isRateLimitError } from '@server/utils/retry';

/**
 * Custom error for Replicate-specific failures
 */
export class ReplicateError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'REPLICATE_ERROR') {
    super(message);
    this.name = 'ReplicateError';
    this.code = code;
  }
}

/**
 * Replicate API input for Real-ESRGAN
 */
interface IRealEsrganInput {
  image: string; // URL or data URL
  scale?: number; // 2 or 4 (default 4)
  face_enhance?: boolean; // Use GFPGAN for faces
}

/**
 * Replicate API input for GFPGAN
 */
interface IGfpganInput {
  img: string; // URL or data URL (note: 'img' not 'image')
  scale?: number; // Rescaling factor (default 2)
  version?: 'v1.2' | 'v1.3' | 'v1.4' | 'RestoreFormer';
}

/**
 * Replicate API input for Clarity Upscaler
 */
interface IClarityUpscalerInput {
  image: string;
  prompt?: string;
  scale_factor?: number; // Magnification (2-16, default 2)
  creativity?: number; // 0-1, default 0.35
  resemblance?: number; // 0-3, default 0.6
  dynamic?: number; // HDR intensity (1-50, default 6)
  output_format?: string;
}

/**
 * Replicate API input for Flux-Kontext-Pro
 */
interface IFluxKontextInput {
  prompt: string;
  input_image: string;
  aspect_ratio: string;
  output_format: string;
}

/**
 * Replicate API input for Flux-2-Pro (Black Forest Labs)
 * Premium face restoration model
 */
interface IFlux2ProInput {
  prompt: string;
  input_images: string[]; // Array of image URLs/data URLs
  aspect_ratio?: string;
  output_format?: 'jpg' | 'png' | 'webp';
  safety_tolerance?: number; // 1-6, default 2
  prompt_upsampling?: boolean;
}

/**
 * Replicate API input for Nano Banana Pro (Google)
 */
interface INanoBananaProInput {
  prompt: string;
  image_input?: string[];
  aspect_ratio?:
    | 'match_input_image'
    | '1:1'
    | '2:3'
    | '3:2'
    | '3:4'
    | '4:3'
    | '4:5'
    | '5:4'
    | '9:16'
    | '16:9'
    | '21:9';
  resolution?: '1K' | '2K' | '4K';
  output_format?: 'jpg' | 'png';
  safety_filter_level?: 'block_low_and_above' | 'block_medium_and_above' | 'block_only_high';
}

/**
 * Generate enhancement instructions from the enhancement settings.
 * This mirrors the client-side logic in prompt-utils.ts to ensure consistency.
 */
function generateEnhancementInstructions(enhancement: IEnhancementSettings): string {
  const actions: string[] = [];

  if (enhancement.clarity) {
    actions.push('sharpen edges and improve overall clarity');
  }

  if (enhancement.color) {
    actions.push('balance color saturation and correct color casts');
  }

  if (enhancement.lighting) {
    actions.push('optimize exposure and lighting balance');
  }

  if (enhancement.denoise) {
    actions.push('remove sensor noise and grain while preserving details');
  }

  if (enhancement.artifacts) {
    actions.push('eliminate compression artifacts and blocky patterns');
  }

  if (enhancement.details) {
    actions.push('enhance fine textures and subtle details');
  }

  if (actions.length === 0) {
    return '';
  }

  return actions.join(', ') + '. ';
}

/**
 * Service for image upscaling via Replicate Real-ESRGAN
 *
 * Cost: ~$0.0017/image on T4 GPU
 * Speed: ~1-2 seconds per image
 *
 * Implements IImageProcessor interface for provider abstraction.
 */
export class ReplicateService implements IImageProcessor {
  public readonly providerName = 'Replicate';
  private replicate: Replicate;
  private modelVersion: string;
  private modelId: string;

  constructor(modelId: string = 'real-esrgan') {
    const apiToken = serverEnv.REPLICATE_API_TOKEN;
    if (!apiToken) {
      throw new Error('REPLICATE_API_TOKEN is not configured');
    }

    this.replicate = new Replicate({ auth: apiToken });
    this.modelVersion = serverEnv.REPLICATE_MODEL_VERSION;
    this.modelId = modelId;
  }

  /**
   * Check if Replicate supports the given processing mode
   *
   * Replicate (Real-ESRGAN) is optimized for pure upscaling operations.
   * For creative enhancement, use Gemini instead.
   */
  supportsMode(mode: string): boolean {
    return ['upscale', 'both'].includes(mode);
  }

  /**
   * Process an image upscale request via Replicate
   *
   * @param userId - The authenticated user's ID
   * @param input - The validated upscale input
   * @param options - Optional processing options (e.g., pre-calculated credit cost)
   * @returns The upscaled image data and remaining credits
   * @throws InsufficientCreditsError if user has no credits
   * @throws ReplicateError if API call fails
   */
  async processImage(
    userId: string,
    input: IUpscaleInput,
    options?: IProcessImageOptions
  ): Promise<IImageProcessorResult> {
    const jobId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    // Use pre-calculated credit cost if provided, otherwise calculate locally
    const creditCost = options?.creditCost ?? calculateCreditCost(input.config);

    // Step 1: Deduct credits atomically using FIFO (subscription first, then purchased)
    const { data: balanceResult, error: creditError } = await supabaseAdmin.rpc(
      'consume_credits_v2',
      {
        target_user_id: userId,
        amount: creditCost,
        ref_id: jobId,
        description: `Image processing via Replicate (${creditCost} credits)`,
      }
    );

    if (creditError) {
      if (creditError.message?.includes('Insufficient credits')) {
        throw new InsufficientCreditsError(creditError.message);
      }
      throw new Error(`Failed to deduct credits: ${creditError.message}`);
    }

    // Extract total balance from result (returns array with single row)
    const newBalance = balanceResult?.[0]?.new_total_balance ?? 0;

    try {
      // Step 2: Call Replicate API
      const result = await this.callReplicate(input);

      return {
        ...result,
        creditsRemaining: newBalance,
      };
    } catch (error) {
      // Step 3: Refund on failure
      await this.refundCredits(userId, jobId, creditCost);
      throw error;
    }
  }

  /**
   * Refund credits for a failed upscale
   */
  private async refundCredits(userId: string, jobId: string, amount: number): Promise<void> {
    const { error } = await supabaseAdmin.rpc('refund_credits', {
      target_user_id: userId,
      amount,
      job_id: jobId,
    });

    if (error) {
      console.error('Failed to refund credits:', error);
    }
  }

  /**
   * Get the model version for a given model ID from the registry
   */
  private getModelVersionForId(modelId: string): string {
    const registry = ModelRegistry.getInstance();
    const model = registry.getModel(modelId);

    if (model && model.modelVersion) {
      return model.modelVersion;
    }

    // Fallback to default model version
    return this.modelVersion;
  }

  /**
   * Build model-specific input parameters
   */
  private buildModelInput(
    modelId: string,
    imageDataUrl: string,
    input: IUpscaleInput
  ):
    | IFluxKontextInput
    | IRealEsrganInput
    | IGfpganInput
    | IClarityUpscalerInput
    | IFlux2ProInput
    | INanoBananaProInput {
    const scale = input.config.scale;
    const customPrompt = input.config.additionalOptions.customInstructions;
    const { enhance, enhanceFaces, preserveText } = input.config.additionalOptions;
    const enhancement = input.config.additionalOptions.enhancement || DEFAULT_ENHANCEMENT_SETTINGS;

    // Generate enhancement instructions from the detailed settings
    const enhancementInstructions = enhance ? generateEnhancementInstructions(enhancement) : '';

    switch (modelId) {
      case 'clarity-upscaler': {
        // Use custom prompt if provided, otherwise build from enhancement settings
        let effectivePrompt = customPrompt;
        if (!effectivePrompt) {
          effectivePrompt = 'masterpiece, best quality, highres';
          if (enhancementInstructions) {
            effectivePrompt += `. ${enhancementInstructions}`;
          }
          if (enhanceFaces) {
            effectivePrompt += ' Enhance facial features naturally.';
          }
          if (preserveText) {
            effectivePrompt += ' Preserve text and logos clearly.';
          }
        }
        return {
          image: imageDataUrl,
          prompt: effectivePrompt,
          scale_factor: scale, // Supports 2-16
          output_format: 'png',
        };
      }

      case 'gfpgan':
        return {
          img: imageDataUrl, // Note: GFPGAN uses 'img' not 'image'
          scale: scale <= 4 ? scale : 4, // GFPGAN max scale is 4
          version: 'v1.4',
        };

      case 'flux-kontext-pro': {
        let effectivePrompt = customPrompt;
        if (!effectivePrompt) {
          effectivePrompt = 'enhance and upscale this image, improve quality and details';
          if (enhancementInstructions) {
            effectivePrompt += `. ${enhancementInstructions}`;
          }
          if (enhanceFaces) {
            effectivePrompt += ' Enhance facial features naturally without altering identity.';
          }
          if (preserveText) {
            effectivePrompt += ' Preserve and sharpen any text or logos.';
          }
        }
        return {
          prompt: effectivePrompt,
          input_image: imageDataUrl,
          aspect_ratio: 'match_input_image',
          output_format: 'png',
        };
      }

      case 'flux-2-pro': {
        let effectivePrompt = customPrompt;
        if (!effectivePrompt) {
          effectivePrompt = 'Restore this image exactly as it would look in higher resolution.';
          if (enhancementInstructions) {
            effectivePrompt += ` ${enhancementInstructions}`;
          }
          if (enhanceFaces) {
            effectivePrompt += ' Enhance facial features naturally without altering identity.';
          }
          if (preserveText) {
            effectivePrompt += ' Preserve text and logos clearly.';
          }
          effectivePrompt += ' No creative changes.';
        }

        return {
          prompt: effectivePrompt,
          input_images: [imageDataUrl],
          aspect_ratio: 'match_input_image',
          output_format: 'png',
          safety_tolerance: 2,
          prompt_upsampling: false,
        };
      }

      case 'nano-banana-pro': {
        // Build a descriptive prompt based on the operation mode
        const ultraConfig = input.config.nanoBananaProConfig;
        let effectivePrompt = customPrompt;

        if (!effectivePrompt) {
          // Generate a default prompt based on new quality tier system
          effectivePrompt = enhance
            ? `Upscale this image to ${scale}x resolution while enhancing for a crisp, professional result.`
            : `Upscale this image to ${scale}x resolution with enhanced sharpness and detail.`;

          // Add specific enhancement instructions from the detailed settings
          if (enhancementInstructions) {
            effectivePrompt += ` ${enhancementInstructions}`;
          }

          // Add face enhancement instruction if enabled
          if (enhanceFaces) {
            effectivePrompt += ' Enhance facial features naturally without altering identity.';
          }

          // Add text preservation instruction if enabled
          if (preserveText) {
            effectivePrompt += ' Preserve and sharpen any text or logos in the image.';
          }
        }

        // Map scale to resolution
        const scaleToResolution: Record<number, '1K' | '2K' | '4K'> = {
          2: '2K',
          4: '4K',
          8: '4K', // Max supported is 4K
        };

        return {
          prompt: effectivePrompt,
          image_input: [imageDataUrl],
          aspect_ratio: ultraConfig?.aspectRatio || 'match_input_image',
          resolution: ultraConfig?.resolution || scaleToResolution[scale] || '2K',
          output_format: ultraConfig?.outputFormat || 'png',
          safety_filter_level: ultraConfig?.safetyFilterLevel || 'block_only_high',
        };
      }

      case 'real-esrgan':
      default:
        // Real-ESRGAN only supports scale 2 or 4
        return {
          image: imageDataUrl,
          scale: scale === 2 ? 2 : 4,
          face_enhance: enhanceFaces || false,
        };
    }
  }

  /**
   * Call the Replicate model (supports multiple models from registry)
   */
  private async callReplicate(input: IUpscaleInput): Promise<{
    imageUrl: string;
    mimeType: string;
    expiresAt: number;
  }> {
    // Prepare image data - ensure it's a data URL
    let imageDataUrl = input.imageData;
    if (!imageDataUrl.startsWith('data:')) {
      const mimeType = input.mimeType || 'image/jpeg';
      imageDataUrl = `data:${mimeType};base64,${imageDataUrl}`;
    }

    // Use the instance's modelId
    const selectedModel = this.modelId;
    const modelVersion =
      selectedModel !== 'auto' ? this.getModelVersionForId(selectedModel) : this.modelVersion;

    // Prepare Replicate input based on model type
    const replicateInput = this.buildModelInput(selectedModel, imageDataUrl, input);

    // Helper to extract URL string from various Replicate output formats
    const extractUrl = (value: unknown): string | null => {
      if (typeof value === 'string') {
        return value;
      }

      if (value && typeof value === 'object') {
        // FileOutput objects can be converted to string (they extend URL class)
        if (typeof (value as { toString?: () => string }).toString === 'function') {
          const stringified = String(value);
          if (stringified.startsWith('http')) {
            return stringified;
          }
        }

        // Try .url property (could be string or function)
        if ('url' in value) {
          const urlValue = (value as { url: unknown }).url;
          if (typeof urlValue === 'function') {
            return urlValue();
          }
          if (typeof urlValue === 'string') {
            return urlValue;
          }
        }

        // Try .href property (URL-like objects)
        if ('href' in value && typeof (value as { href: unknown }).href === 'string') {
          return (value as { href: string }).href;
        }
      }

      return null;
    };

    try {
      // Run with retry for rate limits
      const output = await withRetry(
        () =>
          this.replicate.run(modelVersion as `${string}/${string}:${string}`, {
            input: replicateInput,
          }),
        {
          shouldRetry: err => isRateLimitError(serializeError(err)),
          onRetry: (attempt, delayMs) => {
            console.log(
              `[Replicate] Rate limited, retrying in ${delayMs}ms (attempt ${attempt}/3)`
            );
          },
        }
      );

      // Handle different output formats
      let outputUrl: string;

      if (Array.isArray(output)) {
        const first = output[0];
        const extracted = extractUrl(first);
        if (extracted) {
          outputUrl = extracted;
        } else {
          throw new ReplicateError('Unexpected array output format from Replicate', 'NO_OUTPUT');
        }
      } else {
        const extracted = extractUrl(output);
        if (extracted) {
          outputUrl = extracted;
        } else {
          throw new ReplicateError('No output URL returned from Replicate', 'NO_OUTPUT');
        }
      }

      if (!outputUrl) {
        throw new ReplicateError('Output URL is empty', 'NO_OUTPUT');
      }

      // Return URL directly - browser will fetch the image
      // This avoids CPU-intensive Buffer operations on the server (Cloudflare Workers 10ms limit)
      // Replicate URLs are valid for ~1 hour
      const mimeType = outputUrl.toLowerCase().includes('.png')
        ? 'image/png'
        : outputUrl.toLowerCase().includes('.webp')
          ? 'image/webp'
          : 'image/jpeg';

      return {
        imageUrl: outputUrl,
        mimeType,
        expiresAt: Date.now() + 3600000, // 1 hour
      };
    } catch (error) {
      // Map Replicate-specific errors
      const message = serializeError(error);

      if (isRateLimitError(message)) {
        throw new ReplicateError(
          'Replicate rate limit exceeded. Please try again.',
          'RATE_LIMITED'
        );
      }

      if (message.includes('NSFW') || message.includes('safety')) {
        throw new ReplicateError('Image flagged by safety filter.', 'SAFETY');
      }

      if (message.includes('timeout') || message.includes('timed out')) {
        throw new ReplicateError('Processing timed out. Please try a smaller image.', 'TIMEOUT');
      }

      if (error instanceof ReplicateError) {
        throw error;
      }

      throw new ReplicateError(`Upscale failed: ${message}`, 'PROCESSING_FAILED');
    }
  }
}

// Export factory function for model-specific instances
export function createReplicateService(modelId: string): ReplicateService {
  return new ReplicateService(modelId);
}

// Export singleton for backward compatibility (default model)
let replicateServiceInstance: ReplicateService | null = null;

export function getReplicateService(): ReplicateService {
  if (!replicateServiceInstance) {
    replicateServiceInstance = new ReplicateService();
  }
  return replicateServiceInstance;
}
