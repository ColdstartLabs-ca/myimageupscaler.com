import { BaseModelInputBuilder } from './base-model.builder';
import type { IModelInputContext } from '../model-input.types';
import type { IRecraftCrispUpscaleInput } from '../model-input.types';

/**
 * Builder for Recraft Crisp Upscale model
 *
 * Replicate model: recraft-ai/recraft-crisp-upscale
 * Inputs:
 * - image: Base64 encoded image (only input)
 */
export class RecraftCrispUpscaleBuilder extends BaseModelInputBuilder<IRecraftCrispUpscaleInput> {
  readonly modelId = 'recraft-crisp-upscale';

  build(context: IModelInputContext): IRecraftCrispUpscaleInput {
    const { imageDataUrl } = context;

    return {
      image: imageDataUrl,
    };
  }
}
