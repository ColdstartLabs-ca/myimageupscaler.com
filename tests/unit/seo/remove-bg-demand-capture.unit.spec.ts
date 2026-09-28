/**
 * /tools/remove-bg demand-capture prerequisites.
 *
 * Evidence (GSC final data, 2026-09-28 read): the site-wide impression spike on
 * 2026-09-24→26 (web 15.1K / 36.4K / 10.8K vs ~11.7K/day the week before) was
 * ~100% /tools/remove-bg on the "remove background" query family, when Google
 * briefly ranked it at position 4–5 (usual position ~40–50). No repo change
 * touched the page in that window, so the demand is external — but MIU could only
 * capture it because the URL was routeable, indexable, self-canonical and in the
 * sitemap. Sitemap inclusion depends on the committed GSC snapshot, and from
 * 2026-08-13 to 2026-09-28 that row held a single impression. The snapshot sync
 * guard only trips on mass drops (>=20 pages and >=25%), so losing this one row
 * would silently de-list the page.
 */
import { describe, expect, it, vi } from 'vitest';
import toolsData from '@/app/seo/data/tools.json';
import { getEligibilityReason } from '@/lib/seo/page-eligibility';

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
    TWITTER_HANDLE: 'myimageupscaler',
  },
  serverEnv: { ENV: 'test' },
}));

const REMOVE_BG_URL = 'https://myimageupscaler.com/tools/remove-bg';

describe('/tools/remove-bg keeps the prerequisites that captured the Sep 2026 spike', () => {
  it('earns sitemap eligibility from measured impressions, not a grace period', () => {
    const tool = toolsData.pages.find(page => page.slug === 'remove-bg');

    expect(tool).toBeDefined();
    expect(getEligibilityReason('tools', 'remove-bg', 'en', tool?.lastUpdated)).toBe('impressions');
  });

  it('is emitted in the English tools sitemap', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { GET } = await import('@/app/sitemap-tools.xml/route');

    const xml = await (await GET()).text();

    expect(xml).toContain(`<loc>${REMOVE_BG_URL}</loc>`);
  });

  it('renders as indexable with a self-referencing URL', async () => {
    const { generateMetadata } = await import('@/app/(pseo)/tools/[slug]/page');

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'remove-bg' }) });

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.openGraph?.url).toBe(REMOVE_BG_URL);
  }, 20_000); // cold import of the page module takes 2-5s

  it('closes with a free remove-background CTA that returns to the widget', () => {
    const tool = toolsData.pages.find(page => page.slug === 'remove-bg');

    expect(tool).toMatchObject({
      ctaTitle: 'Ready for a clean cutout?',
      ctaHighlightText: 'Remove your background free',
      ctaDescription:
        'Upload a JPG, PNG, or WebP. No signup, no watermark, and your image stays in your browser.',
      ctaText: 'Remove Background Free',
      ctaUrl: '#tool',
      ctaTrustItems: ['Free to use', 'No account required', 'Processed in your browser'],
    });
  });
});
