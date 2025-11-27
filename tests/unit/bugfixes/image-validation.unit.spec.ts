import { describe, test, expect } from 'vitest';
import {
  upscaleSchema,
  IMAGE_VALIDATION,
  validateImageSizeForTier,
  validateImageDimensions,
  getBase64Size,
} from '../../../shared/validation/upscale.schema';

/**
 * Bug Fix Test: Server-side Image Validation
 *
 * Previously, the server accepted any base64 string without validating
 * file size, MIME type, or dimensions. This allowed oversized/invalid
 * images to reach Gemini and waste credits.
 *
 * The fix adds:
 * - Tier-aware file size validation (5MB free, 25MB paid)
 * - MIME type validation (jpeg, png, webp, heic)
 * - Dimension validation (64-8192px)
 * - Exported constants for validation limits
 *
 * Note: Size validation is NOT in the Zod schema because it depends on user tier.
 * Use validateImageSizeForTier() in the API route after determining user status.
 */

describe('Bug Fix: Server-side Image Validation', () => {
  describe('IMAGE_VALIDATION constants', () => {
    test('should export correct size limits', () => {
      expect(IMAGE_VALIDATION.MAX_SIZE_FREE).toBe(5 * 1024 * 1024); // 5MB
      expect(IMAGE_VALIDATION.MAX_SIZE_PAID).toBe(25 * 1024 * 1024); // 25MB
      expect(IMAGE_VALIDATION.MAX_SIZE_DEFAULT).toBe(5 * 1024 * 1024); // 5MB default
    });

    test('should export allowed MIME types', () => {
      expect(IMAGE_VALIDATION.ALLOWED_TYPES).toContain('image/jpeg');
      expect(IMAGE_VALIDATION.ALLOWED_TYPES).toContain('image/png');
      expect(IMAGE_VALIDATION.ALLOWED_TYPES).toContain('image/webp');
      expect(IMAGE_VALIDATION.ALLOWED_TYPES).toContain('image/heic');
    });

    test('should export dimension limits', () => {
      expect(IMAGE_VALIDATION.MIN_DIMENSION).toBe(64);
      expect(IMAGE_VALIDATION.MAX_DIMENSION).toBe(8192);
    });
  });

  describe('MIME type validation', () => {
    const validBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const validConfig = {
      mode: 'upscale' as const,
      scale: 2 as const,
      denoise: false,
      enhanceFace: false,
      preserveText: false,
    };

    test('should accept valid MIME types', () => {
      for (const mimeType of IMAGE_VALIDATION.ALLOWED_TYPES) {
        const result = upscaleSchema.safeParse({
          imageData: validBase64,
          mimeType,
          config: validConfig,
        });
        expect(result.success).toBe(true);
      }
    });

    test('should reject invalid MIME types', () => {
      const invalidTypes = ['image/gif', 'image/bmp', 'application/pdf', 'text/plain'];

      for (const mimeType of invalidTypes) {
        const result = upscaleSchema.safeParse({
          imageData: validBase64,
          mimeType,
          config: validConfig,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.errors[0].message).toContain('Invalid image type');
        }
      }
    });
  });

  describe('Image size validation (tier-aware)', () => {
    test('should accept small images for free users', () => {
      // Small valid base64 image (1x1 PNG, ~90 bytes)
      const smallImage =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const result = validateImageSizeForTier(smallImage, false);
      expect(result.valid).toBe(true);
    });

    test('should reject oversized images for free users', () => {
      // Create a base64 string that exceeds 5MB when decoded
      // 5MB = 5,242,880 bytes, base64 is ~4/3 of original size
      // So we need ~7MB of base64 to represent 5MB of data
      const oversizedBase64 = 'A'.repeat(7 * 1024 * 1024);

      const result = validateImageSizeForTier(oversizedBase64, false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    test('should accept larger images for paid users', () => {
      // Create a 10MB base64 string (would be ~7.5MB decoded)
      const largeBase64 = 'A'.repeat(10 * 1024 * 1024);

      const resultFree = validateImageSizeForTier(largeBase64, false);
      expect(resultFree.valid).toBe(false);

      const resultPaid = validateImageSizeForTier(largeBase64, true);
      expect(resultPaid.valid).toBe(true);
    });

    test('should reject oversized images for paid users (above 25MB)', () => {
      // Create a 35MB base64 string (would be ~26MB decoded)
      const oversizedBase64 = 'A'.repeat(35 * 1024 * 1024);

      const result = validateImageSizeForTier(oversizedBase64, true);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    test('should handle data URL prefix when calculating size', () => {
      const smallImage =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const dataUrl = `data:image/png;base64,${smallImage}`;

      const result = validateImageSizeForTier(dataUrl, false);
      expect(result.valid).toBe(true);
    });

    test('getBase64Size should correctly calculate size', () => {
      // 100 characters of base64 = ~75 bytes decoded
      const base64 = 'A'.repeat(100);
      const size = getBase64Size(base64);
      expect(size).toBe(75); // 100 * 3/4 = 75

      // With data URL prefix
      const dataUrl = `data:image/png;base64,${base64}`;
      const sizeWithPrefix = getBase64Size(dataUrl);
      expect(sizeWithPrefix).toBe(75);
    });
  });

  describe('Image dimension validation', () => {
    test('should accept valid dimensions', () => {
      const result = validateImageDimensions(1920, 1080);
      expect(result.valid).toBe(true);
    });

    test('should reject dimensions that are too small', () => {
      const result = validateImageDimensions(32, 32);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too small');
      expect(result.error).toContain('64');
    });

    test('should reject dimensions that are too large', () => {
      const result = validateImageDimensions(10000, 10000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
      expect(result.error).toContain('8192');
    });

    test('should reject if only one dimension is out of bounds', () => {
      // One dimension too small
      let result = validateImageDimensions(32, 1000);
      expect(result.valid).toBe(false);

      // One dimension too large
      result = validateImageDimensions(1000, 10000);
      expect(result.valid).toBe(false);
    });

    test('should accept boundary values', () => {
      // Minimum boundary
      let result = validateImageDimensions(64, 64);
      expect(result.valid).toBe(true);

      // Maximum boundary
      result = validateImageDimensions(8192, 8192);
      expect(result.valid).toBe(true);
    });
  });

  describe('Schema validation (without size check)', () => {
    const validConfig = {
      mode: 'upscale' as const,
      scale: 2 as const,
      denoise: false,
      enhanceFace: false,
      preserveText: false,
    };

    test('schema should accept valid base64 without size restriction', () => {
      // The schema no longer enforces size limits (that's done by validateImageSizeForTier)
      const smallImage =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const result = upscaleSchema.safeParse({
        imageData: smallImage,
        mimeType: 'image/png',
        config: validConfig,
      });
      expect(result.success).toBe(true);
    });

    test('schema should accept data URL format', () => {
      const smallImage =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const dataUrl = `data:image/png;base64,${smallImage}`;

      const result = upscaleSchema.safeParse({
        imageData: dataUrl,
        mimeType: 'image/png',
        config: validConfig,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Config validation', () => {
    const validBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    test('should accept valid modes', () => {
      const modes = ['upscale', 'enhance', 'both', 'custom'] as const;

      for (const mode of modes) {
        const result = upscaleSchema.safeParse({
          imageData: validBase64,
          mimeType: 'image/png',
          config: {
            mode,
            scale: 2,
            denoise: false,
            enhanceFace: false,
            preserveText: false,
          },
        });
        expect(result.success).toBe(true);
      }
    });

    test('should accept valid scale factors', () => {
      const scales = [2, 4] as const;

      for (const scale of scales) {
        const result = upscaleSchema.safeParse({
          imageData: validBase64,
          mimeType: 'image/png',
          config: {
            mode: 'upscale',
            scale,
            denoise: false,
            enhanceFace: false,
            preserveText: false,
          },
        });
        expect(result.success).toBe(true);
      }
    });

    test('should reject invalid scale factors', () => {
      const invalidScales = [1, 3, 8, 16];

      for (const scale of invalidScales) {
        const result = upscaleSchema.safeParse({
          imageData: validBase64,
          mimeType: 'image/png',
          config: {
            mode: 'upscale',
            scale,
            denoise: false,
            enhanceFace: false,
            preserveText: false,
          },
        });
        expect(result.success).toBe(false);
      }
    });
  });
});
