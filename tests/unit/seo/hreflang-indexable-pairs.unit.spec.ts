/**
 * PRD-TR-2026-11-02 AC-3: pSEO hreflang alternates only point at indexable locale twins.
 * A hreflang pair with a noindex page is ignored by Google and wastes crawl.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
    TWITTER_HANDLE: 'myimageupscaler',
  },
  serverEnv: { ENV: 'test' },
}));

import { generateMetadata } from '@/lib/seo/metadata-factory';
import { shouldSubmit } from '@/lib/seo/page-eligibility';
import alternatives from '../../../app/seo/data/alternatives.json';
import tools from '../../../app/seo/data/tools.json';

type IPage = Parameters<typeof generateMetadata>[0];

const cases: Array<[string, IPage[]]> = [
  ['alternatives', (alternatives as { pages: IPage[] }).pages],
  ['tools', (tools as { pages: IPage[] }).pages],
];

describe('pSEO hreflang indexable pairs', () => {
  it.each(cases)('%s: every non-en hreflang target is an indexable page', (category, pages) => {
    let checked = 0;
    for (const page of pages) {
      const languages = (generateMetadata(page, category as never).alternates?.languages ??
        {}) as Record<string, string>;
      for (const hreflang of Object.keys(languages)) {
        if (hreflang === 'en' || hreflang === 'x-default') continue;
        checked++;
        expect(
          shouldSubmit(category, page.slug, hreflang, page.lastUpdated),
          `${category}/${page.slug} -> ${hreflang}`
        ).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
