import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { filterEligibleSitemapEntries } from '@/lib/seo/page-eligibility';

const directPseoRoutes = [
  'app/sitemap-ai-features.xml/route.ts',
  'app/sitemap-alternatives.xml/route.ts',
  'app/sitemap-bulk-tools.xml/route.ts',
  'app/sitemap-camera-raw.xml/route.ts',
  'app/sitemap-compare.xml/route.ts',
  'app/sitemap-comparisons-expanded.xml/route.ts',
  'app/sitemap-content.xml/route.ts',
  'app/sitemap-device-optimization.xml/route.ts',
  'app/sitemap-device-use.xml/route.ts',
  'app/sitemap-format-scale.xml/route.ts',
  'app/sitemap-formats.xml/route.ts',
  'app/sitemap-free.xml/route.ts',
  'app/sitemap-guides.xml/route.ts',
  'app/sitemap-images.xml/route.ts',
  'app/sitemap-industry-insights.xml/route.ts',
  'app/sitemap-personas-expanded.xml/route.ts',
  'app/sitemap-photo-restoration.xml/route.ts',
  'app/sitemap-platforms.xml/route.ts',
  'app/sitemap-platform-format.xml/route.ts',
  'app/sitemap-scale.xml/route.ts',
  'app/sitemap-technical-guides.xml/route.ts',
  'app/sitemap-tools.xml/route.ts',
  'app/sitemap-use-cases.xml/route.ts',
];

describe('direct pSEO sitemap producers', () => {
  it('does not leave a page-list sitemap producer outside a shared policy entry point', () => {
    const exemptRoutes = new Set([
      'sitemap-ai-photo-editor.xml',
      'sitemap-blog.xml',
      'sitemap-static.xml',
      'sitemap-use-cases-expanded.xml',
    ]);
    const routeFiles = readdirSync('app').filter(
      file => file.startsWith('sitemap-') && file.endsWith('.xml')
    );

    for (const routeFile of routeFiles) {
      if (exemptRoutes.has(routeFile)) continue;
      const source = readFileSync(`app/${routeFile}/route.ts`, 'utf8');
      if (!source.includes('.map(')) continue;
      expect(source, routeFile).toMatch(
        /filterEligibleSitemapEntries|generateLocaleCategorySitemapResponse|generateSitemapUrlEntry/
      );
    }
  });

  it('routes every direct pSEO page list through the shared eligibility helper', () => {
    for (const routePath of directPseoRoutes) {
      const source = readFileSync(routePath, 'utf8');
      expect(source, routePath).toContain('filterEligibleSitemapEntries');
    }
  });

  it('drops an old zero-impression page from a direct route entry list', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const eligible = filterEligibleSitemapEntries(
      [{ slug: 'bmp-format-guide', lastUpdated: '2025-12-26T00:00:00Z' }],
      'guides',
      'en',
      page => `/guides/${page.slug}`,
      page => page.lastUpdated
    );

    expect(eligible).toEqual([]);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('skipped=1'));
    info.mockRestore();
  });
});

vi.mock('@/lib/seo/data-loader', () => ({
  getAllGuides: vi.fn().mockResolvedValue([
    {
      slug: 'bmp-format-guide',
      title: 'BMP format guide',
      lastUpdated: '2025-12-26T00:00:00Z',
    },
  ]),
}));

describe('guides sitemap route', () => {
  it('does not emit an ineligible page URL', async () => {
    const { GET } = await import('@/app/sitemap-guides.xml/route');
    const response = await GET();
    const xml = await response.text();

    expect(xml).not.toContain('/guides/bmp-format-guide');
  });
});
