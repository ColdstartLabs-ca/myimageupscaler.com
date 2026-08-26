import { describe, expect, it } from 'vitest';
import scaleData from '@/app/seo/data/scale.json';
import deviceUseData from '@/app/seo/data/device-use.json';
import { generateMetadata } from '@/lib/seo/metadata-factory';
import { generateHreflangAlternates } from '@/lib/seo/hreflang-generator';
import { isTranslatedPair, LOCALIZED_CATEGORIES } from '@/lib/seo/localization-config';
import { generateLocaleCategorySitemapResponse } from '@/lib/seo/locale-sitemap-handler';
import type { IScalePage, IPSEODataFile } from '@/lib/seo/pseo-types';

describe('measured locale surface retraction', () => {
  it('should noindex an english-mirror locale page', () => {
    const page = (scaleData as unknown as IPSEODataFile<IScalePage>).pages.find(
      candidate => candidate.slug === '2k-upscaler'
    );
    expect(page).toBeDefined();
    const metadata = generateMetadata(page!, 'scale', 'es');
    expect(metadata.robots).toMatchObject({ index: false, follow: true });
  });

  it('should preserve a genuinely translated category-locale pair', async () => {
    expect(isTranslatedPair('device-use', 'fr')).toBe(true);
    expect(isTranslatedPair('scale', 'es')).toBe(false);

    const page = (deviceUseData as unknown as IPSEODataFile<IScalePage>).pages.find(
      candidate => candidate.slug === 'mobile-ecommerce-upscaler'
    );
    expect(page).toBeDefined();
    expect(generateMetadata(page!, 'device-use', 'fr').robots).toMatchObject({ index: true });

    const response = generateLocaleCategorySitemapResponse('fr', 'device-use', 'device-use', [
      { slug: 'mobile-ecommerce-upscaler', lastUpdated: page!.lastUpdated },
    ]);
    expect(await response.text()).toContain('/fr/device-use/mobile-ecommerce-upscaler');
  });

  it('should not declare hreflang for an untranslated locale', () => {
    const scaleAlternates = generateHreflangAlternates('/scale/2k-upscaler', 'scale');
    const deviceAlternates = generateHreflangAlternates(
      '/device-use/mobile-ecommerce-upscaler',
      'device-use'
    );

    expect(scaleAlternates).not.toHaveProperty('es');
    expect(deviceAlternates).toHaveProperty('fr');
    expect(scaleAlternates.en).not.toContain('/en/');
  });

  it('should exclude untranslated locale URLs from their direct sitemap route', async () => {
    const response = generateLocaleCategorySitemapResponse('es', 'scale', 'scale', [
      { slug: '2k-upscaler', lastUpdated: '2025-12-19T00:00:00Z' },
    ]);
    expect(await response.text()).not.toContain('/es/scale/2k-upscaler');
  });

  it('should derive localized categories from the coverage artifact', () => {
    expect(LOCALIZED_CATEGORIES).toContain('device-use');
    expect(LOCALIZED_CATEGORIES).not.toContain('scale');
  });
});
