import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BLOG_INDEXATION_BASELINE_URLS,
  HISTORICAL_BASELINE_NOT_CURRENTLY_PUBLISHED_SLUGS,
  buildBlogIndexationReport,
  extractBlogUrlsFromCsv,
  extractBlogUrlsFromSitemap,
  formatBlogIndexationReport,
  parseBlogIndexationBaselineCsv,
  reconcileHistoricalBaselineSlugs,
  validateBlogIndexationBaselineUrls,
} from '../../../scripts/seo/blog-indexation-report';
import { clientEnv } from '@shared/config/env';

const ROOT = join(__dirname, '../../..');
const HISTORICAL_BASELINE_CSV = join(
  ROOT,
  'docs/PRDs/gsc-recovery-2026-08/data/gsc-crawled-not-indexed.csv'
);
const HISTORICAL_BASELINE_CSV_CONTENT = readFileSync(HISTORICAL_BASELINE_CSV, 'utf8');
const CANONICAL_BASELINE_URLS = extractBlogUrlsFromCsv(HISTORICAL_BASELINE_CSV_CONTENT);

const POSTS = [
  {
    slug: 'best-free-ai-image-upscaler-2026-tested-compared',
    title: 'Best Free AI Image Upscaler',
    date: '2026-01-01',
    content: 'A published roundup with enough content to be measured.',
  },
  {
    slug: 'fixing-pixelated-photos',
    title: 'Fixing Pixelated Photos',
    date: '2026-01-01',
    content: 'A published guide with enough content to be measured.',
  },
];

describe('blog indexation report', () => {
  it('reports indexed state, causes, and CSV reconciliation', () => {
    const report = buildBlogIndexationReport({
      posts: POSTS,
      statuses: [
        {
          url: '/blog/best-free-ai-image-upscaler-2026-tested-compared',
          indexed: true,
          googleCanonical:
            'https://myimageupscaler.com/blog/best-free-ai-image-upscaler-2026-tested-compared',
        },
        {
          url: '/blog/fixing-pixelated-photos',
          indexed: false,
          googleCanonical: 'https://myimageupscaler.com/blog/fixing-pixelated-photos',
        },
      ],
      inboundLinkCounts: {
        '/blog/best-free-ai-image-upscaler-2026-tested-compared': 2,
        '/blog/fixing-pixelated-photos': 1,
      },
      sitemapUrls: POSTS.map(post => `/blog/${post.slug}`),
      csvUnindexedUrls: ['/blog/fixing-pixelated-photos'],
      impressions: { '/blog/fixing-pixelated-photos': 389 },
      now: new Date('2026-08-13T00:00:00.000Z'),
    });

    expect(report.rows.find(row => row.slug === POSTS[0].slug)?.indexed).toBe(true);
    expect(report.unindexed.map(row => row.slug)).not.toContain(POSTS[0].slug);
    const unindexed = report.unindexed.find(row => row.slug === POSTS[1].slug);
    expect(unindexed?.causes).toContain('NO_INBOUND_LINKS');
    expect(unindexed?.impressions).toBe(389);
    expect(report.reconciliation).toEqual({ missingFromReport: [], unexpectedInReport: [] });
  });

  it('keeps indexed baseline URLs present and flags known unindexed URLs outside the baseline', () => {
    const outsideBaselinePost = {
      slug: 'newly-crawled-post',
      title: 'Newly Crawled Post',
      date: '2026-01-01',
      content: 'A published guide with enough content to be measured.',
    };
    const report = buildBlogIndexationReport({
      posts: [...POSTS, outsideBaselinePost],
      statuses: [
        { url: `/blog/${POSTS[0].slug}`, indexed: true },
        { url: `/blog/${POSTS[1].slug}`, indexed: false },
        { url: `/blog/${outsideBaselinePost.slug}`, indexed: false },
      ],
      sitemapUrls: [...POSTS, outsideBaselinePost].map(post => `/blog/${post.slug}`),
      csvUnindexedUrls: POSTS.map(post => `/blog/${post.slug}`),
    });

    const indexedBaselineRow = report.rows.find(row => row.slug === POSTS[0].slug);
    const outsideBaselineRow = report.rows.find(row => row.slug === outsideBaselinePost.slug);
    expect(indexedBaselineRow).toBeDefined();
    expect(indexedBaselineRow?.indexed).toBe(true);
    expect(outsideBaselineRow).toBeDefined();
    expect(report.reconciliation).toEqual({
      missingFromReport: [],
      unexpectedInReport: [outsideBaselineRow?.url],
    });
  });

  it('keeps unknown GSC statuses out of known unindexed and reports them separately', () => {
    const report = buildBlogIndexationReport({
      posts: POSTS,
      statuses: [{ url: `/blog/${POSTS[1].slug}`, indexed: false }],
      sitemapUrls: POSTS.map(post => `/blog/${post.slug}`),
    });

    expect(report.unindexed.map(row => row.slug)).toEqual([POSTS[1].slug]);
    expect(report.unknown.map(row => row.slug)).toEqual([POSTS[0].slug]);
    expect(report.rows.find(row => row.slug === POSTS[0].slug)?.indexed).toBeUndefined();

    const formatted = formatBlogIndexationReport(report);
    expect(formatted).toContain('Indexed: 0');
    expect(formatted).toContain('Unindexed: 1');
    expect(formatted).toContain('GSC status unavailable: 1');
    expect(formatted).toContain(`${POSTS[0].slug} | intent=commercial | indexed=UNKNOWN`);
  });

  it('parses only blog URLs from the crawled-not-indexed CSV', () => {
    const csv = [
      'URL,Last crawled',
      'https://myimageupscaler.com/blog/fixing-pixelated-photos,2026-08-01',
      'https://myimageupscaler.com/tools/ai-image-upscaler,2026-08-01',
    ].join('\n');

    expect(extractBlogUrlsFromCsv(csv)).toEqual([
      'https://myimageupscaler.com/blog/fixing-pixelated-photos',
    ]);
  });

  it('parses blog URLs from the rendered sitemap', () => {
    const xml = `
      <urlset>
        <url><loc>https://myimageupscaler.com/blog/fixing-pixelated-photos</loc></url>
        <url><loc>https://myimageupscaler.com/tools/ai-image-upscaler</loc></url>
      </urlset>
    `;

    expect(extractBlogUrlsFromSitemap(xml)).toEqual([
      'https://myimageupscaler.com/blog/fixing-pixelated-photos',
    ]);
  });

  it.each([1, 32])('rejects a truncated canonical baseline with %i filtered URL(s)', count => {
    expect(() =>
      validateBlogIndexationBaselineUrls(CANONICAL_BASELINE_URLS.slice(0, count))
    ).toThrow(/exactly 33 distinct blog URLs/);
  });

  it('rejects a baseline containing duplicate blog URLs', () => {
    const duplicateBaseline = [...CANONICAL_BASELINE_URLS.slice(0, 32), CANONICAL_BASELINE_URLS[0]];

    expect(() => validateBlogIndexationBaselineUrls(duplicateBaseline)).toThrow(
      /duplicate blog URL/
    );
  });

  it('pins membership to the historical CSV baseline, not only its row count', () => {
    const differentThirtyThreeUrls = Array.from(
      { length: 33 },
      (_, index) => `https://myimageupscaler.com/blog/different-baseline-post-${index + 1}`
    );

    expect(validateBlogIndexationBaselineUrls(CANONICAL_BASELINE_URLS)).toEqual(
      CANONICAL_BASELINE_URLS
    );
    expect(() => validateBlogIndexationBaselineUrls(differentThirtyThreeUrls)).toThrow(
      /historical 33 blog URL baseline/
    );
  });

  it('rejects a truncated canonical CSV through the loader', () => {
    const truncatedCsv = HISTORICAL_BASELINE_CSV_CONTENT.split(/\r?\n/)
      .filter(line => !line.startsWith(`${CANONICAL_BASELINE_URLS[0]},`))
      .join('\n');

    expect(() => parseBlogIndexationBaselineCsv(truncatedCsv, 'truncated.csv')).toThrow(
      /exactly 33 distinct blog URLs/
    );
  });

  it('rejects a duplicated canonical CSV row through the loader', () => {
    const duplicatedCsv = `${HISTORICAL_BASELINE_CSV_CONTENT.trimEnd()}\n${CANONICAL_BASELINE_URLS[0]},2026-08-13\n`;

    expect(() => parseBlogIndexationBaselineCsv(duplicatedCsv, 'duplicated.csv')).toThrow(
      /duplicate blog URL/
    );
  });

  it('rejects a substituted canonical CSV row through the loader', () => {
    const substitutedCsv = HISTORICAL_BASELINE_CSV_CONTENT.replace(
      `${CANONICAL_BASELINE_URLS[0]},`,
      'https://myimageupscaler.com/blog/substituted-baseline-post,2026-08-13'
    );

    expect(() => parseBlogIndexationBaselineCsv(substitutedCsv, 'substituted.csv')).toThrow(
      /historical 33 blog URL baseline/
    );
  });

  it('does not infer an absent inspection as indexed from CSV absence', () => {
    const report = buildBlogIndexationReport({
      posts: POSTS,
      statuses: [{ url: '/blog/unrelated-current-inspection', indexed: true }],
      csvUnindexedUrls: ['/blog/fixing-pixelated-photos'],
      sitemapUrls: POSTS.map(post => `/blog/${post.slug}`),
    });

    const roundup = report.rows.find(row => row.slug === POSTS[0].slug);
    expect(roundup?.indexed).toBeUndefined();
    expect(roundup?.indexStatusKnown).toBe(false);
    expect(roundup?.causes).toContain('INDEX_STATUS_UNAVAILABLE');
  });

  it('fails closed when GSC returns no rows and no CSV', () => {
    expect(() =>
      buildBlogIndexationReport({
        posts: POSTS,
        statuses: [],
        csvUnindexedUrls: [],
      })
    ).toThrow(/refusing to report every post as indexed/);
  });

  it('fails closed when GSC returns no rows even with a historical CSV baseline', () => {
    expect(() =>
      buildBlogIndexationReport({
        posts: POSTS,
        statuses: [],
        csvUnindexedUrls: CANONICAL_BASELINE_URLS,
        sitemapUrls: POSTS.map(post => `/blog/${post.slug}`),
      })
    ).toThrow(/refusing to report every post as indexed/);
  });

  it('uses the historical CSV only for reconciliation, not current coverage', () => {
    const historicalPost = {
      slug: CANONICAL_BASELINE_URLS[0].split('/').pop() ?? 'missing-slug',
      title: 'Historical baseline post',
      date: '2026-01-01',
      content: 'A historical baseline post.',
    };
    const report = buildBlogIndexationReport({
      posts: [historicalPost],
      statuses: [{ url: '/blog/unrelated-current-inspection', indexed: true }],
      csvUnindexedUrls: CANONICAL_BASELINE_URLS.map(
        url => `${clientEnv.BASE_URL}${new URL(url).pathname}`
      ),
      sitemapUrls: [`/blog/${historicalPost.slug}`],
    });

    const row = report.rows[0];
    expect(row.indexed).toBeUndefined();
    expect(row.indexStatusKnown).toBe(false);
    expect(row.causes).toContain('INDEX_STATUS_UNAVAILABLE');
  });

  it('names every historical baseline URL absent from the checked-in current inventory', () => {
    const snapshot = JSON.parse(readFileSync(join(ROOT, 'content/seo-equity.json'), 'utf8')) as {
      entities: Array<{ type: string; url: string }>;
    };
    const staticBlogData = JSON.parse(
      readFileSync(join(ROOT, 'content/blog-data.json'), 'utf8')
    ) as { posts: Array<{ slug: string }> };
    const currentInventory = [
      ...snapshot.entities
        .filter(entity => entity.type === 'blog')
        .map(entity => entity.url.replace(/^\/blog\//, '')),
      ...staticBlogData.posts.map(post => post.slug),
    ];

    const reconciliation = reconcileHistoricalBaselineSlugs(currentInventory);

    expect(reconciliation.notCurrentlyPublishedSlugs).toEqual([
      ...HISTORICAL_BASELINE_NOT_CURRENTLY_PUBLISHED_SLUGS,
    ]);
    expect(reconciliation.notCurrentlyPublishedSlugs).toHaveLength(28);
    expect(reconciliation.notCurrentlyPublishedUrls).toEqual(
      HISTORICAL_BASELINE_NOT_CURRENTLY_PUBLISHED_SLUGS.map(
        slug => `https://myimageupscaler.com/blog/${slug}`
      )
    );
  });

  it('fails when an explicitly reconciled baseline URL appears in the current inventory', () => {
    expect(() =>
      reconcileHistoricalBaselineSlugs([
        ...HISTORICAL_BASELINE_NOT_CURRENTLY_PUBLISHED_SLUGS,
        'enhance-pictures-in-photoshop',
      ])
    ).toThrow(/historical baseline reconciliation is stale/i);
  });

  it('keeps the checked-in baseline aligned with the exported 33-row contract', () => {
    expect(CANONICAL_BASELINE_URLS).toEqual([...BLOG_INDEXATION_BASELINE_URLS]);
  });
});
