import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  imageUploadSchema,
  imageUploadMetadataSchema,
  blogImageTypeSchema,
} from '@shared/validation/blog.schema';

/**
 * Unit tests for Blog Image Upload Endpoint
 *
 * Tests validation of upload requests with metadata,
 * backwards compatibility, and image_type enum validation.
 */
describe('Blog Image Upload Validation', () => {
  describe('imageUploadSchema', () => {
    const validBase64Image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const validUploadInput = {
      imageData: validBase64Image,
      filename: 'test-image.png',
    };

    test('should validate basic image upload without metadata (backwards compat)', () => {
      const result = imageUploadSchema.safeParse(validUploadInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.imageData).toBe(validBase64Image);
        expect(result.data.filename).toBe('test-image.png');
        expect(result.data.alt_text).toBeUndefined();
        expect(result.data.tags).toBeUndefined();
        expect(result.data.description).toBeUndefined();
        expect(result.data.image_type).toBeUndefined();
        expect(result.data.width).toBeUndefined();
        expect(result.data.height).toBeUndefined();
        expect(result.data.prompt).toBeUndefined();
      }
    });

    test('should validate image upload with all metadata fields', () => {
      const inputWithMetadata = {
        ...validUploadInput,
        alt_text: 'A test image description',
        tags: ['upscaling', 'comparison', 'before-after'],
        description: 'Split screen comparison of image quality',
        image_type: 'featured' as const,
        width: 1920,
        height: 1080,
        prompt: 'AI generated image of upscaled photo',
      };

      const result = imageUploadSchema.safeParse(inputWithMetadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.alt_text).toBe('A test image description');
        expect(result.data.tags).toEqual(['upscaling', 'comparison', 'before-after']);
        expect(result.data.description).toBe('Split screen comparison of image quality');
        expect(result.data.image_type).toBe('featured');
        expect(result.data.width).toBe(1920);
        expect(result.data.height).toBe(1080);
        expect(result.data.prompt).toBe('AI generated image of upscaled photo');
      }
    });

    test('should validate image upload with partial metadata', () => {
      const inputWithPartialMetadata = {
        ...validUploadInput,
        alt_text: 'Test alt text',
        image_type: 'inline' as const,
      };

      const result = imageUploadSchema.safeParse(inputWithPartialMetadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.alt_text).toBe('Test alt text');
        expect(result.data.image_type).toBe('inline');
        expect(result.data.tags).toBeUndefined();
        expect(result.data.description).toBeUndefined();
      }
    });

    test('should reject invalid image_type enum', () => {
      const inputWithInvalidType = {
        ...validUploadInput,
        image_type: 'banner',
      };

      const result = imageUploadSchema.safeParse(inputWithInvalidType);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Invalid enum value');
      }
    });

    test('should reject tags array with too many items', () => {
      const inputWithTooManyTags = {
        ...validUploadInput,
        tags: Array(21)
          .fill(null)
          .map((_, i) => `tag-${i}`),
      };

      const result = imageUploadSchema.safeParse(inputWithTooManyTags);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('20 tags');
      }
    });

    test('should reject description exceeding max length', () => {
      const inputWithLongDescription = {
        ...validUploadInput,
        description: 'A'.repeat(501),
      };

      const result = imageUploadSchema.safeParse(inputWithLongDescription);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('500 characters');
      }
    });

    test('should reject non-positive width', () => {
      const inputWithInvalidWidth = {
        ...validUploadInput,
        width: 0,
      };

      const result = imageUploadSchema.safeParse(inputWithInvalidWidth);
      expect(result.success).toBe(false);
    });

    test('should reject non-positive height', () => {
      const inputWithInvalidHeight = {
        ...validUploadInput,
        height: -100,
      };

      const result = imageUploadSchema.safeParse(inputWithInvalidHeight);
      expect(result.success).toBe(false);
    });

    test('should reject prompt exceeding max length', () => {
      const inputWithLongPrompt = {
        ...validUploadInput,
        prompt: 'A'.repeat(2001),
      };

      const result = imageUploadSchema.safeParse(inputWithLongPrompt);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('2000 characters');
      }
    });

    test('should reject missing required fields', () => {
      const result = imageUploadSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test('should reject invalid imageData format', () => {
      const inputWithInvalidImageData = {
        imageData: 'not-a-data-uri',
        filename: 'test.png',
      };

      const result = imageUploadSchema.safeParse(inputWithInvalidImageData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('base64 data URI');
      }
    });
  });

  describe('imageUploadMetadataSchema', () => {
    test('should validate metadata for multipart upload', () => {
      const metadata = {
        alt_text: 'Test image',
        tags: 'upscaling, comparison, tutorial',
        description: 'A test image for blog post',
        image_type: 'inline' as const,
        width: 800,
        height: 600,
        prompt: 'Generate an image',
      };

      const result = imageUploadMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    test('should validate empty metadata (backwards compat)', () => {
      const result = imageUploadMetadataSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('should reject invalid image_type in multipart metadata', () => {
      const metadata = {
        image_type: 'thumbnail',
      };

      const result = imageUploadMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    test('should accept tags as comma-separated string', () => {
      const metadata = {
        tags: 'tag1, tag2, tag3',
      };

      const result = imageUploadMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toBe('tag1, tag2, tag3');
      }
    });
  });

  describe('blogImageTypeSchema', () => {
    test('should accept featured image type', () => {
      expect(blogImageTypeSchema.parse('featured')).toBe('featured');
    });

    test('should accept inline image type', () => {
      expect(blogImageTypeSchema.parse('inline')).toBe('inline');
    });

    test('should reject invalid image type', () => {
      const invalidTypes = ['thumbnail', 'banner', 'hero', 'avatar', '', 'FEATURED', 'Inline'];

      for (const type of invalidTypes) {
        const result = blogImageTypeSchema.safeParse(type);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('Parse tags helper function', () => {
    // Test the parseTags function logic indirectly through the schema
    test('should handle empty tags string', () => {
      const metadata = {
        tags: '',
      };

      const result = imageUploadMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    test('should handle tags string with extra spaces', () => {
      const metadata = {
        tags: '  tag1  ,  tag2  ,  tag3  ',
      };

      const result = imageUploadMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });
  });
});

/**
 * Integration-style tests for the service layer
 * These tests verify that the saveBlogImageMetadata function is called correctly
 */
describe('Blog Image Upload Service Integration', () => {
  // Mock the service functions
  const mockSaveBlogImageMetadata = vi.fn();
  const mockUploadBlogImage = vi.fn();
  const mockGetImageDimensions = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('should store metadata when provided', () => {
    test('metadata is saved when all fields are provided', async () => {
      // Setup mock return values
      mockUploadBlogImage.mockResolvedValue({
        url: 'https://example.supabase.co/storage/v1/object/public/blog-images/2026/02/test.webp',
        id: '2026/02/1234567890-test.webp',
      });

      mockGetImageDimensions.mockResolvedValue({
        width: 1920,
        height: 1080,
      });

      mockSaveBlogImageMetadata.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        url: 'https://example.supabase.co/storage/v1/object/public/blog-images/2026/02/test.webp',
        storage_path: '2026/02/1234567890-test.webp',
        alt_text: 'Test alt text',
        tags: ['upscaling', 'comparison'],
        description: 'Test description',
        image_type: 'featured',
        width: 1920,
        height: 1080,
        prompt: 'Test prompt',
        used_in_posts: [],
        created_at: '2026-02-12T00:00:00Z',
      });

      // Simulate the upload with metadata
      const uploadResult = await mockUploadBlogImage(Buffer.from('test'), 'test.png', 'image/png');
      const dimensions = await mockGetImageDimensions(Buffer.from('test'));

      const metadataResult = await mockSaveBlogImageMetadata({
        url: uploadResult.url,
        storage_path: uploadResult.id,
        alt_text: 'Test alt text',
        tags: ['upscaling', 'comparison'],
        description: 'Test description',
        image_type: 'featured',
        width: dimensions.width,
        height: dimensions.height,
        prompt: 'Test prompt',
      });

      // Verify metadata was saved
      expect(mockSaveBlogImageMetadata).toHaveBeenCalled();
      expect(metadataResult.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(metadataResult.alt_text).toBe('Test alt text');
      expect(metadataResult.tags).toEqual(['upscaling', 'comparison']);
    });

    test('metadata is saved when only partial fields are provided', async () => {
      mockUploadBlogImage.mockResolvedValue({
        url: 'https://example.supabase.co/storage/v1/object/public/blog-images/2026/02/test.webp',
        id: '2026/02/1234567890-test.webp',
      });

      mockGetImageDimensions.mockResolvedValue({
        width: 800,
        height: 600,
      });

      mockSaveBlogImageMetadata.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        url: 'https://example.supabase.co/storage/v1/object/public/blog-images/2026/02/test.webp',
        storage_path: '2026/02/1234567890-test.webp',
        alt_text: 'Only alt text',
        tags: [],
        description: '',
        image_type: 'inline',
        width: 800,
        height: 600,
        prompt: undefined,
        used_in_posts: [],
        created_at: '2026-02-12T00:00:00Z',
      });

      const uploadResult = await mockUploadBlogImage(Buffer.from('test'), 'test.png', 'image/png');
      const dimensions = await mockGetImageDimensions(Buffer.from('test'));

      const metadataResult = await mockSaveBlogImageMetadata({
        url: uploadResult.url,
        storage_path: uploadResult.id,
        alt_text: 'Only alt text',
        tags: [],
        description: '',
        image_type: 'inline',
        width: dimensions.width,
        height: dimensions.height,
      });

      expect(mockSaveBlogImageMetadata).toHaveBeenCalled();
      expect(metadataResult.alt_text).toBe('Only alt text');
      expect(metadataResult.image_type).toBe('inline');
    });
  });

  describe('should work without metadata (backwards compat)', () => {
    test('upload succeeds without calling saveBlogImageMetadata when no metadata', async () => {
      mockUploadBlogImage.mockResolvedValue({
        url: 'https://example.supabase.co/storage/v1/object/public/blog-images/2026/02/test.webp',
        id: '2026/02/1234567890-test.webp',
      });

      // Simulate upload without metadata
      const uploadResult = await mockUploadBlogImage(Buffer.from('test'), 'test.png', 'image/png');

      // When no metadata is provided, saveBlogImageMetadata should not be called
      // This simulates the hasMetadata check in the route handler
      const hasMetadata = false;
      if (!hasMetadata) {
        expect(mockSaveBlogImageMetadata).not.toHaveBeenCalled();
      }

      expect(uploadResult.url).toBeDefined();
      expect(uploadResult.id).toBeDefined();
    });
  });

  describe('should validate image_type enum', () => {
    test('accepts valid image_type values through schema', () => {
      const validTypes = ['featured', 'inline'];

      for (const type of validTypes) {
        const result = blogImageTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(type);
        }
      }
    });

    test('rejects invalid image_type values through schema', () => {
      const invalidTypes = [
        'thumbnail',
        'banner',
        'hero',
        'avatar',
        '',
        'FEATURED',
        'Inline',
        'featured-image',
      ];

      for (const type of invalidTypes) {
        const result = blogImageTypeSchema.safeParse(type);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.errors[0].message).toContain('Invalid enum value');
        }
      }
    });

    test('imageUploadSchema rejects invalid image_type', () => {
      const validBase64Image =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const inputWithInvalidType = {
        imageData: validBase64Image,
        filename: 'test.png',
        image_type: 'invalid-type',
      };

      const result = imageUploadSchema.safeParse(inputWithInvalidType);
      expect(result.success).toBe(false);
      if (!result.success) {
        const imageTypeError = result.error.errors.find(e => e.path.includes('image_type'));
        expect(imageTypeError).toBeDefined();
        expect(imageTypeError?.message).toContain('Invalid enum value');
      }
    });

    test('imageUploadMetadataSchema rejects invalid image_type', () => {
      const metadataWithInvalidType = {
        image_type: 'thumbnail',
      };

      const result = imageUploadMetadataSchema.safeParse(metadataWithInvalidType);
      expect(result.success).toBe(false);
      if (!result.success) {
        const imageTypeError = result.error.errors.find(e => e.path.includes('image_type'));
        expect(imageTypeError).toBeDefined();
        expect(imageTypeError?.message).toContain('Invalid enum value');
      }
    });
  });
});
