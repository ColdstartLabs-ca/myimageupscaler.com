import { describe, expect, it, vi } from 'vitest';
import { generateLocalizedSitemap, generateSitemapUrlEntry } from '@/lib/seo/sitemap-generator';
import {
  generateLocaleCategorySitemapResponse,
  type ILocaleSitemapPage,
} from '@/lib/seo/locale-sitemap-handler';

const OLD_DATE = '2025-01-01T00:00:00.000Z';

describe('sitemap eligibility', () => {
  it('excludes zero-impression matrix pages from generated sitemaps', () => {
    const xml = generateLocalizedSitemap(
      {
        category: 'tools',
        entries: [
          {
            path: '/tools/resize/resize-image-for-instagram',
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

    expect(xml).not.toContain('/tools/resize/resize-image-for-instagram');
    expect(xml).toContain('/tools/convert/convert-jpeg-to-png');
    expect(xml.match(/<loc>/g)).toHaveLength(2);
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
            path: '/tools/resize/resize-image-for-instagram',
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
    expect(info).toHaveBeenCalledWith(expect.stringContaining('skipped=1'));
    info.mockRestore();
  });

  it('filters locale sitemap pages through the same policy', async () => {
    const pages: ILocaleSitemapPage[] = [
      { slug: 'resize-image-for-instagram', lastUpdated: OLD_DATE },
      { slug: 'convert-jpeg-to-png', lastUpdated: OLD_DATE },
    ];

    const response = generateLocaleCategorySitemapResponse('fr', 'tools', 'tools', pages);
    const xml = await response.text();

    expect(xml).not.toContain('/fr/tools/resize/resize-image-for-instagram');
    expect(xml).toContain('/fr/tools/convert-jpeg-to-png');
  });
});
