#!/usr/bin/env tsx

/**
 * Refresh the committed pSEO performance verdict from a 90-day GSC export.
 *
 * The script joins GSC page rows to the pSEO data inventory before writing. A
 * zero-row response is an error: an empty snapshot would otherwise make every
 * old page look unproven and silently change sitemap output.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { serverEnv } from '@shared/config/env';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@/i18n/config';
import { isCategoryLocalized } from '@/lib/seo/localization-config';
import type { PSEOCategory } from '@/lib/seo/url-utils';
import {
  buildGscDateRange,
  createGscAccessToken,
  queryAllSearchAnalyticsRows,
} from '@server/services/gsc.service';
import type { IGscDateRange, IGscSearchAnalyticsRow } from '@server/services/gsc.types';
import type { IPagePerformanceSnapshot } from '@/lib/seo/page-eligibility';

const DEFAULT_SITE_URL = 'sc-domain:myimageupscaler.com';
const DEFAULT_SNAPSHOT_PATH = 'content/pseo-performance.json';
const DEFAULT_SITE_ORIGIN = 'https://myimageupscaler.com';

const CATEGORY_ALIASES: Record<string, string> = {
  'format-conversion': 'tools',
  'interactive-tools': 'tools',
  'social-media-resize': 'tools',
  'device-specific': 'scale',
  personas: 'personas-expanded',
  comparisons: 'comparisons-expanded',
};

const TOOL_PATHS: Record<string, string> = {
  'image-resizer': '/tools/resize/image-resizer',
  'bulk-image-resizer': '/tools/resize/bulk-image-resizer',
  'resize-image-for-instagram': '/tools/resize/resize-image-for-instagram',
  'resize-image-for-youtube': '/tools/resize/resize-image-for-youtube',
  'resize-image-for-facebook': '/tools/resize/resize-image-for-facebook',
  'resize-image-for-twitter': '/tools/resize/resize-image-for-twitter',
  'resize-image-for-linkedin': '/tools/resize/resize-image-for-linkedin',
  'resize-image-for-pinterest': '/tools/resize/resize-image-for-pinterest',
  'resize-image-for-tiktok': '/tools/resize/resize-image-for-tiktok',
  'resize-image-for-discord': '/tools/resize/resize-image-for-discord',
  'resize-image-for-reddit': '/tools/resize/resize-image-for-reddit',
  'resize-image-for-telegram': '/tools/resize/resize-image-for-telegram',
  'png-to-jpg': '/tools/convert/png-to-jpg',
  'jpg-to-png': '/tools/convert/jpg-to-png',
  'webp-to-jpg': '/tools/convert/webp-to-jpg',
  'webp-to-png': '/tools/convert/webp-to-png',
  'jpg-to-webp': '/tools/convert/jpg-to-webp',
  'png-to-webp': '/tools/convert/png-to-webp',
  'bmp-to-png': '/tools/convert/bmp-to-png',
  'gif-to-png': '/tools/convert/gif-to-png',
  'gif-to-webp': '/tools/convert/gif-to-webp',
  'bmp-to-webp': '/tools/convert/bmp-to-webp',
  'image-compressor': '/tools/compress/image-compressor',
  'bulk-image-compressor': '/tools/compress/bulk-image-compressor',
};

interface IRawInventoryPage {
  category: string;
  slug: string;
  lastUpdated?: string;
  path?: string;
}

export interface IInventoryPage extends IRawInventoryPage {
  category: string;
  locale: Locale;
  url: string;
}

interface ISavedGscExport {
  pages?: Array<Record<string, unknown>>;
  topPages?: Array<Record<string, unknown>>;
  searchTypes?: {
    web?: { pages?: Array<Record<string, unknown>> };
  };
}

interface ICategoryReport {
  category: string;
  locale: string;
  submitted: number;
  impressions: number;
  clicks: number;
  indexationRate: number;
}

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

function getNumberArg(name: string, fallback: number): number {
  const value = getArg(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a number`);
  return parsed;
}

function getDateRange(): IGscDateRange & { days: number } {
  const days = getNumberArg('days', 90);
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error(`--days must be a positive integer; received ${days}`);
  }

  const startDate = getArg('start-date');
  const endDate = getArg('end-date');
  const range = startDate && endDate ? { startDate, endDate } : buildGscDateRange(days);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(range.endDate)) {
    throw new Error('GSC dates must use YYYY-MM-DD');
  }
  if (range.startDate > range.endDate) {
    throw new Error(`GSC date range is empty: ${range.startDate} is after ${range.endDate}`);
  }

  return { ...range, days };
}

function normalizeCategory(category: string): string {
  return CATEGORY_ALIASES[category.trim().toLowerCase()] || category.trim().toLowerCase();
}

function normalizeSlug(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
}

function normalizePath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] || '/';
  return `/${pathname.replace(/^\/+|\/+$/g, '')}`;
}

function getInventoryPath(category: string, slug: string, path?: string): string {
  if (path) return normalizePath(path);
  if (category === 'tools') return TOOL_PATHS[slug] || `/tools/${slug}`;
  return `/${category}/${slug}`;
}

function getInventoryLocales(category: string): readonly Locale[] {
  return isCategoryLocalized(category as PSEOCategory, 'es') ? SUPPORTED_LOCALES : [DEFAULT_LOCALE];
}

function buildInventoryUrl(path: string, locale: Locale): string {
  const localePath = locale === DEFAULT_LOCALE ? path : `/${locale}${path}`;
  return `${DEFAULT_SITE_ORIGIN}${localePath}`;
}

export function buildInventory(rawPages: readonly IRawInventoryPage[]): IInventoryPage[] {
  const byKey = new Map<string, IInventoryPage>();

  for (const rawPage of rawPages) {
    if (!rawPage.slug) continue;
    const category = normalizeCategory(rawPage.category);
    if (category === 'use-cases-expanded') continue;
    const slug = normalizeSlug(rawPage.slug);
    const path = getInventoryPath(category, slug, rawPage.path);

    for (const locale of getInventoryLocales(category)) {
      const key = `${category}/${slug}/${locale}`;
      byKey.set(key, {
        category,
        slug,
        locale,
        url: buildInventoryUrl(path, locale),
        lastUpdated: rawPage.lastUpdated,
        path,
      });
    }
  }

  return [...byKey.values()].sort(
    (left, right) =>
      left.category.localeCompare(right.category) ||
      left.slug.localeCompare(right.slug) ||
      left.locale.localeCompare(right.locale)
  );
}

function readInventory(): IInventoryPage[] {
  const dataDir = resolve(process.cwd(), 'app/seo/data');
  const rawPages: IRawInventoryPage[] = [];

  for (const filename of readdirSync(dataDir)
    .filter(file => file.endsWith('.json'))
    .sort()) {
    const file = JSON.parse(readFileSync(join(dataDir, filename), 'utf8')) as {
      category?: string;
      pages?: Array<{ slug?: string; lastUpdated?: string }>;
    };
    const category = file.category || basename(filename, '.json');

    for (const page of file.pages || []) {
      if (page.slug) rawPages.push({ category, slug: page.slug, lastUpdated: page.lastUpdated });
    }
  }

  const inventory = buildInventory(rawPages);
  if (inventory.length === 0) throw new Error('No pSEO pages found in app/seo/data');
  return inventory;
}

export function normalizePageIdentity(
  url: string
): { category: string; slug: string; locale: Locale } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const segments = parsed.pathname
    .split('/')
    .filter(Boolean)
    .map(segment => normalizeSlug(segment));
  let locale: Locale = DEFAULT_LOCALE;
  if (SUPPORTED_LOCALES.includes(segments[0] as Locale)) {
    locale = segments.shift() as Locale;
  }

  const rawCategory = segments[0];
  const rawSlug = segments[segments.length - 1];
  if (!rawCategory || !rawSlug || segments.length < 2 || rawCategory === 'blog') return null;
  return { category: normalizeCategory(rawCategory), slug: rawSlug, locale };
}

function normalizeSavedRows(input: ISavedGscExport): IGscSearchAnalyticsRow[] {
  const rows = input.pages || input.topPages || input.searchTypes?.web?.pages || [];
  return rows
    .map(row => ({
      keys: [String(row.page || row.url || '')],
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      ctr: Number(row.ctr || 0),
      position: Number(row.position || 100),
    }))
    .filter(row => row.keys[0]);
}

async function fetchRows(siteUrl: string, range: IGscDateRange): Promise<IGscSearchAnalyticsRow[]> {
  const inputPath = getArg('input');
  if (inputPath) {
    return normalizeSavedRows(JSON.parse(readFileSync(resolve(inputPath), 'utf8')));
  }

  if (!serverEnv.GSC_SERVICE_ACCOUNT_EMAIL || !serverEnv.GSC_PRIVATE_KEY) {
    throw new Error(
      'GSC credentials are missing. Set GSC_SERVICE_ACCOUNT_EMAIL and GSC_PRIVATE_KEY, or pass --input=/path/to/export.json.'
    );
  }

  const accessToken = await createGscAccessToken(
    serverEnv.GSC_SERVICE_ACCOUNT_EMAIL,
    serverEnv.GSC_PRIVATE_KEY
  );
  return queryAllSearchAnalyticsRows(accessToken, siteUrl, {
    startDate: range.startDate,
    endDate: range.endDate,
    dimensions: ['page'],
    aggregationType: 'byPage',
    type: 'web',
    dataState: 'final',
    rowLimit: 25000,
  });
}

export function buildSnapshot(
  inventory: readonly IInventoryPage[],
  rows: IGscSearchAnalyticsRow[],
  range: IGscDateRange & { days: number },
  siteUrl: string,
  generatedAt: string
): IPagePerformanceSnapshot {
  if (rows.length === 0) {
    throw new Error(
      `GSC returned zero page rows for ${range.startDate} through ${range.endDate}; no snapshot was written.`
    );
  }

  const pages = inventory.map(page => ({
    category: page.category,
    slug: page.slug,
    locale: page.locale,
    url: page.url,
    impressions: 0,
    clicks: 0,
    lastUpdated: page.lastUpdated,
  }));
  const pageByKey = new Map<string, (typeof pages)[number]>();
  for (const page of pages) {
    pageByKey.set(`${page.category}/${page.slug}/${page.locale}`, page);
  }

  for (const row of rows) {
    const url = row.keys[0];
    const identity = normalizePageIdentity(url);
    if (!identity) continue;

    const pageKey = `${identity.category}/${identity.slug}/${identity.locale}`;
    const existing = pageByKey.get(pageKey);
    if (!existing) continue;
    const record = existing;
    record.impressions += row.impressions;
    record.clicks += row.clicks;
  }

  const indexedUrls = pages.filter(page => page.impressions > 0 || page.clicks > 0).length;
  const submittedUrls = pages.length;

  return {
    generatedAt,
    period: range,
    siteUrl,
    submittedUrls,
    indexedUrls,
    indexationRate:
      submittedUrls === 0 ? 0 : Number(((indexedUrls / submittedUrls) * 100).toFixed(2)),
    pages,
  };
}

function buildCategoryReport(snapshot: IPagePerformanceSnapshot): ICategoryReport[] {
  const groups = new Map<string, ICategoryReport>();

  for (const page of snapshot.pages) {
    const locale = page.locale || 'en';
    const key = `${page.category}/${locale}`;
    const report = groups.get(key) || {
      category: page.category,
      locale,
      submitted: 0,
      impressions: 0,
      clicks: 0,
      indexationRate: 0,
    };
    report.submitted += 1;
    report.impressions += page.impressions;
    report.clicks += page.clicks;
    groups.set(key, report);
  }

  return [...groups.values()]
    .map(report => ({
      ...report,
      indexationRate:
        report.submitted === 0
          ? 0
          : Number(
              (
                ([...snapshot.pages].filter(
                  page =>
                    page.category === report.category &&
                    (page.locale || 'en') === report.locale &&
                    (page.impressions > 0 || page.clicks > 0)
                ).length /
                  report.submitted) *
                100
              ).toFixed(2)
            ),
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.locale.localeCompare(b.locale));
}

export function renderIndexationReport(snapshot: IPagePerformanceSnapshot): string {
  const categoryReports = buildCategoryReport(snapshot);
  const rows = categoryReports
    .map(
      report =>
        `| ${report.category} | ${report.locale} | ${report.submitted} | ${report.impressions} | ${report.clicks} | ${report.indexationRate}% |`
    )
    .join('\n');

  return `# pSEO indexation report\n\nGenerated: ${snapshot.generatedAt}\n\nWindow: ${snapshot.period.startDate} to ${snapshot.period.endDate} (${snapshot.period.days} days)\n\nSite: \`${snapshot.siteUrl}\`\n\nOverall indexation rate: ${snapshot.indexationRate}% (${snapshot.indexedUrls}/${snapshot.submittedUrls})\n\n| Category | Locale | Submitted | Impressions > 0 | Clicks > 0 | Indexation rate |\n| --- | --- | ---: | ---: | ---: | ---: |\n${rows}\n`;
}

async function main(): Promise<void> {
  const snapshotPath = resolve(getArg('snapshot') || DEFAULT_SNAPSHOT_PATH);

  if (process.argv.includes('--report-only')) {
    const current = JSON.parse(readFileSync(snapshotPath, 'utf8')) as IPagePerformanceSnapshot;
    process.stdout.write(renderIndexationReport(current));
    return;
  }

  const range = getDateRange();
  const reportPath = resolve(getArg('report') || `seo-reports/indexation-${range.endDate}.md`);
  const siteUrl = getArg('site') || serverEnv.GSC_SITE_URL || DEFAULT_SITE_URL;
  const rows = await fetchRows(siteUrl, range);
  const snapshot = buildSnapshot(readInventory(), rows, range, siteUrl, new Date().toISOString());

  mkdirSync(resolve(process.cwd(), 'content'), { recursive: true });
  mkdirSync(resolve(process.cwd(), 'seo-reports'), { recursive: true });
  writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  writeFileSync(reportPath, renderIndexationReport(snapshot));
  console.log(
    `Wrote ${snapshotPath} (${snapshot.pages.length} pages) and ${reportPath} (${snapshot.indexationRate}% indexation)`
  );
}

if (process.argv[1]?.endsWith('sync-page-performance.ts')) {
  main().catch(error => {
    console.error(
      `sync-page-performance failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
