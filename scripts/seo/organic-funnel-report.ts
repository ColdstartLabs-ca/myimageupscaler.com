import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BRANDED_QUERIES = new Set([
  'myimageupscaler',
  'my image upscaler',
  'myimageupscaler.com',
  'https myimageupscaler com',
]);

type GscRow = {
  query: string;
  page?: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type FunnelRow = {
  landing_page: string;
  country?: string;
  device?: string;
  mode?: string;
  successful_upscales?: number;
  failed_upscales?: number;
  downloads?: number;
  purchases?: number;
  refunded_credits?: number;
  processing_cost_usd?: number;
};

export function splitBrandRows<T extends { query: string }>(rows: T[]): {
  branded: T[];
  nonBrand: T[];
} {
  const branded: T[] = [];
  const nonBrand: T[] = [];
  for (const row of rows) {
    const normalized = row.query.trim().toLowerCase();
    (BRANDED_QUERIES.has(normalized) ? branded : nonBrand).push(row);
  }
  return { branded, nonBrand };
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function asRows<T>(path: string): T[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as T[] | { rows?: T[] };
  return Array.isArray(parsed) ? parsed : parsed.rows ?? [];
}

function num(value: number | undefined): string {
  return String(value ?? 0);
}

function renderReport(gscRows: GscRow[], funnelRows: FunnelRow[], generatedAt: string): string {
  const split = splitBrandRows(gscRows);
  const brandClicks = split.branded.reduce((sum, row) => sum + (row.clicks ?? 0), 0);
  const nonBrandClicks = split.nonBrand.reduce((sum, row) => sum + (row.clicks ?? 0), 0);

  const lines = [
    '# Organic Funnel by Landing Page',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Search demand split',
    '',
    `- Branded clicks represented in query rows: ${brandClicks}`,
    `- Non-brand clicks represented in query rows: ${nonBrandClicks}`,
    '',
    'Privacy-suppressed GSC query rows are intentionally not assigned to non-brand.',
    '',
    '## Funnel rows',
    '',
    '| Landing page | Country | Device | Mode | Success | Failed | Downloads | Purchases | Refunded credits | Processing cost (USD) |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const row of funnelRows) {
    lines.push(
      `| ${row.landing_page} | ${row.country ?? 'unknown'} | ${row.device ?? 'unknown'} | ${row.mode ?? 'unknown'} | ${num(row.successful_upscales)} | ${num(row.failed_upscales)} | ${num(row.downloads)} | ${num(row.purchases)} | ${num(row.refunded_credits)} | ${num(row.processing_cost_usd)} |`
    );
  }

  if (funnelRows.length === 0) {
    lines.push('| No rows returned | — | — | — | 0 | 0 | 0 | 0 | 0 | 0 |');
  }

  return `${lines.join('\n')}\n`;
}

export function runOrganicFunnelReport(): void {
  const gscPath = argValue('--gsc');
  const ga4Path = argValue('--ga4');
  const output = argValue('--out');
  if (!gscPath || !ga4Path || !output) {
    throw new Error(
      'Usage: yarn seo:funnel:report --gsc <gsc-query-rows.json> --ga4 <ga4-funnel-rows.json> --out <report.md>'
    );
  }

  const gscRows = asRows<GscRow>(gscPath);
  const funnelRows = asRows<FunnelRow>(ga4Path);
  writeFileSync(output, renderReport(gscRows, funnelRows, new Date().toISOString()));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) runOrganicFunnelReport();
