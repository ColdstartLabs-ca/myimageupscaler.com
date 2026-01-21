import { buildPrompt } from '../../utils/prompt.builder';
import type { IModelInputContext } from '../model-input.types';
import type { ISeedreamInput } from '../model-input.types';
import { BaseModelInputBuilder } from './base-model.builder';

/**
 * Seedream size constraints
 * - 2K preset: 2048px max dimension
 * - 4K preset: 4096px max dimension
 * - Custom: 1024-4096px for width/height
 */
const SIZE_CONSTRAINTS = {
  '2K': 2048,
  '4K': 4096,
  MIN_CUSTOM: 1024,
  MAX_CUSTOM: 4096,
} as const;

/**
 * Calculate the appropriate size preset or custom dimensions
 * based on original image dimensions and requested scale
 */
function calculateOutputSize(
  originalWidth: number | undefined,
  originalHeight: number | undefined,
  scale: number
): { size: '2K' | '4K' | 'custom'; width?: number; height?: number } {
  // If we don't have original dimensions, use match_input_image with 2K preset
  if (!originalWidth || !originalHeight) {
    return { size: '2K' };
  }

  // Calculate target dimensions based on scale
  const targetWidth = originalWidth * scale;
  const targetHeight = originalHeight * scale;
  const maxDimension = Math.max(targetWidth, targetHeight);

  // Choose size preset based on target dimensions
  if (maxDimension <= SIZE_CONSTRAINTS['2K']) {
    return { size: '2K' };
  }

  if (maxDimension <= SIZE_CONSTRAINTS['4K']) {
    return { size: '4K' };
  }

  // For very large targets, use custom with clamped dimensions
  // Maintain aspect ratio while clamping to max allowed size
  const aspectRatio = originalWidth / originalHeight;
  let finalWidth: number;
  let finalHeight: number;

  if (aspectRatio >= 1) {
    // Landscape or square
    finalWidth = Math.min(targetWidth, SIZE_CONSTRAINTS.MAX_CUSTOM);
    finalHeight = Math.round(finalWidth / aspectRatio);
  } else {
    // Portrait
    finalHeight = Math.min(targetHeight, SIZE_CONSTRAINTS.MAX_CUSTOM);
    finalWidth = Math.round(finalHeight * aspectRatio);
  }

  // Ensure minimum constraints
  finalWidth = Math.max(finalWidth, SIZE_CONSTRAINTS.MIN_CUSTOM);
  finalHeight = Math.max(finalHeight, SIZE_CONSTRAINTS.MIN_CUSTOM);

  return {
    size: 'custom',
    width: finalWidth,
    height: finalHeight,
  };
}

/**
 * Seedream Model Input Builder
 *
 * Advanced image editing with strong spatial understanding
 * Uses 'image_input' array parameter (enhancement only)
 *
 * Key features:
 * - Uses 'match_input_image' aspect ratio to preserve original proportions
 * - Selects appropriate size preset (2K/4K) based on scale and original dimensions
 * - Falls back to custom dimensions for non-standard sizes
 */
export class SeedreamBuilder extends BaseModelInputBuilder<ISeedreamInput> {
  readonly modelId = 'seedream';

  build(context: IModelInputContext): ISeedreamInput {
    const { imageDataUrl, originalWidth, originalHeight, scale } = context;

    // Build prompt using centralized prompt builder
    const prompt = buildPrompt(this.modelId, context);

    // Calculate appropriate output size based on original dimensions and scale
    const { size, width, height } = calculateOutputSize(originalWidth, originalHeight, scale);

    const input: ISeedreamInput = {
      prompt,
      image_input: [imageDataUrl],
      size,
      // Use match_input_image to preserve original aspect ratio
      aspect_ratio: 'match_input_image',
    };

    // Add custom dimensions if using custom size
    if (size === 'custom' && width && height) {
      input.width = width;
      input.height = height;
    }

    return input;
  }
}
