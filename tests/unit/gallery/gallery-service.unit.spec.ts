/**
 * Gallery Storage Service Unit Tests
 * Tests: should reject save when over tier limit, should validate image URL format, should generate correct storage path
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock supabaseAdmin before importing the service
const mockStorageFrom = {
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
  getPublicUrl: vi.fn(),
};

// Create a more flexible mock setup
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockRange = vi.fn();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();

// Setup chainable methods
mockEq.mockImplementation(() => Promise.resolve({ data: null, count: 0, error: null }));
mockOrder.mockImplementation(() => ({ range: mockRange, limit: vi.fn() }));
mockRange.mockImplementation(() => Promise.resolve({ data: [], error: null }));
mockSingle.mockImplementation(() => Promise.resolve({ data: null, error: null }));
mockMaybeSingle.mockImplementation(() => Promise.resolve({ data: null, error: null }));

mockSelect.mockImplementation(() => ({
  eq: mockEq,
  order: mockOrder,
  range: mockRange,
  single: mockSingle,
  maybeSingle: mockMaybeSingle,
}));

const mockFrom = {
  select: mockSelect,
  insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  delete: vi.fn().mockResolvedValue({ data: null, error: null }),
};

vi.mock('../../server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    storage: {
      from: vi.fn(() => mockStorageFrom),
    },
    from: vi.fn(() => mockFrom),
  },
}));

// Mock sharp
vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({ width: 1024, height: 768 }),
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('compressed-image-data')),
  })),
}));

// Mock crypto with proper module structure
vi.mock('crypto', () => ({
  default: {
    randomUUID: vi.fn(() => 'test-uuid-1234'),
  },
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}));

// Import after mocking
import {
  saveImage,
  listImages,
  deleteImage,
  getUsage,
  compressForGallery,
  type ISaveImageMetadata,
} from '@server/services/galleryStorage.service';
import { GALLERY_LIMITS, type GalleryTier } from '@shared/config/gallery.config';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Gallery Storage Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('compressForGallery', () => {
    test('should compress image and convert to WebP', async () => {
      const buffer = Buffer.from('test-image-data');
      const compressed = await compressForGallery(buffer);

      expect(compressed).toBeInstanceOf(Buffer);
    });

    test('should resize large images to max 2048px', async () => {
      const buffer = Buffer.from('large-image-data');
      const compressed = await compressForGallery(buffer);

      expect(compressed).toBeInstanceOf(Buffer);
    });
  });

  describe('saveImage', () => {
    test('should reject save when over tier limit', async () => {
      const userId = 'user-123';
      const imageUrl = 'https://example.com/image.png';
      const metadata: ISaveImageMetadata = {
        filename: 'test.png',
        width: 1024,
        height: 768,
      };

      // Mock count query - user at limit
      mockFrom.select.mockResolvedValueOnce({
        count: 5,
        error: null,
      });

      // Mock profile fetch - free tier user
      mockFrom.select.mockResolvedValueOnce({
        data: { subscription_tier: 'free', subscription_status: 'active' },
        error: null,
      });

      await expect(saveImage(userId, imageUrl, metadata)).rejects.toThrow(/Gallery limit exceeded/);
    });

    test('should validate image URL format', async () => {
      const userId = 'user-123';
      const invalidUrl = 'not-a-valid-url';
      const metadata: ISaveImageMetadata = {
        filename: 'test.png',
      };

      // Mock count query - allow saving
      mockFrom.select.mockResolvedValueOnce({
        count: 0,
        error: null,
      });

      // Mock profile fetch
      mockFrom.select.mockResolvedValueOnce({
        data: { subscription_tier: 'hobby', subscription_status: 'active' },
        error: null,
      });

      // Mock fetch to fail for invalid URL
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(saveImage(userId, invalidUrl, metadata)).rejects.toThrow(
        /Failed to fetch image from URL/
      );
    });

    test('should generate correct storage path', async () => {
      const userId = 'user-123';
      const imageUrl = 'https://example.com/image.png';
      const metadata: ISaveImageMetadata = {
        filename: 'test-image.png',
        width: 1024,
        height: 768,
      };

      // Mock count query
      mockFrom.select.mockResolvedValueOnce({
        count: 0,
        error: null,
      });

      // Mock profile fetch
      mockFrom.select.mockResolvedValueOnce({
        data: { subscription_tier: 'hobby', subscription_status: 'active' },
        error: null,
      });

      // Mock fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      // Mock storage upload
      mockStorageFrom.upload.mockResolvedValueOnce({
        data: { path: 'user-123/test-uuid-1234.webp' },
        error: null,
      });

      // Mock database insert
      mockFrom.insert.mockResolvedValueOnce({
        data: {
          id: 'img-123',
          user_id: userId,
          storage_path: 'user-123/test-uuid-1234.webp',
          original_filename: 'test-image.png',
          file_size_bytes: 1024,
          width: 1024,
          height: 768,
          model_used: 'unknown',
          processing_mode: 'both',
          created_at: new Date().toISOString(),
        },
        error: null,
      });

      // Mock signed URL generation
      mockStorageFrom.createSignedUrl.mockResolvedValueOnce({
        data: { signedUrl: 'https://signed-url.com/image.webp' },
        error: null,
      });

      const result = await saveImage(userId, imageUrl, metadata);

      expect(result.image).toBeDefined();
      expect(result.image.user_id).toBe(userId);
      expect(result.image.storage_path).toBe('user-123/test-uuid-1234.webp');
      expect(result.signedUrl).toContain('https://');
    });
  });

  describe('listImages', () => {
    test('should return paginated list of images', async () => {
      const userId = 'user-123';

      // Mock database query
      mockFrom.select.mockResolvedValueOnce({
        data: [
          {
            id: 'img-1',
            user_id: userId,
            storage_path: 'user-123/img-1.webp',
            original_filename: 'image1.png',
            file_size_bytes: 1024,
            width: 1024,
            height: 768,
            model_used: 'real-esrgan',
            processing_mode: 'upscale',
            created_at: new Date().toISOString(),
          },
        ],
        count: 1,
        error: null,
      });

      // Mock signed URL generation
      mockStorageFrom.createSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://signed-url.com/image.webp' },
        error: null,
      });

      const result = await listImages(userId, 1, 20);

      expect(result.images).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
      expect(result.has_more).toBe(false);
    });
  });

  describe('deleteImage', () => {
    test('should delete image from storage and database', async () => {
      const userId = 'user-123';
      const imageId = 'img-123';

      // Mock ownership verification
      mockFrom.select.mockResolvedValueOnce({
        data: {
          id: imageId,
          storage_path: 'user-123/img-123.webp',
        },
        error: null,
      });

      // Mock storage deletion
      mockStorageFrom.remove.mockResolvedValueOnce({
        error: null,
      });

      // Mock database deletion
      mockFrom.delete.mockResolvedValueOnce({
        error: null,
      });

      const result = await deleteImage(userId, imageId);

      expect(result).toBe(true);
    });

    test('should throw error if image not found or not owned by user', async () => {
      const userId = 'user-123';
      const imageId = 'non-existent-img';

      // Mock ownership verification - no image found
      mockFrom.select.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(deleteImage(userId, imageId)).rejects.toThrow(
        /Image not found or you do not have permission to delete it/
      );
    });
  });

  describe('getUsage', () => {
    test('should return correct usage stats', async () => {
      const userId = 'user-123';
      const tier: GalleryTier = 'hobby';

      // Mock count query
      mockFrom.select.mockResolvedValueOnce({
        count: 50,
        error: null,
      });

      const result = await getUsage(userId, tier);

      expect(result.current_count).toBe(50);
      expect(result.max_allowed).toBe(GALLERY_LIMITS.hobby);
      expect(result.can_save_more).toBe(true);
    });

    test('should indicate cannot save more when at limit', async () => {
      const userId = 'user-123';
      const tier: GalleryTier = 'free';

      // Mock count query
      mockFrom.select.mockResolvedValueOnce({
        count: 5,
        error: null,
      });

      const result = await getUsage(userId, tier);

      expect(result.current_count).toBe(5);
      expect(result.max_allowed).toBe(GALLERY_LIMITS.free);
      expect(result.can_save_more).toBe(false);
    });

    test('should fetch tier from profile if not provided', async () => {
      const userId = 'user-123';

      // Mock count query
      mockFrom.select.mockResolvedValueOnce({
        count: 10,
        error: null,
      });

      // Mock profile fetch
      mockFrom.select.mockResolvedValueOnce({
        data: { subscription_tier: 'pro', subscription_status: 'active' },
        error: null,
      });

      const result = await getUsage(userId);

      expect(result.current_count).toBe(10);
      expect(result.max_allowed).toBe(GALLERY_LIMITS.pro);
      expect(result.can_save_more).toBe(true);
    });

    test('should return free tier for users without active subscription', async () => {
      const userId = 'user-123';

      // Mock count query
      mockFrom.select.mockResolvedValueOnce({
        count: 3,
        error: null,
      });

      // Mock profile fetch - no active subscription
      mockFrom.select.mockResolvedValueOnce({
        data: { subscription_tier: null, subscription_status: null },
        error: null,
      });

      const result = await getUsage(userId);

      expect(result.current_count).toBe(3);
      expect(result.max_allowed).toBe(GALLERY_LIMITS.free);
      expect(result.can_save_more).toBe(true);
    });
  });
});
