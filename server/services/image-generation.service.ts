import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { GoogleGenAI } from '@google/genai';
import { serverEnv } from '@shared/config/env';
import type { IUpscaleInput, IUpscaleConfig } from '@shared/validation/upscale.schema';
import { getCreditsForTier } from '@shared/config/subscription.utils';
import { getSubscriptionConfig } from '@shared/config/subscription.config';
import type {
  IImageProcessor,
  IImageProcessorResult,
  IProcessImageOptions,
} from './image-processor.interface';

/**
 * Custom error class for insufficient credits
 */
export class InsufficientCreditsError extends Error {
  constructor(message = 'Insufficient credits') {
    super(message);
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * Custom error class for AI generation failures
 */
export class AIGenerationError extends Error {
  public readonly finishReason?: string;

  constructor(message: string, finishReason?: string) {
    super(message);
    this.name = 'AIGenerationError';
    this.finishReason = finishReason;
  }
}

/**
 * Maps Gemini finish reasons to user-friendly error messages
 */
function getFinishReasonMessage(finishReason: string): string {
  switch (finishReason) {
    case 'RECITATION':
      return "The model detected that the output would be too similar to the input (Recitation). Try using the 'Enhance' mode or changing the upscale factor.";
    case 'SAFETY':
      return "The image triggered the model's safety filters.";
    default:
      return `Model stopped generation. Reason: ${finishReason}`;
  }
}

/**
 * Extracts image data from Gemini response parts
 */
function extractImageDataFromParts(parts: unknown[]): { imageData: string; mimeType: string } {
  for (const part of parts) {
    if (typeof part === 'object' && part !== null && 'inlineData' in part) {
      const typedPart = part as {
        inlineData?: { data?: string; mimeType?: string };
        text?: string;
      };
      if (typedPart.inlineData && typedPart.inlineData.data) {
        const base64Image = typedPart.inlineData.data;
        const responseMimeType = typedPart.inlineData.mimeType || 'image/png';
        return {
          imageData: `data:${responseMimeType};base64,${base64Image}`,
          mimeType: responseMimeType,
        };
      }
    }
  }

  // Check if model returned text instead of image
  const textPart = parts.find(p => {
    return typeof p === 'object' && p !== null && 'text' in p;
  }) as { text?: string } | undefined;

  if (textPart?.text) {
    throw new AIGenerationError(
      `The model returned text instead of an image: ${textPart.text.slice(0, 100)}`
    );
  }

  throw new AIGenerationError('No image data found in the response.');
}

/**
 * Builds the quality-tier specific prompt segment
 */
function buildQualityPromptSegment(qualityTier: string, scale: number, enhance: boolean): string {
  // In the new system, we always upscale if scale > 1, and enhance if requested
  if (enhance) {
    return `Reconstruct the image at ${scale}x resolution. Simultaneously remove noise/artifacts and sharpen fine details. The output must be crisp and photorealistic. `;
  } else {
    return `Reconstruct the image at ${scale}x resolution (target 2K/4K). Aggressively sharpen edges and hallucinate plausible fine details to remove blur. `;
  }
}

/**
 * Builds constraint segments for the prompt
 */
function buildConstraintSegments(config: IUpscaleConfig): string {
  let constraints = '';

  if (config.additionalOptions.enhanceFaces) {
    constraints +=
      "Constraint: Enhance facial features naturally (eyes, skin texture) without altering the person's identity. ";
  }

  // Apply denoising if enhancement settings include denoise
  if (config.additionalOptions.enhancement?.denoise) {
    constraints += 'Constraint: Apply strong denoising to smooth out flat areas. ';
  }

  if (config.additionalOptions.preserveText) {
    constraints += 'Constraint: Preserve all text, logos, and typography exactly as they appear. ';
  }

  return constraints;
}

/**
 * Result from a successful image generation
 * @deprecated Use IImageProcessorResult from image-processor.interface instead
 */
export type IGenerationResult = IImageProcessorResult;

/**
 * Calculate the credit cost for an image processing operation.
 * Updated to work with new quality tier system.
 *
 * @param config - The upscale configuration
 * @returns The number of credits required
 */
export function calculateCreditCost(config: IUpscaleConfig): number {
  // Get base cost from quality tier
  const baseCost = getCreditsForTier(config.qualityTier);

  // Get scale multiplier
  const { creditCosts } = getSubscriptionConfig();
  const scaleKey = `${config.scale}x` as '2x' | '4x' | '8x';
  const scaleMultiplier = creditCosts.scaleMultipliers[scaleKey] ?? 1.0;

  // Apply scale multiplier and bounds
  let creditCost = Math.ceil(baseCost * scaleMultiplier);
  creditCost = Math.max(creditCost, creditCosts.minimumCost);
  creditCost = Math.min(creditCost, creditCosts.maximumCost);

  return creditCost;
}

/**
 * Service responsible for handling image generation with proper credit management.
 *
 * This service encapsulates the transaction lifecycle:
 * 1. Deduct credits before processing
 * 2. Generate image using AI
 * 3. Refund credits on failure
 *
 * Implements IImageProcessor interface for provider abstraction.
 */
export class ImageGenerationService implements IImageProcessor {
  public readonly providerName = 'Gemini';
  private genAI: GoogleGenAI;

  constructor() {
    const apiKey = serverEnv.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.genAI = new GoogleGenAI({ apiKey });
  }

  /**
   * Check if Gemini supports the given processing mode
   *
   * Gemini excels at creative enhancement and custom prompts.
   * It can handle all modes but is most cost-effective for enhance/custom.
   */
  supportsMode(mode: string): boolean {
    // Gemini supports all modes as fallback, but prefers enhance/custom
    return ['upscale', 'enhance', 'both', 'custom'].includes(mode);
  }

  /**
   * Process an image upscale request with proper credit management
   *
   * @param userId - The authenticated user's ID
   * @param input - The validated upscale input
   * @param options - Optional processing options (e.g., pre-calculated credit cost)
   * @returns The generated image data and remaining credits
   * @throws InsufficientCreditsError if user has no credits
   * @throws AIGenerationError if AI generation fails
   */
  async processImage(
    userId: string,
    input: IUpscaleInput,
    options?: IProcessImageOptions
  ): Promise<IImageProcessorResult> {
    const jobId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    // Use pre-calculated credit cost if provided, otherwise calculate locally
    const creditCost = options?.creditCost ?? calculateCreditCost(input.config);

    // Step 1: Deduct credits atomically using FIFO (subscription first, then purchased)
    const { data: balanceResult, error: creditError } = await supabaseAdmin.rpc(
      'consume_credits_v2',
      {
        target_user_id: userId,
        amount: creditCost,
        ref_id: jobId,
        description: `Image processing (${input.config.qualityTier} tier, ${creditCost} credits)`,
      }
    );

    if (creditError) {
      // Check if it's an insufficient credits error
      if (creditError.message?.includes('Insufficient credits')) {
        throw new InsufficientCreditsError(creditError.message);
      }
      throw new Error(`Failed to deduct credits: ${creditError.message}`);
    }

    // Extract total balance from result (returns array with single row)
    const newBalance = balanceResult?.[0]?.new_total_balance ?? 0;

    try {
      // Step 2: Generate the image
      const result = await this.callGemini(input);

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
   * Refund credits for a failed generation
   *
   * @param userId - The user to refund credits to
   * @param jobId - The job ID for tracking
   * @param amount - The number of credits to refund
   */
  private async refundCredits(userId: string, jobId: string, amount: number): Promise<void> {
    const { error } = await supabaseAdmin.rpc('refund_credits', {
      target_user_id: userId,
      amount,
      job_id: jobId,
    });

    if (error) {
      // Log the error but don't throw - we don't want to mask the original error
      console.error('Failed to refund credits:', error);
    }
  }

  /**
   * Call the Gemini AI to generate/upscale the image
   */
  private async callGemini(input: IUpscaleInput): Promise<{ imageData: string; mimeType: string }> {
    const prompt = this.generatePrompt(input.config);

    // Strip data URL prefix if present to get raw base64
    let imageData = input.imageData;
    if (imageData.startsWith('data:')) {
      imageData = imageData.split(',')[1];
    }

    const response = await this.genAI.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: input.mimeType || 'image/jpeg',
                data: imageData,
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        temperature: 0.4,
      },
    });

    // Handle stop reasons
    const finishReason = response.candidates?.[0]?.finishReason;

    if (finishReason && finishReason !== 'STOP') {
      throw new AIGenerationError(getFinishReasonMessage(finishReason), finishReason);
    }

    // Extract image from response
    const parts = response.candidates?.[0]?.content?.parts;

    if (!parts || parts.length === 0) {
      throw new AIGenerationError('No content generated by the model.');
    }

    return extractImageDataFromParts(parts);
  }

  /**
   * Generate the prompt based on configuration
   */
  private generatePrompt(config: IUpscaleConfig): string {
    // Use custom instructions if provided
    if (
      config.additionalOptions.customInstructions &&
      config.additionalOptions.customInstructions.trim().length > 0
    ) {
      return config.additionalOptions.customInstructions;
    }

    // Build prompt using new quality tier system
    let prompt =
      'Task: Generate a high-definition version of the provided image with significantly improved quality. ';
    prompt += `Action: ${buildQualityPromptSegment(config.qualityTier, config.scale, config.additionalOptions.enhance)}`;
    prompt += buildConstraintSegments(config);
    prompt += 'Output: Return ONLY the generated image.';

    return prompt;
  }
}

// Export a singleton instance for convenience
export const imageGenerationService = new ImageGenerationService();
