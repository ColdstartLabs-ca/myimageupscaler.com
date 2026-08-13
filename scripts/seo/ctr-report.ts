#!/usr/bin/env tsx

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildGscDateRange,
  createGscAccessToken,
  queryAllSearchAnalyticsRows,
} from '@server/services/gsc.service';
import type { IGscSearchAnalyticsRow } from '@server/services/gsc.types';
import { serverEnv } from '@shared/config/env';
import {
  getPageIntent,
  INFORMATIONAL_CITATION_URLS,
  normalizePagePath,
  type PageIntent,
} from '@lib/seo/page-intent';

const GSC_ROW_LIMIT = 25_000;
const DEFAULT_DAYS = 90;

export interface ICtrPageRow {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface ICtrBucket {
  intent: PageIntent;
  pages: number;
  clicks: number;
  impressions: number;
  ctr: number;
  averagePosition: number;
}

export interface ICtrReport {
  days: number;
  rows: ICtrPageRow[];
  commercial: ICtrBucket;
  informational: ICtrBucket;
  excludedUrls: ICtrPageRow[];
}

interface ISavedGscExport {
  meta?: {
    dateRanges?: { current?: { days?: number } };
    dateRange?: { days?: number };
  };
  topPages?: unknown[];
  pages?: unknown[];
  rows?: unknown[];
  searchTypes?: { web?: { pages?: unknown[] } };
}

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toPageRow(value: unknown): ICtrPageRow | null {
  if (!value || typeof value !== 'object') return null;

  const row = value as Record<string, unknown>;
  const keys = Array.isArray(row.keys) ? row.keys : [];
  const rawUrl = row.page ?? row.url ?? keys[0];
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;

  const clicks = toFiniteNumber(row.clicks);
  const impressions = toFiniteNumber(row.impressions);

  return {
    url: normalizePagePath(rawUrl),
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: toFiniteNumber(row.position, 100),
  };
}

/** Extract page rows from both the standalone GSC fetcher and a raw API response. */
export function extractPageRows(value: unknown): ICtrPageRow[] {
  if (!value || typeof value !== 'object') return [];

  const exportData = value as ISavedGscExport;
  const candidates =
    exportData.searchTypes?.web?.pages ??
    exportData.topPages ??
    exportData.pages ??
    exportData.rows;

  if (!Array.isArray(candidates)) return [];

  return candidates.map(toPageRow).filter((row): row is ICtrPageRow => Boolean(row));
}

function mergePageRows(rows: ICtrPageRow[]): ICtrPageRow[] {
  const merged = new Map<string, ICtrPageRow>();

  for (const row of rows) {
    const previous = merged.get(row.url);
    if (!previous) {
      merged.set(row.url, { ...row });
      continue;
    }

    const impressions = previous.impressions + row.impressions;
    const clicks = previous.clicks + row.clicks;
    merged.set(row.url, {
      url: row.url,
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position:
        impressions > 0
          ? (previous.position * previous.impressions + row.position * row.impressions) /
            impressions
          : row.position,
    });
  }

  return [...merged.values()].sort(
    (left, right) => right.impressions - left.impressions || left.url.localeCompare(right.url)
  );
}

function summarizeBucket(rows: ICtrPageRow[], intent: PageIntent): ICtrBucket {
  const matchingRows = rows.filter(row => getPageIntent(row.url) === intent);
  const clicks = matchingRows.reduce((total, row) => total + row.clicks, 0);
  const impressions = matchingRows.reduce((total, row) => total + row.impressions, 0);

  return {
    intent,
    pages: matchingRows.length,
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    averagePosition:
      impressions > 0
        ? matchingRows.reduce((total, row) => total + row.position * row.impressions, 0) /
          impressions
        : 0,
  };
}

function summarizeInformationalRows(rows: ICtrPageRow[]): ICtrBucket {
  const excluded = new Set(INFORMATIONAL_CITATION_URLS);
  return summarizeBucket(
    rows.filter(row => !excluded.has(normalizePagePath(row.url))),
    'informational'
  );
}

function makeZeroRow(url: string): ICtrPageRow {
  return { url, clicks: 0, impressions: 0, ctr: 0, position: 0 };
}

export function buildCtrReport(rows: ICtrPageRow[], options: { days?: number } = {}): ICtrReport {
  const mergedRows = mergePageRows(rows);
  if (mergedRows.length === 0) {
    throw new Error(
      'No GSC page rows were returned; refusing to report an all-zero CTR split as healthy.'
    );
  }

  const rowByUrl = new Map(mergedRows.map(row => [row.url, row]));
  const excludedUrls = INFORMATIONAL_CITATION_URLS.map(
    url => rowByUrl.get(url) ?? makeZeroRow(url)
  );

  return {
    days: options.days ?? DEFAULT_DAYS,
    rows: mergedRows,
    commercial: summarizeBucket(mergedRows, 'commercial'),
    informational: summarizeInformationalRows(mergedRows),
    excludedUrls,
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatBucket(bucket: ICtrBucket): string {
  return [
    `${bucket.intent}:`,
    `pages=${bucket.pages}`,
    `impressions=${bucket.impressions}`,
    `clicks=${bucket.clicks}`,
    `CTR=${formatPercent(bucket.ctr)}`,
    `avg-position=${bucket.averagePosition.toFixed(2)}`,
  ].join(' ');
}

export function formatCtrReport(report: ICtrReport): string {
  const lines = [
    `Blog CTR report (${report.days} days)`,
    formatBucket(report.commercial),
    formatBucket(report.informational),
    'Site-wide CTR is not the health metric for this lane; use the commercial bucket.',
    'Excluded informational URLs (citation assets; listed explicitly):',
  ];

  for (const row of report.excludedUrls) {
    lines.push(
      `- ${row.url} | impressions=${row.impressions} | clicks=${row.clicks} | CTR=${formatPercent(row.ctr)}`
    );
  }

  return lines.join('\n');
}

async function fetchLiveRows(): Promise<{ rows: ICtrPageRow[]; days: number }> {
  if (!serverEnv.GSC_SERVICE_ACCOUNT_EMAIL || !serverEnv.GSC_PRIVATE_KEY) {
    throw new Error(
      'Missing GSC credentials. Pass --gsc=path/to/saved-export.json or configure GSC_SERVICE_ACCOUNT_EMAIL and GSC_PRIVATE_KEY.'
    );
  }

  const days = Number(getArg('days') ?? DEFAULT_DAYS);
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error('--days must be a positive integer');
  }

  const accessToken = await createGscAccessToken(
    serverEnv.GSC_SERVICE_ACCOUNT_EMAIL,
    serverEnv.GSC_PRIVATE_KEY
  );
  const range = buildGscDateRange(days);
  const rows = await queryAllSearchAnalyticsRows(accessToken, serverEnv.GSC_SITE_URL, {
    startDate: range.startDate,
    endDate: range.endDate,
    dimensions: ['page'],
    aggregationType: 'byPage',
    type: 'web',
    dataState: 'final',
    rowLimit: GSC_ROW_LIMIT,
  });

  return { rows: extractPageRows({ pages: rows }), days };
}

async function loadRowsFromFile(filePath: string): Promise<{ rows: ICtrPageRow[]; days: number }> {
  const raw = JSON.parse(await readFile(filePath, 'utf8')) as ISavedGscExport;
  const dateRange = raw.meta?.dateRanges?.current ?? raw.meta?.dateRange;
  return {
    rows: extractPageRows(raw),
    days: dateRange?.days ?? DEFAULT_DAYS,
  };
}

async function main(): Promise<void> {
  const inputPath = getArg('gsc') ?? getArg('input');
  const result = inputPath ? await loadRowsFromFile(resolve(inputPath)) : await fetchLiveRows();

  const report = buildCtrReport(result.rows, { days: result.days });
  console.log(formatCtrReport(report));
}

const isMainModule =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
  main().catch(error => {
    console.error(
      `Blog CTR report failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
