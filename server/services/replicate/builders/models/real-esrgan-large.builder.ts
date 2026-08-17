import type { IModelInputContext } from '../model-input.types';
import type { IRealEsrganLargeInput } from '../model-input.types';
import { BaseModelInputBuilder } from './base-model.builder';

/**
 * Real-ESRGAN Large Model Input Builder
 *
 * Internal fallback for Quick requests whose original dimensions exceed the
 * default build's pixel guard. Exposes only `upscale` - this build has no
 * face_enhance option.
 */
export class RealEsrganLargeBuilder extends BaseModelInputBuilder<IRealEsrganLargeInput> {
  readonly modelId = 'real-esrgan-large';

  build(context: IModelInputContext): IRealEsrganLargeInput {
    const { imageDataUrl, scale } = context;

    return {
      image: imageDataUrl,
      upscale: this.getBinaryScale(scale),
    };
  }
}
