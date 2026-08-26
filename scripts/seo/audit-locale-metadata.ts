#!/usr/bin/env tsx

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PSEO_CATEGORIES } from '@/lib/seo/url-utils';

const DEFAULT_LAYOUT_TITLE = 'MyImageUpscaler - Image Upscaling & Enhancement';
const CONCURRENCY = 12;

export interface ILocaleMetadataAuditRow {
  url: string;
  title: string | null;
  description: string | null;
  robots: string | null;
  canonical: string | null;
  h1: string | null;
  defaultTitle: boolean;
  missingRobots: boolean;
  titleH1Mismatch: boolean;
}

function attribute(html: string, tagPattern: RegExp, name: string): string | null {
  const tag = html.match(tagPattern)?.[0];
  if (!tag) return null;
  return tag.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'))?.[1] ?? null;
}

function text(html: string, pattern: RegExp): string | null {
  const value = html
    .match(pattern)?.[1]
    ?.replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return value || null;
}

function significantTokens(value: string | null): Set<string> {
  return new Set(
    (value || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length >= 4 && token !== 'myimageupscaler')
  );
}

export function auditLocaleMetadataHtml(
  url: string,
  html: string,
  defaultTitle = DEFAULT_LAYOUT_TITLE
): ILocaleMetadataAuditRow {
  const title = text(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = attribute(html, /<meta\b[^>]*name=["']description["'][^>]*>/i, 'content');
  const robots = attribute(html, /<meta\b[^>]*name=["']robots["'][^>]*>/i, 'content');
  const canonical = attribute(html, /<link\b[^>]*rel=["']canonical["'][^>]*>/i, 'href');
  const h1 = text(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titleTokens = significantTokens(title);
  const h1Tokens = significantTokens(h1);
  const sharedTokens = [...h1Tokens].filter(token => titleTokens.has(token));
  return {
    url,
    title,
    description,
    robots,
    canonical,
    h1,
    defaultTitle: title === defaultTitle,
    missingRobots: robots === null,
    titleH1Mismatch: Boolean(title && h1 && sharedTokens.length === 0),
  };
}

function locations(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replace(/&amp;/g, '&'));
}

function isLocalePseoUrl(value: string): boolean {
  const segments = new URL(value).pathname.split('/').filter(Boolean);
  return /^[a-z]{2}$/.test(segments[0] || '') && PSEO_CATEGORIES.includes(segments[1] as never);
}

async function mapConcurrent<T, R>(items: T[], mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()));
  return results;
}

export async function runLocaleMetadataAudit(baseUrl = 'https://myimageupscaler.com') {
  const sitemapIndex = await (await fetch(new URL('/sitemap.xml', baseUrl))).text();
  const sitemapUrls = locations(sitemapIndex);
  const sitemapDocuments = await mapConcurrent(sitemapUrls, async url => (await fetch(url)).text());
  const urls = [...new Set(sitemapDocuments.flatMap(locations).filter(isLocalePseoUrl))];
  const rows = await mapConcurrent(urls, async url => {
    const html = await (await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
    return auditLocaleMetadataHtml(url, html);
  });
  const byCategoryLocale: Record<
    string,
    { total: number; defaultTitle: number; missingRobots: number; titleH1Mismatch: number }
  > = {};
  for (const row of rows) {
    const [, locale, category] = new URL(row.url).pathname.split('/');
    const key = `${category}:${locale}`;
    const totals = (byCategoryLocale[key] ??= {
      total: 0,
      defaultTitle: 0,
      missingRobots: 0,
      titleH1Mismatch: 0,
    });
    totals.total += 1;
    if (row.defaultTitle) totals.defaultTitle += 1;
    if (row.missingRobots) totals.missingRobots += 1;
    if (row.titleH1Mismatch) totals.titleH1Mismatch += 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    denominators: {
      sitemapScoped: { indexed: 1130, submitted: 1913, rate: 0.5907 },
      gscScoped: { indexed: 1133, known: 4227, rate: 0.268 },
    },
    totals: {
      urls: rows.length,
      defaultTitle: rows.filter(row => row.defaultTitle).length,
      missingRobots: rows.filter(row => row.missingRobots).length,
      titleH1Mismatch: rows.filter(row => row.titleH1Mismatch).length,
    },
    byCategoryLocale,
    rows,
  };
}

async function main(): Promise<void> {
  const output = resolve(
    process.argv.find(argument => argument.startsWith('--output='))?.split('=')[1] ||
      'seo-reports/locale-metadata-audit-2026-08-25.json'
  );
  const artifact = await runLocaleMetadataAudit();
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Audited ${artifact.totals.urls} locale pSEO URLs. ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
