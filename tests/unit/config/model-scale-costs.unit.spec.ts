import { describe, expect, it } from 'vitest';
import { MODEL_SCALE_CREDIT_MULTIPLIERS } from '@shared/config/model-costs.config';
import {
  getScaleCreditMultiplier,
  getCreditsForTierAtScale,
  getCreditRangeForTier,
} from '@shared/config/subscription.utils';

describe('MODEL_SCALE_CREDIT_MULTIPLIERS', () => {
  it('should define clarity-upscaler with 2x and 4x multipliers', () => {
    expect(MODEL_SCALE_CREDIT_MULTIPLIERS['clarity-upscaler']).toEqual({
      2: 1.0,
      4: 2.0,
    });
  });

  it('should not define multipliers for per-image-billed models', () => {
    expect(MODEL_SCALE_CREDIT_MULTIPLIERS['real-esrgan']).toBeUndefined();
    expect(MODEL_SCALE_CREDIT_MULTIPLIERS['gfpgan']).toBeUndefined();
    expect(MODEL_SCALE_CREDIT_MULTIPLIERS['nano-banana-pro']).toBeUndefined();
  });
});

describe('getScaleCreditMultiplier', () => {
  it('should return 1.0 for clarity-upscaler at 2x', () => {
    expect(getScaleCreditMultiplier('clarity-upscaler', 2)).toBe(1.0);
  });

  it('should return 2.0 for clarity-upscaler at 4x', () => {
    expect(getScaleCreditMultiplier('clarity-upscaler', 4)).toBe(2.0);
  });

  it('should return 1.0 for models without scale multipliers', () => {
    expect(getScaleCreditMultiplier('real-esrgan', 2)).toBe(1.0);
    expect(getScaleCreditMultiplier('real-esrgan', 4)).toBe(1.0);
    expect(getScaleCreditMultiplier('gfpgan', 4)).toBe(1.0);
    expect(getScaleCreditMultiplier('nano-banana-pro', 4)).toBe(1.0);
  });

  it('should return 1.0 for unknown models', () => {
    expect(getScaleCreditMultiplier('nonexistent-model', 4)).toBe(1.0);
  });

  it('should return 1.0 for unsupported scale factors', () => {
    expect(getScaleCreditMultiplier('clarity-upscaler', 8)).toBe(1.0);
  });
});

describe('getCreditsForTierAtScale', () => {
  it('should return 4 credits for hd-upscale at 2x', () => {
    expect(getCreditsForTierAtScale('hd-upscale', 2)).toBe(4);
  });

  it('should return 8 credits for hd-upscale at 4x', () => {
    expect(getCreditsForTierAtScale('hd-upscale', 4)).toBe(8);
  });

  it('should return 1 credit for quick at any scale', () => {
    expect(getCreditsForTierAtScale('quick', 2)).toBe(1);
    expect(getCreditsForTierAtScale('quick', 4)).toBe(1);
  });

  it('should return flat cost for face-restore at any scale', () => {
    expect(getCreditsForTierAtScale('face-restore', 2)).toBe(2);
    expect(getCreditsForTierAtScale('face-restore', 4)).toBe(2);
  });

  it('should return flat cost for ultra at any scale', () => {
    expect(getCreditsForTierAtScale('ultra', 2)).toBe(8);
    expect(getCreditsForTierAtScale('ultra', 4)).toBe(8);
  });

  it('should return base cost for auto tier', () => {
    // Auto tier has 'variable' credits, returns 0 base
    expect(getCreditsForTierAtScale('auto', 2)).toBe(0);
  });

  it('should return flat cost for enhancement-only tiers', () => {
    // face-pro uses flux-2-pro (no scale support, no multiplier)
    expect(getCreditsForTierAtScale('face-pro', 2)).toBe(6);
    expect(getCreditsForTierAtScale('face-pro', 4)).toBe(6);
  });
});

describe('getCreditRangeForTier', () => {
  it('should return a range for hd-upscale (clarity-upscaler with scale multipliers)', () => {
    const range = getCreditRangeForTier('hd-upscale');
    expect(range).toEqual({ min: 4, max: 8 });
  });

  it('should return flat number for quick (no scale multipliers)', () => {
    expect(getCreditRangeForTier('quick')).toBe(1);
  });

  it('should return flat number for face-restore', () => {
    expect(getCreditRangeForTier('face-restore')).toBe(2);
  });

  it('should return flat number for ultra', () => {
    expect(getCreditRangeForTier('ultra')).toBe(8);
  });

  it('should return flat number for enhancement-only tiers', () => {
    expect(getCreditRangeForTier('face-pro')).toBe(6);
    expect(getCreditRangeForTier('budget-edit')).toBe(3);
  });

  it('should return base cost for auto tier', () => {
    expect(getCreditRangeForTier('auto')).toBe(0);
  });
});
