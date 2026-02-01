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
  getAllContentPages: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'upscale-digital-art',
        title: 'Upscale Digital Art',
        contentDescription: 'Upscale digital art to print quality',
        category: 'content',
      },
      {
        slug: 'upscale-anime',
        title: 'Upscale Anime',
        contentDescription: 'Enhance anime and manga to HD',
        category: 'content',
      },
      {
        slug: 'upscale-portraits',
        title: 'Upscale Portraits',
        contentDescription: 'Enhance faces and headshots',
        category: 'content',
      },
      {
        slug: 'upscale-logos',
        title: 'Upscale Logo',
        contentDescription: 'Enlarge logos without loss',
        category: 'content',
      },
    ])
  ),
  getAllCameraRawPages: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'upscale-fuji-raf-images',
        title: 'Fujifilm RAF Upscaling',
        description: 'Enhance Fuji RAF RAW files',
        category: 'camera-raw',
      },
      {
        slug: 'upscale-arw-images',
        title: 'Sony ARW RAW Upscaling',
        description: 'Enhance Sony ARW RAW files',
        category: 'camera-raw',
      },
      {
        slug: 'upscale-nef-images',
        title: 'NEF RAW Upscaling',
        description: 'Enhance Nikon NEF RAW files',
        category: 'camera-raw',
      },
      {
        slug: 'upscale-cr2-images',
        title: 'Canon CR2 RAW Upscaling',
        description: 'Enhance Canon CR2 RAW files',
        category: 'camera-raw',
      },
    ])
  ),
  getAllBulkToolsPages: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'bulk-image-compressor',
        title: 'Bulk Image Compressor',
        description: 'Compress multiple images',
        category: 'bulk-tools',
      },
      {
        slug: 'bulk-image-resizer',
        title: 'Bulk Image Resizer',
        description: 'Resize multiple photos',
        category: 'bulk-tools',
      },
    ])
  ),
  getAllDeviceOptimizationPages: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'mobile-device-image-optimization',
        title: 'Mobile Image Optimization',
        description: 'iOS and Android performance',
        category: 'device-optimization',
      },
      {
        slug: 'desktop-image-optimization',
        title: 'Desktop Image Optimization',
        description: 'Windows, Mac, Linux performance',
        category: 'device-optimization',
      },
      {
        slug: 'tablet-image-optimization',
        title: 'Tablet Image Optimization',
        description: 'iPad and Android tablets display',
        category: 'device-optimization',
      },
      {
        slug: 'smart-tv-image-optimization',
        title: 'Smart TV Image Optimization',
        description: '4K, 8K, HDR display quality',
        category: 'device-optimization',
      },
    ])
  ),
  getAllIndustryInsightsPages: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'real-estate-photo-enhancement',
        title: 'Real Estate Photo Enhancement',
        description: 'Boost appeal with AI',
        category: 'industry-insights',
      },
      {
        slug: 'ecommerce-product-photo-enhancement',
        title: 'E-commerce Product Photo Enhancement',
        description: 'Boost sales with AI',
        category: 'industry-insights',
      },
      {
        slug: 'travel-tourism-enhancement',
        title: 'Travel Tourism Photo Enhancement',
        description: 'AI for marketing',
        category: 'industry-insights',
      },
      {
        slug: 'graphic-design-workflow-enhancement',
        title: 'Graphic Design Workflow',
        description: 'AI enhancement for designers',
        category: 'industry-insights',
      },
    ])
  ),
  getAllPhotoRestorationPages: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'family-photo-preservation',
        title: 'Family Photo Preservation',
        description: 'Save family history and memories',
        category: 'photo-restoration',
      },
      {
        slug: 'damaged-photo-repair',
        title: 'Damaged Photo Repair',
        description: 'Fix torn and scratched photos',
        category: 'photo-restoration',
      },
      {
        slug: 'vintage-photo-colorization',
        title: 'Vintage Photo Colorization',
        description: 'Black and white to color',
        category: 'photo-restoration',
      },
      {
        slug: 'old-photo-restoration-guide',
        title: 'Old Photo Restoration Guide',
        description: 'Restore damaged vintage photos',
        category: 'photo-restoration',
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

    // Tests for new categories (content, camera-raw, bulk-tools, device-optimization, industry-insights, photo-restoration)
    it('should return pages for content category', async () => {
      const pages = await getRelatedPagesByCategory('content' as any, undefined, 'en', 6);

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);

      pages.forEach((page: IRelatedPage) => {
        expect(page.category).toBe('content');
        expect(page.url).toContain('/content/');
      });
    });

    it('should return pages for camera-raw category', async () => {
      const pages = await getRelatedPagesByCategory('camera-raw' as any, undefined, 'en', 6);

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);

      pages.forEach((page: IRelatedPage) => {
        expect(page.category).toBe('camera-raw');
        expect(page.url).toContain('/camera-raw/');
      });
    });

    it('should return pages for bulk-tools category', async () => {
      const pages = await getRelatedPagesByCategory('bulk-tools' as any, undefined, 'en', 6);

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);

      pages.forEach((page: IRelatedPage) => {
        expect(page.category).toBe('bulk-tools');
        expect(page.url).toContain('/bulk-tools/');
      });
    });

    it('should return pages for device-optimization category', async () => {
      const pages = await getRelatedPagesByCategory(
        'device-optimization' as any,
        undefined,
        'en',
        6
      );

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);

      pages.forEach((page: IRelatedPage) => {
        expect(page.category).toBe('device-optimization');
        expect(page.url).toContain('/device-optimization/');
      });
    });

    it('should return pages for industry-insights category', async () => {
      const pages = await getRelatedPagesByCategory('industry-insights' as any, undefined, 'en', 6);

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);

      pages.forEach((page: IRelatedPage) => {
        expect(page.category).toBe('industry-insights');
        expect(page.url).toContain('/industry-insights/');
      });
    });

    it('should return pages for photo-restoration category', async () => {
      const pages = await getRelatedPagesByCategory('photo-restoration' as any, undefined, 'en', 6);

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);

      pages.forEach((page: IRelatedPage) => {
        expect(page.category).toBe('photo-restoration');
        expect(page.url).toContain('/photo-restoration/');
      });
    });

    // Tests for getRelatedPages with new categories
    it('should return related pages for content category', async () => {
      const pages = await getRelatedPages('content' as any, 'upscale-digital-art', 'en');

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(6);

      // Check that current page is excluded
      pages.forEach((page: IRelatedPage) => {
        expect(page.slug).not.toBe('upscale-digital-art');
      });
    });

    it('should return related pages for camera-raw category', async () => {
      const pages = await getRelatedPages('camera-raw' as any, 'upscale-fuji-raf-images', 'en');

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(6);

      // Check that current page is excluded
      pages.forEach((page: IRelatedPage) => {
        expect(page.slug).not.toBe('upscale-fuji-raf-images');
      });
    });

    it('should return related pages for bulk-tools category', async () => {
      const pages = await getRelatedPages('bulk-tools' as any, 'bulk-image-compressor', 'en');

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(6);

      // Check that current page is excluded
      pages.forEach((page: IRelatedPage) => {
        expect(page.slug).not.toBe('bulk-image-compressor');
      });
    });

    it('should return related pages for device-optimization category', async () => {
      const pages = await getRelatedPages(
        'device-optimization' as any,
        'mobile-device-image-optimization',
        'en'
      );

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(6);

      // Check that current page is excluded
      pages.forEach((page: IRelatedPage) => {
        expect(page.slug).not.toBe('mobile-device-image-optimization');
      });
    });

    it('should return related pages for industry-insights category', async () => {
      const pages = await getRelatedPages(
        'industry-insights' as any,
        'real-estate-photo-enhancement',
        'en'
      );

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(6);

      // Check that current page is excluded
      pages.forEach((page: IRelatedPage) => {
        expect(page.slug).not.toBe('real-estate-photo-enhancement');
      });
    });

    it('should return related pages for photo-restoration category', async () => {
      const pages = await getRelatedPages(
        'photo-restoration' as any,
        'family-photo-preservation',
        'en'
      );

      expect(pages).toBeDefined();
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(6);

      // Check that current page is excluded
      pages.forEach((page: IRelatedPage) => {
        expect(page.slug).not.toBe('family-photo-preservation');
      });
    });
  });
});
