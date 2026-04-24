import { describe, test, expect } from 'vitest';
import {
  GALLERY_LIMITS,
  GALLERY_STORAGE_CONFIG,
  GALLERY_QUERY_CONFIG,
  GALLERY_CONFIG,
  getGalleryLimit,
  canSaveMoreImages,
  getRemainingSlots,
  type GalleryTier,
} from '@shared/config/gallery.config';

describe('Gallery Configuration', () => {
  describe('GALLERY_LIMITS', () => {
    test('should define limits for all subscription tiers', () => {
      const expectedTiers: GalleryTier[] = ['free', 'starter', 'hobby', 'pro', 'business'];

      for (const tier of expectedTiers) {
        expect(GALLERY_LIMITS[tier]).toBeDefined();
        expect(typeof GALLERY_LIMITS[tier]).toBe('number');
      }
    });

    test('should have valid positive limits for all tiers', () => {
      const tiers = Object.keys(GALLERY_LIMITS) as GalleryTier[];

      for (const tier of tiers) {
        expect(GALLERY_LIMITS[tier]).toBeGreaterThan(0);
        expect(Number.isInteger(GALLERY_LIMITS[tier])).toBe(true);
      }
    });

    test('should have limits that increase with tier level', () => {
      expect(GALLERY_LIMITS.free).toBeLessThan(GALLERY_LIMITS.starter);
      expect(GALLERY_LIMITS.starter).toBeLessThan(GALLERY_LIMITS.hobby);
      expect(GALLERY_LIMITS.hobby).toBeLessThan(GALLERY_LIMITS.pro);
      expect(GALLERY_LIMITS.pro).toBeLessThan(GALLERY_LIMITS.business);
    });

    test('should have correct specific values per PRD requirements', () => {
      expect(GALLERY_LIMITS.free).toBe(5);
      expect(GALLERY_LIMITS.starter).toBe(50);
      expect(GALLERY_LIMITS.hobby).toBe(150);
      expect(GALLERY_LIMITS.pro).toBe(500);
      expect(GALLERY_LIMITS.business).toBe(2000);
    });
  });

  describe('GALLERY_STORAGE_CONFIG', () => {
    test('should have correct bucket name', () => {
      expect(GALLERY_STORAGE_CONFIG.bucketName).toBe('saved-images');
    });

    test('should have 10MB max file size', () => {
      expect(GALLERY_STORAGE_CONFIG.maxFileSizeBytes).toBe(10 * 1024 * 1024);
    });

    test('should allow webp, jpeg, and png mime types', () => {
      expect(GALLERY_STORAGE_CONFIG.allowedMimeTypes).toContain('image/webp');
      expect(GALLERY_STORAGE_CONFIG.allowedMimeTypes).toContain('image/jpeg');
      expect(GALLERY_STORAGE_CONFIG.allowedMimeTypes).toContain('image/png');
      expect(GALLERY_STORAGE_CONFIG.allowedMimeTypes.length).toBe(3);
    });

    test('should have correct path pattern', () => {
      expect(GALLERY_STORAGE_CONFIG.pathPattern).toBe('{user_id}/{filename}');
    });
  });

  describe('GALLERY_QUERY_CONFIG', () => {
    test('should have default page size of 20', () => {
      expect(GALLERY_QUERY_CONFIG.defaultPageSize).toBe(20);
    });

    test('should have max page size of 100', () => {
      expect(GALLERY_QUERY_CONFIG.maxPageSize).toBe(100);
    });

    test('should have default sort order', () => {
      expect(GALLERY_QUERY_CONFIG.defaultSortOrder).toBe('created_at_desc');
    });
  });

  describe('GALLERY_CONFIG', () => {
    test('should combine all config sections', () => {
      expect(GALLERY_CONFIG.limits).toBe(GALLERY_LIMITS);
      expect(GALLERY_CONFIG.storage).toBe(GALLERY_STORAGE_CONFIG);
      expect(GALLERY_CONFIG.query).toBe(GALLERY_QUERY_CONFIG);
    });
  });

  describe('getGalleryLimit', () => {
    test('should return correct limit for free tier', () => {
      expect(getGalleryLimit('free')).toBe(5);
    });

    test('should return correct limit for starter tier', () => {
      expect(getGalleryLimit('starter')).toBe(50);
    });

    test('should return correct limit for hobby tier', () => {
      expect(getGalleryLimit('hobby')).toBe(150);
    });

    test('should return correct limit for pro tier', () => {
      expect(getGalleryLimit('pro')).toBe(500);
    });

    test('should return correct limit for business tier', () => {
      expect(getGalleryLimit('business')).toBe(2000);
    });
  });

  describe('canSaveMoreImages', () => {
    test('should return true when under limit', () => {
      expect(canSaveMoreImages(0, 'free')).toBe(true);
      expect(canSaveMoreImages(4, 'free')).toBe(true);
      expect(canSaveMoreImages(49, 'starter')).toBe(true);
      expect(canSaveMoreImages(499, 'pro')).toBe(true);
    });

    test('should return false when at limit', () => {
      expect(canSaveMoreImages(5, 'free')).toBe(false);
      expect(canSaveMoreImages(50, 'starter')).toBe(false);
      expect(canSaveMoreImages(150, 'hobby')).toBe(false);
      expect(canSaveMoreImages(500, 'pro')).toBe(false);
      expect(canSaveMoreImages(2000, 'business')).toBe(false);
    });

    test('should return false when over limit', () => {
      expect(canSaveMoreImages(6, 'free')).toBe(false);
      expect(canSaveMoreImages(100, 'starter')).toBe(false);
      expect(canSaveMoreImages(1000, 'hobby')).toBe(false);
    });
  });

  describe('getRemainingSlots', () => {
    test('should return correct remaining slots when under limit', () => {
      expect(getRemainingSlots(0, 'free')).toBe(5);
      expect(getRemainingSlots(3, 'free')).toBe(2);
      expect(getRemainingSlots(40, 'starter')).toBe(10);
      expect(getRemainingSlots(100, 'hobby')).toBe(50);
    });

    test('should return 0 when at limit', () => {
      expect(getRemainingSlots(5, 'free')).toBe(0);
      expect(getRemainingSlots(50, 'starter')).toBe(0);
      expect(getRemainingSlots(150, 'hobby')).toBe(0);
      expect(getRemainingSlots(500, 'pro')).toBe(0);
      expect(getRemainingSlots(2000, 'business')).toBe(0);
    });

    test('should return 0 when over limit', () => {
      expect(getRemainingSlots(10, 'free')).toBe(0);
      expect(getRemainingSlots(100, 'starter')).toBe(0);
      expect(getRemainingSlots(500, 'hobby')).toBe(0);
    });

    test('should handle edge case of zero images', () => {
      expect(getRemainingSlots(0, 'free')).toBe(5);
      expect(getRemainingSlots(0, 'business')).toBe(2000);
    });
  });
});
