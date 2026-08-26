/**
 * Hreflang Interactive Tools Unit Tests
 * Phase 6: Verify hreflang alternates render for interactive tool pages
 *
 * Confirms that interactive tools (e.g., transparent-background-maker) in the
 * tools category receive correct hreflang alternates for all supported locales,
 * including x-default and locale-prefixed variants for de/es/fr/it/ja/pt.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateHreflangAlternates,
  generatePSEOHreflangAlternates,
} from '@/lib/seo/hreflang-generator';
import type { PSEOCategory } from '@/lib/seo/url-utils';

// Mock clientEnv — required because hreflang-generator imports it at module level
vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
    TWITTER_HANDLE: 'myimageupscaler',
  },
}));

const CATEGORY: PSEOCategory = 'tools';
const BASE_URL = 'https://myimageupscaler.com';

// New tools added in PR #13
const NEW_TOOL_SLUGS = [
  'background-changer',
  'heic-to-jpg',
  'heic-to-png',
  'pdf-to-jpg',
  'pdf-to-png',
  'image-to-pdf',
  'jpg-to-pdf',
  'image-to-text',
];

describe('Hreflang for new interactive tools (PR #13)', () => {
  it.each(NEW_TOOL_SLUGS)('%s has only measured locale alternates', slug => {
    const alternates = generatePSEOHreflangAlternates(CATEGORY, slug);
    const locales = ['en', 'pt', 'de', 'fr'];
    locales.forEach(locale => {
      expect(alternates[locale]).toBeDefined();
      expect(alternates[locale]).toMatch(/^https?:\/\//);
    });
    expect(alternates['x-default']).toBeDefined();
  });

  it.each(NEW_TOOL_SLUGS)('%s x-default is canonical English URL (no locale prefix)', slug => {
    const alternates = generatePSEOHreflangAlternates(CATEGORY, slug);
    expect(alternates['x-default']).toBe(`${BASE_URL}/tools/${slug}`);
    expect(alternates['x-default']).not.toMatch(/\/[a-z]{2}\/tools\//);
  });

  it.each(NEW_TOOL_SLUGS)('%s de alternate has correct locale path', slug => {
    const alternates = generatePSEOHreflangAlternates(CATEGORY, slug);
    expect(alternates.de).toContain(`/de/tools/${slug}`);
  });
});

const SLUG = 'transparent-background-maker';

describe('Hreflang for interactive tools', () => {
  describe('transparent-background-maker locale alternates', () => {
    it('transparent-background-maker has de hreflang', () => {
      const alternates = generatePSEOHreflangAlternates(CATEGORY, SLUG);
      expect(alternates.de).toContain(`/de/tools/${SLUG}`);
    });

    it('transparent-background-maker omits unmeasured es hreflang', () => {
      const alternates = generatePSEOHreflangAlternates(CATEGORY, SLUG);
      expect(alternates.es).toBeUndefined();
    });

    it('transparent-background-maker has fr hreflang', () => {
      const alternates = generatePSEOHreflangAlternates(CATEGORY, SLUG);
      expect(alternates.fr).toContain(`/fr/tools/${SLUG}`);
    });

    it('transparent-background-maker omits unmeasured it hreflang', () => {
      const alternates = generatePSEOHreflangAlternates(CATEGORY, SLUG);
      expect(alternates.it).toBeUndefined();
    });

    it('transparent-background-maker omits partially mirrored ja hreflang', () => {
      const alternates = generatePSEOHreflangAlternates(CATEGORY, SLUG);
      expect(alternates.ja).toBeUndefined();
    });

    it('transparent-background-maker has pt hreflang', () => {
      const alternates = generatePSEOHreflangAlternates(CATEGORY, SLUG);
      expect(alternates.pt).toContain(`/pt/tools/${SLUG}`);
    });

    it('transparent-background-maker has x-default', () => {
      const alternates = generatePSEOHreflangAlternates(CATEGORY, SLUG);
      expect(alternates['x-default']).toContain(`/tools/${SLUG}`);
    });

    it('transparent-background-maker x-default points to canonical English URL (no locale prefix)', () => {
      const alternates = generatePSEOHreflangAlternates(CATEGORY, SLUG);
      // x-default must be the English (no-prefix) URL
      expect(alternates['x-default']).toBe(`${BASE_URL}/tools/${SLUG}`);
      // Must not contain a locale prefix segment before /tools/
      expect(alternates['x-default']).not.toMatch(/\/[a-z]{2}\/tools\//);
    });

    it('only translated locales and x-default are present for tools', () => {
      const alternates = generatePSEOHreflangAlternates(CATEGORY, SLUG);
      // 7 locale keys (en, es, pt, de, fr, it, ja) + x-default = 8 keys minimum
      expect(Object.keys(alternates)).toEqual(['en', 'pt', 'de', 'fr', 'x-default']);
    });

    it('all locale URLs are valid absolute URLs', () => {
      const alternates = generatePSEOHreflangAlternates(CATEGORY, SLUG);
      for (const [_locale, url] of Object.entries(alternates)) {
        expect(() => new URL(url)).not.toThrow();
        expect(url).toMatch(/^https?:\/\//);
      }
    });
  });

  describe('generateHreflangAlternates with tools path', () => {
    it('returns de alternate for /tools/transparent-background-maker', () => {
      const alternates = generateHreflangAlternates(`/tools/${SLUG}`, CATEGORY);
      expect(alternates.de).toContain(`/de/tools/${SLUG}`);
    });

    it('returns x-default for /tools/transparent-background-maker', () => {
      const alternates = generateHreflangAlternates(`/tools/${SLUG}`, CATEGORY);
      expect(alternates['x-default']).toContain(`/tools/${SLUG}`);
    });

    it('only measured locale alternates are present for tools', () => {
      const alternates = generateHreflangAlternates(`/tools/${SLUG}`, CATEGORY);
      expect(Object.keys(alternates)).toEqual(['en', 'pt', 'de', 'fr', 'x-default']);
    });
  });

  describe('en locale URL format', () => {
    it('en alternate has no locale prefix', () => {
      const alternates = generatePSEOHreflangAlternates(CATEGORY, SLUG);
      expect(alternates.en).toBe(`${BASE_URL}/tools/${SLUG}`);
    });

    it('en and x-default point to same URL', () => {
      const alternates = generatePSEOHreflangAlternates(CATEGORY, SLUG);
      expect(alternates['x-default']).toBe(alternates.en);
    });
  });
});
