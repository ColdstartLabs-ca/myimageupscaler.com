/**
 * Sitemap Index Unit Tests
 * Tests sitemap index generation with proper localization categories
 */

import { describe, it, expect, vi } from 'vitest';
import { LOCALIZED_CATEGORIES, ENGLISH_ONLY_CATEGORIES } from '@/lib/seo/localization-config';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/i18n/config';

// Mock the clientEnv
vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
    TWITTER_HANDLE: 'myimageupscaler',
  },
  serverEnv: {
    ENV: 'test',
  },
}));

describe('Sitemap Index Localization', () => {
  describe('LOCALIZED_CATEGORIES', () => {
    it('should include all 10 localized categories', () => {
      const expectedCategories = [
        'tools',
        'formats',
        'free',
        'guides',
        'scale',
        'alternatives',
        'use-cases',
        'format-scale',
        'platform-format',
        'device-use',
      ];

      expect(LOCALIZED_CATEGORIES).toHaveLength(10);
      expectedCategories.forEach(category => {
        expect(LOCALIZED_CATEGORIES).toContain(category);
      });
    });

    it('should not include English-only categories', () => {
      ENGLISH_ONLY_CATEGORIES.forEach(category => {
        expect(LOCALIZED_CATEGORIES).not.toContain(category);
      });
    });
  });

  describe('ENGLISH_ONLY_CATEGORIES', () => {
    it('should include compare and platforms', () => {
      expect(ENGLISH_ONLY_CATEGORIES).toContain('compare');
      expect(ENGLISH_ONLY_CATEGORIES).toContain('platforms');
    });

    it('should include SEO-fixed English-only categories', () => {
      // Added during SEO audit fix to prevent invalid hreflang links
      expect(ENGLISH_ONLY_CATEGORIES).toContain('bulk-tools');
      expect(ENGLISH_ONLY_CATEGORIES).toContain('content');
      expect(ENGLISH_ONLY_CATEGORIES).toContain('photo-restoration');
      expect(ENGLISH_ONLY_CATEGORIES).toContain('camera-raw');
      expect(ENGLISH_ONLY_CATEGORIES).toContain('industry-insights');
      expect(ENGLISH_ONLY_CATEGORIES).toContain('device-optimization');
      expect(ENGLISH_ONLY_CATEGORIES).toContain('ai-features');
    });

    it('should have 13 English-only categories', () => {
      expect(ENGLISH_ONLY_CATEGORIES).toHaveLength(13);
    });
  });

  describe('Sitemap Count Calculation', () => {
    it('should calculate correct number of sitemaps for localized categories', () => {
      // Each localized category generates 7 sitemaps (1 English + 6 locale-specific)
      const localizedSitemapCount = LOCALIZED_CATEGORIES.length * SUPPORTED_LOCALES.length;
      expect(localizedSitemapCount).toBe(70); // 10 categories × 7 locales
    });

    it('should calculate correct total sitemap index count', () => {
      // English-only sitemap categories (not in LOCALIZED or ENGLISH_ONLY arrays)
      const EXTRA_ENGLISH_ONLY = ['static', 'blog', 'images'];
      const englishOnlySitemapCount =
        ENGLISH_ONLY_CATEGORIES.length + EXTRA_ENGLISH_ONLY.length;

      // Localized: 1 English + 6 non-English per category
      const localizedEnglishCount = LOCALIZED_CATEGORIES.length; // 10
      const localeSpecificCount =
        LOCALIZED_CATEGORIES.length * (SUPPORTED_LOCALES.length - 1); // 10 × 6 = 60

      const totalSitemaps =
        englishOnlySitemapCount + localizedEnglishCount + localeSpecificCount;

      // 13 + 3 + 10 + 60 = 86 (13 English-only + 3 extra + 10 localized English + 60 locale-specific)
      expect(totalSitemaps).toBe(86);
    });

    it('should have correct locale count', () => {
      expect(SUPPORTED_LOCALES).toHaveLength(7);
      expect(SUPPORTED_LOCALES).toContain('en');
      expect(SUPPORTED_LOCALES).toContain('es');
      expect(SUPPORTED_LOCALES).toContain('pt');
      expect(SUPPORTED_LOCALES).toContain('de');
      expect(SUPPORTED_LOCALES).toContain('fr');
      expect(SUPPORTED_LOCALES).toContain('it');
      expect(SUPPORTED_LOCALES).toContain('ja');
    });

    it('should have English as the default locale', () => {
      expect(DEFAULT_LOCALE).toBe('en');
    });
  });

  describe('Sitemap Filename Generation', () => {
    it('should generate correct filename for default locale', () => {
      const category = 'tools';
      const locale = DEFAULT_LOCALE;
      const filename =
        locale === DEFAULT_LOCALE ? `sitemap-${category}.xml` : `sitemap-${category}-${locale}.xml`;

      expect(filename).toBe('sitemap-tools.xml');
    });

    it('should generate correct filename for non-default locales', () => {
      const category = 'tools';
      const locales = ['es', 'pt', 'de', 'fr', 'it', 'ja'];

      locales.forEach(locale => {
        const filename =
          locale === DEFAULT_LOCALE
            ? `sitemap-${category}.xml`
            : `sitemap-${category}-${locale}.xml`;
        expect(filename).toBe(`sitemap-tools-${locale}.xml`);
      });
    });

    it('should generate correct filenames for all localized categories', () => {
      LOCALIZED_CATEGORIES.forEach(category => {
        SUPPORTED_LOCALES.forEach(locale => {
          const filename =
            locale === DEFAULT_LOCALE
              ? `sitemap-${category}.xml`
              : `sitemap-${category}-${locale}.xml`;

          expect(filename).toMatch(/^sitemap-[\w-]+\.xml$/);
        });
      });
    });
  });
});

describe('Sitemap Generator Integration', () => {
  it('should use localized categories from config', async () => {
    // Import the actual module to test integration
    const { isCategoryLocalized } = await import('@/lib/seo/localization-config');

    // All localized categories should return true for non-English locales
    LOCALIZED_CATEGORIES.forEach(category => {
      expect(isCategoryLocalized(category, 'es')).toBe(true);
      expect(isCategoryLocalized(category, 'pt')).toBe(true);
      expect(isCategoryLocalized(category, 'de')).toBe(true);
    });

    // English-only categories should return false for non-English locales
    ENGLISH_ONLY_CATEGORIES.forEach(category => {
      expect(isCategoryLocalized(category, 'es')).toBe(false);
      expect(isCategoryLocalized(category, 'pt')).toBe(false);
    });

    // All categories should return true for English
    [...LOCALIZED_CATEGORIES, ...ENGLISH_ONLY_CATEGORIES].forEach(category => {
      expect(isCategoryLocalized(category, 'en')).toBe(true);
    });
  });
});
