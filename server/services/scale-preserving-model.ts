import { MODEL_MAX_INPUT_PIXELS } from '@shared/config/model-costs.config';
import type { ModelId } from '@shared/types/coreflow.types';

const MAX_VERIFIED_FALLBACK_SIDE = 2048;

interface IScalePreservingModelInput {
  modelId: ModelId;
  width: number;
  height: number;
  scale: number;
}

interface IScalePreservingModelResult {
  modelId: ModelId;
  usedFallback: boolean;
}

/**
 * Real-ESRGAN rejects inputs above its GPU pixel limit. For Quick 2x requests,
 * use the tiled Clarity model when it can preserve the original dimensions.
 * Other scales remain on the requested model so normal validation rejects them
 * rather than silently shrinking the source or using an unproven slow path.
 */
export function resolveScalePreservingModel({
  modelId,
  width,
  height,
  scale,
}: IScalePreservingModelInput): IScalePreservingModelResult {
  const pixels = width * height;

  if (
    modelId === 'real-esrgan' &&
    scale === 2 &&
    width <= MAX_VERIFIED_FALLBACK_SIDE &&
    height <= MAX_VERIFIED_FALLBACK_SIDE &&
    pixels > MODEL_MAX_INPUT_PIXELS['real-esrgan'] &&
    pixels <= MODEL_MAX_INPUT_PIXELS['clarity-upscaler']
  ) {
    return { modelId: 'clarity-upscaler', usedFallback: true };
  }

  return { modelId, usedFallback: false };
}
