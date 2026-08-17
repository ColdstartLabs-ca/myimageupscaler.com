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
 * Ordered processing targets for an oversized Quick 2x request. The caller
 * uses the first enabled entry. Clarity is the last resort only: it costs
 * roughly 14x a Quick run while the user is still billed the Quick price.
 */
export const SCALE_PRESERVING_FALLBACK_CANDIDATES: ModelId[] = [
  'real-esrgan-large',
  'clarity-upscaler',
];

/**
 * The default Real-ESRGAN build rejects inputs above its hard pixel guard.
 * For Quick 2x requests, use the unguarded Real-ESRGAN build, which tiles
 * internally and preserves the original dimensions at Quick-tier cost.
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
    pixels <= MODEL_MAX_INPUT_PIXELS['real-esrgan-large']
  ) {
    return { modelId: SCALE_PRESERVING_FALLBACK_CANDIDATES[0], usedFallback: true };
  }

  return { modelId, usedFallback: false };
}
