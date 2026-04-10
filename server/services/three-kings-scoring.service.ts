/**
 * Three Kings Scoring Service
 *
 * Scores blog pages using the 3-Kings technique, targeting pages in positions 5-20
 * that have the highest potential to move into the top 5 search results.
 */

import { BLOCKED_BLOG_SLUGS } from '@shared/constants/blocked-blog-slugs';

export interface IGscPageRow {
  keys: [string]; // [page]
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface IGscQueryPageRow {
  keys: [string, string]; // [query, page]
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface IThreeKingsEntry {
  url: string;
  slug: string;
  title: string | null;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  opportunityScore: number;
  positionScore: number;
  impressionScore: number;
  ctrGapScore: number;
  queryIntentScore: number;
  topQuery: string | null;
}

const QUERY_INTENT_KEYWORDS = ['upscale', 'enhance', 'ai', 'tool', 'free', 'how to', 'best'];

const MAX_RESULTS = 50;

/**
 * Returns a position score peaking at positions 6-10 (sweet spot for 3-Kings technique).
 */
function getPositionScore(position: number): number {
  if (position <= 3) return 0.3;
  if (position <= 5) return 0.7;
  if (position <= 10) return 1.0;
  if (position <= 15) return 0.8;
  if (position <= 20) return 0.5;
  return 0.2;
}

/**
 * Returns the expected CTR for a given position based on industry benchmarks.
 */
function getExpectedCtr(position: number): number {
  const expectedCtrByPosition: Record<number, number> = {
    1: 0.28,
    2: 0.15,
    3: 0.11,
    4: 0.08,
    5: 0.07,
    6: 0.06,
    7: 0.05,
    8: 0.04,
    9: 0.03,
    10: 0.025,
  };
  return expectedCtrByPosition[position] ?? 0.02;
}

/**
 * Builds a map of page URL → top query (by impressions) from the query-page rows.
 */
function buildTopQueryMap(queryPageRows: IGscQueryPageRow[]): Map<string, string> {
  const pageQueryImpressions = new Map<string, { query: string; impressions: number }>();

  for (const row of queryPageRows) {
    const [query, page] = row.keys;
    const existing = pageQueryImpressions.get(page);
    if (!existing || row.impressions > existing.impressions) {
      pageQueryImpressions.set(page, { query, impressions: row.impressions });
    }
  }

  const topQueryMap = new Map<string, string>();
  for (const [page, { query }] of pageQueryImpressions) {
    topQueryMap.set(page, query);
  }

  return topQueryMap;
}

/**
 * Extracts the blog slug from a URL containing /blog/.
 * e.g. "https://myimageupscaler.com/blog/my-post" → "my-post"
 */
function extractBlogSlug(url: string): string {
  const blogIndex = url.indexOf('/blog/');
  return url.slice(blogIndex + '/blog/'.length);
}

/**
 * Checks whether any intent keyword appears in the query (case-insensitive).
 */
function getQueryIntentScore(topQuery: string | null): number {
  if (!topQuery) return 0;
  const lower = topQuery.toLowerCase();
  return QUERY_INTENT_KEYWORDS.some(kw => lower.includes(kw)) ? 1.0 : 0;
}

/**
 * Scores blog pages using the 3-Kings technique.
 *
 * @param pageRows - GSC page-level data rows
 * @param queryPageRows - GSC query+page-level data rows
 * @returns Top 50 blog page entries sorted by opportunityScore descending
 */
export function scoreBlogPages(
  pageRows: IGscPageRow[],
  queryPageRows: IGscQueryPageRow[]
): IThreeKingsEntry[] {
  const topQueryMap = buildTopQueryMap(queryPageRows);

  // Filter to blog pages only and exclude blocked slugs
  const blogPageRows = pageRows.filter(row => {
    const url = row.keys[0];
    if (!url.includes('/blog/')) return false;
    const slug = extractBlogSlug(url);
    return !BLOCKED_BLOG_SLUGS.has(slug);
  });

  // Find max impressions for normalization
  const maxImpressions = Math.max(0, ...blogPageRows.map(r => r.impressions));

  const entries: IThreeKingsEntry[] = blogPageRows.map(row => {
    const url = row.keys[0];
    const slug = extractBlogSlug(url);
    const topQuery = topQueryMap.get(url) ?? null;

    const positionScore = getPositionScore(row.position);

    const impressionScore = maxImpressions === 0 ? 0 : row.impressions / maxImpressions;

    const expectedCtr = getExpectedCtr(Math.round(row.position));
    const rawCtrGap = Math.max(0, expectedCtr - row.ctr);
    const ctrGapScore = rawCtrGap / 0.28; // normalize: max possible gap is 0.28

    const queryIntentScore = getQueryIntentScore(topQuery);

    const opportunityScore =
      0.35 * positionScore + 0.30 * impressionScore + 0.20 * ctrGapScore + 0.15 * queryIntentScore;

    return {
      url,
      slug,
      title: null,
      position: row.position,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.ctr,
      opportunityScore,
      positionScore,
      impressionScore,
      ctrGapScore,
      queryIntentScore,
      topQuery,
    };
  });

  entries.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return entries.slice(0, MAX_RESULTS);
}
