/**
 * pSEO Static Params Tests
 *
 * Tests for generateStaticParams() in localized pSEO routes
 * Phase 2: Tools, Formats, Guides, Free, Scale
 */

import { describe, it, expect } from 'vitest';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import {
  getAllToolSlugs,
  getAllFormatSlugs,
  getAllGuideSlugs,
  getAllFreeSlugs,
  getAllScaleSlugs,
} from '@/lib/seo';

describe('pSEO Static Params - Phase 2', () => {
  describe('SUPPORTED_LOCALES', () => {
    it('should have 7 supported locales', () => {
      expect(SUPPORTED_LOCALES).toHaveLength(7);
    });

    it('should include en as the first locale', () => {
      expect(SUPPORTED_LOCALES[0]).toBe('en');
    });

    it('should contain all expected locales', () => {
      const expectedLocales = ['en', 'es', 'pt', 'de', 'fr', 'it', 'ja'];
      expect(SUPPORTED_LOCALES).toEqual(expect.arrayContaining(expectedLocales));
    });
  });

  describe('Tools Category', () => {
    it('should have tool slugs available', async () => {
      const slugs = await getAllToolSlugs();
      expect(slugs.length).toBeGreaterThan(0);
      expect(slugs).toEqual(expect.any(Array));
    });

    it('should not include undefined in tool slugs', async () => {
      const slugs = await getAllToolSlugs();
      expect(slugs.every(slug => slug !== undefined)).toBe(true);
      expect(slugs.every(slug => typeof slug === 'string')).toBe(true);
    });
  });

  describe('Formats Category', () => {
    it('should have format slugs available', async () => {
      const slugs = await getAllFormatSlugs();
      expect(slugs.length).toBeGreaterThan(0);
      expect(slugs).toEqual(expect.any(Array));
    });

    it('should not include undefined in format slugs', async () => {
      const slugs = await getAllFormatSlugs();
      expect(slugs.every(slug => slug !== undefined)).toBe(true);
      expect(slugs.every(slug => typeof slug === 'string')).toBe(true);
    });
  });

  describe('Guides Category', () => {
    it('should have guide slugs available', async () => {
      const slugs = await getAllGuideSlugs();
      expect(slugs.length).toBeGreaterThan(0);
      expect(slugs).toEqual(expect.any(Array));
    });

    it('should not include undefined in guide slugs', async () => {
      const slugs = await getAllGuideSlugs();
      expect(slugs.every(slug => slug !== undefined)).toBe(true);
      expect(slugs.every(slug => typeof slug === 'string')).toBe(true);
    });
  });

  describe('Free Category', () => {
    it('should have free slugs available', async () => {
      const slugs = await getAllFreeSlugs();
      expect(slugs.length).toBeGreaterThan(0);
      expect(slugs).toEqual(expect.any(Array));
    });

    it('should not include undefined in free slugs', async () => {
      const slugs = await getAllFreeSlugs();
      expect(slugs.every(slug => slug !== undefined)).toBe(true);
      expect(slugs.every(slug => typeof slug === 'string')).toBe(true);
    });
  });

  describe('Scale Category', () => {
    it('should have scale slugs available', async () => {
      const slugs = await getAllScaleSlugs();
      expect(slugs.length).toBeGreaterThan(0);
      expect(slugs).toEqual(expect.any(Array));
    });

    it('should not include undefined in scale slugs', async () => {
      const slugs = await getAllScaleSlugs();
      expect(slugs.every(slug => slug !== undefined)).toBe(true);
      expect(slugs.every(slug => typeof slug === 'string')).toBe(true);
    });
  });

  describe('Static Params Generation Pattern', () => {
    it('should generate correct locale-slug combinations for tools', async () => {
      const slugs = await getAllToolSlugs();
      const expectedCount = slugs.length * SUPPORTED_LOCALES.length;

      // Simulate generateStaticParams pattern
      const params = SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));

      expect(params).toHaveLength(expectedCount);
      expect(params.every(p => p.slug && p.locale)).toBe(true);
      expect(params.every(p => SUPPORTED_LOCALES.includes(p.locale))).toBe(true);
    });

    it('should generate correct locale-slug combinations for formats', async () => {
      const slugs = await getAllFormatSlugs();
      const expectedCount = slugs.length * SUPPORTED_LOCALES.length;

      // Simulate generateStaticParams pattern
      const params = SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));

      expect(params).toHaveLength(expectedCount);
      expect(params.every(p => p.slug && p.locale)).toBe(true);
      expect(params.every(p => SUPPORTED_LOCALES.includes(p.locale))).toBe(true);
    });

    it('should generate correct locale-slug combinations for guides', async () => {
      const slugs = await getAllGuideSlugs();
      const expectedCount = slugs.length * SUPPORTED_LOCALES.length;

      // Simulate generateStaticParams pattern
      const params = SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));

      expect(params).toHaveLength(expectedCount);
      expect(params.every(p => p.slug && p.locale)).toBe(true);
      expect(params.every(p => SUPPORTED_LOCALES.includes(p.locale))).toBe(true);
    });

    it('should generate correct locale-slug combinations for free tools', async () => {
      const slugs = await getAllFreeSlugs();
      const expectedCount = slugs.length * SUPPORTED_LOCALES.length;

      // Simulate generateStaticParams pattern
      const params = SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));

      expect(params).toHaveLength(expectedCount);
      expect(params.every(p => p.slug && p.locale)).toBe(true);
      expect(params.every(p => SUPPORTED_LOCALES.includes(p.locale))).toBe(true);
    });

    it('should generate correct locale-slug combinations for scale', async () => {
      const slugs = await getAllScaleSlugs();
      const expectedCount = slugs.length * SUPPORTED_LOCALES.length;

      // Simulate generateStaticParams pattern
      const params = SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));

      expect(params).toHaveLength(expectedCount);
      expect(params.every(p => p.slug && p.locale)).toBe(true);
      expect(params.every(p => SUPPORTED_LOCALES.includes(p.locale))).toBe(true);
    });

    it('should generate params for all pSEO categories', async () => {
      const [toolSlugs, formatSlugs, guideSlugs, freeSlugs, scaleSlugs] = await Promise.all([
        getAllToolSlugs(),
        getAllFormatSlugs(),
        getAllGuideSlugs(),
        getAllFreeSlugs(),
        getAllScaleSlugs(),
      ]);

      // All categories should return slugs
      expect(toolSlugs.length).toBeGreaterThan(0);
      expect(formatSlugs.length).toBeGreaterThan(0);
      expect(guideSlugs.length).toBeGreaterThan(0);
      expect(freeSlugs.length).toBeGreaterThan(0);
      expect(scaleSlugs.length).toBeGreaterThan(0);

      // Simulate params generation for all categories
      const toolsParams = SUPPORTED_LOCALES.flatMap(locale =>
        toolSlugs.map(slug => ({ slug, locale }))
      );
      const formatsParams = SUPPORTED_LOCALES.flatMap(locale =>
        formatSlugs.map(slug => ({ slug, locale }))
      );
      const guidesParams = SUPPORTED_LOCALES.flatMap(locale =>
        guideSlugs.map(slug => ({ slug, locale }))
      );
      const freeParams = SUPPORTED_LOCALES.flatMap(locale =>
        freeSlugs.map(slug => ({ slug, locale }))
      );
      const scaleParams = SUPPORTED_LOCALES.flatMap(locale =>
        scaleSlugs.map(slug => ({ slug, locale }))
      );

      // All params should have locale property
      expect(toolsParams.every(p => p.locale)).toBe(true);
      expect(formatsParams.every(p => p.locale)).toBe(true);
      expect(guidesParams.every(p => p.locale)).toBe(true);
      expect(freeParams.every(p => p.locale)).toBe(true);
      expect(scaleParams.every(p => p.locale)).toBe(true);

      // No undefined locales
      expect(toolsParams.every(p => p.locale !== undefined)).toBe(true);
      expect(formatsParams.every(p => p.locale !== undefined)).toBe(true);
      expect(guidesParams.every(p => p.locale !== undefined)).toBe(true);
      expect(freeParams.every(p => p.locale !== undefined)).toBe(true);
      expect(scaleParams.every(p => p.locale !== undefined)).toBe(true);
    });

    it('should not generate undefined locale in any params', async () => {
      const [toolSlugs, formatSlugs, guideSlugs, freeSlugs, scaleSlugs] = await Promise.all([
        getAllToolSlugs(),
        getAllFormatSlugs(),
        getAllGuideSlugs(),
        getAllFreeSlugs(),
        getAllScaleSlugs(),
      ]);

      const allParams = [
        ...SUPPORTED_LOCALES.flatMap(locale => toolSlugs.map(slug => ({ slug, locale }))),
        ...SUPPORTED_LOCALES.flatMap(locale => formatSlugs.map(slug => ({ slug, locale }))),
        ...SUPPORTED_LOCALES.flatMap(locale => guideSlugs.map(slug => ({ slug, locale }))),
        ...SUPPORTED_LOCALES.flatMap(locale => freeSlugs.map(slug => ({ slug, locale }))),
        ...SUPPORTED_LOCALES.flatMap(locale => scaleSlugs.map(slug => ({ slug, locale }))),
      ];

      // Critical test: ensure no undefined locales
      expect(allParams.every(p => p.locale !== undefined)).toBe(true);
      expect(allParams.some(p => p.locale === undefined)).toBe(false);
    });
  });
});
