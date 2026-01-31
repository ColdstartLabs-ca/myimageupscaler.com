/**
 * Hreflang Generator Unit Tests
 * Phase 5: Metadata & SEO with hreflang
 *
 * Tests hreflang generation for multi-language SEO support
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateHreflangAlternates,
  generatePSEOHreflangAlternates,
  getLocalizedPath,
  formatHreflangForMetadata,
  getCanonicalUrl,
  validateHreflangAlternates,
  getOpenGraphLocale,
} from '@/lib/seo/hreflang-generator';
import type { PSEOCategory } from '@/lib/seo/url-utils';

// Mock the clientEnv to use a consistent base URL for testing
vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
    TWITTER_HANDLE: 'myimageupscaler',
  },
}));

describe('Hreflang Generator', () => {
  describe('generateHreflangAlternates', () => {
    it('should generate correct hreflang alternates for a simple path', () => {
      const path = '/tools/ai-image-upscaler';
      const alternates = generateHreflangAlternates(path);

      expect(alternates).toBeDefined();
      expect(alternates.en).toBe('https://myimageupscaler.com/tools/ai-image-upscaler');
      expect(alternates.es).toBe('https://myimageupscaler.com/es/tools/ai-image-upscaler');
      expect(alternates['x-default']).toBe('https://myimageupscaler.com/tools/ai-image-upscaler');
    });

    it('should generate hreflang for homepage', () => {
      const path = '/';
      const alternates = generateHreflangAlternates(path);

      expect(alternates.en).toBe('https://myimageupscaler.com');
      expect(alternates.es).toBe('https://myimageupscaler.com/es');
      expect(alternates['x-default']).toBe('https://myimageupscaler.com');
    });

    it('should include all supported locales', () => {
      const path = '/tools/upscaler';
      const alternates = generateHreflangAlternates(path);

      // Should have en, es, and x-default
      expect(Object.keys(alternates)).toContain('en');
      expect(Object.keys(alternates)).toContain('es');
      expect(Object.keys(alternates)).toContain('x-default');
    });

    it('should have x-default pointing to English version', () => {
      const path = '/tools/test';
      const alternates = generateHreflangAlternates(path);

      expect(alternates['x-default']).toBe(alternates.en);
    });
  });

  describe('generatePSEOHreflangAlternates', () => {
    it('should combine category and slug for pSEO pages', () => {
      const category: PSEOCategory = 'tools';
      const slug = 'ai-image-upscaler';
      const alternates = generatePSEOHreflangAlternates(category, slug);

      expect(alternates.en).toBe('https://myimageupscaler.com/tools/ai-image-upscaler');
      expect(alternates.es).toBe('https://myimageupscaler.com/es/tools/ai-image-upscaler');
      expect(alternates['x-default']).toBe('https://myimageupscaler.com/tools/ai-image-upscaler');
    });

    it('should work with different pSEO categories', () => {
      const categories: PSEOCategory[] = ['tools', 'formats', 'scale', 'guides'];

      categories.forEach(category => {
        const alternates = generatePSEOHreflangAlternates(category, 'test-page');

        expect(alternates.en).toBe(`https://myimageupscaler.com/${category}/test-page`);
        expect(alternates.es).toBe(`https://myimageupscaler.com/es/${category}/test-page`);
        expect(alternates['x-default']).toBe(`https://myimageupscaler.com/${category}/test-page`);
      });
    });
  });

  describe('getLocalizedPath', () => {
    it('should return path without prefix for English (default locale)', () => {
      const path = '/tools/ai-upscaler';
      const localizedPath = getLocalizedPath(path, 'en');

      expect(localizedPath).toBe('/tools/ai-upscaler');
    });

    it('should add locale prefix for Spanish', () => {
      const path = '/tools/ai-upscaler';
      const localizedPath = getLocalizedPath(path, 'es');

      expect(localizedPath).toBe('/es/tools/ai-upscaler');
    });

    it('should handle paths without leading slash', () => {
      const path = 'tools/ai-upscaler';
      const localizedPath = getLocalizedPath(path, 'es');

      expect(localizedPath).toBe('/es/tools/ai-upscaler');
    });

    it('should handle root path', () => {
      const path = '/';
      const enPath = getLocalizedPath(path, 'en');
      const esPath = getLocalizedPath(path, 'es');

      expect(enPath).toBe('/');
      expect(esPath).toBe('/es');
    });
  });

  describe('formatHreflangForMetadata', () => {
    it('should return alternates object as-is for Next.js metadata', () => {
      const alternates = {
        en: 'https://example.com/en',
        es: 'https://example.com/es',
        'x-default': 'https://example.com',
      };

      const formatted = formatHreflangForMetadata(alternates);

      expect(formatted).toEqual(alternates);
    });
  });

  describe('getCanonicalUrl', () => {
    it('should return full canonical URL for a path', () => {
      const path = '/tools/ai-upscaler';
      const canonical = getCanonicalUrl(path);

      expect(canonical).toBe('https://myimageupscaler.com/tools/ai-upscaler');
    });

    it('should handle root path', () => {
      const canonical = getCanonicalUrl('/');

      expect(canonical).toBe('https://myimageupscaler.com');
    });

    it('should always return English version as canonical', () => {
      const path = '/es/tools/upscaler';
      const canonical = getCanonicalUrl(path);

      // Canonical should always use the base URL without locale prefix
      expect(canonical).not.toContain('/es/');
    });
  });

  describe('validateHreflangAlternates', () => {
    it('should return true for valid alternates', () => {
      const alternates = {
        en: 'https://myimageupscaler.com/tools/upscaler',
        es: 'https://myimageupscaler.com/es/tools/upscaler',
        pt: 'https://myimageupscaler.com/pt/tools/upscaler',
        de: 'https://myimageupscaler.com/de/tools/upscaler',
        fr: 'https://myimageupscaler.com/fr/tools/upscaler',
        it: 'https://myimageupscaler.com/it/tools/upscaler',
        ja: 'https://myimageupscaler.com/ja/tools/upscaler',
        'x-default': 'https://myimageupscaler.com/tools/upscaler',
      };

      expect(validateHreflangAlternates(alternates)).toBe(true);
    });

    it('should return false when x-default is missing', () => {
      const alternates = {
        en: 'https://myimageupscaler.com/tools/upscaler',
        es: 'https://myimageupscaler.com/es/tools/upscaler',
        pt: 'https://myimageupscaler.com/pt/tools/upscaler',
        de: 'https://myimageupscaler.com/de/tools/upscaler',
        fr: 'https://myimageupscaler.com/fr/tools/upscaler',
        it: 'https://myimageupscaler.com/it/tools/upscaler',
        ja: 'https://myimageupscaler.com/ja/tools/upscaler',
      };

      expect(validateHreflangAlternates(alternates)).toBe(false);
    });

    it('should return false when a locale is missing', () => {
      const alternates = {
        en: 'https://myimageupscaler.com/tools/upscaler',
        es: 'https://myimageupscaler.com/es/tools/upscaler',
        pt: 'https://myimageupscaler.com/pt/tools/upscaler',
        de: 'https://myimageupscaler.com/de/tools/upscaler',
        fr: 'https://myimageupscaler.com/fr/tools/upscaler',
        it: 'https://myimageupscaler.com/it/tools/upscaler',
        'x-default': 'https://myimageupscaler.com/tools/upscaler',
      };

      expect(validateHreflangAlternates(alternates)).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      const alternates = {
        en: 'not-a-valid-url',
        es: 'https://myimageupscaler.com/es/tools/upscaler',
        pt: 'https://myimageupscaler.com/pt/tools/upscaler',
        de: 'https://myimageupscaler.com/de/tools/upscaler',
        fr: 'https://myimageupscaler.com/fr/tools/upscaler',
        it: 'https://myimageupscaler.com/it/tools/upscaler',
        ja: 'https://myimageupscaler.com/ja/tools/upscaler',
        'x-default': 'https://myimageupscaler.com/tools/upscaler',
      };

      expect(validateHreflangAlternates(alternates)).toBe(false);
    });
  });

  describe('getOpenGraphLocale', () => {
    it('should return correct OpenGraph locale for English', () => {
      const ogLocale = getOpenGraphLocale('en');

      expect(ogLocale).toBe('en_US');
    });

    it('should return correct OpenGraph locale for Spanish', () => {
      const ogLocale = getOpenGraphLocale('es');

      expect(ogLocale).toBe('es_ES');
    });

    it('should default to en_US for unknown locales', () => {
      // @ts-expect-error - Testing with invalid locale
      const ogLocale = getOpenGraphLocale('zz');

      expect(ogLocale).toBe('en_US');
    });
  });

  describe('Integration Tests', () => {
    it('should generate complete hreflang structure for a tool page', () => {
      const category: PSEOCategory = 'tools';
      const slug = 'ai-image-upscaler';
      const alternates = generatePSEOHreflangAlternates(category, slug);

      // Verify structure includes all supported locales + x-default
      const expectedKeys = [...['en', 'es', 'pt', 'de', 'fr', 'it', 'ja'], 'x-default'];
      expect(Object.keys(alternates).sort()).toEqual(expectedKeys.sort());

      // Verify all URLs are valid
      for (const [_locale, url] of Object.entries(alternates)) {
        expect(() => new URL(url)).not.toThrow();
        expect(url).toContain('https://');
      }

      // Verify x-default points to English
      expect(alternates['x-default']).toBe(alternates.en);
    });

    it('should handle nested paths correctly', () => {
      const path = '/tools/resize/bulk-image-resizer';
      const alternates = generateHreflangAlternates(path);

      expect(alternates.en).toBe('https://myimageupscaler.com/tools/resize/bulk-image-resizer');
      expect(alternates.es).toBe('https://myimageupscaler.com/es/tools/resize/bulk-image-resizer');
    });
  });
});
