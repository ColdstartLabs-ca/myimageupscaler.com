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

export interface IScalePreservingRecoveryEligibilityInput {
  modelId: string;
  width?: number;
  height?: number;
  scale: number;
  qualityTier?: string;
  enhanceFaces?: boolean;
}

/**
 * Cost-first processing targets for an oversized Quick 2x request.
 */
export const SCALE_PRESERVING_FALLBACK_CANDIDATES: ModelId[] = ['real-esrgan-large'];

/**
 * Return the cost-first candidates for an oversized Quick request.
 *
 * The fallback remains an internal Quick implementation detail for every
 * account type. Paid face enhancement is selected explicitly and never
 * becomes an implicit recovery path for ordinary Quick.
 */
export function getScalePreservingFallbackCandidates(_isPaidUser: boolean): ModelId[] {
  return [...SCALE_PRESERVING_FALLBACK_CANDIDATES];
}

/**
 * Return whether a failed Quick request may make the single cjwbw recovery
 * attempt. Recovery is intentionally narrower than direct size routing: it
 * requires trusted dimensions, the verified 2x envelope, and faces disabled.
 * An omitted quality tier is accepted for legacy callers whose real-esrgan
 * service instance is the Quick processor.
 */
export function isScalePreservingRecoveryEligible({
  modelId,
  width,
  height,
  scale,
  qualityTier,
  enhanceFaces,
}: IScalePreservingRecoveryEligibilityInput): boolean {
  const hasKnownDimensions =
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    (width as number) > 0 &&
    (height as number) > 0;

  return (
    modelId === 'real-esrgan' &&
    (qualityTier === undefined || qualityTier === 'quick') &&
    enhanceFaces !== true &&
    scale === 2 &&
    hasKnownDimensions &&
    (width as number) <= SCALE_PRESERVING_FALLBACK_MAX_SIDE &&
    (height as number) <= SCALE_PRESERVING_FALLBACK_MAX_SIDE &&
    (width as number) * (height as number) <= MODEL_MAX_INPUT_PIXELS['real-esrgan-large']
  );
}

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
