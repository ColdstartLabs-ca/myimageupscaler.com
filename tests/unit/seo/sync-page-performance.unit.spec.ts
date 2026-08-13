import { describe, expect, it } from 'vitest';
import {
  buildInventory,
  buildSnapshot,
  normalizePageIdentity,
  type IInventoryPage,
} from '@/scripts/seo/sync-page-performance';

const range = {
  startDate: '2026-05-12',
  endDate: '2026-08-09',
  days: 90,
};

describe('pSEO performance inventory', () => {
  it('seeds every emitted locale for localized categories', () => {
    const inventory = buildInventory([
      { category: 'guides', slug: 'bmp-format-guide', lastUpdated: '2025-12-26T00:00:00Z' },
      { category: 'ai-features', slug: 'ai-artifact-removal-upscaler', lastUpdated: '2026-02-11' },
    ]);

    expect(inventory.filter(page => page.category === 'guides')).toHaveLength(7);
    expect(inventory.filter(page => page.category === 'ai-features')).toHaveLength(1);
    expect(inventory.some(page => page.category === 'guides' && page.locale === 'fr')).toBe(true);
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
});
