/**
 * Unit tests for server/utils/image-resizer.ts
 * Tests the ensureFitsModel function for server-side auto-resize
 */

import { describe, it, expect, beforeEach } from 'vitest';
import sharp from 'sharp';

import {
  ensureFitsModel,
  getImageDimensions,
  getMaxPixelsForModel,
  type IResizeResult,
} from '@server/utils/image-resizer';
import { MODEL_MAX_INPUT_PIXELS } from '@shared/config/model-costs.config';

/**
 * Helper to create a test image buffer
 */
async function createTestImage(
  width: number,
  height: number,
  format: 'jpeg' | 'png' | 'webp' = 'jpeg',
  options?: { quality?: number }
): Promise<string> {
  let sharpInstance = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  });

  // Apply format-specific options
  if (format === 'jpeg') {
    sharpInstance = sharpInstance.jpeg({ quality: options?.quality ?? 90 });
  } else if (format === 'png') {
    sharpInstance = sharpInstance.png({ compressionLevel: 6 });
  } else if (format === 'webp') {
    sharpInstance = sharpInstance.webp({ quality: options?.quality ?? 90 });
  }

  const buffer = await sharpInstance.toBuffer();

  const base64 = buffer.toString('base64');
  return `data:image/${format};base64,${base64}`;
}

/**
 * Helper to create raw base64 (without data URL prefix)
 */
async function createRawBase64TestImage(width: number, height: number): Promise<string> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  return buffer.toString('base64');
}

describe('Server-Side Image Resizer', () => {
  describe('getMaxPixelsForModel', () => {
    it('should return correct limit for real-esrgan (1.5M)', () => {
      expect(getMaxPixelsForModel('real-esrgan')).toBe(1_500_000);
    });

    it('should return correct limit for clarity-upscaler (4M)', () => {
      expect(getMaxPixelsForModel('clarity-upscaler')).toBe(4_000_000);
    });

    it('should return correct limit for flux-kontext-fast (1.04M)', () => {
      expect(getMaxPixelsForModel('flux-kontext-fast')).toBe(1_048_576);
    });

    it('should fallback to real-esrgan limit for unknown models', () => {
      expect(getMaxPixelsForModel('unknown-model')).toBe(1_500_000);
    });

    it('should match MODEL_MAX_INPUT_PIXELS config for all known models', () => {
      for (const [modelId, expectedLimit] of Object.entries(MODEL_MAX_INPUT_PIXELS)) {
        const actualLimit = getMaxPixelsForModel(modelId);
        expect(actualLimit, `Model ${modelId} limit should match config`).toBe(expectedLimit);
      }
    });
  });

  describe('ensureFitsModel - Basic functionality', () => {
    it('should not resize image within model pixel limit', async () => {
      // 1000x1000 = 1M pixels, within real-esrgan's 1.5M limit
      const imageData = await createTestImage(1000, 1000);

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      expect(result.wasResized).toBe(false);
      expect(result.dimensions).toEqual({ width: 1000, height: 1000 });
      expect(result.originalDimensions).toBeUndefined();
    });

    it('should resize image exceeding model pixel limit', async () => {
      // 3000x4000 = 12M pixels, exceeds real-esrgan's 1.5M limit
      const imageData = await createTestImage(3000, 4000);

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      expect(result.wasResized).toBe(true);
      expect(result.originalDimensions).toEqual({ width: 3000, height: 4000 });

      // Verify resized dimensions fit within limit
      const resizedPixels = result.dimensions.width * result.dimensions.height;
      expect(resizedPixels).toBeLessThanOrEqual(1_500_000);
    });

    it('should preserve aspect ratio after resize', async () => {
      // 3000x4000 = 12MP, aspect ratio 3:4
      const imageData = await createTestImage(3000, 4000);

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      expect(result.wasResized).toBe(true);

      // Original aspect ratio: 3:4 = 0.75
      const originalRatio = 3000 / 4000;
      const resizedRatio = result.dimensions.width / result.dimensions.height;

      // Allow 1% tolerance due to rounding
      expect(Math.abs(originalRatio - resizedRatio)).toBeLessThan(0.01);
    });
  });

  describe('ensureFitsModel - Per-model limits', () => {
    it('should use real-esrgan limit (1.5M)', async () => {
      // 1300x1300 = 1.69M pixels
      const imageData = await createTestImage(1300, 1300);

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      expect(result.wasResized).toBe(true);
      const pixels = result.dimensions.width * result.dimensions.height;
      expect(pixels).toBeLessThanOrEqual(1_500_000);
    });

    it('should use clarity-upscaler limit (4M)', async () => {
      // 1300x1300 = 1.69M pixels - fits in 4M limit
      const imageData = await createTestImage(1300, 1300);

      const result = await ensureFitsModel(imageData, 'clarity-upscaler');

      expect(result.wasResized).toBe(false);
      expect(result.dimensions).toEqual({ width: 1300, height: 1300 });
    });

    it('should use flux-kontext-fast limit (1.04M)', async () => {
      // 1024x1024 = 1.04M pixels - at the limit
      const imageData = await createTestImage(1024, 1024);

      const result = await ensureFitsModel(imageData, 'flux-kontext-fast');

      expect(result.wasResized).toBe(false);
    });

    it('should resize for flux-kontext-fast when over limit', async () => {
      // 1200x1200 = 1.44M pixels - exceeds 1.04M limit
      const imageData = await createTestImage(1200, 1200);

      const result = await ensureFitsModel(imageData, 'flux-kontext-fast');

      expect(result.wasResized).toBe(true);
      const pixels = result.dimensions.width * result.dimensions.height;
      expect(pixels).toBeLessThanOrEqual(1_048_576);
    });
  });

  describe('ensureFitsModel - Format handling', () => {
    it('should handle JPEG images', async () => {
      const imageData = await createTestImage(2000, 2000, 'jpeg');

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      expect(result.mimeType).toBe('image/jpeg');
      expect(result.wasResized).toBe(true);
    });

    it('should handle PNG images', async () => {
      const imageData = await createTestImage(2000, 2000, 'png');

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      expect(result.mimeType).toBe('image/png');
      expect(result.wasResized).toBe(true);
    });

    it('should handle WebP images', async () => {
      const imageData = await createTestImage(2000, 2000, 'webp');

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      expect(result.mimeType).toBe('image/webp');
      expect(result.wasResized).toBe(true);
    });

    it('should handle raw base64 without data URL prefix', async () => {
      const rawBase64 = await createRawBase64TestImage(2000, 2000);

      const result = await ensureFitsModel(rawBase64, 'real-esrgan');

      expect(result.wasResized).toBe(true);
      expect(result.imageData).toContain('data:image/jpeg;base64,');
    });
  });

  describe('ensureFitsModel - Error handling', () => {
    it('should throw on invalid base64 data', async () => {
      await expect(ensureFitsModel('not-valid-base64!!!', 'real-esrgan')).rejects.toThrow();
    });

    it('should throw on corrupt image data', async () => {
      const corruptData = 'data:image/jpeg;base64,' + 'a'.repeat(1000);

      await expect(ensureFitsModel(corruptData, 'real-esrgan')).rejects.toThrow(
        /Failed to read image metadata/
      );
    });

    it('should throw on empty image data', async () => {
      await expect(ensureFitsModel('', 'real-esrgan')).rejects.toThrow();
    });

    it('should throw on invalid data URL format', async () => {
      const invalidDataUrl = 'data:text/plain;base64,SGVsbG8gV29ybGQ=';

      await expect(ensureFitsModel(invalidDataUrl, 'real-esrgan')).rejects.toThrow();
    });
  });

  describe('ensureFitsModel - Output verification', () => {
    it('should return valid base64 data URL', async () => {
      const imageData = await createTestImage(3000, 4000);

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      expect(result.imageData).toMatch(/^data:image\/[a-z+]+;base64,[A-Za-z0-9+/]+=*$/);
    });

    it('should produce output that sharp can read', async () => {
      const imageData = await createTestImage(3000, 4000);

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      // Extract base64 data
      const base64Match = result.imageData.match(/^data:[^;]+;base64,(.+)$/);
      expect(base64Match).not.toBeNull();

      const buffer = Buffer.from(base64Match![1], 'base64');

      // Verify sharp can read the output
      const metadata = await sharp(buffer).metadata();
      expect(metadata.width).toBe(result.dimensions.width);
      expect(metadata.height).toBe(result.dimensions.height);
    });

    it('should resize to exactly fit or just under the limit', async () => {
      // 5000x5000 = 25MP → should resize to fit 1.5M
      const imageData = await createTestImage(5000, 5000);

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      const pixels = result.dimensions.width * result.dimensions.height;
      // Should be close to the limit (within 5%) but not over
      expect(pixels).toBeLessThanOrEqual(1_500_000);
      expect(pixels).toBeGreaterThan(1_500_000 * 0.9); // Within 90% of limit
    });
  });

  describe('ensureFitsModel - Options', () => {
    it('should respect custom maxPixels option', async () => {
      // 1000x1000 = 1M pixels
      const imageData = await createTestImage(1000, 1000);

      // Custom limit of 500K pixels
      const result = await ensureFitsModel(imageData, 'real-esrgan', { maxPixels: 500_000 });

      expect(result.wasResized).toBe(true);
      const pixels = result.dimensions.width * result.dimensions.height;
      expect(pixels).toBeLessThanOrEqual(500_000);
    });

    it('should accept quality option without error', async () => {
      // Create a large image that will be resized
      const imageData = await createTestImage(3000, 4000);

      // Both quality levels should work without error
      const resultLowQuality = await ensureFitsModel(imageData, 'real-esrgan', { quality: 50 });
      const resultHighQuality = await ensureFitsModel(imageData, 'real-esrgan', { quality: 95 });

      // Verify both produce valid output
      expect(resultLowQuality.wasResized).toBe(true);
      expect(resultHighQuality.wasResized).toBe(true);
      expect(resultLowQuality.imageData).toMatch(/^data:image\/jpeg;base64,/);
      expect(resultHighQuality.imageData).toMatch(/^data:image\/jpeg;base64,/);
    });
  });

  describe('getImageDimensions', () => {
    it('should return dimensions for valid image', async () => {
      const imageData = await createTestImage(800, 600);

      const dims = await getImageDimensions(imageData);

      expect(dims).toEqual({ width: 800, height: 600 });
    });

    it('should return null for invalid image data', async () => {
      const dims = await getImageDimensions('invalid-data');

      expect(dims).toBeNull();
    });

    it('should handle data URL format', async () => {
      const imageData = await createTestImage(100, 100);

      const dims = await getImageDimensions(imageData);

      expect(dims).toEqual({ width: 100, height: 100 });
    });

    it('should handle raw base64 format', async () => {
      const rawBase64 = await createRawBase64TestImage(100, 100);

      const dims = await getImageDimensions(rawBase64);

      expect(dims).toEqual({ width: 100, height: 100 });
    });
  });

  describe('Edge cases', () => {
    it('should handle very small images', async () => {
      const imageData = await createTestImage(64, 64);

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      expect(result.wasResized).toBe(false);
      expect(result.dimensions).toEqual({ width: 64, height: 64 });
    });

    it('should handle images at exact limit', async () => {
      // sqrt(1.5M) ≈ 1224.74
      // 1224x1224 = 1,498,176 (just under limit)
      const imageData = await createTestImage(1224, 1224);

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      expect(result.wasResized).toBe(false);
    });

    it('should handle images just over limit', async () => {
      // 1225x1225 = 1,500,625 (just over limit)
      const imageData = await createTestImage(1225, 1225);

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      expect(result.wasResized).toBe(true);
    });

    it('should handle non-square aspect ratios', async () => {
      // 4000x2000 = 8MP → should resize to ~1.5M
      const imageData = await createTestImage(4000, 2000);

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      expect(result.wasResized).toBe(true);

      // Verify aspect ratio preserved (2:1)
      const ratio = result.dimensions.width / result.dimensions.height;
      expect(ratio).toBeCloseTo(2, 1);

      // Verify within limit
      const pixels = result.dimensions.width * result.dimensions.height;
      expect(pixels).toBeLessThanOrEqual(1_500_000);
    });

    it('should handle extreme aspect ratios', async () => {
      // 8000x1000 = 8MP (8:1 ratio)
      const imageData = await createTestImage(8000, 1000);

      const result = await ensureFitsModel(imageData, 'real-esrgan');

      expect(result.wasResized).toBe(true);

      // Verify aspect ratio preserved
      const ratio = result.dimensions.width / result.dimensions.height;
      expect(ratio).toBeCloseTo(8, 1);
    });
  });
});
