/**
 * Related Pages Module Tests
 * Tests for getRelatedPages and getRelatedPagesByCategory functions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getRelatedPages, getRelatedPagesByCategory } from '@/lib/seo/related-pages';
import type { IRelatedPage } from '@/lib/seo/related-pages';

// Mock the data loader
vi.mock('@/lib/seo/data-loader', () => ({
  getAllPlatforms: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'midjourney-upscaler',
        platformName: 'Midjourney',
        description: 'Enhance Midjourney AI images',
        category: 'platforms',
        relatedFormats: ['png', 'jpeg'],
      },
      {
        slug: 'stable-diffusion-upscaler',
        platformName: 'Stable Diffusion',
        description: 'Enhance SD images',
        category: 'platforms',
        relatedFormats: ['webp'],
      },
      {
        slug: 'dalle-upscaler',
        platformName: 'DALL-E',
        description: 'Enhance DALL-E images',
        category: 'platforms',
        relatedFormats: ['png'],
      },
    ])
  ),
  getAllFormats: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'png-upscaler',
        formatName: 'PNG',
        description: 'Upscale PNG images',
        category: 'formats',
      },
      {
        slug: 'jpeg-upscaler',
        formatName: 'JPEG',
        description: 'Upscale JPEG images',
        category: 'formats',
      },
    ])
  ),
  getAllFormatScale: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'png-upscale-2x',
        format: 'PNG',
        scaleFactor: '2x',
        formatDescription: 'PNG format description',
        category: 'format-scale',
      },
      {
        slug: 'jpeg-upscale-4x',
        format: 'JPEG',
        scaleFactor: '4x',
        formatDescription: 'JPEG format description',
        category: 'format-scale',
      },
    ])
  ),
  getAllPlatformFormat: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'midjourney-upscaler-png',
        platform: 'Midjourney',
        format: 'PNG',
        platformDescription: 'Midjourney + PNG',
        category: 'platform-format',
      },
      {
        slug: 'stable-diffusion-upscaler-webp',
        platform: 'Stable Diffusion',
        format: 'WebP',
        platformDescription: 'SD + WebP',
        category: 'platform-format',
      },
    ])
  ),
  getAllDeviceUse: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'mobile-social-media-upscaler',
        device: 'mobile',
        useCase: 'social media',
        useCaseDescription: 'Mobile social media optimization',
        category: 'device-use',
      },
      {
        slug: 'desktop-professional-upscaler',
        device: 'desktop',
        useCase: 'professional',
        useCaseDescription: 'Desktop professional use',
        category: 'device-use',
      },
    ])
  ),
  getAllTools: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'image-upscaler',
        toolName: 'Image Upscaler',
        description: 'General image upscaling tool',
        category: 'tools',
      },
    ])
  ),
}));

describe('Related Pages Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRelatedPages', () => {
    it('should return related pages for platform category', async () => {
      const pages = await getRelatedPages('platforms', 'midjourney-upscaler', 'en');

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(6);

      // Check that pages have required fields
      pages.forEach((page: IRelatedPage) => {
        expect(page).toHaveProperty('slug');
        expect(page).toHaveProperty('title');
        expect(page).toHaveProperty('category');
        expect(page).toHaveProperty('url');
        expect(page.slug).not.toBe('midjourney-upscaler'); // Should not include current page
      });
    });

    it('should include pages from same category for platform', async () => {
      const pages = await getRelatedPages('platforms', 'midjourney-upscaler', 'en');

      // Should include other platforms
      const platformPages = pages.filter(p => p.category === 'platforms');
      expect(platformPages.length).toBeGreaterThan(0);
      expect(platformPages.length).toBeLessThanOrEqual(2);
    });

    it('should include related category pages for platform', async () => {
      const pages = await getRelatedPages('platforms', 'midjourney-upscaler', 'en');

      // Should include format-scale pages as related content
      const formatScalePages = pages.filter(p => p.category === 'format-scale');
      expect(formatScalePages.length).toBeGreaterThan(0);
    });

    it('should return related pages for format category', async () => {
      const pages = await getRelatedPages('formats', 'png-upscaler', 'en');

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(6);

      // Check that pages have required fields
      pages.forEach((page: IRelatedPage) => {
        expect(page).toHaveProperty('slug');
        expect(page).toHaveProperty('title');
        expect(page).toHaveProperty('category');
        expect(page).toHaveProperty('url');
        expect(page.slug).not.toBe('png-upscaler'); // Should not include current page
      });
    });

    it('should return related pages for format-scale category', async () => {
      const pages = await getRelatedPages('format-scale', 'png-upscale-2x', 'en');

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(6);

      // Check locale in URL
      if (pages.length > 0) {
        expect(pages[0].locale).toBe('en');
      }
    });

    it('should return related pages for platform-format category', async () => {
      const pages = await getRelatedPages('platform-format', 'midjourney-upscaler-png', 'en');

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(6);
    });

    it('should return related pages for device-use category', async () => {
      const pages = await getRelatedPages('device-use', 'mobile-social-media-upscaler', 'en');

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(6);
    });

    it('should handle locale parameter correctly', async () => {
      const pagesEn = await getRelatedPages('platforms', 'midjourney-upscaler', 'en');
      const pagesEs = await getRelatedPages('platforms', 'midjourney-upscaler', 'es');

      expect(pagesEn).toBeDefined();
      expect(pagesEs).toBeDefined();

      // Check that locale is set correctly
      if (pagesEn.length > 0) {
        expect(pagesEn[0].locale).toBe('en');
      }
      if (pagesEs.length > 0) {
        expect(pagesEs[0].locale).toBe('es');
        // Check URL includes locale prefix
        expect(pagesEs[0].url).toContain('/es/');
      }
    });

    it('should return generic related pages for unknown categories', async () => {
      const pages = await getRelatedPages('tools' as any, 'some-tool', 'en');

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(4);

      // All pages should be tools category
      pages.forEach((page: IRelatedPage) => {
        expect(page.category).toBe('tools');
      });
    });

    it('should not exceed 6 pages', async () => {
      const pages = await getRelatedPages('platforms', 'midjourney-upscaler', 'en');

      expect(pages.length).toBeLessThanOrEqual(6);
    });

    it('should return at least 4 pages when data is available', async () => {
      const pages = await getRelatedPages('platforms', 'midjourney-upscaler', 'en');

      expect(pages.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('getRelatedPagesByCategory', () => {
    it('should return pages for platforms category', async () => {
      const pages = await getRelatedPagesByCategory('platforms', undefined, 'en', 6);

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(6);

      pages.forEach((page: IRelatedPage) => {
        expect(page.category).toBe('platforms');
        expect(page.url).toContain('/platforms/');
      });
    });

    it('should exclude specified slug', async () => {
      const pages = await getRelatedPagesByCategory('platforms', 'midjourney-upscaler', 'en', 10);

      expect(pages).toBeDefined();
      pages.forEach((page: IRelatedPage) => {
        expect(page.slug).not.toBe('midjourney-upscaler');
      });
    });

    it('should respect limit parameter', async () => {
      const pages = await getRelatedPagesByCategory('platforms', undefined, 'en', 2);

      expect(pages.length).toBeLessThanOrEqual(2);
    });

    it('should include locale in URL for non-English locales', async () => {
      const pages = await getRelatedPagesByCategory('platforms', undefined, 'es', 2);

      if (pages.length > 0) {
        expect(pages[0].url).toContain('/es/platforms/');
        expect(pages[0].locale).toBe('es');
      }
    });

    it('should not include locale prefix for English', async () => {
      const pages = await getRelatedPagesByCategory('platforms', undefined, 'en', 2);

      if (pages.length > 0) {
        expect(pages[0].url).not.toContain('/en/platforms/');
        expect(pages[0].url).toMatch(/^\/platforms\//);
      }
    });

    it('should return pages for formats category', async () => {
      const pages = await getRelatedPagesByCategory('formats', undefined, 'en', 6);

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);

      pages.forEach((page: IRelatedPage) => {
        expect(page.category).toBe('formats');
      });
    });

    it('should return pages for format-scale category', async () => {
      const pages = await getRelatedPagesByCategory('format-scale', undefined, 'en', 6);

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);

      pages.forEach((page: IRelatedPage) => {
        expect(page.category).toBe('format-scale');
      });
    });

    it('should return pages for platform-format category', async () => {
      const pages = await getRelatedPagesByCategory('platform-format', undefined, 'en', 6);

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);

      pages.forEach((page: IRelatedPage) => {
        expect(page.category).toBe('platform-format');
      });
    });

    it('should return pages for device-use category', async () => {
      const pages = await getRelatedPagesByCategory('device-use', undefined, 'en', 6);

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);

      pages.forEach((page: IRelatedPage) => {
        expect(page.category).toBe('device-use');
      });
    });

    it('should return pages for tools category', async () => {
      const pages = await getRelatedPagesByCategory('tools', undefined, 'en', 6);

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);

      pages.forEach((page: IRelatedPage) => {
        expect(page.category).toBe('tools');
      });
    });

    it('should return empty array for unknown category', async () => {
      const pages = await getRelatedPagesByCategory('unknown' as any, undefined, 'en', 6);

      expect(pages).toEqual([]);
    });
  });
});
