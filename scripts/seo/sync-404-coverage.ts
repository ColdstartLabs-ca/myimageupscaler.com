#!/usr/bin/env tsx

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parseGscCsv } from '../../lib/seo/gsc-verification';
import { SUPPORTED_LOCALES } from '../../i18n/config';
import { LEGACY_REDIRECTS } from '../../lib/seo/legacy-redirects';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_INPUT = resolve('docs/PRDs/gsc-recovery-2026-08/data/gsc-404.csv');
const DEFAULT_OUTPUT = resolve('seo-reports/404-resolution-2026-08-25.json');
const MAX_HOPS = 10;
const MAX_ATTEMPTS = 3;
const CONCURRENCY = 8;

export interface I404Resolution {
  url: string;
  status: number;
  finalStatus: number;
  hops: number;
  finalUrl: string;
  error?: string;
}

export interface I404ResolutionArtifact {
  generatedAt: string;
  source: string;
  resolutions: I404Resolution[];
  destinationResolutions: I404Resolution[];
}

interface IRedirectDestination {
  destination: string;
}

const LOCALE_TOKEN = ':locale(en|fr|de|es|it|ja|pt)';

export function expandRedirectDestinations(redirects: readonly IRedirectDestination[]): string[] {
  return [
    ...new Set(
      redirects.flatMap(({ destination }) =>
        destination.includes(LOCALE_TOKEN)
          ? SUPPORTED_LOCALES.map(locale => destination.replace(LOCALE_TOKEN, locale))
          : [destination]
      )
    ),
  ];
}

export function deadRedirectDestinations(
  redirects: readonly IRedirectDestination[],
  resolutions: readonly I404Resolution[]
): string[] {
  const statusByPath = new Map(
    resolutions.map(row => [new URL(row.url).pathname, row.finalStatus] as const)
  );
  return expandRedirectDestinations(redirects).filter(path => statusByPath.get(path) !== 200);
}

export function liveZeroHopPaths(resolutions: readonly I404Resolution[]): Set<string> {
  return new Set(
    resolutions
      .filter(row => row.finalStatus === 200 && row.hops === 0)
      .map(row => new URL(row.url).pathname)
  );
}

export async function resolveUrl(input: string): Promise<I404Resolution> {
  let current = input;
  let firstStatus = 0;

  try {
    for (let hops = 0; hops <= MAX_HOPS; hops += 1) {
      let response: Response | undefined;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        response = await fetch(current, {
          redirect: 'manual',
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; MIU404Coverage/1.0)' },
          signal: AbortSignal.timeout(15_000),
        });
        if (response.status < 500) break;
      }
      if (!response) throw new Error(`no response received for ${current}`);
      if (hops === 0) firstStatus = response.status;

      if (!REDIRECT_STATUSES.has(response.status)) {
        return {
          url: input,
          status: firstStatus,
          finalStatus: response.status,
          hops,
          finalUrl: current,
        };
      }

      const location = response.headers.get('location');
      if (!location) {
        return {
          url: input,
          status: firstStatus,
          finalStatus: response.status,
          hops,
          finalUrl: current,
          error: `redirect ${response.status} is missing Location`,
        };
      }
      current = new URL(location, current).toString();
    }

    return {
      url: input,
      status: firstStatus,
      finalStatus: 0,
      hops: MAX_HOPS + 1,
      finalUrl: current,
      error: `exceeded ${MAX_HOPS} redirect hops`,
    };
  } catch (error) {
    return {
      url: input,
      status: firstStatus,
      finalStatus: 0,
      hops: 0,
      finalUrl: current,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function resolveUrls(urls: string[]): Promise<I404Resolution[]> {
  const results = new Array<I404Resolution>(urls.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < urls.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await resolveUrl(urls[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, () => worker()));
  return results;
}

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const inputPath = resolve(readArg('input') ?? DEFAULT_INPUT);
  const outputPath = resolve(readArg('output') ?? DEFAULT_OUTPUT);
  if (!existsSync(inputPath)) throw new Error(`404 coverage input does not exist: ${inputPath}`);

  const urls = parseGscCsv(readFileSync(inputPath, 'utf8'));
  if (urls.length === 0) throw new Error(`404 coverage input contains no URLs: ${inputPath}`);

  const origin = new URL(urls[0]).origin;
  const destinationUrls = expandRedirectDestinations(LEGACY_REDIRECTS).map(path =>
    new URL(path, origin).toString()
  );
  const artifact: I404ResolutionArtifact = {
    generatedAt: new Date().toISOString(),
    source: basename(inputPath),
    resolutions: await resolveUrls(urls),
    destinationResolutions: await resolveUrls(destinationUrls),
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);

  const unresolved = artifact.resolutions.filter(row => row.finalStatus !== 200);
  const deadDestinations = deadRedirectDestinations(
    LEGACY_REDIRECTS,
    artifact.destinationResolutions
  );
  process.stdout.write(
    `Resolved ${artifact.resolutions.length} GSC 404 URLs; ${unresolved.length} still do not end at 200. ` +
      `Checked ${artifact.destinationResolutions.length} redirect destinations; ${deadDestinations.length} do not end at 200.\n${outputPath}\n`
  );
  if (deadDestinations.length > 0) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('sync-404-coverage.ts')) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
