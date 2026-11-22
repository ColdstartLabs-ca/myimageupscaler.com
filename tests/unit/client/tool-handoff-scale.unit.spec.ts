import { describe, expect, test } from 'vitest';
import { withToolHandoffScale } from '@client/utils/tool-image-handoff';
import { QUALITY_TIER_SCALES, type IUpscaleConfig } from '@/shared/types/coreflow.types';

const base: IUpscaleConfig = {
  qualityTier: 'quick',
  scale: 2,
  additionalOptions: {
    smartAnalysis: false,
    enhance: true,
    enhanceFaces: false,
    preserveText: false,
  },
} as IUpscaleConfig;

describe('tool handoff scale', () => {
  test('the "Upscale This Image 4x" handoff opens the workspace at 4x on the free quick tier', () => {
    expect(QUALITY_TIER_SCALES.quick).toContain(4);
    expect(withToolHandoffScale(base).scale).toBe(4);
  });

  test('keeps the current scale when the tier does not offer 4x', () => {
    const tierWithout4x = (
      Object.keys(QUALITY_TIER_SCALES) as IUpscaleConfig['qualityTier'][]
    ).find(tier => !QUALITY_TIER_SCALES[tier].includes(4));
    if (!tierWithout4x) return;
    const config = { ...base, qualityTier: tierWithout4x };
    expect(withToolHandoffScale(config)).toBe(config);
  });

  test('does not touch the other settings', () => {
    expect(withToolHandoffScale(base).additionalOptions).toBe(base.additionalOptions);
  });
});
