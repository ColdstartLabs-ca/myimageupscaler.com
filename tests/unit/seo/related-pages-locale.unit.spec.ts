/**
 * Related Pages Locale Prefix Unit Tests
 *
 * Tests that buildUrl in related-pages.ts respects English-only categories
 * and fixes GSC redirect errors where locale prefixes
 * were incorrectly added to English-only category links.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock the data-loader module to avoid actual file I/O
vi.mock('@/lib/seo/data-loader', () => ({
  getAllFormats: vi.fn(() => Promise.resolve([])),
  getAllPlatforms: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'midjourney',
        title: 'Midjourney',
        category: 'platforms',
        platformName: 'Midjourney',
      },
      {
        slug: 'stable-diffusion',
        title: 'Stable Diffusion',
        category: 'platforms',
        platformName: 'Stable Diffusion',
      },
    ])
  ),
  getAllFormatScale: vi.fn(() =>
    Promise.resolve([
      {
        slug: '2x-png',
        title: '2x PNG',
        category: 'format-scale',
        format: 'PNG',
        scaleFactor: '2x',
      },
    ])
  ),
  getAllPlatformFormat: vi.fn(() => Promise.resolve([])),
  getAllDeviceUse: vi.fn(() => Promise.resolve([])),
  getAllTools: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'ai-image-upscaler',
        title: 'AI Image Upscaler',
        category: 'tools',
      },
    ])
  ),
  getAllInteractiveTools: vi.fn(() => Promise.resolve([])),
  getInteractiveToolData: vi.fn(() => Promise.resolve(null)),
  getAllContentPages: vi.fn(() => Promise.resolve([])),
  getAllCameraRawPages: vi.fn(() => Promise.resolve([])),
  getAllBulkToolsPages: vi.fn(() => Promise.resolve([])),
  getAllDeviceOptimizationPages: vi.fn(() => Promise.resolve([])),
  getAllIndustryInsightsPages: vi.fn(() => Promise.resolve([])),
  getAllPhotoRestorationPages: vi.fn(() => Promise.resolve([])),
}));

describe('Related Pages Locale Prefix Handling', () => {
  let getRelatedPages: (typeof import('@/lib/seo/related-pages'))['getRelatedPages'];
  let getRelatedPagesByCategory: (typeof import('@/lib/seo/related-pages'))['getRelatedPagesByCategory'];
  let isCategoryEnglishOnly: (typeof import('@/lib/seo/localization-config'))['isCategoryEnglishOnly'];

  beforeAll(async () => {
    const relatedPagesModule = await import('@/lib/seo/related-pages');
    getRelatedPages = relatedPagesModule.getRelatedPages;
    getRelatedPagesByCategory = relatedPagesModule.getRelatedPagesByCategory;

    const localizationModule = await import('@/lib/seo/localization-config');
    isCategoryEnglishOnly = localizationModule.isCategoryEnglishOnly;
  });

  describe('English-only category verification', () => {
    it('platforms should be marked as English-only', () => {
      expect(isCategoryEnglishOnly('platforms')).toBe(true);
    });

    it('compare should be marked as English-only', () => {
      expect(isCategoryEnglishOnly('compare')).toBe(true);
    });

    it('bulk-tools should be marked as English-only', () => {
      expect(isCategoryEnglishOnly('bulk-tools')).toBe(true);
    });

    it('ai-features should be marked as English-only', () => {
      expect(isCategoryEnglishOnly('ai-features')).toBe(true);
    });
  });

  describe('Localized category verification', () => {
    it('tools should NOT be marked as English-only', () => {
      expect(isCategoryEnglishOnly('tools')).toBe(false);
    });

    it('formats should NOT be marked as English-only', () => {
      expect(isCategoryEnglishOnly('formats')).toBe(false);
    });

    it('format-scale should NOT be marked as English-only', () => {
      expect(isCategoryEnglishOnly('format-scale')).toBe(false);
    });

    it('guides should NOT be marked as English-only', () => {
      expect(isCategoryEnglishOnly('guides')).toBe(false);
    });
  });

  describe('getRelatedPagesByCategory - platforms (English-only)', () => {
    it('should NOT add locale prefix for platforms category with Spanish locale', async () => {
      const result = await getRelatedPagesByCategory('platforms', 'test-slug', 'es', 5);

      expect(result.length).toBeGreaterThan(0);

      // All URLs should NOT have /es/ prefix since platforms is English-only
      result.forEach(page => {
        expect(page.url).not.toMatch(/^\/es\//);
        expect(page.url).toMatch(/^\/platforms\//);
      });
    });

    it('should NOT add locale prefix for platforms with German locale', async () => {
      const result = await getRelatedPagesByCategory('platforms', 'midjourney', 'de', 5);

      result.forEach(page => {
        expect(page.url).not.toContain('/de/');
        expect(page.url).toMatch(/^\/platforms\//);
      });
    });
  });

  describe('getRelatedPagesByCategory - tools (localized)', () => {
    it('should ADD locale prefix for tools category with Spanish locale', async () => {
      const result = await getRelatedPagesByCategory('tools', 'test-slug', 'es', 5);

      expect(result.length).toBeGreaterThan(0);

      // All URLs should have /es/ prefix since tools is localized
      result.forEach(page => {
        expect(page.url).toMatch(/^\/es\/tools\//);
      });
    });
  });

  describe('English locale (default)', () => {
    it('should NOT add /en/ prefix for platforms when locale is en', async () => {
      const result = await getRelatedPagesByCategory('platforms', 'test-slug', 'en', 5);

      result.forEach(page => {
        expect(page.url).not.toContain('/en/');
        expect(page.url).toMatch(/^\/platforms\//);
      });
    });

    it('should NOT add /en/ prefix for tools when locale is en', async () => {
      const result = await getRelatedPagesByCategory('tools', 'test-slug', 'en', 5);

      result.forEach(page => {
        expect(page.url).not.toContain('/en/');
        // Tools with en locale should just be /tools/ not /en/tools/
        expect(page.url).toMatch(/^\/tools\//);
      });
    });
  });

  describe('URL format verification', () => {
    it('platforms URL should be /platforms/slug format regardless of locale', async () => {
      const esResult = await getRelatedPagesByCategory('platforms', 'test-slug', 'es', 1);
      const deResult = await getRelatedPagesByCategory('platforms', 'test-slug', 'de', 1);
      const enResult = await getRelatedPagesByCategory('platforms', 'test-slug', 'en', 1);

      // All should have same URL format without locale prefix
      expect(esResult[0].url).toMatch(/^\/platforms\//);
      expect(deResult[0].url).toMatch(/^\/platforms\//);
      expect(enResult[0].url).toMatch(/^\/platforms\//);
    });

    it('tools URL should include locale prefix for non-en locales', async () => {
      const esResult = await getRelatedPagesByCategory('tools', 'test-slug', 'es', 1);
      const deResult = await getRelatedPagesByCategory('tools', 'test-slug', 'de', 1);
      const enResult = await getRelatedPagesByCategory('tools', 'test-slug', 'en', 1);

      // Non-en should have locale prefix
      expect(esResult[0].url).toMatch(/^\/es\/tools\//);
      expect(deResult[0].url).toMatch(/^\/de\/tools\//);
      // En should NOT have locale prefix
      expect(enResult[0].url).toMatch(/^\/tools\//);
    });
  });
});
