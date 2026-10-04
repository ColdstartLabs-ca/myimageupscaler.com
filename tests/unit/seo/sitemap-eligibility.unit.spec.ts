import { describe, expect, it, vi } from 'vitest';

/**
 * The eligibility policy reads the committed GSC snapshot at import time, so
 * asserting against the live `content/pseo-performance.json` made this policy
 * test fail whenever a monthly snapshot refresh drops or adds a locale row.
 * Pin the rows the policy branches on instead.
 */
vi.mock('@/content/pseo-performance.json', () => ({
  default: {
    generatedAt: '2026-08-13T00:00:00.000Z',
    pages: [
      // Tracked in GSC but earning nothing -> pruned.
      {
        category: 'tools',
        slug: 'svg-to-jpg',
        locale: 'fr',
        impressions: 0,
        clicks: 0,
        lastUpdated: '2025-01-01T00:00:00.000Z',
      },
      // The English page earns impressions -> stays submitted.
      {
        category: 'tools',
        slug: 'convert-jpeg-to-png',
        locale: 'en',
        impressions: 12,
        clicks: 1,
        lastUpdated: '2025-01-01T00:00:00.000Z',
      },
    ],
  },
}));

import { generateLocalizedSitemap, generateSitemapUrlEntry } from '@/lib/seo/sitemap-generator';
import {
  generateLocaleCategorySitemapResponse,
  type ILocaleSitemapPage,
} from '@/lib/seo/locale-sitemap-handler';

const OLD_DATE = '2025-01-01T00:00:00.000Z';

describe('sitemap eligibility', () => {
  it('excludes zero-impression and untracked locale variants from generated sitemaps', () => {
    const xml = generateLocalizedSitemap(
      {
        category: 'tools',
        entries: [
          {
            path: '/tools/convert/svg-to-jpg',
            lastModified: OLD_DATE,
          },
          {
            path: '/tools/convert/convert-jpeg-to-png',
            lastModified: OLD_DATE,
          },
        ],
      },
      'fr'
    );

    expect(xml).not.toContain('/tools/convert/svg-to-jpg');
    expect(xml).not.toContain('/tools/convert/convert-jpeg-to-png');
    expect(xml.match(/<loc>/g)).toHaveLength(1);
  });

  it('keeps a click-producing page submitted', () => {
    const entry = generateSitemapUrlEntry({
      path: '/tools/convert/convert-jpeg-to-png',
      lastModified: OLD_DATE,
      includeHreflang: false,
    });

    expect(entry).toContain('/tools/convert/convert-jpeg-to-png');
  });

  it('logs the dropped count per sitemap', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    generateLocalizedSitemap(
      {
        category: 'tools',
        entries: [
          {
            path: '/tools/convert/svg-to-jpg',
            lastModified: OLD_DATE,
          },
          {
            path: '/tools/convert/convert-jpeg-to-png',
            lastModified: OLD_DATE,
          },
        ],
      },
      'fr'
    );

    expect(info).toHaveBeenCalledWith(expect.stringContaining('[sitemap:tools:fr]'));
    expect(info).toHaveBeenCalledWith(expect.stringContaining('skipped=2'));
    info.mockRestore();
  });

  it('should log an eligibility reason for every excluded URL', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    generateLocalizedSitemap(
      {
        category: 'platform-format',
        entries: [
          {
            path: '/platform-format/dalle-upscaler-png',
            lastModified: '2026-01-06',
          },
        ],
      },
      'ja'
    );

    expect(info).toHaveBeenCalledWith(expect.stringContaining('reasons={"untracked":1}'));
    info.mockRestore();
  });

  it('filters locale sitemap pages through the same policy', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const pages: ILocaleSitemapPage[] = [
      { slug: 'svg-to-jpg', lastUpdated: OLD_DATE },
      { slug: 'convert-jpeg-to-png', lastUpdated: OLD_DATE },
    ];

    const response = generateLocaleCategorySitemapResponse('fr', 'tools', 'tools', pages);
    const xml = await response.text();

    expect(xml).not.toContain('/fr/tools/convert/svg-to-jpg');
    expect(xml).not.toContain('/fr/tools/convert-jpeg-to-png');
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('reasons={"pruned":1,"untracked":1}')
    );
    info.mockRestore();
  });
});
