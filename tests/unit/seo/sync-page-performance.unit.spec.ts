import { describe, expect, it } from 'vitest';
import {
  buildInventory,
  buildSnapshot,
  normalizePageIdentity,
  assertNoCatastrophicEarningRegression,
  type IInventoryPage,
} from '@/scripts/seo/sync-page-performance';

const range = {
  startDate: '2026-05-12',
  endDate: '2026-08-09',
  days: 90,
};

describe('pSEO performance inventory', () => {
  it('seeds only locales backed by measured translated pairs without dropping routeable categories', () => {
    const inventory = buildInventory([
      { category: 'guides', slug: 'bmp-format-guide', lastUpdated: '2025-12-26T00:00:00Z' },
      { category: 'alternatives', slug: 'topaz-gigapixel', lastUpdated: '2026-08-25' },
      { category: 'ai-features', slug: 'ai-artifact-removal-upscaler', lastUpdated: '2026-02-11' },
      {
        category: 'use-cases-expanded',
        slug: 'ecommerce-product-images',
        lastUpdated: '2026-02-11',
      },
    ]);

    expect(inventory.filter(page => page.category === 'guides')).toHaveLength(1);
    expect(inventory.filter(page => page.category === 'alternatives')).toHaveLength(7);
    expect(inventory.filter(page => page.category === 'ai-features')).toHaveLength(1);
    expect(inventory.filter(page => page.category === 'use-cases-expanded')).toHaveLength(1);
    expect(inventory.some(page => page.category === 'guides' && page.locale === 'fr')).toBe(false);
  });

  it('keeps an exact locale zero row instead of falling back to English', () => {
    const inventory: IInventoryPage[] = [
      {
        category: 'tools',
        slug: 'resize-image-for-instagram',
        locale: 'en',
        url: 'https://myimageupscaler.com/tools/resize/resize-image-for-instagram',
        lastUpdated: '2025-01-19',
      },
      {
        category: 'tools',
        slug: 'resize-image-for-instagram',
        locale: 'fr',
        url: 'https://myimageupscaler.com/fr/tools/resize/resize-image-for-instagram',
        lastUpdated: '2025-01-19',
      },
    ];

    const snapshot = buildSnapshot(
      inventory,
      [
        {
          keys: ['https://myimageupscaler.com/tools/resize/resize-image-for-instagram/'],
          impressions: 4,
          clicks: 1,
          ctr: 0.25,
          position: 5,
        },
      ],
      range,
      'sc-domain:myimageupscaler.com',
      '2026-08-13T00:00:00.000Z'
    );

    expect(snapshot.pages).toHaveLength(2);
    expect(snapshot.pages.find(page => page.locale === 'en')).toMatchObject({
      impressions: 4,
      clicks: 1,
    });
    expect(snapshot.pages.find(page => page.locale === 'fr')).toMatchObject({
      impressions: 0,
      clicks: 0,
    });
  });

  it('normalizes locale, category, slug, query strings, and trailing slashes deterministically', () => {
    expect(
      normalizePageIdentity(
        'https://myimageupscaler.com/fr/tools/resize/resize-image-for-instagram/?utm_source=gsc'
      )
    ).toEqual({ category: 'tools', slug: 'resize-image-for-instagram', locale: 'fr' });
    expect(
      normalizePageIdentity('https://myimageupscaler.com/personas-expanded/photo-editor')
    ).toEqual({ category: 'personas-expanded', slug: 'photo-editor', locale: 'en' });
  });

  it('rejects a refresh that catastrophically erases previously earning pages', () => {
    const inventory: IInventoryPage[] = Array.from({ length: 40 }, (_, index) => ({
      category: 'guides',
      slug: `guide-${index}`,
      locale: 'en',
      url: `https://myimageupscaler.com/guides/guide-${index}`,
    }));
    const rows = inventory.map((page, index) => ({
      keys: [page.url],
      impressions: index < 5 ? 10 : 0,
      clicks: index < 5 ? 1 : 0,
      ctr: index < 5 ? 0.1 : 0,
      position: 5,
    }));
    const previous = buildSnapshot(
      inventory,
      inventory.map(page => ({
        keys: [page.url],
        impressions: 10,
        clicks: 1,
        ctr: 0.1,
        position: 5,
      })),
      range,
      'sc-domain:myimageupscaler.com',
      '2026-08-13T00:00:00.000Z'
    );
    const candidate = buildSnapshot(
      inventory,
      rows,
      range,
      'sc-domain:myimageupscaler.com',
      '2026-09-28T00:00:00.000Z'
    );

    expect(() => assertNoCatastrophicEarningRegression(previous, candidate)).toThrow(
      /35 previously earning pages/
    );
  });
});
