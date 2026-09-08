import type { IModelInputContext } from '../model-input.types';
import type { IRealEsrganInput } from '../model-input.types';
import { BaseModelInputBuilder } from './base-model.builder';

/**
 * Real-ESRGAN Model Input Builder
 *
 * Default upscale model (fast, reliable)
 * Only supports scale 2 or 4
 */
export class RealEsrganBuilder extends BaseModelInputBuilder<IRealEsrganInput> {
  readonly modelId = 'real-esrgan';

  build(context: IModelInputContext): IRealEsrganInput {
    const { imageDataUrl, scale } = context;

    return {
      image: imageDataUrl,
      scale: this.getBinaryScale(scale),
      face_enhance: false,
    };
  }
}
