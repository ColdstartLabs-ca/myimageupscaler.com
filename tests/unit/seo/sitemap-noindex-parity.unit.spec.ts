import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getAllAlternatives, getAlternativeDataWithLocale } from '@/lib/seo/data-loader';
import { generateMetadata } from '@/lib/seo/metadata-factory';
import { resolveLocalePageMetadata } from '@/lib/seo/locale-page-metadata';
import { filterEligiblePages, filterEligibleSitemapEntries } from '@/lib/seo/page-eligibility';
import type { Locale } from '@/i18n/config';

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    TWITTER_HANDLE: 'myimageupscaler',
  },
  serverEnv: { ENV: 'test' },
}));

const localeRoutes = {
  es: () => import('@/app/sitemap-alternatives-es.xml/route'),
  pt: () => import('@/app/sitemap-alternatives-pt.xml/route'),
  de: () => import('@/app/sitemap-alternatives-de.xml/route'),
  fr: () => import('@/app/sitemap-alternatives-fr.xml/route'),
  it: () => import('@/app/sitemap-alternatives-it.xml/route'),
  ja: () => import('@/app/sitemap-alternatives-ja.xml/route'),
};
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-02T17:00:00Z'));
});
afterAll(() => vi.useRealTimers());

describe('sitemap and rendered noindex parity', () => {
  it('excludes an explicit noindex even when it has a fresh date or a pinned slug', () => {
    const pages = [{ slug: 'ai-image-upscaler', noindex: true, lastUpdated: '2026-11-01' }];
    expect(filterEligiblePages(pages, 'tools', 'en').pages).toEqual([]);
    expect(
      filterEligibleSitemapEntries(
        pages,
        'tools',
        'en',
        page => `/tools/${page.slug}`,
        page => page.lastUpdated
      )
    ).toEqual([]);
  });

  it('removes the noindex comparison without dropping indexable comparison controls', async () => {
    const { GET } = await import('@/app/sitemap-compare.xml/route');
    const xml = await (await GET()).text();
    expect(locs(xml)).not.toContain(
      'https://myimageupscaler.com/compare/midjourney-vs-stable-diffusion'
    );
    expect(locs(xml)).toContain('https://myimageupscaler.com/compare/best-ai-upscalers');
  });

  it.each(Object.entries(localeRoutes))(
    '%s alternatives submit only pages that their real metadata permits indexing',
    async (language, loadRoute) => {
      const locale = language as Locale;
      const xml = await (await (await loadRoute()).GET()).text();
      const urls = locs(xml);
      expect(urls).toContain(`https://myimageupscaler.com/${locale}/alternatives`);
      expect(urls).not.toContain(
        `https://myimageupscaler.com/${locale}/alternatives/vs-adobe-express`
      );
      const adobeMetadata = await resolveLocalePageMetadata(
        getAlternativeDataWithLocale,
        'alternatives',
        'vs-adobe-express',
        locale
      );
      expect(adobeMetadata.robots).toMatchObject({ index: false });
      if (locale === 'es') {
        expect(urls).not.toContain('https://myimageupscaler.com/es/alternatives/vs-imgupscaler');
      }
      for (const url of urls.filter(url => url.split('/').length === 6)) {
        const slug = url.split('/').at(-1)!;
        const metadata = await resolveLocalePageMetadata(
          getAlternativeDataWithLocale,
          'alternatives',
          slug,
          locale
        );
        expect(metadata.robots, url).toMatchObject({ index: true });
      }
    }
  );

  it('uses actual locale dates and omits missing translations rather than English fallback', async () => {
    const spanish = await getAllAlternatives('es');
    expect(spanish.some(page => page.slug === 'vs-imgupscaler')).toBe(false);
    const french = await getAllAlternatives('fr');
    const adobe = french.find(page => page.slug === 'vs-adobe-express')!;
    const rendered = await getAlternativeDataWithLocale('vs-adobe-express', 'fr');
    expect(adobe.lastUpdated).toBe(rendered.data?.lastUpdated);
  });

  it('preserves the refreshed, indexable English Adobe Express owner', async () => {
    const { GET } = await import('@/app/sitemap-alternatives.xml/route');
    const xml = await (await GET()).text();
    expect(locs(xml)).toContain('https://myimageupscaler.com/alternatives/vs-adobe-express');
    const page = (await getAllAlternatives()).find(page => page.slug === 'vs-adobe-express')!;
    expect(generateMetadata(page, 'alternatives').robots).toMatchObject({ index: true });
  });
});
