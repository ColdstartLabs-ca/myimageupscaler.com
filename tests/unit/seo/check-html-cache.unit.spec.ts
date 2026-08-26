import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import packageJson from '../../../package.json';
import { evaluateHtmlCacheObservation, HTML_CACHE_ROUTES } from '@/scripts/seo/check-html-cache';

const postDeployVerifyScript = readFileSync(
  path.resolve(process.cwd(), 'scripts/deploy/steps/06-verify.sh'),
  'utf8'
);

describe('production HTML cache gate', () => {
  it('should fail when an HTML response carries Set-Cookie', () => {
    expect(
      evaluateHtmlCacheObservation({
        route: '/',
        cacheStatus: 'HIT',
        setCookie: 'miu_referral_source=direct',
        ttfbMs: 80,
      })
    ).toContain('/ returned Set-Cookie.');
  });

  it('should fail when the cache probe returns a non-success response', () => {
    expect(
      evaluateHtmlCacheObservation({
        route: '/blog/example',
        status: 404,
        cacheStatus: 'HIT',
        setCookie: null,
        ttfbMs: 80,
      })
    ).toContain('/blog/example returned HTTP 404.');
  });

  it('should accept a Worker cache HIT when Cloudflare does not emit cf-cache-status', () => {
    expect(
      evaluateHtmlCacheObservation({
        route: '/blog/example',
        cacheStatus: null,
        openNextCacheStatus: 'HIT',
        cacheControl: 's-maxage=86400, stale-while-revalidate=2592000',
        setCookie: null,
        ttfbMs: 80,
      })
    ).toEqual([]);
    expect(
      evaluateHtmlCacheObservation({
        route: '/blog/example',
        cacheStatus: 'HIT',
        setCookie: null,
        ttfbMs: 80,
      })
    ).toEqual([]);
  });

  it('should fail when neither Cloudflare nor Worker cache proof is present', () => {
    expect(
      evaluateHtmlCacheObservation({
        route: '/blog/example',
        cacheStatus: null,
        setCookie: null,
        ttfbMs: 80,
      })
    ).toContain(
      '/blog/example has no cf-cache-status or Worker cache HIT (x-nextjs-cache/x-opennext-cache).'
    );
  });

  it('should require shared cache-control for a Worker cache HIT', () => {
    expect(
      evaluateHtmlCacheObservation({
        route: '/blog/example',
        cacheStatus: null,
        nextCacheStatus: 'HIT',
        cacheControl: 'private, no-cache',
        setCookie: null,
        ttfbMs: 80,
      })
    ).toContain('/blog/example Worker cache HIT lacks shared s-maxage cache-control.');
  });

  it('should fail when a warm response is still a cache miss', () => {
    expect(
      evaluateHtmlCacheObservation({
        route: '/formats/upscale-gif-images',
        cacheStatus: 'MISS',
        setCookie: null,
        ttfbMs: 80,
      })
    ).toContain('/formats/upscale-gif-images warm cf-cache-status was MISS, not HIT.');
  });

  it('should exclude dashboard from the HTML cache contract', () => {
    expect(HTML_CACHE_ROUTES).not.toContain('/dashboard');
    expect(
      evaluateHtmlCacheObservation({
        route: '/fr/dashboard/settings',
        cacheStatus: null,
        setCookie: 'sb-access-token=session',
        ttfbMs: 800,
      })
    ).toEqual(['Authenticated dashboard routes are outside the HTML cache contract.']);
  });

  it('should verify static cache config before deploy and live cache behavior after deploy', () => {
    expect(packageJson.scripts['seo:cache:gate']).toBe('tsx scripts/seo/check-html-cache.ts');
    expect(packageJson.scripts['seo:cache:config']).toContain('opennext-cache-config.unit.spec.ts');
    expect(packageJson.scripts.verify).toContain('yarn seo:cache:config');
    expect(packageJson.scripts.verify).not.toContain('yarn seo:cache:gate');
    expect(postDeployVerifyScript).toContain('yarn seo:cache:gate -- --base-url="$url"');
  });
});
