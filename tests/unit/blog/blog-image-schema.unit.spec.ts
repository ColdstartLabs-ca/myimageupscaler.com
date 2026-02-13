import { describe, test, expect } from 'vitest';
import {
  blogImageMetadataSchema,
  blogImageTypeSchema,
  searchBlogImagesSchema,
  saveBlogImageMetadataSchema,
} from '@shared/validation/blog.schema';

/**
 * Unit tests for Blog Image Metadata Schemas
 *
 * Tests validation of blog image metadata, search parameters,
 * and save operations for the blog image reuse system.
 */
describe('Blog Image Schema Validation', () => {
  describe('blogImageTypeSchema', () => {
    test('should accept valid image types', () => {
      expect(blogImageTypeSchema.parse('featured')).toBe('featured');
      expect(blogImageTypeSchema.parse('inline')).toBe('inline');
    });

    test('should reject invalid image_type', () => {
      const result = blogImageTypeSchema.safeParse('banner');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Invalid enum value');
      }
    });

    test('should reject invalid image types', () => {
      const invalidTypes = ['thumbnail', 'hero', 'background', 'avatar', ''];

      for (const type of invalidTypes) {
        const result = blogImageTypeSchema.safeParse(type);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('blogImageMetadataSchema', () => {
    const validMetadata = {
      url: 'https://example.com/images/test.webp',
      storage_path: '2026/02/test-image.webp',
      alt_text: 'A test image showing before and after comparison',
      tags: ['before-after', 'comparison', 'upscaling'],
      description: 'Split screen comparison of image quality before and after upscaling',
      image_type: 'inline' as const,
      width: 800,
      height: 600,
      prompt: 'Split screen: pixelated photo left, crystal clear right',
      used_in_posts: ['how-to-upscale-images', 'best-practices-for-image-enhancement'],
    };

    test('should validate blog image metadata schema', () => {
      const result = blogImageMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.url).toBe(validMetadata.url);
        expect(result.data.alt_text).toBe(validMetadata.alt_text);
        expect(result.data.tags).toEqual(validMetadata.tags);
        expect(result.data.image_type).toBe(validMetadata.image_type);
        expect(result.data.width).toBe(validMetadata.width);
        expect(result.data.height).toBe(validMetadata.height);
      }
    });

    test('should accept metadata without optional prompt', () => {
      const { prompt, ...metadataWithoutPrompt } = validMetadata;
      const result = blogImageMetadataSchema.safeParse(metadataWithoutPrompt);
      expect(result.success).toBe(true);
    });

    test('should accept metadata with empty used_in_posts', () => {
      const result = blogImageMetadataSchema.safeParse({
        ...validMetadata,
        used_in_posts: [],
      });
      expect(result.success).toBe(true);
    });

    test('should default tags to empty array', () => {
      const { tags, ...metadataWithoutTags } = validMetadata;
      const result = blogImageMetadataSchema.safeParse({
        ...metadataWithoutTags,
        used_in_posts: [],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toEqual([]);
      }
    });

    test('should reject invalid URL', () => {
      const result = blogImageMetadataSchema.safeParse({
        ...validMetadata,
        url: 'not-a-url',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('valid URL');
      }
    });

    test('should reject empty storage_path', () => {
      const result = blogImageMetadataSchema.safeParse({
        ...validMetadata,
        storage_path: '',
      });
      expect(result.success).toBe(false);
    });

    test('should reject alt_text exceeding max length', () => {
      const result = blogImageMetadataSchema.safeParse({
        ...validMetadata,
        alt_text: 'A'.repeat(201),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('200 characters');
      }
    });

    test('should reject too many tags', () => {
      const result = blogImageMetadataSchema.safeParse({
        ...validMetadata,
        tags: Array(21)
          .fill(null)
          .map((_, i) => `tag-${i}`),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('20 tags');
      }
    });

    test('should reject description exceeding max length', () => {
      const result = blogImageMetadataSchema.safeParse({
        ...validMetadata,
        description: 'A'.repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('500 characters');
      }
    });

    test('should reject non-positive width', () => {
      const result = blogImageMetadataSchema.safeParse({
        ...validMetadata,
        width: 0,
      });
      expect(result.success).toBe(false);
    });

    test('should reject non-positive height', () => {
      const result = blogImageMetadataSchema.safeParse({
        ...validMetadata,
        height: -100,
      });
      expect(result.success).toBe(false);
    });

    test('should reject non-integer dimensions', () => {
      const result = blogImageMetadataSchema.safeParse({
        ...validMetadata,
        width: 800.5,
        height: 600.5,
      });
      expect(result.success).toBe(false);
    });

    test('should reject prompt exceeding max length', () => {
      const result = blogImageMetadataSchema.safeParse({
        ...validMetadata,
        prompt: 'A'.repeat(2001),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('2000 characters');
      }
    });
  });

  describe('searchBlogImagesSchema', () => {
    test('should validate search params with tags filter', () => {
      const result = searchBlogImagesSchema.safeParse({
        tags: ['before-after', 'comparison'],
        image_type: 'inline',
        limit: 10,
        offset: 0,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toEqual(['before-after', 'comparison']);
        expect(result.data.image_type).toBe('inline');
        expect(result.data.limit).toBe(10);
        expect(result.data.offset).toBe(0);
      }
    });

    test('should validate search params without tags', () => {
      const result = searchBlogImagesSchema.safeParse({
        image_type: 'featured',
        limit: 5,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toBeUndefined();
        expect(result.data.image_type).toBe('featured');
        expect(result.data.limit).toBe(5);
      }
    });

    test('should use default values for limit and offset', () => {
      const result = searchBlogImagesSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
        expect(result.data.offset).toBe(0);
      }
    });

    test('should coerce limit and offset from strings', () => {
      const result = searchBlogImagesSchema.safeParse({
        limit: '20',
        offset: '5',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(5);
      }
    });

    test('should reject limit below minimum', () => {
      const result = searchBlogImagesSchema.safeParse({
        limit: 0,
      });
      expect(result.success).toBe(false);
    });

    test('should reject limit above maximum', () => {
      const result = searchBlogImagesSchema.safeParse({
        limit: 101,
      });
      expect(result.success).toBe(false);
    });

    test('should reject negative offset', () => {
      const result = searchBlogImagesSchema.safeParse({
        offset: -1,
      });
      expect(result.success).toBe(false);
    });

    test('should reject invalid image_type in search', () => {
      const result = searchBlogImagesSchema.safeParse({
        image_type: 'thumbnail',
      });
      expect(result.success).toBe(false);
    });

    test('should accept empty tags array', () => {
      const result = searchBlogImagesSchema.safeParse({
        tags: [],
      });
      expect(result.success).toBe(true);
    });

    test('should accept search with only tags filter', () => {
      const result = searchBlogImagesSchema.safeParse({
        tags: ['upscaling', 'tutorial'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toEqual(['upscaling', 'tutorial']);
        expect(result.data.image_type).toBeUndefined();
      }
    });
  });

  describe('saveBlogImageMetadataSchema', () => {
    const validSaveInput = {
      url: 'https://example.com/images/test.webp',
      storage_path: '2026/02/test-image.webp',
      alt_text: 'A test image',
      tags: ['test'],
      description: 'Test description',
      image_type: 'inline' as const,
      width: 800,
      height: 600,
    };

    test('should validate save input without prompt', () => {
      const result = saveBlogImageMetadataSchema.safeParse(validSaveInput);
      expect(result.success).toBe(true);
    });

    test('should validate save input with optional prompt', () => {
      const result = saveBlogImageMetadataSchema.safeParse({
        ...validSaveInput,
        prompt: 'AI generated image prompt',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.prompt).toBe('AI generated image prompt');
      }
    });

    test('should default tags to empty array', () => {
      const { tags, ...inputWithoutTags } = validSaveInput;
      const result = saveBlogImageMetadataSchema.safeParse(inputWithoutTags);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toEqual([]);
      }
    });

    test('should reject missing required fields', () => {
      const requiredFields = [
        'url',
        'storage_path',
        'alt_text',
        'description',
        'image_type',
        'width',
        'height',
      ];

      for (const field of requiredFields) {
        const { [field]: _, ...partialInput } = validSaveInput;
        const result = saveBlogImageMetadataSchema.safeParse(partialInput);
        expect(result.success).toBe(false);
      }
    });
  });
});
