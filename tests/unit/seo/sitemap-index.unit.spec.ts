/**
 * Sitemap Index Unit Tests
 * Tests sitemap index generation with proper localization categories
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  ALL_CATEGORIES,
  LOCALIZED_CATEGORIES,
  ENGLISH_ONLY_CATEGORIES,
  isTranslatedPair,
} from '@/lib/seo/localization-config';
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
    it('should include only categories with measured translated pairs', () => {
      expect(LOCALIZED_CATEGORIES).toContain('device-use');
      expect(LOCALIZED_CATEGORIES).toContain('tools');
      expect(LOCALIZED_CATEGORIES).not.toContain('scale');
      for (const category of LOCALIZED_CATEGORIES) {
        expect(
          SUPPORTED_LOCALES.some(locale => locale !== 'en' && isTranslatedPair(category, locale))
        ).toBe(true);
      }
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

    it('should have 14 English-only categories', () => {
      expect(ENGLISH_ONLY_CATEGORIES).toHaveLength(14);
    });
  });

  describe('Sitemap Count Calculation', () => {
    it('should calculate correct number of sitemaps for localized categories', () => {
      const localizedSitemapCount =
        LOCALIZED_CATEGORIES.length +
        LOCALIZED_CATEGORIES.reduce(
          (count, category) =>
            count +
            SUPPORTED_LOCALES.filter(
              locale => locale !== DEFAULT_LOCALE && isTranslatedPair(category, locale)
            ).length,
          0
        );
      expect(localizedSitemapCount).toBe(27);
    });

    it('should calculate correct total sitemap index count', () => {
      // Non-pSEO child sitemaps (static pages + blog) sit outside PSEO_CATEGORIES
      const NON_PSEO_SITEMAPS = ['static', 'blog'];

      const englishCount = ALL_CATEGORIES.length + NON_PSEO_SITEMAPS.length;
      const localeSpecificCount = LOCALIZED_CATEGORIES.reduce(
        (count, category) =>
          count +
          SUPPORTED_LOCALES.filter(
            locale => locale !== DEFAULT_LOCALE && isTranslatedPair(category, locale)
          ).length,
        0
      );

      const totalSitemaps = englishCount + localeSpecificCount;

      expect(totalSitemaps).toBe(46);
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

/** Child sitemap filenames the index actually renders, e.g. `sitemap-tools.xml`. */
const listedChildSitemaps = async (): Promise<string[]> => {
  const { GET } = await import('@/app/sitemap.xml/route');
  const xml = await (await GET()).text();
  return Array.from(xml.matchAll(/<loc>[^<]*\/([^/<]+\.xml)<\/loc>/g), match => match[1]);
};

describe('Sitemap Index Route', () => {
  it('should include ai-features in the sitemap index', async () => {
    const { GET } = await import('@/app/sitemap.xml/route');
    const response = await GET();
    const xml = await response.text();

    expect(xml).toContain('sitemap-ai-features.xml');
  });

  it('should include the registered use-cases-expanded sitemap', async () => {
    const { GET } = await import('@/app/sitemap.xml/route');
    const response = await GET();
    const xml = await response.text();

    expect(xml).toContain('sitemap-use-cases-expanded.xml');
  });

  it('should serve the use-cases-expanded child sitemap', async () => {
    const { GET } = await import('@/app/sitemap-use-cases-expanded.xml/route');

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('/use-cases-expanded/real-estate-photography');
  });

  it('should include only measured category-locale sitemap pairs', async () => {
    const { GET } = await import('@/app/sitemap.xml/route');
    const response = await GET();
    const xml = await response.text();

    const matches = xml.match(/<sitemap>/g);
    expect(matches).toHaveLength(46);
  });

  // A category with zero translated non-English pairs falls out of
  // LOCALIZED_CATEGORIES. Its English pages are still indexable, so the index
  // must keep listing the English child sitemap.
  it.each(['scale', 'free', 'guides'] as const)(
    'should list the %s English child sitemap even with no translated locale pairs',
    async category => {
      const { GET } = await import('@/app/sitemap.xml/route');
      const xml = await (await GET()).text();

      expect(LOCALIZED_CATEGORIES).not.toContain(category);
      expect(xml).toContain(`/sitemap-${category}.xml`);
    }
  );

  it.each([
    ['scale', '/scale/upscale-to-4k'],
    ['free', '/free/free-image-upscaler'],
    ['guides', '/guides/how-to-upscale-images'],
  ] as const)('should serve %s page URLs from its child sitemap', async (category, url) => {
    const { GET } = await import(`@/app/sitemap-${category}.xml/route`);
    const xml = await (await GET()).text();

    expect(xml).toContain(url);
  });

  it('should list an English child sitemap for every category in ALL_CATEGORIES', async () => {
    const names = await listedChildSitemaps();

    for (const category of ALL_CATEGORIES) {
      expect(names, `index should list sitemap-${category}.xml`).toContain(
        `sitemap-${category}.xml`
      );
    }
  });

  // A listed child sitemap with no route file 404s in production and silently drops
  // its URLs — the Sep 2026 index listed categories that could not be fetched.
  it('should have a route file for every child sitemap listed in the index', async () => {
    const names = await listedChildSitemaps();
    expect(names.length).toBeGreaterThan(0);

    const unrouted = names.filter(
      name => !existsSync(join(process.cwd(), 'app', name, 'route.ts'))
    );

    expect(unrouted, `child sitemaps without a route file: ${unrouted.join(', ')}`).toEqual([]);
  });
});

describe('Sitemap Generator Integration', () => {
  it('should use localized categories from config', async () => {
    // Import the actual module to test integration
    const { isCategoryLocalized } = await import('@/lib/seo/localization-config');

    expect(isCategoryLocalized('device-use', 'fr')).toBe(true);
    expect(isCategoryLocalized('scale', 'es')).toBe(false);

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
