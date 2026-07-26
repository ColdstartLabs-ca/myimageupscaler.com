import { buildPrompt } from '../../utils/prompt.builder';
import type { IModelInputContext } from '../model-input.types';
import type { INanoBanana2Input } from '../model-input.types';
import { BaseModelInputBuilder } from './base-model.builder';
import { resolveEffectiveResolution } from '@shared/config/subscription.utils';

/**
 * Nano Banana 2 Model Input Builder
 *
 * Fast image generation and editing model with conversational editing,
 * multi-image fusion, and character consistency.
 * Supports resolutions: 1K, 2K, 4K
 */
export class NanoBanana2Builder extends BaseModelInputBuilder<INanoBanana2Input> {
  readonly modelId = 'nano-banana-2';

  build(context: IModelInputContext): INanoBanana2Input {
    const { imageDataUrl, scale, nanoBananaProConfig } = context;

    // Build prompt using centralized prompt builder
    const prompt = buildPrompt(this.modelId, context);

    // Use config resolution if provided, otherwise map from scale
    const resolution = resolveEffectiveResolution(
      this.modelId,
      scale,
      nanoBananaProConfig?.resolution
    );

    if (!resolution) {
      throw new Error(`Unable to resolve output resolution for ${this.modelId}`);
    }

    return {
      prompt,
      image_input: [imageDataUrl],
      aspect_ratio: nanoBananaProConfig?.aspectRatio || 'match_input_image',
      resolution: resolution as INanoBanana2Input['resolution'],
      output_format: nanoBananaProConfig?.outputFormat || 'png',
    };
  }
}
