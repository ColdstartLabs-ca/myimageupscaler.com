/**
 * Unit tests for per-model pixel limits
 * Tests the getMaxPixelsForModel helper and MODEL_MAX_INPUT_PIXELS configuration
 */

import { describe, it, expect } from 'vitest';

import { MODEL_MAX_INPUT_PIXELS } from '@shared/config/model-costs.config';
import {
  getMaxPixelsForModel,
  getMaxPixelsForQualityTier,
  IMAGE_VALIDATION,
} from '@shared/validation/upscale.schema';

describe('Model Pixel Limits', () => {
  describe('getMaxPixelsForModel', () => {
    it('should return correct pixel limit for real-esrgan (1.5M)', () => {
      expect(getMaxPixelsForModel('real-esrgan')).toBe(1_500_000);
    });

    it('should return correct pixel limit for gfpgan (1.5M)', () => {
      expect(getMaxPixelsForModel('gfpgan')).toBe(1_500_000);
    });

    it('should return correct pixel limit for realesrgan-anime (1.5M)', () => {
      expect(getMaxPixelsForModel('realesrgan-anime')).toBe(1_500_000);
    });

    it('should return correct pixel limit for clarity-upscaler (4M)', () => {
      expect(getMaxPixelsForModel('clarity-upscaler')).toBe(4_000_000);
    });

    it('should return correct pixel limit for nano-banana (4M)', () => {
      expect(getMaxPixelsForModel('nano-banana')).toBe(4_000_000);
    });

    it('should return correct pixel limit for nano-banana-pro (4M)', () => {
      expect(getMaxPixelsForModel('nano-banana-pro')).toBe(4_000_000);
    });

    it('should return correct pixel limit for flux-2-pro (4M)', () => {
      expect(getMaxPixelsForModel('flux-2-pro')).toBe(4_000_000);
    });

    it('should return correct pixel limit for seedream (4M)', () => {
      expect(getMaxPixelsForModel('seedream')).toBe(4_000_000);
    });

    it('should return correct pixel limit for qwen-image-edit (2.56M)', () => {
      expect(getMaxPixelsForModel('qwen-image-edit')).toBe(2_560_000);
    });

    it('should return correct pixel limit for p-image-edit (2.0736M)', () => {
      expect(getMaxPixelsForModel('p-image-edit')).toBe(2_073_600);
    });

    it('should return correct pixel limit for flux-kontext-fast (1M)', () => {
      expect(getMaxPixelsForModel('flux-kontext-fast')).toBe(1_048_576);
    });

    it('should return default 1.5M for unknown model', () => {
      expect(getMaxPixelsForModel('unknown-model')).toBe(IMAGE_VALIDATION.MAX_PIXELS);
      expect(getMaxPixelsForModel('nonexistent')).toBe(1_500_000);
    });
  });

  describe('getMaxPixelsForQualityTier', () => {
    it('should return model-specific limits for explicit quality tiers', () => {
      expect(getMaxPixelsForQualityTier('quick')).toBe(1_500_000);
      expect(getMaxPixelsForQualityTier('hd-upscale')).toBe(4_000_000);
      expect(getMaxPixelsForQualityTier('budget-edit')).toBe(2_560_000);
    });

    it('should use the conservative fallback for auto tier', () => {
      expect(getMaxPixelsForQualityTier('auto')).toBe(IMAGE_VALIDATION.MAX_PIXELS);
    });

    it('should skip Replicate pixel limits for background removal', () => {
      expect(getMaxPixelsForQualityTier('bg-removal')).toBeNull();
    });
  });

  describe('MODEL_MAX_INPUT_PIXELS configuration', () => {
    it('should have limits <= 4M for all models', () => {
      const maxAllowed = 4_000_000;
      for (const [modelId, limit] of Object.entries(MODEL_MAX_INPUT_PIXELS)) {
        expect(limit, `Model ${modelId} limit should be <= 4M`).toBeLessThanOrEqual(maxAllowed);
      }
    });

    it('should have limits >= 1M for all models', () => {
      const minAllowed = 1_000_000;
      for (const [modelId, limit] of Object.entries(MODEL_MAX_INPUT_PIXELS)) {
        expect(limit, `Model ${modelId} limit should be >= 1M`).toBeGreaterThanOrEqual(minAllowed);
      }
    });

    it('should have pixel limits defined for all expected models', () => {
      const expectedModels = [
        'real-esrgan',
        'gfpgan',
        'realesrgan-anime',
        'clarity-upscaler',
        'nano-banana',
        'nano-banana-pro',
        'flux-2-pro',
        'qwen-image-edit',
        'seedream',
        'p-image-edit',
        'flux-kontext-fast',
      ];

      for (const modelId of expectedModels) {
        expect(
          MODEL_MAX_INPUT_PIXELS,
          `Model ${modelId} should have pixel limit defined`
        ).toHaveProperty(modelId);
      }
    });

    it('should have positive integer values for all limits', () => {
      for (const [modelId, limit] of Object.entries(MODEL_MAX_INPUT_PIXELS)) {
        expect(Number.isInteger(limit), `Model ${modelId} limit should be an integer`).toBe(true);
        expect(limit, `Model ${modelId} limit should be positive`).toBeGreaterThan(0);
      }
    });
  });

  describe('Global default fallback', () => {
    it('IMAGE_VALIDATION.MAX_PIXELS should be 1.5M (most conservative)', () => {
      expect(IMAGE_VALIDATION.MAX_PIXELS).toBe(1_500_000);
    });
  });
});
