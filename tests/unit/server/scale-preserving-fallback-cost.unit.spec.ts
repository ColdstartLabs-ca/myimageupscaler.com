import { describe, expect, it } from 'vitest';
import { resolveScalePreservingModel } from '@server/services/scale-preserving-model';
import { ModelRegistry } from '@server/services/model-registry';
import { MODEL_COSTS, MODEL_MAX_INPUT_PIXELS } from '@shared/config/model-costs.config';

/**
 * Cost regression guard for the oversized Quick 2x fallback.
 *
 * Quick 2x requests above the default model's pixel guard are rerouted
 * internally while the user is still billed the Quick tier price, so the
 * fallback target must stay in Quick's cost class. Routing them to the
 * diffusion upscaler cost ~14x a Quick run.
 */
describe('scale-preserving fallback cost', () => {
  const registry = ModelRegistry.getInstance();

  const fallback = resolveScalePreservingModel({
    modelId: 'real-esrgan',
    width: 1800,
    height: 1800,
    scale: 2,
  });

  it('routes the oversized Quick 2x request to a fallback model', () => {
    expect(fallback.usedFallback).toBe(true);
  });

  it('never routes the internal fallback to the diffusion upscalers', () => {
    expect(fallback.modelId).not.toBe('clarity-upscaler');
    expect(fallback.modelId).not.toBe('clarity-pro-upscaler');
  });

  it('keeps the fallback provider cost within 3x of a normal Quick run', () => {
    const quickCost = MODEL_COSTS.REAL_ESRGAN_COST;
    const fallbackCost = registry.getModel(fallback.modelId)?.costPerRun ?? Number.MAX_SAFE_INTEGER;

    expect(fallbackCost).toBeLessThanOrEqual(quickCost * 3);
    expect(fallbackCost).toBeLessThan(MODEL_COSTS.CLARITY_UPSCALER_COST / 3);
  });

  it('covers the whole fallback band up to 2048x2048', () => {
    expect(MODEL_MAX_INPUT_PIXELS[fallback.modelId]).toBeGreaterThanOrEqual(2048 * 2048);
  });

  it('is enabled and reachable regardless of the premium model flag', () => {
    expect(registry.getModel(fallback.modelId)?.isEnabled).toBe(true);
  });

  it('never offers the internal fallback as a user-selectable model', () => {
    const enabledIds = registry.getEnabledModels().map(model => model.id);
    const businessIds = registry.getModelsByTier('business').map(model => model.id);

    expect(enabledIds).not.toContain(fallback.modelId);
    expect(businessIds).not.toContain(fallback.modelId);
  });
});
