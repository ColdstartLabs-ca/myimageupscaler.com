import { buildPrompt } from '../../utils/prompt.builder';
import type { IModelInputContext } from '../model-input.types';
import type { IFluxKontextFastInput } from '../model-input.types';
import { BaseModelInputBuilder } from './base-model.builder';

/**
 * Flux-Kontext-Fast Model Input Builder
 *
 * Ultra fast flux kontext endpoint for image editing
 * Free tier model for creative edits and enhancements
 * Enhancement-only (no upscaling support)
 */
export class FluxKontextFastBuilder extends BaseModelInputBuilder<IFluxKontextFastInput> {
  readonly modelId = 'flux-kontext-fast';

  build(context: IModelInputContext): IFluxKontextFastInput {
    const { imageDataUrl } = context;

    // Build prompt using centralized prompt builder
    const prompt = buildPrompt(this.modelId, context);

    return {
      prompt,
      img_cond_path: imageDataUrl,
      guidance: 3.5,
      speed_mode: 'Extra Juiced 🔥 (more speed)',
      image_size: 1024,
      aspect_ratio: 'match_input_image',
      output_format: 'jpg',
      output_quality: 80,
      num_inference_steps: 30,
    };
  }
}
