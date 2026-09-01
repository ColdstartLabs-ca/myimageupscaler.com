import type { IModelConfig } from './model-registry.types';

export type AutoScale = 2 | 4 | 8;

/**
 * Enhancement-only providers use the neutral 2x request value. They cannot
 * claim 4x/8x output without a provider scale control or a verified dimension
 * contract.
 */
export function isAutoModelCompatible(
  model: Pick<IModelConfig, 'supportedScales'>,
  scale: AutoScale
): boolean {
  return model.supportedScales.length === 0
    ? scale === 2
    : model.supportedScales.includes(scale);
}

/**
 * Keep Auto model eligibility identical wherever a recommendation is resolved.
 * High-cost models are explicit-tier choices, not Auto fallbacks.
 */
export function getAutoEligibleModels<T extends Pick<IModelConfig, 'creditMultiplier' | 'supportedScales'>>(
  models: readonly T[],
  scale: AutoScale
): T[] {
  return models.filter(
    model => model.creditMultiplier < 8 && isAutoModelCompatible(model, scale)
  );
}

/**
 * Resolve an analyzer recommendation to a model that the route can actually
 * execute, falling back to the first eligible model when needed.
 */
export function resolveAutoModel<T extends Pick<IModelConfig, 'id' | 'creditMultiplier' | 'supportedScales'>>(
  models: readonly T[],
  scale: AutoScale,
  recommendedModelId?: string
): T | null {
  const eligibleModels = getAutoEligibleModels(models, scale);
  return (
    eligibleModels.find(model => model.id === recommendedModelId) ?? eligibleModels[0] ?? null
  );
}
