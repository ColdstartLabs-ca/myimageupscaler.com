import { describe, expect, it } from 'vitest';
import packageJson from '../../../package.json';
import { evaluateHtmlCacheObservation, HTML_CACHE_ROUTES } from '@/scripts/seo/check-html-cache';

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

  it('should fail when cf-cache-status is absent', () => {
    expect(
      evaluateHtmlCacheObservation({
        route: '/blog/example',
        cacheStatus: null,
        setCookie: null,
        ttfbMs: 80,
      })
    ).toContain('/blog/example has no cf-cache-status.');
    expect(
      evaluateHtmlCacheObservation({
        route: '/blog/example',
        cacheStatus: 'HIT',
        setCookie: null,
        ttfbMs: 80,
      })
    ).toEqual([]);
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

  it('should wire the cache gate into verify', () => {
    expect(packageJson.scripts['seo:cache:gate']).toBe('tsx scripts/seo/check-html-cache.ts');
    expect(packageJson.scripts['seo:cache:config']).toContain('opennext-cache-config.unit.spec.ts');
    expect(packageJson.scripts.verify).toContain('yarn seo:cache:config');
    expect(packageJson.scripts.verify).toContain('yarn seo:cache:gate');
  });
});
