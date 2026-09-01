import { buildPrompt } from '../../utils/prompt.builder';
import type { IModelInputContext, INanoBananaInput } from '../model-input.types';
import { BaseModelInputBuilder } from './base-model.builder';

/**
 * Nano Banana Model Input Builder
 *
 * Text Preserve uses the Replicate google/nano-banana schema. The provider
 * accepts an HTTPS image reference and returns an output URI.
 */
export class NanoBananaBuilder extends BaseModelInputBuilder<INanoBananaInput> {
  readonly modelId = 'nano-banana';

  build(context: IModelInputContext): INanoBananaInput {
    return {
      prompt: buildPrompt(this.modelId, context),
      image_input: [context.imageDataUrl],
      aspect_ratio: 'match_input_image',
      output_format: 'png',
    };
  }
}
