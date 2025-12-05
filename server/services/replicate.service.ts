import Replicate from 'replicate';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import type { IUpscaleInput } from '@shared/validation/upscale.schema';
import { calculateCreditCost, InsufficientCreditsError } from './image-generation.service';
import type { IImageProcessor, IImageProcessorResult } from './image-processor.interface';
import { serializeError } from '@shared/utils/errors';

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
 * Replicate API input for Flux-Kontext-Pro
 */
interface IFluxKontextInput {
  prompt: string;
  input_image: string;
  aspect_ratio: string;
  output_format: string;
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

  constructor() {
    const apiToken = serverEnv.REPLICATE_API_TOKEN;
    if (!apiToken) {
      throw new Error('REPLICATE_API_TOKEN is not configured');
    }

    this.replicate = new Replicate({ auth: apiToken });
    this.modelVersion = serverEnv.REPLICATE_MODEL_VERSION;
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
   * @returns The upscaled image data and remaining credits
   * @throws InsufficientCreditsError if user has no credits
   * @throws ReplicateError if API call fails
   */
  async processImage(userId: string, input: IUpscaleInput): Promise<IImageProcessorResult> {
    const jobId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const creditCost = calculateCreditCost(input.config);

    // Step 1: Deduct credits atomically
    const { data: newBalance, error: creditError } = await supabaseAdmin.rpc(
      'decrement_credits_with_log',
      {
        target_user_id: userId,
        amount: creditCost,
        transaction_type: 'usage',
        ref_id: jobId,
        description: `Image upscale via Replicate (${creditCost} credits)`,
      }
    );

    if (creditError) {
      if (creditError.message?.includes('Insufficient credits')) {
        throw new InsufficientCreditsError(creditError.message);
      }
      throw new Error(`Failed to deduct credits: ${creditError.message}`);
    }

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
   * Call the Replicate model (supports both Real-ESRGAN and Flux-Kontext-Pro)
   */
  private async callReplicate(
    input: IUpscaleInput
  ): Promise<{ imageData: string; mimeType: string }> {
    // Prepare image data - ensure it's a data URL
    let imageDataUrl = input.imageData;
    if (!imageDataUrl.startsWith('data:')) {
      const mimeType = input.mimeType || 'image/jpeg';
      imageDataUrl = `data:${mimeType};base64,${imageDataUrl}`;
    }

    // Check if using flux-kontext-pro (requires prompt) or real-esrgan
    const isFluxModel = this.modelVersion.includes('flux-kontext-pro');

    // Prepare Replicate input based on model type
    const replicateInput: IFluxKontextInput | IRealEsrganInput = isFluxModel
      ? {
          prompt:
            input.config.customPrompt ||
            'enhance and upscale this image, improve quality and details',
          input_image: imageDataUrl,
          aspect_ratio: 'match_input_image',
          output_format: 'png',
        }
      : {
          image: imageDataUrl,
          scale: input.config.scale === 2 ? 2 : 4,
          face_enhance: input.config.enhanceFace || false,
        };

    try {
      // Run the model - returns output URL(s)
      const output = await this.replicate.run(
        this.modelVersion as `${string}/${string}:${string}`,
        { input: replicateInput }
      );

      console.log('[Replicate] Raw output type:', typeof output);
      console.log('[Replicate] Raw output value:', output);
      console.log('[Replicate] Is array:', Array.isArray(output));

      // Handle different output formats
      let outputUrl: string;

      if (typeof output === 'string') {
        // flux-kontext-pro returns a string URL directly
        outputUrl = output;
      } else if (Array.isArray(output)) {
        // Some models return array of URLs or FileOutput objects
        const first = output[0];
        if (typeof first === 'string') {
          outputUrl = first;
        } else if (first && typeof first === 'object' && 'url' in first) {
          outputUrl = typeof first.url === 'function' ? first.url() : first.url;
        } else {
          throw new ReplicateError('Unexpected array output format from Replicate', 'NO_OUTPUT');
        }
      } else if (output && typeof output === 'object' && 'url' in output) {
        // FileOutput object with .url() method
        outputUrl = typeof output.url === 'function' ? output.url() : output.url;
      } else {
        throw new ReplicateError(
          `No output URL returned from Replicate. Got: ${JSON.stringify(output)}`,
          'NO_OUTPUT'
        );
      }

      if (!outputUrl) {
        throw new ReplicateError('Output URL is empty', 'NO_OUTPUT');
      }

      // Fetch the output image
      const imageResponse = await fetch(outputUrl);

      if (!imageResponse.ok) {
        throw new ReplicateError(
          `Failed to fetch output image: ${imageResponse.status}`,
          'FETCH_FAILED'
        );
      }

      // Convert to base64
      const imageBuffer = await imageResponse.arrayBuffer();
      const base64 = Buffer.from(imageBuffer).toString('base64');

      // Determine mime type from response or URL
      const contentType = imageResponse.headers.get('content-type') || 'image/png';

      return {
        imageData: `data:${contentType};base64,${base64}`,
        mimeType: contentType,
      };
    } catch (error) {
      // Map Replicate-specific errors
      const message = serializeError(error);

      if (message.includes('rate limit') || message.includes('429')) {
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

// Export singleton for convenience
let replicateServiceInstance: ReplicateService | null = null;

export function getReplicateService(): ReplicateService {
  if (!replicateServiceInstance) {
    replicateServiceInstance = new ReplicateService();
  }
  return replicateServiceInstance;
}
