import { describe, expect, it } from 'vitest';
import {
  calculateFinalProviderAwareCredits,
  PROVIDER_COST_CREDIT_VALUE_USD,
  resolveEffectiveResolution,
} from '@shared/config/subscription.utils';
import { MODEL_RESOLUTION_PROVIDER_COSTS } from '@shared/config/model-costs.config';

describe('per-resolution provider-aware credits', () => {
  const calculate = (
    modelId: 'nano-banana-pro' | 'nano-banana-2',
    qualityTier: 'ultra' | 'nano-banana-2',
    scale: 2 | 4 | 8,
    effectiveResolution?: string
  ) =>
    calculateFinalProviderAwareCredits({
      modelId,
      qualityTier,
      scale,
      effectiveResolution,
    });

  it('should charge 13 credits when ultra runs at 2K', () => {
    expect(calculate('nano-banana-pro', 'ultra', 2).finalCredits).toBe(13);
  });

  it('should charge 25 credits when ultra runs at 4K', () => {
    expect(calculate('nano-banana-pro', 'ultra', 4).finalCredits).toBe(25);
  });

  it('should charge 25 credits when scale is 2 but resolution override is 4K', () => {
    const effectiveResolution = resolveEffectiveResolution('nano-banana-pro', 2, '4K');

    expect(effectiveResolution).toBe('4K');
    expect(calculate('nano-banana-pro', 'ultra', 2, effectiveResolution).finalCredits).toBe(25);
  });

  it('should charge 25 credits when scale is 8', () => {
    expect(resolveEffectiveResolution('nano-banana-pro', 8)).toBe('4K');
    expect(calculate('nano-banana-pro', 'ultra', 8).finalCredits).toBe(25);
  });

  it('should charge 9 credits when nano-banana-2 runs at 2K', () => {
    expect(calculate('nano-banana-2', 'nano-banana-2', 2).finalCredits).toBe(9);
  });

  it('should charge 6 credits when nano-banana-2 runs at 1K', () => {
    expect(calculate('nano-banana-2', 'nano-banana-2', 2, '1K').finalCredits).toBe(6);
  });

  it('should charge 13 credits when nano-banana-2 runs at 4K', () => {
    expect(calculate('nano-banana-2', 'nano-banana-2', 4).finalCredits).toBe(13);
  });

  it('should charge 13 credits when nano-banana-2 scale is 2 but resolution override is 4K', () => {
    const effectiveResolution = resolveEffectiveResolution('nano-banana-2', 2, '4K');

    expect(effectiveResolution).toBe('4K');
    expect(calculate('nano-banana-2', 'nano-banana-2', 2, effectiveResolution).finalCredits).toBe(
      13
    );
  });

  it('should hold margin above 55% at every configured resolution', () => {
    for (const [modelId, resolutionCosts] of Object.entries(MODEL_RESOLUTION_PROVIDER_COSTS)) {
      const qualityTier = modelId === 'nano-banana-pro' ? 'ultra' : 'nano-banana-2';

      for (const [resolution, providerCost] of Object.entries(resolutionCosts)) {
        const credits = calculate(
          modelId as 'nano-banana-pro' | 'nano-banana-2',
          qualityTier,
          2,
          resolution
        ).finalCredits;
        const revenue = credits * 0.0298;
        const margin = (revenue - providerCost) / revenue;

        expect(margin, `${modelId} ${resolution}`).toBeGreaterThan(0.55);
      }
    }
  });

  it('should use the configured provider cost in its pricing result', () => {
    const result = calculate('nano-banana-pro', 'ultra', 4);

    expect(result.providerCostUsd).toBe(0.3);
    expect(result.pricingModel).toBe('per-resolution');
    expect(result.finalCredits * PROVIDER_COST_CREDIT_VALUE_USD).toBeGreaterThan(
      result.providerCostUsd
    );
  });

  it('should throw when resolution is absent from the provider cost table', () => {
    expect(() => calculate('nano-banana-pro', 'ultra', 2, '8K')).toThrow(/Unsupported resolution/);
  });

  it('should return undefined for models without resolution pricing', () => {
    expect(resolveEffectiveResolution('real-esrgan', 2, '4K')).toBeUndefined();
  });
});
