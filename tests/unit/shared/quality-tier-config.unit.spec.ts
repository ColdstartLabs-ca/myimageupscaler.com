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

    it('should have 1 credit for bg-removal', () => {
      expect(QUALITY_TIER_CONFIG['bg-removal'].credits).toBe(1);
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
        'budget-old-photo',
        'seedream-edit',
        'anime-upscale',
        'hd-upscale',
        'face-pro',
        'ultra',
        'bg-removal',
        'lighting-fix',
        'resume-photo',
        'photo-repair',
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
        'budget-old-photo',
        'seedream-edit',
        'anime-upscale',
        'hd-upscale',
        'face-pro',
        'ultra',
        'bg-removal',
        'lighting-fix',
        'resume-photo',
        'photo-repair',
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
        'budget-old-photo',
        'seedream-edit',
        'face-pro',
        'bg-removal',
        'lighting-fix',
        'resume-photo',
        'photo-repair',
      ];

      for (const tier of enhancementOnlyTiers) {
        expect(
          QUALITY_TIER_SCALES[tier],
          `Tier ${tier} should have empty scales (enhancement-only)`
        ).toEqual([]);
      }
    });
  });

  describe('Model gallery fields (useCases and previewImages)', () => {
    const allTiers = Object.keys(QUALITY_TIER_CONFIG) as (keyof typeof QUALITY_TIER_CONFIG)[];

    it('should have useCases array for every tier', () => {
      for (const tier of allTiers) {
        const config = QUALITY_TIER_CONFIG[tier];
        expect(config.useCases, `Tier ${tier} should have useCases array defined`).toBeDefined();
        expect(Array.isArray(config.useCases), `Tier ${tier} useCases should be an array`).toBe(
          true
        );
        expect(config.useCases.length, `Tier ${tier} useCases should not be empty`).toBeGreaterThan(
          0
        );
      }
    });

    it('should have previewImages field for every tier', () => {
      for (const tier of allTiers) {
        const config = QUALITY_TIER_CONFIG[tier];
        expect('previewImages' in config, `Tier ${tier} should have previewImages field`).toBe(
          true
        );

        // previewImages should be either null or a valid object with before/after
        if (config.previewImages !== null) {
          expect(
            typeof config.previewImages,
            `Tier ${tier} previewImages should be an object when not null`
          ).toBe('object');
          expect(
            config.previewImages,
            `Tier ${tier} previewImages should have before property`
          ).toHaveProperty('before');
          expect(
            config.previewImages,
            `Tier ${tier} previewImages should have after property`
          ).toHaveProperty('after');
          expect(
            typeof config.previewImages!.before,
            `Tier ${tier} previewImages.before should be a string`
          ).toBe('string');
          expect(
            typeof config.previewImages!.after,
            `Tier ${tier} previewImages.after should be a string`
          ).toBe('string');
        }
      }
    });

    it('useCases should be lowercase searchable strings', () => {
      for (const tier of allTiers) {
        const config = QUALITY_TIER_CONFIG[tier];
        for (const useCase of config.useCases) {
          expect(typeof useCase, `Tier ${tier} useCase "${useCase}" should be a string`).toBe(
            'string'
          );
          expect(useCase, `Tier ${tier} useCase "${useCase}" should be lowercase`).toBe(
            useCase.toLowerCase()
          );
          expect(
            useCase.length,
            `Tier ${tier} useCase "${useCase}" should not be empty`
          ).toBeGreaterThan(0);
        }
      }
    });

    it('should have 3-6 use cases per tier for good searchability', () => {
      for (const tier of allTiers) {
        const config = QUALITY_TIER_CONFIG[tier];
        expect(
          config.useCases.length,
          `Tier ${tier} should have 3-6 use cases (got ${config.useCases.length})`
        ).toBeGreaterThanOrEqual(3);
        expect(
          config.useCases.length,
          `Tier ${tier} should have 3-6 use cases (got ${config.useCases.length})`
        ).toBeLessThanOrEqual(6);
      }
    });
  });
});
