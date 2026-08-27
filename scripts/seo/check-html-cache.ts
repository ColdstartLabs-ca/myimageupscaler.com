#!/usr/bin/env tsx

import { pathToFileURL } from 'node:url';

export const HTML_CACHE_ROUTES = [
  '/',
  '/blog/fixing-pixelated-photos',
  '/formats/upscale-gif-images',
  '/tools/ai-image-upscaler',
] as const;

export const MAX_WARM_TTFB_MS = 400;
export const WARM_TTFB_SAMPLE_COUNT = 3;

export interface IHtmlCacheObservation {
  route: string;
  status?: number;
  cacheStatus: string | null;
  nextCacheStatus?: string | null;
  openNextCacheStatus?: string | null;
  cacheControl?: string | null;
  setCookie: string | null;
  ttfbMs: number;
}

function isHit(value: string | null | undefined): boolean {
  return value?.trim().toUpperCase() === 'HIT';
}

function isDashboardRoute(route: string): boolean {
  return /^\/(?:[a-z]{2}\/)?dashboard(?:\/|$)/.test(route);
}

function evaluateHtmlCacheCorrectness(observation: IHtmlCacheObservation): string[] {
  if (isDashboardRoute(observation.route)) {
    return ['Authenticated dashboard routes are outside the HTML cache contract.'];
  }

  const errors: string[] = [];
  if (observation.status !== undefined && (observation.status < 200 || observation.status >= 300)) {
    errors.push(`${observation.route} returned HTTP ${observation.status}.`);
  }
  if (observation.setCookie) errors.push(`${observation.route} returned Set-Cookie.`);
  if (!observation.cacheStatus) {
    const workerCacheHit =
      isHit(observation.nextCacheStatus) || isHit(observation.openNextCacheStatus);
    if (!workerCacheHit) {
      errors.push(
        `${observation.route} has no cf-cache-status or Worker cache HIT (x-nextjs-cache/x-opennext-cache).`
      );
    } else if (!/\bs-maxage\s*=\s*\d+/i.test(observation.cacheControl ?? '')) {
      errors.push(`${observation.route} Worker cache HIT lacks shared s-maxage cache-control.`);
    }
  } else if (!isHit(observation.cacheStatus)) {
    errors.push(
      `${observation.route} warm cf-cache-status was ${observation.cacheStatus}, not HIT.`
    );
  }
  return errors;
}

export function evaluateHtmlCacheObservation(observation: IHtmlCacheObservation): string[] {
  const errors = evaluateHtmlCacheCorrectness(observation);
  if (isDashboardRoute(observation.route)) return errors;
  if (observation.ttfbMs >= MAX_WARM_TTFB_MS) {
    errors.push(
      `${observation.route} warm TTFB was ${Math.round(observation.ttfbMs)}ms (budget: <${MAX_WARM_TTFB_MS}ms).`
    );
  }
  return errors;
}

export function evaluateWarmHtmlCacheSamples(observations: IHtmlCacheObservation[]): string[] {
  if (observations.length === 0) return ['HTML cache gate collected no warm samples.'];

  const errors = new Set(observations.flatMap(evaluateHtmlCacheCorrectness));
  const sortedTtfb = observations.map(observation => observation.ttfbMs).sort((a, b) => a - b);
  const medianTtfb = sortedTtfb[Math.floor(sortedTtfb.length / 2)];
  if (medianTtfb >= MAX_WARM_TTFB_MS) {
    errors.add(
      `${observations[0].route} median warm TTFB was ${Math.round(medianTtfb)}ms (budget: <${MAX_WARM_TTFB_MS}ms).`
    );
  }
  return [...errors];
}

async function request(baseUrl: string, route: string): Promise<IHtmlCacheObservation> {
  const startedAt = performance.now();
  const response = await fetch(new URL(route, baseUrl), {
    redirect: 'follow',
    headers: { 'accept-encoding': 'br' },
  });
  const ttfbMs = performance.now() - startedAt;
  await response.body?.cancel();
  return {
    route,
    status: response.status,
    cacheStatus: response.headers.get('cf-cache-status'),
    nextCacheStatus: response.headers.get('x-nextjs-cache'),
    openNextCacheStatus: response.headers.get('x-opennext-cache'),
    cacheControl: response.headers.get('cache-control'),
    setCookie: response.headers.get('set-cookie'),
    ttfbMs,
  };
}

export async function runHtmlCacheGate(baseUrl = 'https://myimageupscaler.com'): Promise<string[]> {
  const errors: string[] = [];
  for (const route of HTML_CACHE_ROUTES) {
    await request(baseUrl, route);
    const warmSamples: IHtmlCacheObservation[] = [];
    for (let sample = 0; sample < WARM_TTFB_SAMPLE_COUNT; sample += 1) {
      warmSamples.push(await request(baseUrl, route));
    }
    errors.push(...evaluateWarmHtmlCacheSamples(warmSamples));
    const medianTtfb = [...warmSamples].sort((a, b) => a.ttfbMs - b.ttfbMs)[
      Math.floor(warmSamples.length / 2)
    ];
    const warm = warmSamples.at(-1)!;
    console.log(
      `${route}: status=${warm.status ?? 'unknown'} ` +
        `cf-cache-status=${warm.cacheStatus || 'absent'} ` +
        `x-nextjs-cache=${warm.nextCacheStatus || 'absent'} ` +
        `x-opennext-cache=${warm.openNextCacheStatus || 'absent'} ` +
        `median-ttfb=${Math.round(medianTtfb.ttfbMs)}ms`
    );
  }
  return errors;
}

async function main(): Promise<void> {
  const baseUrl = process.argv.find(argument => argument.startsWith('--base-url='))?.split('=')[1];
  const errors = await runHtmlCacheGate(baseUrl);
  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
