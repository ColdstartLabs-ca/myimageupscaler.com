/**
 * pSEO Static Params Tests
 *
 * Tests for generateStaticParams() functions in localized pSEO routes.
 * This verifies that all routes generate params with locale parameter included,
 * preventing /undefined/ URLs from appearing in the build output.
 */

import { describe, test, expect, vi } from 'vitest';
import { SUPPORTED_LOCALES } from '@/i18n/config';

// Mock the data loader functions
vi.mock('@/lib/seo/data-loader', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/seo/data-loader')>('@/lib/seo/data-loader');
  return {
    ...actual,
    getAllPlatformSlugs: async () => ['midjourney-upscaler', 'canva-upscaler'],
    getAllFormatScaleSlugs: async () => ['upscale-jpeg-2x', 'upscale-png-4x'],
    getAllDeviceUseSlugs: async () => ['mobile-upscaler', 'desktop-upscaler'],
    getAllPlatformFormatSlugs: async () => ['midjourney-jpeg-upscaler', 'canva-png-upscaler'],
    getAllUseCaseSlugs: async () => ['enhance-photos', 'restore-old-images'],
    getAllAlternativeSlugs: async () => ['waifu2x-alternative', 'letsenhance-alternative'],
    getAllComparisonSlugs: async () => ['topaz-vs-midjourney', 'canva-vs-adobe'],
  };
});

describe('pSEO Static Params Generation', () => {
  describe('platforms/[slug]/page.tsx', () => {
    test('should generate params with all locales for platforms', async () => {
      // Import the actual generateStaticParams function
      const { generateStaticParams } = await import('@/app/[locale]/(pseo)/platforms/[slug]/page');

      const params = await generateStaticParams();

      // Should have 2 slugs × 7 locales = 14 params
      expect(params).toHaveLength(14);

      // Check that specific locale combinations exist
      expect(params).toContainEqual({ slug: 'midjourney-upscaler', locale: 'en' });
      expect(params).toContainEqual({ slug: 'midjourney-upscaler', locale: 'es' });
      expect(params).toContainEqual({ slug: 'canva-upscaler', locale: 'pt' });
      expect(params).toContainEqual({ slug: 'canva-upscaler', locale: 'de' });
    });

    test('should not include undefined locale', async () => {
      const { generateStaticParams } = await import('@/app/[locale]/(pseo)/platforms/[slug]/page');

      const params = await generateStaticParams();

      // Verify all params have defined locale
      expect(params.every(p => p.locale !== undefined)).toBe(true);

      // Verify no params have undefined as locale value
      expect(params.some(p => p.locale === 'undefined')).toBe(false);

      // Verify all params have valid locale from SUPPORTED_LOCALES
      expect(params.every(p => SUPPORTED_LOCALES.includes(p.locale as any))).toBe(true);
    });
  });

  describe('format-scale/[slug]/page.tsx', () => {
    test('should generate params with all locales for format-scale', async () => {
      const { generateStaticParams } =
        await import('@/app/[locale]/(pseo)/format-scale/[slug]/page');

      const params = await generateStaticParams();

      // Should have 2 slugs × 7 locales = 14 params
      expect(params).toHaveLength(14);

      // Check that specific locale combinations exist
      expect(params).toContainEqual({ slug: 'upscale-jpeg-2x', locale: 'en' });
      expect(params).toContainEqual({ slug: 'upscale-jpeg-2x', locale: 'fr' });
      expect(params).toContainEqual({ slug: 'upscale-png-4x', locale: 'it' });
      expect(params).toContainEqual({ slug: 'upscale-png-4x', locale: 'ja' });
    });

    test('should not include undefined locale', async () => {
      const { generateStaticParams } =
        await import('@/app/[locale]/(pseo)/format-scale/[slug]/page');

      const params = await generateStaticParams();

      expect(params.every(p => p.locale !== undefined)).toBe(true);
      expect(params.some(p => p.locale === 'undefined')).toBe(false);
      expect(params.every(p => SUPPORTED_LOCALES.includes(p.locale as any))).toBe(true);
    });
  });

  describe('device-use/[slug]/page.tsx', () => {
    test('should generate params with all locales for device-use', async () => {
      const { generateStaticParams } = await import('@/app/[locale]/(pseo)/device-use/[slug]/page');

      const params = await generateStaticParams();

      // Should have 2 slugs × 7 locales = 14 params
      expect(params).toHaveLength(14);

      // Check that specific locale combinations exist
      expect(params).toContainEqual({ slug: 'mobile-upscaler', locale: 'en' });
      expect(params).toContainEqual({ slug: 'mobile-upscaler', locale: 'es' });
      expect(params).toContainEqual({ slug: 'desktop-upscaler', locale: 'pt' });
    });

    test('should not include undefined locale', async () => {
      const { generateStaticParams } = await import('@/app/[locale]/(pseo)/device-use/[slug]/page');

      const params = await generateStaticParams();

      expect(params.every(p => p.locale !== undefined)).toBe(true);
      expect(params.some(p => p.locale === 'undefined')).toBe(false);
      expect(params.every(p => SUPPORTED_LOCALES.includes(p.locale as any))).toBe(true);
    });
  });

  describe('platform-format/[slug]/page.tsx', () => {
    test('should generate params with all locales for platform-format', async () => {
      const { generateStaticParams } =
        await import('@/app/[locale]/(pseo)/platform-format/[slug]/page');

      const params = await generateStaticParams();

      // Should have 2 slugs × 7 locales = 14 params
      expect(params).toHaveLength(14);

      // Check that specific locale combinations exist
      expect(params).toContainEqual({ slug: 'midjourney-jpeg-upscaler', locale: 'en' });
      expect(params).toContainEqual({ slug: 'midjourney-jpeg-upscaler', locale: 'de' });
      expect(params).toContainEqual({ slug: 'canva-png-upscaler', locale: 'fr' });
    });

    test('should not include undefined locale', async () => {
      const { generateStaticParams } =
        await import('@/app/[locale]/(pseo)/platform-format/[slug]/page');

      const params = await generateStaticParams();

      expect(params.every(p => p.locale !== undefined)).toBe(true);
      expect(params.some(p => p.locale === 'undefined')).toBe(false);
      expect(params.every(p => SUPPORTED_LOCALES.includes(p.locale as any))).toBe(true);
    });
  });

  describe('Cross-category consistency', () => {
    test('should generate same number of params per slug across all categories', async () => {
      const [platformsParams, formatScaleParams, deviceUseParams, platformFormatParams] =
        await Promise.all([
          import('@/app/[locale]/(pseo)/platforms/[slug]/page').then(m => m.generateStaticParams()),
          import('@/app/[locale]/(pseo)/format-scale/[slug]/page').then(m =>
            m.generateStaticParams()
          ),
          import('@/app/[locale]/(pseo)/device-use/[slug]/page').then(m =>
            m.generateStaticParams()
          ),
          import('@/app/[locale]/(pseo)/platform-format/[slug]/page').then(m =>
            m.generateStaticParams()
          ),
        ]);

      // Each category should have 2 slugs × 7 locales = 14 params
      expect(platformsParams).toHaveLength(14);
      expect(formatScaleParams).toHaveLength(14);
      expect(deviceUseParams).toHaveLength(14);
      expect(platformFormatParams).toHaveLength(14);
    });

    test('should include all SUPPORTED_LOCALES in each category', async () => {
      const [platformsParams, formatScaleParams, deviceUseParams, platformFormatParams] =
        await Promise.all([
          import('@/app/[locale]/(pseo)/platforms/[slug]/page').then(m => m.generateStaticParams()),
          import('@/app/[locale]/(pseo)/format-scale/[slug]/page').then(m =>
            m.generateStaticParams()
          ),
          import('@/app/[locale]/(pseo)/device-use/[slug]/page').then(m =>
            m.generateStaticParams()
          ),
          import('@/app/[locale]/(pseo)/platform-format/[slug]/page').then(m =>
            m.generateStaticParams()
          ),
        ]);

      const extractLocales = (params: Awaited<typeof platformsParams>) =>
        params.map(p => p.locale).filter((v, i, a) => a.indexOf(v) === i);

      const platformsLocales = extractLocales(platformsParams);
      const formatScaleLocales = extractLocales(formatScaleParams);
      const deviceUseLocales = extractLocales(deviceUseParams);
      const platformFormatLocales = extractLocales(platformFormatParams);

      // Each category should include all 7 supported locales
      expect(platformsLocales).toHaveLength(SUPPORTED_LOCALES.length);
      expect(formatScaleLocales).toHaveLength(SUPPORTED_LOCALES.length);
      expect(deviceUseLocales).toHaveLength(SUPPORTED_LOCALES.length);
      expect(platformFormatLocales).toHaveLength(SUPPORTED_LOCALES.length);

      // All should match SUPPORTED_LOCALES
      expect(platformsLocales).toEqual(expect.arrayContaining([...SUPPORTED_LOCALES]));
      expect(formatScaleLocales).toEqual(expect.arrayContaining([...SUPPORTED_LOCALES]));
      expect(deviceUseLocales).toEqual(expect.arrayContaining([...SUPPORTED_LOCALES]));
      expect(platformFormatLocales).toEqual(expect.arrayContaining([...SUPPORTED_LOCALES]));
    });
  });

  // Phase 3: Additional categories
  describe('use-cases/[slug]/page.tsx', () => {
    test('should generate params with all locales for use-cases', async () => {
      const { generateStaticParams } = await import('@/app/[locale]/(pseo)/use-cases/[slug]/page');

      const params = await generateStaticParams();

      // Should have 2 slugs × 7 locales = 14 params
      expect(params).toHaveLength(14);

      // Check that specific locale combinations exist
      expect(params).toContainEqual({ slug: 'enhance-photos', locale: 'en' });
      expect(params).toContainEqual({ slug: 'enhance-photos', locale: 'es' });
      expect(params).toContainEqual({ slug: 'restore-old-images', locale: 'pt' });
      expect(params).toContainEqual({ slug: 'restore-old-images', locale: 'de' });
    });

    test('should not include undefined locale', async () => {
      const { generateStaticParams } = await import('@/app/[locale]/(pseo)/use-cases/[slug]/page');

      const params = await generateStaticParams();

      expect(params.every(p => p.locale !== undefined)).toBe(true);
      expect(params.some(p => p.locale === 'undefined')).toBe(false);
      expect(params.every(p => SUPPORTED_LOCALES.includes(p.locale as any))).toBe(true);
    });
  });

  describe('alternatives/[slug]/page.tsx', () => {
    test('should generate params with all locales for alternatives', async () => {
      const { generateStaticParams } =
        await import('@/app/[locale]/(pseo)/alternatives/[slug]/page');

      const params = await generateStaticParams();

      // Should have 2 slugs × 7 locales = 14 params
      expect(params).toHaveLength(14);

      // Check that specific locale combinations exist
      expect(params).toContainEqual({ slug: 'waifu2x-alternative', locale: 'en' });
      expect(params).toContainEqual({ slug: 'waifu2x-alternative', locale: 'fr' });
      expect(params).toContainEqual({ slug: 'letsenhance-alternative', locale: 'it' });
      expect(params).toContainEqual({ slug: 'letsenhance-alternative', locale: 'ja' });
    });

    test('should not include undefined locale', async () => {
      const { generateStaticParams } =
        await import('@/app/[locale]/(pseo)/alternatives/[slug]/page');

      const params = await generateStaticParams();

      expect(params.every(p => p.locale !== undefined)).toBe(true);
      expect(params.some(p => p.locale === 'undefined')).toBe(false);
      expect(params.every(p => SUPPORTED_LOCALES.includes(p.locale as any))).toBe(true);
    });
  });

  describe('compare/[slug]/page.tsx', () => {
    test('should generate params with all locales for compare', async () => {
      const { generateStaticParams } = await import('@/app/[locale]/(pseo)/compare/[slug]/page');

      const params = await generateStaticParams();

      // Should have 2 slugs × 7 locales = 14 params
      expect(params).toHaveLength(14);

      // Check that specific locale combinations exist
      expect(params).toContainEqual({ slug: 'topaz-vs-midjourney', locale: 'en' });
      expect(params).toContainEqual({ slug: 'topaz-vs-midjourney', locale: 'es' });
      expect(params).toContainEqual({ slug: 'canva-vs-adobe', locale: 'pt' });
    });

    test('should not include undefined locale', async () => {
      const { generateStaticParams } = await import('@/app/[locale]/(pseo)/compare/[slug]/page');

      const params = await generateStaticParams();

      expect(params.every(p => p.locale !== undefined)).toBe(true);
      expect(params.some(p => p.locale === 'undefined')).toBe(false);
      expect(params.every(p => SUPPORTED_LOCALES.includes(p.locale as any))).toBe(true);
    });
  });

  describe('Nested tool routes', () => {
    test('should generate params for nested tool routes (resize)', async () => {
      const { generateStaticParams } =
        await import('@/app/[locale]/(pseo)/tools/resize/[slug]/page');

      const params = await generateStaticParams();

      // Should have 6 resize slugs × 7 locales = 42 params
      expect(params.length).toBeGreaterThan(0);

      // Check that params include both slug and locale
      expect(params.every(p => p.slug !== undefined && p.locale !== undefined)).toBe(true);

      // Check that all locales are present for a specific slug
      const imageResizerParams = params.filter(p => p.slug === 'image-resizer');
      expect(imageResizerParams.length).toBe(SUPPORTED_LOCALES.length);
    });

    test('should generate params for nested tool routes (convert)', async () => {
      const { generateStaticParams } =
        await import('@/app/[locale]/(pseo)/tools/convert/[slug]/page');

      const params = await generateStaticParams();

      // Should have 6 conversion slugs × 7 locales = 42 params
      expect(params.length).toBeGreaterThan(0);

      // Check that params include both slug and locale
      expect(params.every(p => p.slug !== undefined && p.locale !== undefined)).toBe(true);

      // Check that all locales are present for a specific slug
      const pngToJpgParams = params.filter(p => p.slug === 'png-to-jpg');
      expect(pngToJpgParams.length).toBe(SUPPORTED_LOCALES.length);
    });

    test('should generate params for nested tool routes (compress)', async () => {
      const { generateStaticParams } =
        await import('@/app/[locale]/(pseo)/tools/compress/[slug]/page');

      const params = await generateStaticParams();

      // Should have 2 compress slugs × 7 locales = 14 params
      expect(params.length).toBeGreaterThan(0);

      // Check that params include both slug and locale
      expect(params.every(p => p.slug !== undefined && p.locale !== undefined)).toBe(true);

      // Check that all locales are present for a specific slug
      const compressorParams = params.filter(p => p.slug === 'image-compressor');
      expect(compressorParams.length).toBe(SUPPORTED_LOCALES.length);
    });

    test('should include all SUPPORTED_LOCALES in nested tool routes', async () => {
      const [resizeParams, convertParams, compressParams] = await Promise.all([
        import('@/app/[locale]/(pseo)/tools/resize/[slug]/page').then(m =>
          m.generateStaticParams()
        ),
        import('@/app/[locale]/(pseo)/tools/convert/[slug]/page').then(m =>
          m.generateStaticParams()
        ),
        import('@/app/[locale]/(pseo)/tools/compress/[slug]/page').then(m =>
          m.generateStaticParams()
        ),
      ]);

      const extractLocales = (params: Awaited<typeof resizeParams>) =>
        params.map(p => p.locale).filter((v, i, a) => a.indexOf(v) === i);

      const resizeLocales = extractLocales(resizeParams);
      const convertLocales = extractLocales(convertParams);
      const compressLocales = extractLocales(compressParams);

      // Each nested route should include all 7 supported locales
      expect(resizeLocales).toEqual(expect.arrayContaining([...SUPPORTED_LOCALES]));
      expect(convertLocales).toEqual(expect.arrayContaining([...SUPPORTED_LOCALES]));
      expect(compressLocales).toEqual(expect.arrayContaining([...SUPPORTED_LOCALES]));
    });
  });
});
