import {
  MODEL_MAX_INPUT_PIXELS,
  SCALE_PRESERVING_FALLBACK_MAX_SIDE,
} from '@shared/config/model-costs.config';
import type { ModelId } from '@shared/types/coreflow.types';

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
    width <= SCALE_PRESERVING_FALLBACK_MAX_SIDE &&
    height <= SCALE_PRESERVING_FALLBACK_MAX_SIDE &&
    pixels > MODEL_MAX_INPUT_PIXELS['real-esrgan'] &&
    pixels <= MODEL_MAX_INPUT_PIXELS['clarity-upscaler']
  ) {
    return { modelId: 'clarity-upscaler', usedFallback: true };
  }

  return { modelId, usedFallback: false };
}
