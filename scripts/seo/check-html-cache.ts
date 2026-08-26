#!/usr/bin/env tsx

import { pathToFileURL } from 'node:url';

export const HTML_CACHE_ROUTES = [
  '/',
  '/blog/fixing-pixelated-photos',
  '/formats/upscale-gif-images',
  '/tools/ai-image-upscaler',
] as const;

export const MAX_WARM_TTFB_MS = 400;

export interface IHtmlCacheObservation {
  route: string;
  cacheStatus: string | null;
  setCookie: string | null;
  ttfbMs: number;
}

export function evaluateHtmlCacheObservation(observation: IHtmlCacheObservation): string[] {
  if (/^\/(?:[a-z]{2}\/)?dashboard(?:\/|$)/.test(observation.route)) {
    return ['Authenticated dashboard routes are outside the HTML cache contract.'];
  }

  const errors: string[] = [];
  if (observation.setCookie) errors.push(`${observation.route} returned Set-Cookie.`);
  if (!observation.cacheStatus) {
    errors.push(`${observation.route} has no cf-cache-status.`);
  } else if (observation.cacheStatus.toUpperCase() !== 'HIT') {
    errors.push(
      `${observation.route} warm cf-cache-status was ${observation.cacheStatus}, not HIT.`
    );
  }
  if (observation.ttfbMs >= MAX_WARM_TTFB_MS) {
    errors.push(
      `${observation.route} warm TTFB was ${Math.round(observation.ttfbMs)}ms (budget: <${MAX_WARM_TTFB_MS}ms).`
    );
  }
  return errors;
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
    cacheStatus: response.headers.get('cf-cache-status'),
    setCookie: response.headers.get('set-cookie'),
    ttfbMs,
  };
}

export async function runHtmlCacheGate(baseUrl = 'https://myimageupscaler.com'): Promise<string[]> {
  const errors: string[] = [];
  for (const route of HTML_CACHE_ROUTES) {
    await request(baseUrl, route);
    const warm = await request(baseUrl, route);
    errors.push(...evaluateHtmlCacheObservation(warm));
    console.log(
      `${route}: cf-cache-status=${warm.cacheStatus || 'absent'} ttfb=${Math.round(warm.ttfbMs)}ms`
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
