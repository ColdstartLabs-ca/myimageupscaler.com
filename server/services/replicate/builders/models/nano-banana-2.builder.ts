import { buildPrompt } from '../../utils/prompt.builder';
import type { IModelInputContext } from '../model-input.types';
import type { INanoBanana2Input } from '../model-input.types';
import { BaseModelInputBuilder } from './base-model.builder';

/**
 * Map scale to resolution for Nano Banana 2
 */
const SCALE_TO_RESOLUTION: Record<number, '0.5K' | '1K' | '2K' | '4K'> = {
  2: '2K',
  4: '4K',
  8: '4K', // Max supported is 4K
};

/**
 * Nano Banana 2 Model Input Builder
 *
 * Fast image generation and editing model with conversational editing,
 * multi-image fusion, and character consistency.
 * Supports resolutions: 0.5K, 1K, 2K, 4K
 */
export class NanoBanana2Builder extends BaseModelInputBuilder<INanoBanana2Input> {
  readonly modelId = 'nano-banana-2';

  build(context: IModelInputContext): INanoBanana2Input {
    const { imageDataUrl, scale, nanoBananaProConfig } = context;

    // Build prompt using centralized prompt builder
    const prompt = buildPrompt(this.modelId, context);

    // Use config resolution if provided, otherwise map from scale
    const resolution = nanoBananaProConfig?.resolution || SCALE_TO_RESOLUTION[scale] || '2K';

    return {
      prompt,
      image_input: [imageDataUrl],
      aspect_ratio: nanoBananaProConfig?.aspectRatio || 'match_input_image',
      resolution,
      output_format: nanoBananaProConfig?.outputFormat || 'png',
    };
  }
}
