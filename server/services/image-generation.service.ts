import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { GoogleGenAI } from '@google/genai';
import { serverEnv } from '@shared/config/env';
import type { IUpscaleInput, IUpscaleConfig } from '@shared/validation/upscale.schema';
import { calculateCreditCost as configCalculateCreditCost } from '@shared/config/subscription.utils';
import type { IImageProcessor, IImageProcessorResult } from './image-processor.interface';
import { ModelRegistry } from './model-registry';

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
 * Builds the mode-specific prompt segment
 */
function buildModePromptSegment(mode: string, scale: number): string {
  switch (mode) {
    case 'upscale':
      return `Reconstruct the image at ${scale}x resolution (target 2K/4K). Aggressively sharpen edges and hallucinate plausible fine details to remove blur. `;
    case 'enhance':
      return 'Refine the image clarity. Remove all JPEG compression artifacts, grain, and sensor noise. Balance the lighting and color saturation for a professional look. ';
    case 'both':
    default:
      return `Reconstruct the image at ${scale}x resolution. Simultaneously remove noise/artifacts and sharpen fine details. The output must be crisp and photorealistic. `;
  }
}

/**
 * Builds constraint segments for the prompt
 */
function buildConstraintSegments(config: IUpscaleConfig): string {
  let constraints = '';

  if (config.enhanceFace) {
    constraints +=
      "Constraint: Enhance facial features naturally (eyes, skin texture) without altering the person's identity. ";
  }

  if (config.denoise) {
    constraints += 'Constraint: Apply strong denoising to smooth out flat areas. ';
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
 * Uses ModelRegistry as the single source of truth for credit calculations.
 *
 * @param config - The upscale configuration
 * @returns The number of credits required
 */
export function calculateCreditCost(config: IUpscaleConfig): number {
  // If auto mode selected, use the original calculation method as fallback
  if (config.selectedModel === 'auto') {
    return configCalculateCreditCost({
      mode: config.mode,
      scale: config.scale,
    });
  }

  // Use ModelRegistry as the single source of truth for credit calculations
  // This ensures consistency between estimation and actual deduction
  const modelRegistry = ModelRegistry.getInstance();
  return modelRegistry.calculateCreditCostWithMode(config.selectedModel, config.scale, config.mode);
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
   * @returns The generated image data and remaining credits
   * @throws InsufficientCreditsError if user has no credits
   * @throws AIGenerationError if AI generation fails
   */
  async processImage(userId: string, input: IUpscaleInput): Promise<IImageProcessorResult> {
    const jobId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const creditCost = calculateCreditCost(input.config);

    // Step 1: Deduct credits atomically using FIFO (subscription first, then purchased)
    const { data: balanceResult, error: creditError } = await supabaseAdmin.rpc(
      'consume_credits_v2',
      {
        target_user_id: userId,
        amount: creditCost,
        ref_id: jobId,
        description: `Image ${input.config.mode} (${creditCost} credits)`,
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
    // Use custom prompt if in custom mode and a prompt is provided
    if (config.mode === 'custom' && config.customPrompt && config.customPrompt.trim().length > 0) {
      return config.customPrompt;
    }

    // Fallback to 'both' logic if in custom mode but empty prompt, or normal mode logic
    const effectiveMode = config.mode === 'custom' ? 'both' : config.mode;

    // Build prompt using extracted functions
    let prompt =
      'Task: Generate a high-definition version of the provided image with significantly improved quality. ';
    prompt += `Action: ${buildModePromptSegment(effectiveMode, config.scale)}`;
    prompt += buildConstraintSegments(config);
    prompt += 'Output: Return ONLY the generated image.';

    return prompt;
  }
}

// Export a singleton instance for convenience
export const imageGenerationService = new ImageGenerationService();
