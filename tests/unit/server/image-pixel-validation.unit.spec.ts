/**
 * Unit tests for server-side per-model pixel validation
 * Tests the ModelRegistry.getMaxInputPixels method and server-side validation logic
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { ModelRegistry } from '@server/services/model-registry';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';
import { MODEL_MAX_INPUT_PIXELS } from '@shared/config/model-costs.config';

describe('Server-Side Image Pixel Validation', () => {
  let modelRegistry: ModelRegistry;

  beforeEach(() => {
    modelRegistry = ModelRegistry.getInstance();
    modelRegistry.reset();
  });

  describe('ModelRegistry.getMaxInputPixels', () => {
    it('should return correct pixel limit for real-esrgan (1.5M)', () => {
      expect(modelRegistry.getMaxInputPixels('real-esrgan')).toBe(1_500_000);
    });

    it('should return correct pixel limit for gfpgan (1.5M)', () => {
      expect(modelRegistry.getMaxInputPixels('gfpgan')).toBe(1_500_000);
    });

    it('should return correct pixel limit for realesrgan-anime (1.5M)', () => {
      expect(modelRegistry.getMaxInputPixels('realesrgan-anime')).toBe(1_500_000);
    });

    it('should return correct pixel limit for clarity-upscaler (4M)', () => {
      expect(modelRegistry.getMaxInputPixels('clarity-upscaler')).toBe(4_000_000);
    });

    it('should return correct pixel limit for nano-banana (4M)', () => {
      expect(modelRegistry.getMaxInputPixels('nano-banana')).toBe(4_000_000);
    });

    it('should return correct pixel limit for nano-banana-pro (4M)', () => {
      expect(modelRegistry.getMaxInputPixels('nano-banana-pro')).toBe(4_000_000);
    });

    it('should return correct pixel limit for flux-2-pro (4M)', () => {
      expect(modelRegistry.getMaxInputPixels('flux-2-pro')).toBe(4_000_000);
    });

    it('should return correct pixel limit for seedream (4M)', () => {
      expect(modelRegistry.getMaxInputPixels('seedream')).toBe(4_000_000);
    });

    it('should return correct pixel limit for qwen-image-edit (2.56M)', () => {
      expect(modelRegistry.getMaxInputPixels('qwen-image-edit')).toBe(2_560_000);
    });

    it('should return correct pixel limit for p-image-edit (2.0736M)', () => {
      expect(modelRegistry.getMaxInputPixels('p-image-edit')).toBe(2_073_600);
    });

    it('should return correct pixel limit for flux-kontext-fast (1M)', () => {
      expect(modelRegistry.getMaxInputPixels('flux-kontext-fast')).toBe(1_048_576);
    });

    it('should use default limit for unknown models', () => {
      expect(modelRegistry.getMaxInputPixels('unknown-model')).toBe(IMAGE_VALIDATION.MAX_PIXELS);
      expect(modelRegistry.getMaxInputPixels('nonexistent')).toBe(1_500_000);
    });
  });

  describe('Pixel limit consistency', () => {
    it('ModelRegistry.getMaxInputPixels should match MODEL_MAX_INPUT_PIXELS config', () => {
      for (const [modelId, expectedLimit] of Object.entries(MODEL_MAX_INPUT_PIXELS)) {
        const actualLimit = modelRegistry.getMaxInputPixels(modelId);
        expect(actualLimit, `Model ${modelId} limit should match config`).toBe(expectedLimit);
      }
    });
  });

  describe('Validation logic', () => {
    /**
     * Helper to simulate server-side pixel validation
     * This mirrors the validation logic in the upscale route
     */
    function validatePixelsForModel(
      width: number,
      height: number,
      modelId: string
    ): { valid: boolean; error?: string; maxPixels?: number } {
      const pixels = width * height;
      const maxPixels = modelRegistry.getMaxInputPixels(modelId);

      if (pixels > maxPixels) {
        return {
          valid: false,
          error: `Image dimensions (${width}×${height} = ${formatPixels(pixels)} pixels) exceed the maximum for this processing mode (${formatPixels(maxPixels)} pixels)`,
          maxPixels,
        };
      }

      return { valid: true, maxPixels };
    }

    function formatPixels(p: number): string {
      if (p >= 1_000_000) {
        return `${(p / 1_000_000).toFixed(1)}M`;
      }
      return p.toLocaleString();
    }

    it('should reject image exceeding model pixel limit', () => {
      // 1300x1300 = 1.69M pixels, exceeds real-esrgan's 1.5M limit
      const result = validatePixelsForModel(1300, 1300, 'real-esrgan');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceed the maximum');
      expect(result.maxPixels).toBe(1_500_000);
    });

    it('should accept image within model pixel limit', () => {
      // 1200x1200 = 1.44M pixels, within real-esrgan's 1.5M limit
      const result = validatePixelsForModel(1200, 1200, 'real-esrgan');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept larger image for model with higher limit', () => {
      // 1300x1300 = 1.69M pixels
      // Exceeds real-esrgan's 1.5M limit, but within clarity-upscaler's 4M limit
      const resultRealEsrgan = validatePixelsForModel(1300, 1300, 'real-esrgan');
      expect(resultRealEsrgan.valid).toBe(false);

      const resultClarity = validatePixelsForModel(1300, 1300, 'clarity-upscaler');
      expect(resultClarity.valid).toBe(true);
    });

    it('should use default limit for unknown models', () => {
      // 1300x1300 = 1.69M pixels
      // Exceeds default 1.5M limit
      const result = validatePixelsForModel(1300, 1300, 'unknown-model');
      expect(result.valid).toBe(false);
      expect(result.maxPixels).toBe(IMAGE_VALIDATION.MAX_PIXELS);
    });

    it('should return correct error format with maxPixels', () => {
      const result = validatePixelsForModel(3000, 2000, 'real-esrgan');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.maxPixels).toBe(1_500_000);
      expect(result.error).toContain('3000×2000');
      expect(result.error).toContain('6.0M pixels');
    });

    it('should correctly validate boundary cases', () => {
      // Exactly at the limit should pass
      // sqrt(1.5M) ≈ 1224.74, so 1224x1224 = 1,498,176 pixels (under limit)
      const atLimit = validatePixelsForModel(1224, 1224, 'real-esrgan');
      expect(atLimit.valid).toBe(true);

      // Just over the limit should fail
      // 1225x1225 = 1,500,625 pixels (over limit)
      const overLimit = validatePixelsForModel(1225, 1225, 'real-esrgan');
      expect(overLimit.valid).toBe(false);
    });

    it('should validate flux-kontext-fast strict 1M limit', () => {
      // flux-kontext-fast has the strictest limit: 1,048,576 pixels (1024x1024)
      // 1024x1024 = 1,048,576 pixels (at limit)
      const atLimit = validatePixelsForModel(1024, 1024, 'flux-kontext-fast');
      expect(atLimit.valid).toBe(true);

      // 1025x1025 = 1,050,625 pixels (over limit)
      const overLimit = validatePixelsForModel(1025, 1025, 'flux-kontext-fast');
      expect(overLimit.valid).toBe(false);
    });

    it('should validate qwen-image-edit 2.56M limit', () => {
      // qwen-image-edit has 2.56M limit (1600x1600)
      // 1600x1600 = 2,560,000 pixels (at limit)
      const atLimit = validatePixelsForModel(1600, 1600, 'qwen-image-edit');
      expect(atLimit.valid).toBe(true);

      // 1601x1600 = 2,561,600 pixels (over limit)
      const overLimit = validatePixelsForModel(1601, 1600, 'qwen-image-edit');
      expect(overLimit.valid).toBe(false);
    });

    it('should validate p-image-edit 2.0736M limit', () => {
      // p-image-edit has 2,073,600 limit (1440x1440)
      // 1440x1440 = 2,073,600 pixels (at limit)
      const atLimit = validatePixelsForModel(1440, 1440, 'p-image-edit');
      expect(atLimit.valid).toBe(true);

      // 1441x1440 = 2,075,040 pixels (over limit)
      const overLimit = validatePixelsForModel(1441, 1440, 'p-image-edit');
      expect(overLimit.valid).toBe(false);
    });
  });

  describe('Error message formatting', () => {
    function formatPixels(p: number): string {
      if (p >= 1_000_000) {
        return `${(p / 1_000_000).toFixed(1)}M`;
      }
      return p.toLocaleString();
    }

    it('should format millions correctly', () => {
      expect(formatPixels(1_500_000)).toBe('1.5M');
      expect(formatPixels(2_000_000)).toBe('2.0M');
      expect(formatPixels(2_560_000)).toBe('2.6M');
      expect(formatPixels(4_000_000)).toBe('4.0M');
      expect(formatPixels(1_048_576)).toBe('1.0M');
    });

    it('should format sub-million values with locale separators', () => {
      expect(formatPixels(500_000)).toBe('500,000');
      expect(formatPixels(999_999)).toBe('999,999');
    });
  });
});
