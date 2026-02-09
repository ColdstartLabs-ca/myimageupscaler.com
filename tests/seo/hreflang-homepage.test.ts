/**
 * Hreflang Homepage Tests - Phase 5
 * Tests for homepage hreflang correctness to fix cannibalization
 * GSC shows "image upscaler" ranking for: / (EN), /ja/ (JA), /ja/scale (JA scale page)
 * The homepage should have correct hreflang with all 7 locales + x-default
 * Scale pages should have distinct hreflang pointing to scale category only
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateHreflangAlternates,
  getCanonicalUrl,
  getLocalizedPath,
  validateHreflangAlternates,
} from '@/lib/seo/hreflang-generator';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import { clientEnv } from '@shared/config/env';

describe('Hreflang Homepage - Phase 5: Homepage Cannibalization Fix', () => {
  const BASE_URL = clientEnv.BASE_URL;

  beforeEach(() => {
    // Reset any mocks
    vi.restoreAllMocks();
  });

  describe('Homepage hreflang generation', () => {
    it('should generate hreflang for all 7 locales on homepage', () => {
      const alternates = generateHreflangAlternates('/');

      // Should have all 7 supported locales + x-default
      expect(Object.keys(alternates)).toHaveLength(8); // 7 locales + x-default

      // Check each locale is present
      SUPPORTED_LOCALES.forEach(locale => {
        expect(alternates[locale]).toBeDefined();
        expect(alternates[locale]).toMatch(new RegExp(`^${BASE_URL}`));
      });

      // Check x-default is present
      expect(alternates['x-default']).toBeDefined();
    });

    it('should have x-default pointing to English homepage', () => {
      const alternates = generateHreflangAlternates('/');

      // x-default should point to the English homepage (BASE_URL without trailing slash)
      expect(alternates['x-default']).toBe(BASE_URL);
    });

    it('should have English hreflang pointing to root URL', () => {
      const alternates = generateHreflangAlternates('/');

      // English should point to root without locale prefix
      expect(alternates['en']).toBe(BASE_URL);
    });

    it('should NOT include scale pages in homepage hreflang', () => {
      const alternates = generateHreflangAlternates('/');

      // None of the hreflang URLs should include /scale
      Object.values(alternates).forEach(url => {
        expect(url).not.toContain('/scale');
      });
    });

    it('should generate correct localized paths for homepage', () => {
      const alternates = generateHreflangAlternates('/');

      // English: no prefix
      expect(alternates['en']).toBe(`${BASE_URL}`);

      // Other locales: should have prefix only
      expect(alternates['es']).toBe(`${BASE_URL}/es`);
      expect(alternates['pt']).toBe(`${BASE_URL}/pt`);
      expect(alternates['de']).toBe(`${BASE_URL}/de`);
      expect(alternates['fr']).toBe(`${BASE_URL}/fr`);
      expect(alternates['it']).toBe(`${BASE_URL}/it`);
      expect(alternates['ja']).toBe(`${BASE_URL}/ja`);
    });

    it('should pass validation for homepage hreflang', () => {
      const alternates = generateHreflangAlternates('/');

      expect(validateHreflangAlternates(alternates)).toBe(true);
    });
  });

  describe('Homepage canonical URLs', () => {
    it('should have self-referencing canonical for English homepage', () => {
      const canonical = getCanonicalUrl('/', 'en');

      expect(canonical).toBe(BASE_URL);
    });

    it('should have self-referencing canonical for /ja/', () => {
      const canonical = getCanonicalUrl('/', 'ja');

      expect(canonical).toBe(`${BASE_URL}/ja`);
    });

    it('should have self-referencing canonical for /es/', () => {
      const canonical = getCanonicalUrl('/', 'es');

      expect(canonical).toBe(`${BASE_URL}/es`);
    });

    it('should have self-referencing canonical for all locales on homepage', () => {
      SUPPORTED_LOCALES.forEach(locale => {
        const canonical = getCanonicalUrl('/', locale);

        if (locale === 'en') {
          expect(canonical).toBe(BASE_URL);
        } else {
          expect(canonical).toBe(`${BASE_URL}/${locale}`);
        }
      });
    });

    it('should NOT point to homepage from scale pages', () => {
      const scaleCanonical = getCanonicalUrl('/scale/2x-upscaler', 'ja');

      // Scale page canonical should point to itself, not homepage
      expect(scaleCanonical).toContain('/scale/');
      expect(scaleCanonical).not.toBe(BASE_URL);
      expect(scaleCanonical).not.toBe(`${BASE_URL}/ja`);
    });
  });

  describe('Scale page hreflang - distinct from homepage', () => {
    it('should generate hreflang for scale pages with category parameter', () => {
      const alternates = generateHreflangAlternates('/scale/2x-upscaler', 'scale');

      // Should have all 7 locales (scale is a localized category)
      expect(Object.keys(alternates)).toHaveLength(8); // 7 locales + x-default

      // x-default should point to English scale page
      expect(alternates['x-default']).toBe(`${BASE_URL}/scale/2x-upscaler`);
    });

    it('should include /scale/ in all scale page hreflang URLs', () => {
      const alternates = generateHreflangAlternates('/scale/2x-upscaler', 'scale');

      // All URLs should include /scale/
      Object.entries(alternates).forEach(([locale, url]) => {
        if (locale !== 'x-default') {
          // English: /scale/2x-upscaler
          // Other locales: /{locale}/scale/2x-upscaler
          expect(url).toContain('/scale/');
        }
      });
    });

    it('should have distinct hreflang for scale vs homepage', () => {
      const homepageAlternates = generateHreflangAlternates('/');
      const scaleAlternates = generateHreflangAlternates('/scale/2x-upscaler', 'scale');

      // Homepage hreflang should NOT include /scale
      Object.values(homepageAlternates).forEach(url => {
        expect(url).not.toContain('/scale');
      });

      // Scale hreflang should include /scale for all locales
      Object.values(scaleAlternates).forEach(url => {
        expect(url).toContain('/scale');
      });
    });

    it('should have self-referencing canonical for /ja/scale page', () => {
      const canonical = getCanonicalUrl('/scale/2x-upscaler', 'ja');

      expect(canonical).toBe(`${BASE_URL}/ja/scale/2x-upscaler`);
      expect(canonical).not.toBe(BASE_URL);
      expect(canonical).not.toBe(`${BASE_URL}/ja`);
    });

    it('should have x-default pointing to English scale page', () => {
      const alternates = generateHreflangAlternates('/scale/2x-upscaler', 'scale');

      expect(alternates['x-default']).toBe(`${BASE_URL}/scale/2x-upscaler`);
      expect(alternates['x-default']).not.toBe(BASE_URL);
    });
  });

  describe('getLocalizedPath utility', () => {
    it('should return slash for English homepage (normalized later)', () => {
      const path = getLocalizedPath('/', 'en');
      // getLocalizedPath returns '/' for English homepage
      // When combined with BASE_URL in generateHreflangAlternates, this results in BASE_URL without trailing slash
      expect(path).toBe('/');
    });

    it('should return /ja for Japanese homepage', () => {
      const path = getLocalizedPath('/', 'ja');
      expect(path).toBe('/ja');
    });

    it('should return path without locale prefix for English scale page', () => {
      const path = getLocalizedPath('/scale/2x-upscaler', 'en');
      expect(path).toBe('/scale/2x-upscaler');
    });

    it('should return path with locale prefix for Japanese scale page', () => {
      const path = getLocalizedPath('/scale/2x-upscaler', 'ja');
      expect(path).toBe('/ja/scale/2x-upscaler');
    });
  });

  describe('Validation edge cases', () => {
    it('should validate homepage hreflang with all required fields', () => {
      const alternates = generateHreflangAlternates('/');

      // Check English is present (required as default locale)
      expect(alternates['en']).toBeDefined();

      // Check x-default is present (required)
      expect(alternates['x-default']).toBeDefined();

      // All URLs should be valid
      Object.entries(alternates).forEach(([locale, url]) => {
        expect(() => new URL(url)).not.toThrow();
        expect(url).toMatch(/^https?:\/\//);
      });
    });

    it('should handle empty path as homepage', () => {
      const alternates1 = generateHreflangAlternates('/');
      const alternates2 = generateHreflangAlternates('');

      // Both should produce the same result
      expect(alternates1['en']).toBe(alternates2['en']);
      expect(alternates1['x-default']).toBe(alternates2['x-default']);
    });

    it('should not include trailing slash in homepage hreflang URLs', () => {
      const alternates = generateHreflangAlternates('/');

      Object.values(alternates).forEach(url => {
        // BASE_URL should not have trailing slash for homepage
        expect(url).not.toMatch(/\/$/);
      });
    });
  });

  describe('English-only categories should not have localized hreflang', () => {
    it('should only generate English + x-default for compare category', () => {
      const alternates = generateHreflangAlternates('/compare/test', 'compare');

      // Should only have en + x-default
      expect(Object.keys(alternates)).toHaveLength(2);
      expect(alternates['en']).toBeDefined();
      expect(alternates['x-default']).toBeDefined();
      expect(alternates['ja']).toBeUndefined();
      expect(alternates['es']).toBeUndefined();
    });
  });
});
