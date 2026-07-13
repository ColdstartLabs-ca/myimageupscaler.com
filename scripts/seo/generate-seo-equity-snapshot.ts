import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import configRaw from '../../content/seo-equity.config.json';
import { buildSeoEquitySnapshot, stableStringify } from '../../lib/seo/seo-equity-scoring';
import {
  seoEquityConfigSchema,
  seoEquityGscPageSchema,
  seoEquitySnapshotSchema,
  type ISeoEquityGscPage,
} from '../../lib/seo/seo-equity.schema';

interface IGscExport {
  meta?: {
    dateRange?: { startDate?: string; endDate?: string; days?: number };
    dateRanges?: {
      current?: { startDate?: string; endDate?: string; days?: number };
    };
  };
  topPages?: unknown[];
}

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

function toGscPage(row: unknown): ISeoEquityGscPage | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const url = String(record.page ?? record.url ?? '');
  if (!url) return null;

  return seoEquityGscPageSchema.parse({
    url,
    clicks: Number(record.clicks ?? 0),
    impressions: Number(record.impressions ?? 0),
    ctr: Number(record.ctr ?? 0),
    position: Number(record.position ?? 100),
  });
}

const gscPath = getArg('gsc');
const outPath = getArg('out') ?? 'content/seo-equity.json';
const generatedAt = getArg('generated-at') ?? new Date().toISOString();

if (!gscPath) {
  throw new Error('Missing required --gsc=path/to/saved-gsc-export.json argument');
}

const config = seoEquityConfigSchema.parse(configRaw);
const gscExport = JSON.parse(readFileSync(gscPath, 'utf8')) as IGscExport;
const pages = (gscExport.topPages ?? [])
  .map(toGscPage)
  .filter((page): page is ISeoEquityGscPage => Boolean(page));

if (pages.length === 0) {
  throw new Error(`No topPages rows found in saved GSC export: ${gscPath}`);
}

const dateRange = gscExport.meta?.dateRanges?.current ?? gscExport.meta?.dateRange;
const window = {
  startDate: dateRange?.startDate ?? '1970-01-01',
  endDate: dateRange?.endDate ?? '1970-01-01',
  days: dateRange?.days ?? 1,
};
const snapshot = buildSeoEquitySnapshot({
  config,
  pages,
  generatedAt,
  gscExport: basename(gscPath),
  window,
});

seoEquitySnapshotSchema.parse(snapshot);
writeFileSync(outPath, stableStringify(snapshot));
console.log(`Generated SEO equity snapshot: ${outPath} (${snapshot.entities.length} entities)`);
