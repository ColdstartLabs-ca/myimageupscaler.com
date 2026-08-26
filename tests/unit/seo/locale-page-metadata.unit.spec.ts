import { describe, expect, it, vi } from 'vitest';
import { resolveLocalePageMetadata } from '@/lib/seo/locale-page-metadata';
import type { PSEOPage } from '@/lib/seo/pseo-types';

const englishPage = {
  slug: 'dalle-upscaler-png',
  title: 'DALL-E PNG Upscaler',
  metaTitle: 'DALL-E PNG Upscaler | MyImageUpscaler',
  metaDescription: 'Upscale DALL-E PNG images online.',
  secondaryKeywords: [],
  lastUpdated: '2026-08-25',
} as unknown as PSEOPage;

describe('resolveLocalePageMetadata', () => {
  it('should return a real title and noindex when the locale has no translation', async () => {
    const loader = vi.fn(async (_slug: string, locale: string) => ({
      data: locale === 'en' ? englishPage : null,
      hasTranslation: locale === 'en',
      isLocalizedCategory: true,
    }));

    const metadata = await resolveLocalePageMetadata(
      loader,
      'platform-format',
      englishPage.slug,
      'es'
    );

    expect(metadata.title).toBe(englishPage.metaTitle);
    expect(metadata.robots).toMatchObject({ index: false, follow: true });
    expect(loader).toHaveBeenNthCalledWith(1, englishPage.slug, 'es');
    expect(loader).toHaveBeenNthCalledWith(2, englishPage.slug, 'en');
  });

  it('should preserve the factory index verdict when a translation exists', async () => {
    const loader = vi.fn(async () => ({
      data: englishPage,
      hasTranslation: true,
      isLocalizedCategory: true,
    }));

    const metadata = await resolveLocalePageMetadata(
      loader,
      'platform-format',
      englishPage.slug,
      'es'
    );

    expect(metadata.title).toBe(englishPage.metaTitle);
    expect(metadata.robots).toMatchObject({ follow: true });
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
