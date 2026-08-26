#!/usr/bin/env tsx

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SUPPORTED_LOCALES, type Locale } from '../../i18n/config';
import { PSEO_CATEGORIES, type PSEOCategory } from '../../lib/seo/url-utils';
import { extractSitemapLocs } from '../../lib/seo/gsc-verification';

export const DEFAULT_LAYOUT_TITLE = 'MyImageUpscaler - Image Upscaling & Enhancement';
const DEFAULT_BASE_URL = 'https://myimageupscaler.com';
const DEFAULT_SAMPLE_SIZE = 3;
const CONCURRENCY = 8;

export type LocaleCoverageClassification = 'translated' | 'english-mirror' | 'soft404' | 'missing';

export interface IRenderedPageSignal {
  url: string;
  status: number;
  title?: string;
  h1?: string;
}

export interface ILocaleCoveragePair {
  category: PSEOCategory;
  locale: Locale;
  sampled: number;
  translated: number;
  englishMirror: number;
  soft404: number;
  missing: number;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractRenderedSignals(
  url: string,
  status: number,
  html: string
): IRenderedPageSignal {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return {
    url,
    status,
    title: title ? decodeHtml(title) : undefined,
    h1: h1 ? decodeHtml(h1) : undefined,
  };
}

export function classifyLocalePage(
  english: IRenderedPageSignal,
  localized: IRenderedPageSignal
): LocaleCoverageClassification {
  if (localized.status !== 200) return 'missing';
  if (localized.title === DEFAULT_LAYOUT_TITLE) return 'soft404';
  if (english.url === localized.url) {
    throw new Error(`Locale coverage compared a page against itself: ${english.url}`);
  }
  if (localized.title === english.title && localized.h1 === english.h1) return 'english-mirror';
  return 'translated';
}

async function fetchSignal(url: string): Promise<IRenderedPageSignal> {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MIULocaleCoverage/1.0)' },
      signal: AbortSignal.timeout(20_000),
    });
    return extractRenderedSignals(url, response.status, await response.text());
  } catch {
    return { url, status: 0 };
  }
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()));
  return output;
}

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

async function categoryPaths(
  baseUrl: string,
  category: PSEOCategory,
  sampleSize: number
): Promise<string[]> {
  const response = await fetch(`${baseUrl}/sitemap-${category}.xml`, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; MIULocaleCoverage/1.0)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return [];
  return extractSitemapLocs(await response.text())
    .map(url => new URL(url).pathname)
    .filter(path => path !== `/${category}` && path.startsWith(`/${category}/`))
    .slice(0, sampleSize);
}

async function main(): Promise<void> {
  const baseUrl = (getArg('base-url') ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const sampleSize = Number(getArg('sample-size') ?? DEFAULT_SAMPLE_SIZE);
  const outputPath = resolve(
    getArg('output') ?? `seo-reports/locale-coverage-${new Date().toISOString().slice(0, 10)}.json`
  );

  const samples = new Map<PSEOCategory, string[]>();
  for (const category of PSEO_CATEGORIES) {
    samples.set(category, await categoryPaths(baseUrl, category, sampleSize));
  }

  const pairInputs = PSEO_CATEGORIES.flatMap(category =>
    SUPPORTED_LOCALES.map(locale => ({ category, locale, paths: samples.get(category) ?? [] }))
  );
  const pairs = await mapConcurrent(pairInputs, async input => {
    const counts: ILocaleCoveragePair = {
      category: input.category,
      locale: input.locale,
      sampled: input.paths.length,
      translated: 0,
      englishMirror: 0,
      soft404: 0,
      missing: 0,
    };
    for (const path of input.paths) {
      if (input.locale === 'en') {
        const signal = await fetchSignal(`${baseUrl}${path}`);
        counts[signal.status === 200 ? 'translated' : 'missing'] += 1;
        continue;
      }
      const [english, localized] = await Promise.all([
        fetchSignal(`${baseUrl}${path}`),
        fetchSignal(`${baseUrl}/${input.locale}${path}`),
      ]);
      const classification = classifyLocalePage(english, localized);
      if (classification === 'english-mirror') counts.englishMirror += 1;
      else counts[classification] += 1;
    }
    return counts;
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), pairs }, null, 2)}\n`
  );
  process.stdout.write(`Measured ${pairs.length} category-locale pairs.\n${outputPath}\n`);
}

if (process.argv[1]?.endsWith('measure-locale-coverage.ts')) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
