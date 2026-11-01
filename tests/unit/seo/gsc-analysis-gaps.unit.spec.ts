import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const gscFetch = require('../../../.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs');
const gscUi = require('../../../.claude/skills/gsc-analysis/scripts/gsc-ui-extract.cjs');

const {
  buildCannibalization,
  buildClickChangeDecomposition,
  buildDataCompleteness,
  buildGroupComparison,
  buildLongTrend,
  buildLowHangingFruit,
  buildPositionBuckets,
  buildSitemapCoverage,
  estimatePotentialClicks,
  googleRequest,
  joinQueryPageData,
  parseSitemapLocs,
  pickInspectionTargets,
  queryAllSearchAnalyticsRows,
} = gscFetch;
const fetchFailures: unknown[] = gscFetch.fetchFailures;

const page = (url: string, clicks: number, impressions: number, position = 10) => ({
  page: url,
  clicks,
  impressions,
  ctr: impressions ? clicks / impressions : 0,
  position,
});

const query = (overrides: Record<string, unknown>) => ({
  query: 'upscale image',
  clicks: 0,
  impressions: 100,
  ctr: 0,
  position: 10,
  isBranded: false,
  isDomainLike: false,
  ...overrides,
});

describe('gsc-fetch opportunity correctness', () => {
  it('should treat fragment URLs of one page as a single page', () => {
    const rows = [
      {
        keys: ['poster size', 'https://x.com/blog/poster'],
        clicks: 5,
        impressions: 900,
        position: 3,
      },
      {
        keys: ['poster size', 'https://x.com/blog/poster#dpi'],
        clicks: 1,
        impressions: 800,
        position: 3,
      },
    ];
    const { queries } = joinQueryPageData(
      [{ keys: ['poster size'], clicks: 6, impressions: 1000, position: 3 }],
      [],
      rows,
      []
    );
    expect(queries[0].pageCount).toBe(1);
    expect(queries[0].topPage).toBe('https://x.com/blog/poster');
  });

  it('should only flag cannibalization when a second page holds a real impression share', () => {
    const minor = query({ query: 'minor', pageCount: 2, secondPageShare: 0.04 });
    const real = query({ query: 'real', pageCount: 2, secondPageShare: 0.3 });
    const flagged = buildCannibalization([minor, real]).map((row: { query: string }) => row.query);
    expect(flagged).toEqual(['real']);
  });

  it('should cover positions between the CTR list and the old quick-win floor', () => {
    const rows = buildLowHangingFruit([query({ query: 'gap', position: 6.5, impressions: 800 })]);
    expect(rows.map((row: { query: string }) => row.query)).toEqual(['gap']);
    expect(rows[0].difficulty).toBe('easy');
  });

  it('should not score a page-three query above a page-two query', () => {
    expect(estimatePotentialClicks(1000, 22, 0)).toBeLessThanOrEqual(
      estimatePotentialClicks(1000, 15, 0)
    );
  });

  it('should measure potential from the actual CTR', () => {
    expect(estimatePotentialClicks(1000, 9, 0.04)).toBe(0);
    expect(estimatePotentialClicks(1000, 9, 0.01)).toBe(30);
  });
});

describe('gsc-fetch segment analysis', () => {
  it('should split clicks by locale and section and leave fragments out of the sums', () => {
    const current = [
      page('https://x.com/blog/a', 10, 100),
      page('https://x.com/blog/a#s', 2, 500),
      page('https://x.com/es/tools/b', 4, 40),
    ];
    const previous = [
      page('https://x.com/blog/a', 20, 200),
      page('https://x.com/es/tools/b', 2, 40),
    ];

    const bySection = buildGroupComparison(current, previous, 'section');
    expect(bySection.rows.find((row: { group: string }) => row.group === 'blog')).toMatchObject({
      clicks: 10,
      previousClicks: 20,
      clickDelta: -10,
      impressions: 100,
    });
    expect(bySection.excludedFragmentRows).toMatchObject({ rows: 1, clicks: 2, impressions: 500 });

    const byLocale = buildGroupComparison(current, previous, 'locale');
    expect(byLocale.rows.find((row: { group: string }) => row.group === 'es')).toMatchObject({
      clicks: 4,
      clickDelta: 2,
    });
  });

  it('should decompose click change into effects that sum to the real delta', () => {
    const result = buildClickChangeDecomposition(
      [page('https://x.com/a', 30, 1000, 10), page('https://x.com/new', 5, 50)],
      [page('https://x.com/a', 100, 2000, 10), page('https://x.com/gone', 7, 70)]
    );
    const parts =
      result.volumeEffect + result.ctrEffect + result.newPageClicks - result.lostPageClicks;
    expect(parts).toBeCloseTo(result.clickDelta, 6);
    expect(result.clickDelta).toBe(35 - 107);
    expect(result.topLosses[0]).toMatchObject({ page: 'https://x.com/a', cause: 'demand' });
  });

  it('should label a cause from position and impression movement', () => {
    const { topLosses } = buildClickChangeDecomposition(
      [page('https://x.com/rank', 10, 500, 14), page('https://x.com/ctr', 10, 1000, 5)],
      [page('https://x.com/rank', 50, 1000, 8), page('https://x.com/ctr', 40, 1000, 5)]
    );
    const causes = Object.fromEntries(
      topLosses.map((row: { page: string; cause: string }) => [row.page, row.cause])
    );
    expect(causes['https://x.com/rank']).toBe('ranking');
    expect(causes['https://x.com/ctr']).toBe('ctr');
  });

  it('should bucket queries by position', () => {
    const buckets = buildPositionBuckets([
      query({ position: 2, clicks: 3, impressions: 10 }),
      query({ position: 7, clicks: 1, impressions: 20 }),
      query({ position: 55, clicks: 0, impressions: 30 }),
    ]);
    expect(buckets['1-3']).toMatchObject({ queries: 1, clicks: 3, impressions: 10 });
    expect(buckets['4-10']).toMatchObject({ queries: 1, impressions: 20 });
    expect(buckets['51+']).toMatchObject({ queries: 1, impressions: 30 });
  });

  it('should roll daily rows into monthly totals with a weighted position', () => {
    const trend = buildLongTrend(
      [
        { date: '2026-09-30', clicks: 1, impressions: 100, position: 10 },
        { date: '2026-10-01', clicks: 2, impressions: 100, position: 10 },
        { date: '2026-10-02', clicks: 4, impressions: 300, position: 20 },
      ],
      '2026-10-02'
    );
    expect(trend.months.map((row: { month: string }) => row.month)).toEqual(['2026-09', '2026-10']);
    expect(trend.months[1]).toMatchObject({ clicks: 6, impressions: 400, position: 17.5, days: 2 });
    expect(trend.yearOverYear).toBeNull();
  });
});

describe('gsc-fetch sitemap reconciliation', () => {
  it('should read loc values and decode entities', () => {
    const xml = '<urlset><url><loc> https://x.com/a?b=1&amp;c=2 </loc></url></urlset>';
    expect(parseSitemapLocs(xml)).toEqual(['https://x.com/a?b=1&c=2']);
  });

  it('should find submitted URLs with no impressions and traffic outside the sitemap', () => {
    const coverage = buildSitemapCoverage(
      ['https://x.com/a', 'https://x.com/blog/silent'],
      [
        page('https://x.com/a', 1, 10),
        page('https://x.com/orphan', 2, 90),
        page('https://x.com/a#s', 0, 9),
      ]
    );
    expect(coverage).toMatchObject({ submitted: 2, withImpressions: 1, zeroImpressionCount: 1 });
    expect(coverage.zeroImpressionBySection).toEqual({ blog: 1 });
    expect(coverage.outsideSitemap.map((row: { page: string }) => row.page)).toEqual([
      'https://x.com/orphan',
    ]);
  });

  it('should inspect losers and silent URLs, not only the top pages', () => {
    const dataset = {
      lowHangingFruit: [{ topPage: 'https://x.com/lhf' }],
      pageCtrOpportunities: [{ page: 'https://x.com/ctr' }],
      pageMovers: { losers: [{ page: 'https://x.com/loser#s' }] },
      pages: [page('https://x.com/top', 9, 900)],
    };
    const targets = pickInspectionTargets(dataset, 4, ['https://x.com/silent']);
    expect(targets).toContain('https://x.com/loser');
    expect(targets).toContain('https://x.com/silent');
    expect(targets).toContain('https://x.com/lhf');
    expect(targets).toHaveLength(4);
  });
});

describe('gsc-fetch fetch reliability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchFailures.length = 0;
  });

  const response = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status });

  it('should retry a rate-limited request before it succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(429, { error: { message: 'slow down' } }))
      .mockResolvedValueOnce(response(200, { rows: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await googleRequest({ url: 'https://x', accessToken: 't', retryBaseMs: 0 });

    expect(result).toEqual({ rows: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchFailures).toEqual([]);
  });

  it('should record a failed optional request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => response(403, { error: { message: 'denied' } }))
    );

    const result = await googleRequest({
      url: 'https://x',
      accessToken: 't',
      optional: true,
      label: 'web queries',
    });

    expect(result).toBeNull();
    expect(fetchFailures).toEqual([{ label: 'web queries', status: 403, message: 'denied' }]);
  });

  it('should keep rows from earlier pages when a later page fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response(200, { rows: [{ keys: ['a'] }, { keys: ['b'] }] }))
        .mockImplementation(async () => response(403, { error: { message: 'denied' } }))
    );

    const rows = await queryAllSearchAnalyticsRows({
      accessToken: 't',
      siteUrl: 'sc-domain:x.com',
      requestBody: {},
      rowLimit: 2,
      optional: true,
      label: 'web queries',
    });

    expect(rows).toHaveLength(2);
    expect(fetchFailures).toHaveLength(1);
  });

  it('should retry a sitemap child that returns 503 and keep its URLs', async () => {
    const urlset = '<urlset><url><loc>https://x.com/a</loc></url></urlset>';
    const index =
      '<sitemapindex><sitemap><loc>https://x.com/child.xml</loc></sitemap></sitemapindex>';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(index, { status: 200 }))
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response(urlset, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const urls = await gscFetch.fetchSitemapUrls(['https://x.com/sitemap.xml'], 0);

    expect(urls).toEqual(['https://x.com/a']);
    expect(fetchFailures).toEqual([]);
  });

  it('should record a sitemap that keeps failing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response('busy', { status: 503 }))
    );

    const urls = await gscFetch.fetchSitemapUrls(['https://x.com/sitemap.xml'], 0);

    expect(urls).toEqual([]);
    expect(fetchFailures).toHaveLength(1);
  });

  it('should pass a timeout so one stuck request cannot hang the export', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => response(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await googleRequest({ url: 'https://x', accessToken: 't' });

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('should mark the export incomplete and name API blind spots', () => {
    const dataset = {
      summary: { current: { clicks: 100, impressions: 1000 } },
      queries: [query({ clicks: 40, impressions: 500 })],
      pages: [page('https://x.com/a', 100, 1000)],
    };
    fetchFailures.push({ label: 'web queries', status: 500, message: 'boom' });

    const completeness = buildDataCompleteness(dataset);

    expect(completeness.complete).toBe(false);
    expect(completeness.queryClickCoverage).toBe(0.4);
    expect(completeness.anonymizedClicks).toBe(60);
    expect(completeness.apiBlindSpots.join(' ')).toContain('Generative AI');
    expect(completeness.apiBlindSpots.join(' ')).toContain('Page indexing');
  });
});

describe('gsc-ui-extract parsers', () => {
  const indexBlock = [
    ['sc-domain:x.com', 35, []],
    [
      [
        [
          [
            ['INFORMATIONAL', null, null, null, null, null, 4, null, 4],
            ['KEY1'],
            null,
            null,
            [
              null,
              null,
              0,
              null,
              null,
              null,
              4,
              null,
              null,
              [[null, 'INFORMATIONAL', 'NO_INDEX_TAG']],
            ],
          ],
          [1],
        ],
        [
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          [
            [14, 15],
            [
              [1785888000000, 107],
              [1792713600000, 1031],
            ],
          ],
          4,
        ],
        [null, 1031],
      ],
    ],
  ];

  it('should read an issue row with its type, count, validation state and trend', () => {
    const [issue] = gscUi.parseIssues({ 'ds:9': indexBlock });
    expect(issue).toMatchObject({
      key: 'KEY1',
      type: 'NO_INDEX_TAG',
      count: 1031,
      validation: 'failed',
    });
    expect(issue.trend[0]).toEqual(['2026-08-05', 107]);
  });

  it('should tally drilldown URLs by locale and section and ignore uncrawled timestamps', () => {
    const urls = gscUi.parseDrilldownUrls({
      'ds:14': [
        ['sc-domain:x.com', 33],
        [
          [
            [
              ['https://x.com/it/alternatives/vs-a', null],
              [null, 1792881102],
            ],
          ],
          [
            [
              ['https://x.com/blog/b', null],
              [null, 0],
            ],
          ],
        ],
      ],
    });
    expect(urls.listed).toBe(2);
    expect(urls.byLocale).toEqual({ it: 1, en: 1 });
    expect(urls.bySection).toEqual({ alternatives: 1, blog: 1 });
    expect(urls.latestCrawl).toBe('2026-10-24');
  });

  it('should return null for latest crawl when no URL was crawled', () => {
    const urls = gscUi.parseDrilldownUrls({
      'ds:14': [
        [
          [
            [
              ['https://x.com/blog/b', null],
              [null, 0],
            ],
          ],
        ],
      ],
    });
    expect(urls.latestCrawl).toBeNull();
  });

  it('should extract embedded datasets from report HTML', () => {
    const html =
      "AF_initDataCallback({key: 'ds:9', hash: '1', data:[[\"s\",30],[[1785888000000,[1,2,3]]]], sideChannel: {}});";
    expect(gscUi.splitDs(html)['ds:9'][0]).toEqual(['s', 30]);
  });

  it('should find the daily series when an issue block shares its RPC id', () => {
    const series = Array.from({ length: 8 }, (_, day) => [
      1785715200000 + day * 86400000,
      [day, 16],
    ]);
    const report = gscUi.parseIssueReport(
      {
        'ds:9': [['sc-domain:x.com', 6, [[2, 'PRODUCT_OFFER']]], [[]]],
        'ds:11': [['sc-domain:x.com', 6, [[2, 'PRODUCT_OFFER']]], [series]],
      },
      6,
      ['invalid', 'valid']
    );
    expect(report.daily.weekly.at(-1)).toMatchObject({ invalid: 7, valid: 16 });
  });

  it('should map a device and its daily counts from the Core Web Vitals block', () => {
    const series = Array.from({ length: 8 }, (_, day) => [
      1785715200000 + day * 86400000,
      [day, 0, 0],
    ]);
    const report = gscUi.parseCoreWebVitals({
      'ds:13': [['sc-domain:x.com', 38, [[17, null, null, 2]]], [series]],
    });
    expect(report.mobile.weekly.at(-1)).toMatchObject({ poor: 7, needsImprovement: 0, good: 0 });
  });
});

describe('gsc-analysis skill documentation', () => {
  const skill = fs.readFileSync(path.resolve('.claude/skills/gsc-analysis/SKILL.md'), 'utf8');

  it.each([
    'dataCompleteness',
    'clickChangeDecomposition',
    'sectionBreakdown',
    'localeBreakdown',
    'sitemapCoverage',
    'longTrend',
    'freshness',
    'gsc-ui-extract.cjs',
    'Generative AI',
    'Page indexing',
    'Crawl stats',
    'Multimodal',
  ])('should document %s', term => {
    expect(skill).toContain(term);
  });
});
