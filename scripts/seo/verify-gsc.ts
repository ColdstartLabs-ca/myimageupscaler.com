#!/usr/bin/env tsx

/**
 * Verify that the requested GSC URL set has no pages that are both submitted
 * in a sitemap and marked noindex. The default CNI input is the reviewed CSV
 * from the index-bloat PRD; pass --input=... for a refreshed export.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_CNI_INPUT = 'docs/PRDs/gsc-recovery-2026-08/data/gsc-crawled-not-indexed.csv';

export interface IVerifierArgs {
  set: 'cni';
  baseUrl: string;
  inputPath: string;
}

export interface IPageRobots {
  url: string;
  robots: string;
}

function getArg(args: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

export function parseVerifierArgs(args: readonly string[] = process.argv): IVerifierArgs {
  const set = getArg(args, 'set');
  if (set !== 'cni') {
    throw new Error(`Unsupported --set=${set || '(missing)'}; only --set=cni is supported.`);
  }

  const baseUrlArg = getArg(args, 'base-url');
  if (!baseUrlArg)
    throw new Error('--base-url is required, for example --base-url=https://example.com.');

  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlArg);
  } catch {
    throw new Error(`Invalid --base-url=${baseUrlArg}; expected an absolute http(s) URL.`);
  }
  if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
    throw new Error(`Invalid --base-url=${baseUrlArg}; expected an absolute http(s) URL.`);
  }

  return {
    set: 'cni',
    baseUrl: baseUrl.origin,
    inputPath: resolve(getArg(args, 'input') || DEFAULT_CNI_INPUT),
  };
}

function normalizeUrl(value: string, baseUrl: string): string {
  const parsed = new URL(value, baseUrl);
  const path = parsed.pathname.replace(/\/+$/, '') || '/';
  return `${parsed.origin}${path}`;
}

function hasNoindex(robots: string): boolean {
  return /(^|[,\s])noindex([,\s]|$)/i.test(robots);
}

export function findNoindexedSitemapOverlap(
  sitemapUrls: readonly string[],
  pageRobots: readonly IPageRobots[],
  baseUrl: string
): string[] {
  const sitemapSet = new Set(sitemapUrls.map(url => normalizeUrl(url, baseUrl)));

  return pageRobots
    .filter(page => hasNoindex(page.robots) && sitemapSet.has(normalizeUrl(page.url, baseUrl)))
    .map(page => normalizeUrl(page.url, baseUrl))
    .sort();
}

export function findSitemapOverlap(
  sitemapUrls: readonly string[],
  requestedUrls: readonly string[],
  baseUrl: string
): string[] {
  const sitemapSet = new Set(sitemapUrls.map(url => normalizeUrl(url, baseUrl)));
  return [...new Set(requestedUrls.map(url => normalizeUrl(url, baseUrl)))]
    .filter(url => sitemapSet.has(url))
    .sort();
}

export function parseCniCsv(csv: string, baseUrl: string): string[] {
  const urls = csv
    .split(/\r?\n/)
    .map(line => line.split(',')[0]?.trim().replace(/^"|"$/g, ''))
    .filter((value): value is string => !!value && /^https?:\/\//i.test(value));
  const uniqueUrls = [...new Set(urls.map(url => normalizeUrl(url, baseUrl)))];
  if (uniqueUrls.length === 0)
    throw new Error('The requested CNI input contains no absolute URLs.');
  return uniqueUrls;
}

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(match => match[1].trim());
}

async function fetchText(url: string, description: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `Unable to fetch ${description} at ${url}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) {
    throw new Error(`Unable to fetch ${description} at ${url}: HTTP ${response.status}.`);
  }
  return response.text();
}

async function fetchSitemapUrls(baseUrl: string): Promise<string[]> {
  const pending = [`${baseUrl}/sitemap.xml`];
  const visited = new Set<string>();
  const urls = new Set<string>();

  while (pending.length > 0) {
    const sitemapUrl = pending.shift()!;
    const normalizedSitemapUrl = normalizeUrl(sitemapUrl, baseUrl);
    if (visited.has(normalizedSitemapUrl)) continue;
    visited.add(normalizedSitemapUrl);

    const xml = await fetchText(normalizedSitemapUrl, 'sitemap');
    for (const loc of extractLocs(xml)) {
      if (/\.xml(?:$|[?#])/i.test(loc)) pending.push(loc);
      else urls.add(normalizeUrl(loc, baseUrl));
    }
  }

  if (urls.size === 0)
    throw new Error(`No page URLs were found while crawling ${baseUrl}/sitemap.xml.`);
  return [...urls];
}

function extractRobotsMeta(html: string): string {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const name = tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
    if (name?.toLowerCase() !== 'robots') continue;
    return tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] || '';
  }
  return '';
}

async function fetchPageRobots(urls: readonly string[]): Promise<IPageRobots[]> {
  const pages: IPageRobots[] = [];
  for (const url of urls) {
    const html = await fetchText(url, 'CNI page');
    pages.push({ url, robots: extractRobotsMeta(html) });
  }
  return pages;
}

async function main(): Promise<void> {
  const args = parseVerifierArgs();
  if (!existsSync(args.inputPath)) {
    throw new Error(
      `Missing requested ${args.set} input at ${args.inputPath}. Export the GSC set or pass --input=/path/to/gsc-crawled-not-indexed.csv.`
    );
  }

  const cniUrls = parseCniCsv(readFileSync(args.inputPath, 'utf8'), args.baseUrl);
  const outsideBaseUrl = cniUrls.filter(url => new URL(url).origin !== args.baseUrl);
  if (outsideBaseUrl.length > 0) {
    throw new Error(
      `Requested ${args.set} input contains URLs outside --base-url=${args.baseUrl}.`
    );
  }

  const sitemapUrls = await fetchSitemapUrls(args.baseUrl);
  const pageRobots = await fetchPageRobots(cniUrls);
  const requestedSetOverlap = findSitemapOverlap(sitemapUrls, cniUrls, args.baseUrl);
  const overlaps = findNoindexedSitemapOverlap(sitemapUrls, pageRobots, args.baseUrl);

  console.log(
    `Checked set=${args.set}: cniUrls=${cniUrls.length}, sitemapUrls=${sitemapUrls.length}, requested+sitemap-overlap=${requestedSetOverlap.length}, noindexed+sitemap-overlap=${overlaps.length}`
  );
  if (requestedSetOverlap.length > 0) {
    console.error('Requested CNI URLs still submitted in a sitemap:');
    for (const url of requestedSetOverlap) console.error(`- ${url}`);
    process.exitCode = 1;
    return;
  }
  console.log('GSC sitemap overlap gate passed: 0 URLs are both sitemap-submitted and noindexed.');
}

if (process.argv[1]?.endsWith('verify-gsc.ts')) {
  main().catch(error => {
    console.error(
      `seo:verify:gsc failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
