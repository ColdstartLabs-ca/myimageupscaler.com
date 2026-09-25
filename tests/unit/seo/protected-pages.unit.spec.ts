/**
 * Protected pages: the URLs that carry MIU's organic clicks and signups.
 *
 * Evidence (GSC + GA4 organic, 56 days to 2026-09-22):
 * - `/` = 38% of organic clicks ("image upscaler" 743, "upscaler" 158, "imageupscaler" 114).
 * - Brand queries ("myimageupscaler", "my image upscaler") land returning users who produce
 *   53%+ of organic key events via /dashboard — branded locale homepage titles keep the brand.
 * - `/tools/ai-image-upscaler` owns "image upscaler 8x" (245 clicks); the scale pages own
 *   "16x upscaler" / "2k upscaler".
 *
 * These pins exist because a bulk copy pass on 2026-09-10 stripped the free offer and cut
 * signups ~40%. Changing a pinned term needs a deliberate, single-page decision with a
 * seo-changes-backlog entry and a 7-day readback — not a drive-by cleanup.
 * The flagship blog post (/blog/best-free-ai-image-upscaler-2026-tested-compared, 1,690 clicks,
 * #2 organic converter) lives in Supabase and is guarded by the Three Kings ledger instead.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import scaleData from '@/app/seo/data/scale.json';
import toolsData from '@/app/seo/data/tools.json';

interface IPseoPage {
  slug: string;
  metaTitle?: string;
  title?: string;
  h1?: string;
}

const pageOf = (data: { pages: IPseoPage[] }, slug: string): IPseoPage => {
  const page = data.pages.find(p => p.slug === slug);
  if (!page) throw new Error(`protected page ${slug} is missing from its data file`);
  return page;
};

const LOCALES_DIR = join(process.cwd(), 'locales');
const homepageTitle = (locale: string): string =>
  JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'common.json'), 'utf8')).meta.homepage.title;

describe('protected pages keep the terms their top queries match', () => {
  it('keeps "Image Upscaler", "Free" and the brand in the English homepage title', () => {
    const title = homepageTitle('en');
    expect(title).toMatch(/image upscaler/i);
    expect(title).toMatch(/free/i);
    expect(title).toContain('MyImageUpscaler');
  });

  // de/fr titles are unbranded today; adding the brand there is a separate single-page test.
  it.each(['en', 'es', 'it', 'ja', 'pt'])('keeps the brand in the %s homepage title', locale => {
    expect(homepageTitle(locale)).toContain('MyImageUpscaler');
  });

  it('keeps "Free", "Image Upscaler" and "8x" on /tools/ai-image-upscaler', () => {
    const page = pageOf(toolsData as { pages: IPseoPage[] }, 'ai-image-upscaler');
    for (const field of [page.metaTitle ?? page.title, page.h1]) {
      expect(field).toMatch(/free/i);
      expect(field).toMatch(/image upscaler/i);
      expect(field).toMatch(/8x/i);
    }
  });

  it.each([
    ['upscale-16x', /16x/i],
    ['2k-upscaler', /2k/i],
  ])('keeps the scale term and "Upscaler" on /scale/%s', (slug, term) => {
    const page = pageOf(scaleData as { pages: IPseoPage[] }, slug);
    for (const field of [page.metaTitle ?? page.title, page.h1]) {
      expect(field).toMatch(term);
      expect(field).toMatch(/upscaler/i);
    }
  });
});
