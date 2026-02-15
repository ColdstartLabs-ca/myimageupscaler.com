/**
 * Unit tests for quality tier configuration
 * Tests the bg-removal tier and FREE_QUALITY_TIERS configuration
 */

import { describe, it, expect } from 'vitest';

import { MODEL_COSTS } from '@shared/config/model-costs.config';
import { QUALITY_TIER_CONFIG, QUALITY_TIER_SCALES } from '@shared/types/coreflow.types';

describe('Quality Tier Configuration', () => {
  describe('bg-removal tier', () => {
    it('should include bg-removal in QualityTier config', () => {
      expect(QUALITY_TIER_CONFIG['bg-removal']).toBeDefined();
    });

    it('should have 0 credits for bg-removal', () => {
      expect(QUALITY_TIER_CONFIG['bg-removal'].credits).toBe(0);
    });

    it('should have null modelId for bg-removal (browser-based)', () => {
      expect(QUALITY_TIER_CONFIG['bg-removal'].modelId).toBeNull();
    });

    it('should have correct label for bg-removal', () => {
      expect(QUALITY_TIER_CONFIG['bg-removal'].label).toBe('Background Removal');
    });

    it('should have correct description for bg-removal', () => {
      expect(QUALITY_TIER_CONFIG['bg-removal'].description).toBe('Remove image backgrounds');
    });

    it('should have correct bestFor for bg-removal', () => {
      expect(QUALITY_TIER_CONFIG['bg-removal'].bestFor).toBe('Product photos, profile pics');
    });

    it('should have smartAnalysisAlwaysOn false for bg-removal', () => {
      expect(QUALITY_TIER_CONFIG['bg-removal'].smartAnalysisAlwaysOn).toBe(false);
    });

    it('should have empty scales for bg-removal', () => {
      expect(QUALITY_TIER_SCALES['bg-removal']).toEqual([]);
    });
  });

  describe('FREE_QUALITY_TIERS', () => {
    it('should include bg-removal in FREE_QUALITY_TIERS', () => {
      expect(MODEL_COSTS.FREE_QUALITY_TIERS).toContain('bg-removal');
    });

    it('should include quick in FREE_QUALITY_TIERS', () => {
      expect(MODEL_COSTS.FREE_QUALITY_TIERS).toContain('quick');
    });

    it('should include face-restore in FREE_QUALITY_TIERS', () => {
      expect(MODEL_COSTS.FREE_QUALITY_TIERS).toContain('face-restore');
    });

    it('should have exactly 3 free quality tiers', () => {
      expect(MODEL_COSTS.FREE_QUALITY_TIERS).toHaveLength(3);
    });
  });

  describe('Quality tier config integrity', () => {
    it('should have config for all quality tiers', () => {
      const expectedTiers = [
        'auto',
        'quick',
        'face-restore',
        'fast-edit',
        'budget-edit',
        'seedream-edit',
        'anime-upscale',
        'hd-upscale',
        'face-pro',
        'ultra',
        'bg-removal',
      ];

      for (const tier of expectedTiers) {
        expect(QUALITY_TIER_CONFIG[tier], `Tier ${tier} should have config defined`).toBeDefined();
      }
    });

    it('should have scales defined for all quality tiers', () => {
      const expectedTiers = [
        'auto',
        'quick',
        'face-restore',
        'fast-edit',
        'budget-edit',
        'seedream-edit',
        'anime-upscale',
        'hd-upscale',
        'face-pro',
        'ultra',
        'bg-removal',
      ];

      for (const tier of expectedTiers) {
        expect(QUALITY_TIER_SCALES[tier], `Tier ${tier} should have scales defined`).toBeDefined();
        expect(
          Array.isArray(QUALITY_TIER_SCALES[tier]),
          `Tier ${tier} scales should be an array`
        ).toBe(true);
      }
    });

    it('should have enhancement-only tiers with empty scales', () => {
      const enhancementOnlyTiers = [
        'fast-edit',
        'budget-edit',
        'seedream-edit',
        'face-pro',
        'bg-removal',
      ];

      for (const tier of enhancementOnlyTiers) {
        expect(
          QUALITY_TIER_SCALES[tier],
          `Tier ${tier} should have empty scales (enhancement-only)`
        ).toEqual([]);
      }
    });
  });
});
