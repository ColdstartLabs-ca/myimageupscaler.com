import { BaseModelInputBuilder } from './base-model.builder';
import type { IModelInputContext } from '../model-input.types';
import type { IClarityProUpscalerInput } from '../model-input.types';

/**
 * Builder for Clarity Pro Upscaler model
 *
 * Replicate model: philz1337x/clarity-pro-upscaler
 * Inputs:
 * - image: Base64 encoded image
 * - scale_factor: 2, 4, 8 (or 16 — deferred)
 * - creativity: -10..10 (default 0 for predictable identity preservation)
 * - output_format: 'png' | 'jpg'
 */
export class ClarityProUpscalerBuilder extends BaseModelInputBuilder<IClarityProUpscalerInput> {
  readonly modelId = 'clarity-pro-upscaler';

  build(context: IModelInputContext): IClarityProUpscalerInput {
    const { imageDataUrl, scale } = context;

    return {
      image: imageDataUrl,
      scale_factor: scale,
      creativity: 0,
      output_format: 'png',
    };
  }
}
