#!/usr/bin/env tsx

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  fetchBlogPagePerformance,
  buildGscDateRange,
  createGscAccessToken,
} from '@server/services/gsc.service';
import type { IGscSearchAnalyticsRow } from '@server/services/gsc.types';
import {
  getAllPublishedPosts,
  getAllPublishedSlugsStrict,
  getPublishedPostBySlug,
} from '@server/services/blog.service';
import { clientEnv, serverEnv } from '@shared/config/env';
import { BLOCKED_BLOG_SLUGS } from '@shared/constants/blocked-blog-slugs';
import { getSeoEquityInboundLinkCounts, getSeoEquitySnapshot } from '@lib/seo/seo-equity';
import { getPageIntent, type PageIntent } from '@lib/seo/page-intent';

const DEFAULT_DAYS = 90;
const MINIMUM_WORD_COUNT = 800;
const TOO_NEW_DAYS = 14;
export const BLOG_INDEXATION_BASELINE_URLS = [
  'https://myimageupscaler.com/blog/enhance-pictures-in-photoshop',
  'https://myimageupscaler.com/blog/jpg-vs-png-quality',
  'https://myimageupscaler.com/blog/how-to-upscale-avif-tiff-bmp-image-formats',
  'https://myimageupscaler.com/blog/picture-restoration-software',
  'https://myimageupscaler.com/blog/windows-11-snap-layouts',
  'https://myimageupscaler.com/blog/image-enlarger-vs-image-upscaler',
  'https://myimageupscaler.com/blog/how-to-fix-resolution',
  'https://myimageupscaler.com/blog/sunset-camera-settings',
  'https://myimageupscaler.com/blog/picture-to-oil-painting-convert',
  'https://myimageupscaler.com/blog/remove-noise-in-photoshop',
  'https://myimageupscaler.com/blog/screenshot-upscaling-rescue-low-resolution-captures',
  'https://myimageupscaler.com/blog/dpi-of-image',
  'https://myimageupscaler.com/blog/best-video-upscaler',
  'https://myimageupscaler.com/blog/why-upscaled-text-looks-blurry-how-to-fix',
  'https://myimageupscaler.com/blog/ai-quality-enhancer',
  'https://myimageupscaler.com/blog/damaged-old-photographs',
  'https://myimageupscaler.com/blog/turn-image-into-illustration',
  'https://myimageupscaler.com/blog/what-is-8k-image-resolution',
  'https://myimageupscaler.com/blog/photo-restoration-near-me',
  'https://myimageupscaler.com/blog/noise-reduction-in-images',
  'https://myimageupscaler.com/blog/ai-image-extender',
  'https://myimageupscaler.com/blog/how-to-enhance-a-picture-in-photoshop',
  'https://myimageupscaler.com/blog/what-is-denoising',
  'https://myimageupscaler.com/blog/image-out-of-focus',
  'https://myimageupscaler.com/blog/enhance-picture-quality-ai',
  'https://myimageupscaler.com/blog/how-to-preserve-old-photographs',
  'https://myimageupscaler.com/blog/heic-iphone-photo-upscaling-guide',
  'https://myimageupscaler.com/blog/how-to-make-png-background-transparent-free',
  'https://myimageupscaler.com/blog/reduce-image-noise',
  'https://myimageupscaler.com/blog/noise-reduction-in-image',
  'https://myimageupscaler.com/blog/ai-photo-restoration',
  'https://myimageupscaler.com/blog/how-to-clear-up-a-photo',
  'https://myimageupscaler.com/blog/best-image-upscaling-tools-2026',
] as const;
export const BLOG_INDEXATION_BASELINE_URL_COUNT = BLOG_INDEXATION_BASELINE_URLS.length;
export const HISTORICAL_BASELINE_NOT_CURRENTLY_PUBLISHED_SLUGS = [
  'enhance-pictures-in-photoshop',
  'jpg-vs-png-quality',
  'how-to-upscale-avif-tiff-bmp-image-formats',
  'picture-restoration-software',
  'windows-11-snap-layouts',
  'image-enlarger-vs-image-upscaler',
  'how-to-fix-resolution',
  'sunset-camera-settings',
  'picture-to-oil-painting-convert',
  'remove-noise-in-photoshop',
  'dpi-of-image',
  'best-video-upscaler',
  'ai-quality-enhancer',
  'what-is-8k-image-resolution',
  'photo-restoration-near-me',
  'noise-reduction-in-images',
  'ai-image-extender',
  'how-to-enhance-a-picture-in-photoshop',
  'what-is-denoising',
  'image-out-of-focus',
  'enhance-picture-quality-ai',
  'how-to-preserve-old-photographs',
  'how-to-make-png-background-transparent-free',
  'reduce-image-noise',
  'noise-reduction-in-image',
  'ai-photo-restoration',
  'how-to-clear-up-a-photo',
  'best-image-upscaling-tools-2026',
] as const;

export type BlogIndexationCause =
  | 'NO_INBOUND_LINKS'
  | 'CANONICAL_MISMATCH'
  | 'THIN'
  | 'NOT_IN_SITEMAP'
  | 'TOO_NEW'
  | 'INDEX_STATUS_UNAVAILABLE'
  | 'UNINDEXED_NO_CAUSE';

export interface IBlogIndexationPost {
  slug: string;
  title: string;
  date: string;
  content: string;
}

export interface IGscIndexationStatus {
  url: string;
  indexed?: boolean;
  verdict?: string;
  coverageState?: string;
  userCanonical?: string;
  googleCanonical?: string;
  sitemap?: string[];
}

export interface IBlogIndexationRow {
  slug: string;
  url: string;
  intent: PageIntent;
  title: string;
  indexed: boolean | undefined;
  indexStatusKnown: boolean;
  impressions: number;
  inboundLinks: number;
  wordCount: number;
  canonical: string;
  publishDate: string;
  inSitemap: boolean;
  causes: BlogIndexationCause[];
}

export interface IBlogIndexationReport {
  days: number;
  rows: IBlogIndexationRow[];
  unindexed: IBlogIndexationRow[];
  unknown: IBlogIndexationRow[];
  expectedUnindexedUrls?: string[];
  reconciliation?: {
    missingFromReport: string[];
    unexpectedInReport: string[];
    historicalBaselineNotCurrentlyPublished?: string[];
  };
}

export interface IBlogIndexationInput {
  posts: IBlogIndexationPost[];
  statuses: IGscIndexationStatus[];
  impressions?: Map<string, number> | Record<string, number>;
  inboundLinkCounts?: Map<string, number> | Record<string, number>;
  sitemapUrls?: Iterable<string>;
  csvUnindexedUrls?: Iterable<string>;
  now?: Date;
  days?: number;
}

interface ISavedGscExport {
  meta?: {
    dateRanges?: { current?: { days?: number } };
    dateRange?: { days?: number };
  };
  indexing?: { inspectedPages?: unknown[] };
  coverage?: { rows?: unknown[] };
  topPages?: unknown[];
  pages?: unknown[];
  searchTypes?: { web?: { pages?: unknown[] } };
  crawledNotIndexed?: unknown[];
  unindexed?: unknown[];
}

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toBlogUrl(slug: string): string {
  return `${clientEnv.BASE_URL.replace(/\/$/, '')}/blog/${slug}`;
}

function normalizeBlogUrl(value: string): string {
  try {
    const url = new URL(value, clientEnv.BASE_URL);
    return `${url.origin}${url.pathname}`.replace(/\/$/, '');
  } catch {
    return value.split(/[?#]/, 1)[0].replace(/\/$/, '');
  }
}

function toSlug(value: string): string | null {
  try {
    const pathname = new URL(value, clientEnv.BASE_URL).pathname.replace(/\/$/, '');
    return pathname.startsWith('/blog/') ? pathname.slice('/blog/'.length) : null;
  } catch {
    return null;
  }
}

function normalizeSlug(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return toSlug(trimmed);

  const path = trimmed.split(/[?#]/, 1)[0].replace(/\/$/, '');
  return path.startsWith('/blog/') ? path.slice('/blog/'.length) : path.replace(/^\//, '');
}

function historicalBaselineUrlForSlug(slug: string): string {
  return (
    BLOG_INDEXATION_BASELINE_URLS.find(url => toSlug(url) === slug) ??
    `https://myimageupscaler.com/blog/${slug}`
  );
}

export interface IHistoricalBaselineReconciliation {
  currentBaselineSlugs: string[];
  notCurrentlyPublishedSlugs: string[];
  notCurrentlyPublishedUrls: string[];
}

/**
 * Reconcile the fixed GSC baseline against the current published inventory.
 *
 * The baseline is historical evidence, not a source of ghost posts. Every
 * baseline URL must either be in the current inventory or be named in the
 * explicit not-currently-published set below. A drift in either direction
 * fails with an actionable message so publication status is rechecked before
 * the declaration is changed.
 */
export function reconcileHistoricalBaselineSlugs(
  currentSlugs: Iterable<string>
): IHistoricalBaselineReconciliation {
  const current = new Set(
    [...currentSlugs].map(normalizeSlug).filter((slug): slug is string => Boolean(slug))
  );
  const baselineSlugs = BLOG_INDEXATION_BASELINE_URLS.map(url => toSlug(url)).filter(
    (slug): slug is string => Boolean(slug)
  );
  const declaredNotCurrentlyPublished = new Set(HISTORICAL_BASELINE_NOT_CURRENTLY_PUBLISHED_SLUGS);
  const blockedDeclaredSlugs = [...declaredNotCurrentlyPublished].filter(slug =>
    BLOCKED_BLOG_SLUGS.has(slug)
  );
  const currentBaselineSlugs = baselineSlugs.filter(slug => current.has(slug));
  const missingBaselineSlugs = baselineSlugs.filter(slug => !current.has(slug));
  const unexpectedMissingSlugs = missingBaselineSlugs.filter(
    slug => !declaredNotCurrentlyPublished.has(slug)
  );
  const declaredButCurrentSlugs = [...declaredNotCurrentlyPublished].filter(slug =>
    current.has(slug)
  );

  if (
    blockedDeclaredSlugs.length > 0 ||
    unexpectedMissingSlugs.length > 0 ||
    declaredButCurrentSlugs.length > 0
  ) {
    throw new Error(
      `Historical baseline reconciliation is stale. Confirm publication status before changing the explicit not-currently-published set; blocked=${blockedDeclaredSlugs.map(historicalBaselineUrlForSlug).join(', ') || 'none'}; unexpected missing=${unexpectedMissingSlugs.map(historicalBaselineUrlForSlug).join(', ') || 'none'}; listed but current=${declaredButCurrentSlugs.map(historicalBaselineUrlForSlug).join(', ') || 'none'}.`
    );
  }

  return {
    currentBaselineSlugs,
    notCurrentlyPublishedSlugs: [...HISTORICAL_BASELINE_NOT_CURRENTLY_PUBLISHED_SLUGS],
    notCurrentlyPublishedUrls: HISTORICAL_BASELINE_NOT_CURRENTLY_PUBLISHED_SLUGS.map(
      historicalBaselineUrlForSlug
    ),
  };
}

function toBooleanIndexed(value: Record<string, unknown>): boolean | undefined {
  if (typeof value.indexed === 'boolean') return value.indexed;

  const verdict = String(value.verdict ?? value.indexStatus?.verdict ?? '').toUpperCase();
  if (verdict === 'PASS') return true;
  if (verdict === 'FAIL') return false;

  const coverageState = String(
    value.coverageState ?? value.indexStatus?.coverageState ?? ''
  ).toLowerCase();
  if (coverageState.includes('indexed') && !coverageState.includes('not indexed')) return true;
  if (coverageState.includes('not indexed')) return false;

  return undefined;
}

function toStatus(value: unknown): IGscIndexationStatus | null {
  if (!value || typeof value !== 'object') return null;

  const raw = value as Record<string, unknown>;
  const indexStatus =
    raw.indexStatusResult && typeof raw.indexStatusResult === 'object'
      ? (raw.indexStatusResult as Record<string, unknown>)
      : raw;
  const rawKeys = Array.isArray(raw.keys) ? raw.keys : [];
  const rawUrl = raw.url ?? raw.page ?? raw.inspectionUrl ?? rawKeys[0];
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;

  const sitemap = indexStatus.sitemap;
  return {
    url: normalizeBlogUrl(rawUrl),
    indexed: toBooleanIndexed({ ...raw, ...indexStatus }),
    verdict: typeof indexStatus.verdict === 'string' ? indexStatus.verdict : undefined,
    coverageState:
      typeof indexStatus.coverageState === 'string' ? indexStatus.coverageState : undefined,
    userCanonical:
      typeof indexStatus.userCanonical === 'string' ? indexStatus.userCanonical : undefined,
    googleCanonical:
      typeof indexStatus.googleCanonical === 'string' ? indexStatus.googleCanonical : undefined,
    sitemap: Array.isArray(sitemap)
      ? sitemap.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

/** Parse the supplied crawled-not-indexed CSV without treating an empty file as success. */
export function extractBlogUrlsFromCsv(csv: string): string[] {
  return csv
    .split(/\r?\n/)
    .slice(1)
    .map(line => line.split(',')[0]?.trim().replace(/^"|"$/g, ''))
    .filter((url): url is string => Boolean(url))
    .map(normalizeBlogUrl)
    .filter(url => Boolean(toSlug(url)));
}

export function parseBlogIndexationBaselineCsv(
  csv: string,
  source = 'Crawled-not-indexed baseline CSV'
): string[] {
  return validateBlogIndexationBaselineUrls(extractBlogUrlsFromCsv(csv), source);
}

export function validateBlogIndexationBaselineUrls(
  urls: Iterable<string>,
  source = 'Crawled-not-indexed baseline CSV'
): string[] {
  const normalizedUrls = [...urls].map(normalizeBlogUrl).filter(url => Boolean(toSlug(url)));
  const distinctUrls = new Set(normalizedUrls);
  const duplicateRows = normalizedUrls.length - distinctUrls.size;

  if (duplicateRows > 0) {
    throw new Error(
      `${source} contains duplicate blog URL rows=${duplicateRows}; expected ${BLOG_INDEXATION_BASELINE_URL_COUNT} distinct historical rows.`
    );
  }

  if (
    normalizedUrls.length !== BLOG_INDEXATION_BASELINE_URL_COUNT ||
    distinctUrls.size !== BLOG_INDEXATION_BASELINE_URL_COUNT
  ) {
    throw new Error(
      `${source} must contain exactly ${BLOG_INDEXATION_BASELINE_URL_COUNT} distinct blog URLs after filtering; found ${normalizedUrls.length} filtered rows and ${distinctUrls.size} distinct URLs.`
    );
  }

  const expectedUrls = new Set(BLOG_INDEXATION_BASELINE_URLS.map(normalizeBlogUrl));
  const missingUrls = [...expectedUrls].filter(url => !distinctUrls.has(url)).sort();
  const unexpectedUrls = [...distinctUrls].filter(url => !expectedUrls.has(url)).sort();
  if (missingUrls.length > 0 || unexpectedUrls.length > 0) {
    throw new Error(
      `${source} must match the historical 33 blog URL baseline; missing=${missingUrls.join(', ') || 'none'}; unexpected=${unexpectedUrls.join(', ') || 'none'}.`
    );
  }

  return normalizedUrls;
}

/** Extract blog URLs from the rendered blog sitemap rather than the post inventory. */
export function extractBlogUrlsFromSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map(match => match[1].replace(/&amp;/g, '&').trim())
    .map(normalizeBlogUrl)
    .filter(url => Boolean(toSlug(url)));
}

function getMapValue(
  values: Map<string, number> | Record<string, number> | undefined,
  key: string
): number {
  if (!values) return 0;
  const normalizedUrl = normalizeBlogUrl(key);
  const pathname = new URL(key, clientEnv.BASE_URL).pathname.replace(/\/$/, '') || '/';
  if (values instanceof Map) {
    return values.get(key) ?? values.get(normalizedUrl) ?? values.get(pathname) ?? 0;
  }
  return values[key] ?? values[normalizedUrl] ?? values[pathname] ?? 0;
}

function countWords(content: string): number {
  const plainText = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]+\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*`_|~-]/g, ' ')
    .trim();

  return plainText ? plainText.split(/\s+/).length : 0;
}

function daysSince(dateString: string, now: Date): number {
  const timestamp = Date.parse(dateString);
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - timestamp) / 86_400_000);
}

function toUrlSet(urls: Iterable<string> | undefined): Set<string> | undefined {
  if (urls === undefined) return undefined;
  const normalized = [...urls].map(normalizeBlogUrl).filter(Boolean);
  return new Set(normalized);
}

function getStatusMap(statuses: IGscIndexationStatus[]): Map<string, IGscIndexationStatus> {
  return new Map(statuses.map(status => [normalizeBlogUrl(status.url), status]));
}

function reconcileUnindexedUrls(
  actualRows: IBlogIndexationRow[],
  baselineUrls: Iterable<string>
): {
  missingFromReport: string[];
  unexpectedInReport: string[];
  historicalBaselineNotCurrentlyPublished: string[];
} {
  // The CSV is a historical baseline. A baseline URL may now be indexed, so
  // reconcile its presence in the current report separately from current
  // known-unindexed status.
  const reportUrls = new Set(actualRows.map(row => normalizeBlogUrl(row.url)));
  const reportSlugs = new Set(actualRows.map(row => row.slug));
  const currentKnownUnindexed = new Set(
    actualRows
      .filter(row => row.indexed === false && row.indexStatusKnown)
      .map(row => normalizeBlogUrl(row.url))
  );
  const baseline = [...baselineUrls].map(url => ({
    url: normalizeBlogUrl(url),
    slug: normalizeSlug(url),
  }));
  const baselineSlugs = new Set(
    baseline.map(entry => entry.slug).filter((slug): slug is string => Boolean(slug))
  );
  const missingEntries = baseline.filter(
    entry => !reportUrls.has(entry.url) && (!entry.slug || !reportSlugs.has(entry.slug))
  );
  const historicalBaselineSlugs = new Set(HISTORICAL_BASELINE_NOT_CURRENTLY_PUBLISHED_SLUGS);

  return {
    missingFromReport: missingEntries
      .filter(entry => !entry.slug || !historicalBaselineSlugs.has(entry.slug))
      .map(entry => entry.url)
      .sort(),
    unexpectedInReport: [...currentKnownUnindexed]
      .filter(url => {
        const slug = normalizeSlug(url);
        return !slug || !baselineSlugs.has(slug);
      })
      .sort(),
    historicalBaselineNotCurrentlyPublished: missingEntries
      .filter(entry => entry.slug && historicalBaselineSlugs.has(entry.slug))
      .map(entry => entry.url)
      .sort(),
  };
}

export function buildBlogIndexationReport(input: IBlogIndexationInput): IBlogIndexationReport {
  const statusMap = getStatusMap(input.statuses);
  const sitemapUrls = toUrlSet(input.sitemapUrls);
  const csvUnindexedUrls = toUrlSet(input.csvUnindexedUrls);
  const now = input.now ?? new Date();

  if (input.statuses.length === 0) {
    throw new Error(
      'No GSC coverage/indexation rows were returned for the current response; the historical CSV is reconciliation-only, so refusing to report every post as indexed.'
    );
  }

  if (!sitemapUrls) {
    throw new Error(
      'No rendered blog sitemap inventory was supplied; refusing to infer sitemap membership from the post inventory.'
    );
  }

  const rows = input.posts.map(post => {
    const url = toBlogUrl(post.slug);
    const normalizedUrl = normalizeBlogUrl(url);
    const status = statusMap.get(normalizedUrl);
    const statusFromGsc = status?.indexed;
    const statusKnown = statusFromGsc !== undefined;
    const indexed = statusFromGsc;
    const expectedCanonical = url;
    const canonical = status?.googleCanonical ?? status?.userCanonical ?? expectedCanonical;
    const wordCount = countWords(post.content);
    const inboundLinks = getMapValue(input.inboundLinkCounts, `/blog/${post.slug}`);
    const inSitemap = sitemapUrls.has(normalizedUrl);
    const causes: BlogIndexationCause[] = [];

    if (inboundLinks < 2) causes.push('NO_INBOUND_LINKS');
    if (status?.userCanonical && normalizeBlogUrl(status.userCanonical) !== normalizeBlogUrl(url)) {
      causes.push('CANONICAL_MISMATCH');
    } else if (
      status?.googleCanonical &&
      normalizeBlogUrl(status.googleCanonical) !== normalizeBlogUrl(url)
    ) {
      causes.push('CANONICAL_MISMATCH');
    }
    if (wordCount < MINIMUM_WORD_COUNT) causes.push('THIN');
    if (!inSitemap) causes.push('NOT_IN_SITEMAP');
    if (daysSince(post.date, now) < TOO_NEW_DAYS) causes.push('TOO_NEW');
    if (!statusKnown) causes.push('INDEX_STATUS_UNAVAILABLE');
    if (!indexed && causes.length === 0) causes.push('UNINDEXED_NO_CAUSE');

    return {
      slug: post.slug,
      url,
      intent: getPageIntent(url),
      title: post.title,
      indexed,
      indexStatusKnown: statusKnown,
      impressions: getMapValue(input.impressions, normalizeBlogUrl(url)),
      inboundLinks,
      wordCount,
      canonical,
      publishDate: post.date,
      inSitemap,
      causes,
    };
  });

  const unknown = rows.filter(row => row.indexed === undefined);
  const report: IBlogIndexationReport = {
    days: input.days ?? DEFAULT_DAYS,
    rows,
    unindexed: rows.filter(row => row.indexed === false),
    unknown,
  };

  if (csvUnindexedUrls) {
    const reconciliation = reconcileUnindexedUrls(rows, csvUnindexedUrls);
    report.expectedUnindexedUrls = [...csvUnindexedUrls].sort();
    report.reconciliation = {
      missingFromReport: reconciliation.missingFromReport,
      unexpectedInReport: reconciliation.unexpectedInReport,
    };
    if (reconciliation.historicalBaselineNotCurrentlyPublished.length > 0) {
      report.reconciliation.historicalBaselineNotCurrentlyPublished =
        reconciliation.historicalBaselineNotCurrentlyPublished;
    }
  }

  return report;
}

function toImpressionMap(rows: IGscSearchAnalyticsRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const url = row.keys?.[0];
    if (url) map.set(normalizeBlogUrl(url), toFiniteNumber(row.impressions));
  }
  return map;
}

function getSavedStatuses(data: ISavedGscExport): IGscIndexationStatus[] {
  const candidates = [
    ...(data.indexing?.inspectedPages ?? []),
    ...(data.coverage?.rows ?? []),
    ...(data.crawledNotIndexed ?? []),
    ...(data.unindexed ?? []),
  ];

  return candidates
    .map(toStatus)
    .filter((status): status is IGscIndexationStatus => Boolean(status));
}

function getSavedPerformanceRows(data: ISavedGscExport): IGscSearchAnalyticsRow[] {
  const candidates = data.searchTypes?.web?.pages ?? data.topPages ?? data.pages ?? [];
  return candidates.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    const keys = Array.isArray(row.keys) ? row.keys : [];
    const url = row.page ?? row.url ?? keys[0];
    if (typeof url !== 'string') return [];
    return [
      {
        keys: [url],
        clicks: toFiniteNumber(row.clicks),
        impressions: toFiniteNumber(row.impressions),
        ctr: toFiniteNumber(row.ctr),
        position: toFiniteNumber(row.position, 100),
      },
    ];
  });
}

async function readRequiredCsv(): Promise<{ urls: string[]; path: string }> {
  const explicitPath = getArg('csv');
  const candidates = explicitPath
    ? [resolve(explicitPath)]
    : [
        'data/gsc-crawled-not-indexed.csv',
        'docs/PRDs/gsc-recovery-2026-08/data/gsc-crawled-not-indexed.csv',
      ].map(candidate => resolve(candidate));
  const path = candidates.find(candidate => existsSync(candidate));
  if (!path) {
    throw new Error(
      'Crawled-not-indexed CSV is required for the 33-row reconciliation; pass --csv=path/to/data/gsc-crawled-not-indexed.csv.'
    );
  }

  const urls = parseBlogIndexationBaselineCsv(await readFile(path, 'utf8'), path);
  return { urls, path };
}

async function readRequiredSitemap(): Promise<{ urls: string[]; source: string }> {
  const explicitSource = getArg('sitemap');
  const source = explicitSource ?? `${clientEnv.BASE_URL.replace(/\/$/, '')}/sitemap-blog.xml`;
  const response = /^https?:\/\//i.test(source)
    ? await fetch(source)
    : {
        ok: true,
        status: 200,
        text: () => readFile(resolve(source), 'utf8'),
      };

  if (!response.ok) {
    throw new Error(`Blog sitemap fetch failed (${response.status}): ${source}`);
  }

  const urls = extractBlogUrlsFromSitemap(await response.text());
  if (urls.length === 0) {
    throw new Error(`Blog sitemap contains no blog URLs: ${source}`);
  }
  return { urls, source };
}

async function inspectUrl(accessToken: string, url: string): Promise<IGscIndexationStatus> {
  const response = await fetch(
    'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: serverEnv.GSC_SITE_URL }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GSC URL Inspection failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const status = toStatus({
    url,
    ...(data.inspectionResult as Record<string, unknown> | undefined),
  });
  if (!status) throw new Error(`GSC URL Inspection returned no index status for ${url}`);
  return status;
}

async function fetchLiveInput(sitemapUrls: string[]): Promise<IBlogIndexationInput> {
  if (!serverEnv.GSC_SERVICE_ACCOUNT_EMAIL || !serverEnv.GSC_PRIVATE_KEY) {
    throw new Error(
      'Missing GSC credentials. Pass --gsc=path/to/saved-export.json or configure GSC_SERVICE_ACCOUNT_EMAIL and GSC_PRIVATE_KEY.'
    );
  }

  const [publishedPosts, allPublishedSlugs] = await Promise.all([
    getAllPublishedPosts(),
    getAllPublishedSlugsStrict(),
  ]);
  const publishedSlugs = allPublishedSlugs.filter(slug => !BLOCKED_BLOG_SLUGS.has(slug));
  const metadataBySlug = new Map(publishedPosts.map(post => [post.slug, post]));
  const posts = await Promise.all(
    publishedSlugs.map(async slug => {
      const metadata = metadataBySlug.get(slug);
      const fullPost = await getPublishedPostBySlug(slug);
      return {
        slug,
        title: metadata?.title ?? fullPost?.title ?? slug,
        date: fullPost?.published_at ?? fullPost?.created_at ?? metadata?.date ?? '1970-01-01',
        content: fullPost?.content ?? '',
      } satisfies IBlogIndexationPost;
    })
  );

  const accessToken = await createGscAccessToken(
    serverEnv.GSC_SERVICE_ACCOUNT_EMAIL,
    serverEnv.GSC_PRIVATE_KEY
  );
  const range = buildGscDateRange(DEFAULT_DAYS);
  const performanceRows = await fetchBlogPagePerformance(
    accessToken,
    serverEnv.GSC_SITE_URL,
    range
  );
  const statuses: IGscIndexationStatus[] = [];
  for (const post of posts) {
    statuses.push(await inspectUrl(accessToken, toBlogUrl(post.slug)));
  }

  const blogSlugs = posts.map(post => post.slug);
  const inboundLinkCounts = getSeoEquityInboundLinkCounts(getSeoEquitySnapshot(), { blogSlugs });

  return {
    posts,
    statuses,
    impressions: toImpressionMap(performanceRows),
    inboundLinkCounts,
    sitemapUrls,
    days: DEFAULT_DAYS,
  };
}

async function loadSavedInput(
  path: string,
  csvUrls: string[],
  sitemapUrls: string[]
): Promise<IBlogIndexationInput> {
  const data = JSON.parse(await readFile(resolve(path), 'utf8')) as ISavedGscExport;
  const [publishedPosts, allPublishedSlugs] = await Promise.all([
    getAllPublishedPosts(),
    getAllPublishedSlugsStrict(),
  ]);
  const publishedSlugs = allPublishedSlugs.filter(slug => !BLOCKED_BLOG_SLUGS.has(slug));
  const metadataBySlug = new Map(publishedPosts.map(post => [post.slug, post]));
  const posts = await Promise.all(
    publishedSlugs.map(async slug => {
      const metadata = metadataBySlug.get(slug);
      const fullPost = await getPublishedPostBySlug(slug);
      return {
        slug,
        title: metadata?.title ?? fullPost?.title ?? slug,
        date: fullPost?.published_at ?? fullPost?.created_at ?? metadata?.date ?? '1970-01-01',
        content: fullPost?.content ?? '',
      } satisfies IBlogIndexationPost;
    })
  );
  const blogSlugs = posts.map(post => post.slug);
  const inboundLinkCounts = getSeoEquityInboundLinkCounts(getSeoEquitySnapshot(), { blogSlugs });
  const performanceRows = getSavedPerformanceRows(data);
  const statuses = getSavedStatuses(data);
  return {
    posts,
    statuses,
    impressions: toImpressionMap(performanceRows),
    inboundLinkCounts,
    sitemapUrls,
    csvUnindexedUrls: csvUrls,
    days: data.meta?.dateRanges?.current?.days ?? data.meta?.dateRange?.days ?? DEFAULT_DAYS,
  };
}

export function formatBlogIndexationReport(
  report: IBlogIndexationReport,
  csvPath?: string
): string {
  const lines = [
    `Blog indexation report (${report.days} days)`,
    `Published posts: ${report.rows.length}`,
    `Indexed: ${report.rows.filter(row => row.indexed === true).length}`,
    `Unindexed: ${report.unindexed.length}`,
    `GSC status unavailable: ${report.unknown.length}`,
    '',
    'Post detail:',
  ];

  for (const row of report.rows) {
    lines.push(
      `- ${row.slug} | intent=${row.intent} | indexed=${row.indexed === undefined ? 'UNKNOWN' : row.indexed ? 'YES' : 'NO'} | impressions=${row.impressions} | inbound=${row.inboundLinks} | words=${row.wordCount} | canonical=${row.canonical} | published=${row.publishDate} | sitemap=${row.inSitemap ? 'YES' : 'NO'} | causes=${row.causes.join(',') || 'none'}`
    );
  }

  if (report.reconciliation) {
    lines.push('', `CSV cross-check: ${csvPath ?? 'supplied crawled-not-indexed export'}`);
    lines.push(
      `- baseline=${report.expectedUnindexedUrls?.length ?? 0} | missing-from-report=${report.reconciliation.missingFromReport.length} | unexpected-in-report=${report.reconciliation.unexpectedInReport.length}`
    );
    if (report.reconciliation.historicalBaselineNotCurrentlyPublished) {
      lines.push(
        `- historical-baseline-not-currently-published=${report.reconciliation.historicalBaselineNotCurrentlyPublished.length}: ${report.reconciliation.historicalBaselineNotCurrentlyPublished.join(', ')}`
      );
    }
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const inputPath = getArg('gsc') ?? getArg('input');
  const csv = await readRequiredCsv();
  const sitemap = await readRequiredSitemap();
  const input = inputPath
    ? await loadSavedInput(inputPath, csv.urls, sitemap.urls)
    : await fetchLiveInput(sitemap.urls);
  reconcileHistoricalBaselineSlugs(input.posts.map(post => post.slug));
  const report = buildBlogIndexationReport({
    ...input,
    csvUnindexedUrls: csv.urls,
  });
  console.log(formatBlogIndexationReport(report, csv.path));

  if (report.reconciliation) {
    const { missingFromReport, unexpectedInReport } = report.reconciliation;
    if (missingFromReport.length > 0 || unexpectedInReport.length > 0) {
      throw new Error(
        `Unindexed set does not reconcile with ${csv.path}: missing=${missingFromReport.length}, unexpected=${unexpectedInReport.length}`
      );
    }
  }
}

const isMainModule =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
  main().catch(error => {
    console.error(
      `Blog indexation report failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
