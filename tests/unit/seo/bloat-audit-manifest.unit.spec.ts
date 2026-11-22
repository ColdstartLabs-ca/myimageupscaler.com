import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  normalizeUrl,
  classifyBlogPost,
  classifyPseoPage,
  buildManifest,
  buildConsolidation,
  GUARDED_SLUGS,
  OWNER_RULES,
} = require('../../../scripts/seo/audit-index-bloat.cjs');

const OPTIONS = { recentCutoff: '2026-10-07' };
const BASE = 'https://myimageupscaler.com';
const OWNER_BLOG_SLUGS = OWNER_RULES.filter((rule: { target: string }) =>
  rule.target.startsWith('/blog/')
).map((rule: { target: string }) => rule.target.slice('/blog/'.length));

function gscRow(path: string, clicks: number, impressions = 0) {
  return { page: `${BASE}${path}`, clicks, impressions };
}

function ga4Row(path: string, sessions: number, conversions: number) {
  return { page: path, sessions, conversions };
}

function manifestInputs(
  blogRows: ReturnType<typeof gscRow>[],
  posts: Array<{ slug: string; lastmod: string }>,
  ga4Rows: ReturnType<typeof ga4Row>[] = []
) {
  const sitemapPosts = [
    ...OWNER_BLOG_SLUGS.map((slug: string) => ({ slug, lastmod: '2026-01-01' })),
    ...posts,
  ];
  return {
    gsc: {
      startDate: '2026-05-23',
      endDate: '2026-11-18',
      rows: [...OWNER_BLOG_SLUGS.map((slug: string) => gscRow(`/blog/${slug}`, 1)), ...blogRows],
    },
    sitemap: {
      fetchedAt: '2026-11-21',
      urls: [
        { loc: `${BASE}/blog`, lastmod: '2026-11-21' },
        ...sitemapPosts.map(post => ({
          loc: `${BASE}/blog/${post.slug}`,
          lastmod: post.lastmod,
        })),
      ],
    },
    ga4: { rows: ga4Rows },
    pseo: [
      { category: 'platform-format', pages: [{ slug: 'midjourney-upscaler-png' }] },
      { category: 'alternatives', pages: [{ slug: 'vs-bigjpg' }] },
    ],
  };
}

describe('audit-index-bloat normalizeUrl', () => {
  it('strips fragment, query and trailing slash', () => {
    expect(normalizeUrl(`${BASE}/blog/some-post/?a=1#section`)).toBe(`${BASE}/blog/some-post`);
    expect(normalizeUrl(`${BASE}/`)).toBe(BASE);
    expect(normalizeUrl(`${BASE}/blog/some-post`)).toBe(`${BASE}/blog/some-post`);
  });
});

describe('audit-index-bloat blog rule order', () => {
  it('guards listed slugs even with zero clicks', () => {
    const result = classifyBlogPost(
      {
        slug: 'tiktok-profile-picture-ideas',
        clicks180: 0,
        impressions180: 0,
        lastmod: '2026-01-01',
      },
      OPTIONS
    );
    expect(result).toEqual({ disposition: 'DEFER_GUARDED' });
  });

  it('guards owner targets before the KEEP rule', () => {
    const result = classifyBlogPost(
      { slug: 'best-image-upscaler', clicks180: 500, impressions180: 9000, lastmod: '2026-01-01' },
      OPTIONS
    );
    expect(result).toEqual({ disposition: 'DEFER_GUARDED' });
  });

  it('keeps posts with clicks', () => {
    const result = classifyBlogPost(
      { slug: 'credit-based-pricing', clicks180: 2, impressions180: 10, lastmod: '2026-01-01' },
      OPTIONS
    );
    expect(result).toEqual({ disposition: 'KEEP' });
  });

  it('defers recent posts before considering a merge rule', () => {
    expect(
      classifyBlogPost(
        { slug: 'remove-background-noise', clicks180: 0, impressions180: 0, lastmod: '2026-10-07' },
        OPTIONS
      )
    ).toEqual({ disposition: 'DEFER_RECENT' });
    expect(
      classifyBlogPost(
        { slug: 'remove-background-noise', clicks180: 0, impressions180: 0, lastmod: '2026-10-06' },
        OPTIONS
      )
    ).toEqual({ disposition: 'MERGE_301', target: '/tools/remove-bg' });
  });

  it.each([
    ['remove-background-from-photo', '/tools/remove-bg'],
    ['photo-noise-remover', '/blog/noise-reduction-in-photos'],
    ['restore-old-photos', '/blog/best-free-photo-restoration-services-online'],
    ['fix-blurry-pictures', '/blog/best-app-for-unblurring-photos'],
    ['print-poster-size', '/blog/upscale-image-for-print-300-dpi-guide'],
    ['photo-enhancer-online', '/blog/best-free-ai-photo-enhancer-online'],
    ['upscale-image-to-8k', '/blog/best-image-upscaler'],
  ])('merges %s into %s', (slug, target) => {
    expect(
      classifyBlogPost({ slug, clicks180: 0, impressions180: 0, lastmod: '2026-01-01' }, OPTIONS)
    ).toEqual({ disposition: 'MERGE_301', target });
  });

  it('noindexes unmatched zero-click posts', () => {
    expect(
      classifyBlogPost(
        { slug: 'credit-based-pricing', clicks180: 0, impressions180: 9, lastmod: '2026-01-01' },
        OPTIONS
      )
    ).toEqual({ disposition: 'NOINDEX_UNPUBLISH' });
  });

  it('noindexes off-topic posts with zero GA4 conversions even when they have clicks', () => {
    expect(
      classifyBlogPost(
        {
          slug: '4-k-youtube-to-mp-4',
          clicks180: 142,
          impressions180: 3232,
          lastmod: '2026-06-09',
          offTopic: true,
          ga4Conversions90: 0,
        },
        OPTIONS
      )
    ).toEqual({ disposition: 'NOINDEX_UNPUBLISH', reason: 'off-topic, 0 GA4 conversions in 90d' });
  });

  it('keeps off-topic posts with GA4 conversions', () => {
    expect(
      classifyBlogPost(
        {
          slug: 'animation-maker-for-minecraft',
          clicks180: 288,
          impressions180: 21990,
          lastmod: '2026-06-02',
          offTopic: true,
          ga4Conversions90: 8,
        },
        OPTIONS
      )
    ).toEqual({ disposition: 'KEEP' });
  });

  it('evaluates the guarded rule before the off-topic rule', () => {
    expect(
      classifyBlogPost(
        {
          slug: 'tiktok-profile-picture-ideas',
          clicks180: 0,
          impressions180: 0,
          lastmod: '2026-01-01',
          offTopic: true,
          ga4Conversions90: 0,
        },
        OPTIONS
      )
    ).toEqual({ disposition: 'DEFER_GUARDED' });
  });
});

describe('audit-index-bloat pSEO rules', () => {
  it('keeps pages with clicks and noindexes zero-click pages', () => {
    expect(classifyPseoPage({ category: 'platform-format', slug: 'a', clicks180: 1 })).toEqual({
      disposition: 'KEEP',
    });
    expect(classifyPseoPage({ category: 'platform-format', slug: 'a', clicks180: 0 })).toEqual({
      disposition: 'NOINDEX_UNPUBLISH',
    });
  });

  it('guards the protected alternatives pages', () => {
    for (const slug of ['vs-adobe-express', 'vs-bigjpg', 'vs-waifu2x', 'vs-iloveimg']) {
      expect(classifyPseoPage({ category: 'alternatives', slug, clicks180: 0 })).toEqual({
        disposition: 'DEFER_GUARDED',
      });
    }
  });
});

describe('audit-index-bloat buildManifest', () => {
  it('sums normalized rows, sorts by slug and writes the expected shape', () => {
    const inputs = manifestInputs(
      [
        gscRow('/blog/zebra-post', 6, 60),
        gscRow('/blog/zebra-post#fragment', 7, 70),
        gscRow('/blog/zebra-post/?q=1', 8, 80),
      ],
      [
        { slug: 'zebra-post', lastmod: '2026-01-01' },
        { slug: 'alpha-post', lastmod: '2026-01-01' },
      ]
    );
    const manifest = buildManifest(inputs, OPTIONS);

    expect(manifest.generatedFrom).toEqual({
      gscRange: { startDate: '2026-05-23', endDate: '2026-11-18' },
      sitemapFetchedAt: '2026-11-21',
    });
    expect(manifest.rules.recentCutoff).toBe('2026-10-07');
    expect(manifest.rules.ownerRules).toEqual(OWNER_RULES);
    expect(manifest.blog.map((row: { slug: string }) => row.slug)).toEqual(
      [...manifest.blog.map((row: { slug: string }) => row.slug)].sort()
    );
    expect(manifest.pseo.map((row: { slug: string }) => row.slug)).toEqual([
      'midjourney-upscaler-png',
      'vs-bigjpg',
    ]);

    const zebra = manifest.blog.find((row: { slug: string }) => row.slug === 'zebra-post');
    expect(zebra).toEqual({
      slug: 'zebra-post',
      url: `${BASE}/blog/zebra-post`,
      clicks180: 21,
      impressions180: 210,
      ga4Sessions90: 0,
      ga4Conversions90: 0,
      lastmod: '2026-01-01',
      disposition: 'KEEP',
    });
    expect(
      manifest.blog.find((row: { slug: string }) => row.slug === 'alpha-post').disposition
    ).toBe('NOINDEX_UNPUBLISH');
    expect(manifest.blog.length).toBe(OWNER_BLOG_SLUGS.length + 2);

    const pseoKeep = manifest.pseo.find(
      (row: { slug: string }) => row.slug === 'midjourney-upscaler-png'
    );
    expect(pseoKeep.url).toBe(`${BASE}/platform-format/midjourney-upscaler-png`);
    expect(pseoKeep.disposition).toBe('NOINDEX_UNPUBLISH');
    expect(
      manifest.pseo.find((row: { slug: string }) => row.slug === 'vs-bigjpg').disposition
    ).toBe('DEFER_GUARDED');

    const counts: Record<string, number> = {};
    for (const row of manifest.blog) counts[row.disposition] = (counts[row.disposition] ?? 0) + 1;
    for (const [disposition, count] of Object.entries(manifest.summary.blog)) {
      expect(count).toBe(counts[disposition] ?? 0);
    }
  });

  it('adds GA4 sessions and conversions, defaulting missing rows to zero', () => {
    const inputs = manifestInputs(
      [
        gscRow('/blog/animation-maker-for-minecraft', 288, 21990),
        gscRow('/blog/4-k-youtube-to-mp-4', 142, 3232),
      ],
      [
        { slug: 'animation-maker-for-minecraft', lastmod: '2026-06-02' },
        { slug: '4-k-youtube-to-mp-4', lastmod: '2026-06-09' },
      ],
      [ga4Row('/blog/animation-maker-for-minecraft', 153, 8)]
    );
    const manifest = buildManifest(inputs, OPTIONS);
    const minecraft = manifest.blog.find(
      (entry: { slug: string }) => entry.slug === 'animation-maker-for-minecraft'
    );
    expect(minecraft.ga4Sessions90).toBe(153);
    expect(minecraft.ga4Conversions90).toBe(8);
    expect(minecraft.disposition).toBe('KEEP');

    const youtube = manifest.blog.find(
      (entry: { slug: string }) => entry.slug === '4-k-youtube-to-mp-4'
    );
    expect(youtube.ga4Sessions90).toBe(0);
    expect(youtube.ga4Conversions90).toBe(0);
    expect(youtube.disposition).toBe('NOINDEX_UNPUBLISH');
    expect(youtube.reason).toBe('off-topic, 0 GA4 conversions in 90d');
  });

  it('noindexes flagged off-topic posts that have no GA4 conversions', () => {
    const inputs = manifestInputs(
      [gscRow('/blog/windows-11-snap-layouts', 1, 843)],
      [{ slug: 'windows-11-snap-layouts', lastmod: '2026-01-01' }]
    );
    const row = buildManifest(inputs, OPTIONS).blog.find(
      (entry: { slug: string }) => entry.slug === 'windows-11-snap-layouts'
    );
    expect(row.offTopic).toBe(true);
    expect(row.disposition).toBe('NOINDEX_UNPUBLISH');
  });

  it('throws when an owner target is not KEEP in the data', () => {
    const inputs = manifestInputs([], []);
    const missing = inputs.gsc.rows.find(
      (row: { page: string }) => row.page === `${BASE}/blog/${OWNER_BLOG_SLUGS[0]}`
    );
    missing.clicks = 0;
    expect(() => buildManifest(inputs, OPTIONS)).toThrow(/owner/i);
  });
});

describe('committed index-bloat manifest', () => {
  const manifestPath = resolve(
    process.cwd(),
    'docs/SEO/reports/2026-11-21-index-bloat-manifest.json'
  );
  const inputPath = resolve(
    process.cwd(),
    'docs/SEO/reports/inputs/2026-11-21-index-bloat/sitemap-blog.json'
  );

  it('exists with one blog row per sitemap post', () => {
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const sitemap = JSON.parse(readFileSync(inputPath, 'utf8'));
    const posts = sitemap.urls.filter((url: { loc: string }) => url.loc.includes('/blog/'));
    expect(manifest.blog.length).toBe(posts.length);
  });

  it('only merges into live KEEP blog rows or /tools/ paths, and never touches guarded slugs', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const blogRows = new Map<string, { slug: string; disposition: string; clicks180: number }>(
      manifest.blog.map((row: { slug: string; disposition: string; clicks180: number }) => [
        row.slug,
        row,
      ])
    );
    for (const row of manifest.blog) {
      if (row.disposition !== 'MERGE_301') continue;
      expect(row.target).toBeTruthy();
      if (!row.target.startsWith('/tools/')) {
        expect(row.target.startsWith('/blog/')).toBe(true);
        const targetRow = blogRows.get(row.target.slice('/blog/'.length));
        expect(targetRow).toBeTruthy();
        if (!targetRow) throw new Error(`Missing merge target row for ${row.target}`);
        expect(targetRow.clicks180).toBeGreaterThan(0);
        expect(['KEEP', 'DEFER_GUARDED']).toContain(targetRow.disposition);
      }
    }
    const guarded = new Set(GUARDED_SLUGS);
    for (const row of manifest.blog) {
      if (!guarded.has(row.slug)) continue;
      expect(['MERGE_301', 'NOINDEX_UNPUBLISH']).not.toContain(row.disposition);
    }
  });

  it('matches the committed blog consolidation file', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const consolidation = JSON.parse(
      readFileSync(resolve(process.cwd(), 'shared/constants/blog-consolidation.json'), 'utf8')
    );

    expect(consolidation).toEqual(buildConsolidation(manifest));
  });

  it('applies the off-topic GA4 rule to the real off-topic posts', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const rows = new Map<string, { disposition: string; ga4Conversions90: number }>(
      manifest.blog.map((row: { slug: string; disposition: string; ga4Conversions90: number }) => [
        row.slug,
        row,
      ])
    );
    expect(rows.get('4-k-youtube-to-mp-4')?.disposition).toBe('NOINDEX_UNPUBLISH');
    expect(rows.get('4-k-youtube-to-mp-4')?.ga4Conversions90).toBe(0);
    expect(rows.get('windows-11-snap-layouts')?.disposition).toBe('NOINDEX_UNPUBLISH');
    expect(rows.get('windows-11-snap-layouts')?.ga4Conversions90).toBe(0);
    expect(rows.get('animation-maker-for-minecraft')?.disposition).toBe('KEEP');
    expect(rows.get('animation-maker-for-minecraft')?.ga4Conversions90).toBe(8);
    expect(rows.get('convert-video-to-hd-1080-p-online-free')?.disposition).toBe('KEEP');
    expect(rows.get('convert-video-to-hd-1080-p-online-free')?.ga4Conversions90).toBe(4);
  });

  it('builds pSEO urls from category and slug', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const row of manifest.pseo) {
      expect(row.url).toBe(`${BASE}/${row.category}/${row.slug}`);
    }
  });
});
