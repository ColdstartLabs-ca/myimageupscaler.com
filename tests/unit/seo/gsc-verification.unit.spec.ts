/**
 * GSC Fix Verification — expectation logic
 *
 * These tests guard the harness that PRDs 01-03 in docs/PRDs/gsc-recovery-2026-08/ rely on.
 * The harness only has value if it can report a violation, so every expectation is tested in both
 * directions: the passing state AND the state it must catch.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  GSC_SETS,
  SET_CSV_FILES,
  evaluateExpectation,
  extractCanonical,
  extractRobotsMeta,
  extractSitemapLocs,
  isNoindex,
  isSameUrl,
  parseGscCsv,
  rebaseUrl,
  summarizeByFamily,
  urlFamily,
  type IUrlObservation,
} from '@/lib/seo/gsc-verification';

const DATA_DIR = path.join(process.cwd(), 'docs/PRDs/gsc-recovery-2026-08/data');

function observation(overrides: Partial<IUrlObservation>): IUrlObservation {
  return { url: 'https://myimageupscaler.com/tools/ai-image-upscaler', status: 200, ...overrides };
}

describe('GSC verification — CSV parsing', () => {
  it('should parse URLs from a GSC export and skip the header', () => {
    const csv = 'URL,Last crawled\nhttps://myimageupscaler.com/a,2026-08-08\nhttps://myimageupscaler.com/b,2026-08-07\n';

    expect(parseGscCsv(csv)).toEqual(['https://myimageupscaler.com/a', 'https://myimageupscaler.com/b']);
  });

  it('should parse every committed GSC export the harness advertises', () => {
    for (const set of GSC_SETS) {
      const file = path.join(DATA_DIR, SET_CSV_FILES[set]);
      expect(existsSync(file), `${SET_CSV_FILES[set]} is missing`).toBe(true);
      expect(parseGscCsv(readFileSync(file, 'utf8')).length, `${set} parsed empty`).toBeGreaterThan(0);
    }
  });
});

describe('GSC verification — 404 set', () => {
  it('should pass a URL that now returns 200', () => {
    expect(evaluateExpectation('404', observation({ status: 200 })).ok).toBe(true);
  });

  it('should pass a URL that now redirects to a live page', () => {
    const result = evaluateExpectation(
      '404',
      observation({
        status: 301,
        location: 'https://myimageupscaler.com/blog/upscale-anime',
        finalUrl: 'https://myimageupscaler.com/blog/upscale-anime',
        finalStatus: 200,
        redirectHops: 1,
      })
    );

    expect(result.ok).toBe(true);
    expect(result.reason).toContain('301');
  });

  it('should fail a redirect whose destination still returns 404', () => {
    const result = evaluateExpectation(
      '404',
      observation({
        url: 'https://myimageupscaler.com/use-cases-expanded/social-media-content-creation?ref=x',
        status: 301,
        finalUrl: 'https://myimageupscaler.com/use-cases-expanded/social-media-content-creation',
        finalStatus: 404,
        redirectHops: 1,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('404');
  });

  it('should fail a redirect chain even when it ends at a live page', () => {
    const result = evaluateExpectation(
      '404',
      observation({ status: 301, finalUrl: 'https://myimageupscaler.com/blog', finalStatus: 200, redirectHops: 3 })
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('chain');
  });

  it('should fail a redirect whose destination was never checked', () => {
    expect(
      evaluateExpectation('404', observation({ status: 301, location: '/somewhere' })).ok
    ).toBe(false);
  });

  it('should fail a URL that still returns 404', () => {
    expect(evaluateExpectation('404', observation({ status: 404 })).ok).toBe(false);
  });

  it('should fail a URL that returns a server error', () => {
    expect(evaluateExpectation('404', observation({ status: 503 })).ok).toBe(false);
  });
});

describe('GSC verification — 5xx set', () => {
  it('should pass a URL that now returns 200', () => {
    expect(evaluateExpectation('5xx', observation({ status: 200 })).ok).toBe(true);
  });

  it('should fail a URL that still returns 500', () => {
    expect(evaluateExpectation('5xx', observation({ status: 500 })).ok).toBe(false);
  });

  it('should fail a URL returning the Cloudflare 1102 status', () => {
    expect(evaluateExpectation('5xx', observation({ status: 503 })).ok).toBe(false);
  });
});

describe('GSC verification — noindex and crawled-not-indexed sets', () => {
  it('should fail a noindexed URL that is still submitted in a sitemap', () => {
    const result = evaluateExpectation(
      'noindex',
      observation({ robots: 'noindex, nofollow', inSitemap: true })
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('sitemap');
  });

  it('should pass a noindexed URL that was removed from the sitemaps', () => {
    expect(
      evaluateExpectation('noindex', observation({ robots: 'noindex, follow', inSitemap: false })).ok
    ).toBe(true);
  });

  it('should pass an indexable URL that is submitted in a sitemap', () => {
    expect(
      evaluateExpectation('cni', observation({ robots: 'index, follow', inSitemap: true })).ok
    ).toBe(true);
  });

  it('should refuse to evaluate when sitemap membership was not collected', () => {
    const result = evaluateExpectation('cni', observation({ robots: 'noindex' }));

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('not collected');
  });

  it('should detect noindex from the X-Robots-Tag header', () => {
    expect(isNoindex(observation({ xRobotsTag: 'noindex' }))).toBe(true);
    expect(isNoindex(observation({ robots: 'index, follow' }))).toBe(false);
  });
});

describe('GSC verification — duplicate-canonical set', () => {
  it('should fail a locale page that still canonicals to itself', () => {
    const url = 'https://myimageupscaler.com/de/scale/2k-upscaler';

    const result = evaluateExpectation('dup', observation({ url, canonical: url }));

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('self-canonical');
  });

  it('should pass a locale fallback page that canonicals to English', () => {
    const result = evaluateExpectation(
      'dup',
      observation({
        url: 'https://myimageupscaler.com/de/scale/2k-upscaler',
        canonical: 'https://myimageupscaler.com/scale/2k-upscaler',
      })
    );

    expect(result.ok).toBe(true);
  });

  it('should fail a page with no canonical tag at all', () => {
    expect(
      evaluateExpectation('dup', observation({ url: 'https://myimageupscaler.com/de/tools' })).ok
    ).toBe(false);
  });

  it('should ignore the trailing slash when comparing canonicals', () => {
    expect(isSameUrl('https://myimageupscaler.com/de/tools/', 'https://myimageupscaler.com/de/tools')).toBe(
      true
    );
  });
});

describe('GSC verification — negative control and failures', () => {
  it('should pass when --expect matches the live status', () => {
    expect(evaluateExpectation('404', observation({ status: 404 }), 404).ok).toBe(true);
  });

  it('should fail when --expect does not match the live status', () => {
    expect(evaluateExpectation('404', observation({ status: 200 }), 404).ok).toBe(false);
  });

  it('should fail a URL whose request errored rather than treating it as passing', () => {
    const result = evaluateExpectation('404', observation({ status: 0, error: 'timeout' }));

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('timeout');
  });
});

describe('GSC verification — HTML and sitemap parsing', () => {
  it('should extract the canonical href regardless of attribute order', () => {
    expect(extractCanonical('<link href="https://x.test/a" rel="canonical"/>')).toBe('https://x.test/a');
    expect(extractCanonical('<link rel="canonical" href="https://x.test/b"/>')).toBe('https://x.test/b');
  });

  it('should not mistake another link tag for the canonical', () => {
    expect(extractCanonical('<link rel="alternate" hreflang="de" href="https://x.test/de"/>')).toBeUndefined();
  });

  it('should extract the robots meta content', () => {
    expect(extractRobotsMeta('<meta name="robots" content="noindex, follow">')).toBe('noindex, follow');
  });

  it('should extract loc values from a sitemap index', () => {
    const xml = '<sitemapindex><sitemap><loc>https://x.test/sitemap-tools.xml</loc></sitemap></sitemapindex>';

    expect(extractSitemapLocs(xml)).toEqual(['https://x.test/sitemap-tools.xml']);
  });
});

describe('GSC verification — reporting', () => {
  it('should group locale variants under the same URL family', () => {
    expect(urlFamily('https://myimageupscaler.com/de/tools/resize/resize-image-for-telegram')).toBe(
      '/tools/resize'
    );
    expect(urlFamily('https://myimageupscaler.com/tools/ocr-online')).toBe('/tools/[slug]');
    expect(urlFamily('https://myimageupscaler.com/article/upscale-anime')).toBe('/article');
  });

  it('should rank families by violation count so the biggest cause reads first', () => {
    const results = [
      { url: 'https://myimageupscaler.com/article/a', ok: false },
      { url: 'https://myimageupscaler.com/article/b', ok: false },
      { url: 'https://myimageupscaler.com/personas/x', ok: false },
      { url: 'https://myimageupscaler.com/personas/y', ok: true },
    ].map(row => ({
      observation: observation({ url: row.url }),
      expectation: { ok: row.ok, reason: 'test' },
    }));

    const summaries = summarizeByFamily(results);

    expect(summaries[0].family).toBe('/article');
    expect(summaries[0].violations).toBe(2);
    expect(summaries[1].violations).toBe(1);
  });

  it('should rebase exported URLs onto a local origin for pre-deploy runs', () => {
    expect(rebaseUrl('https://myimageupscaler.com/de/tools', 'http://localhost:3000')).toBe(
      'http://localhost:3000/de/tools'
    );
  });
});
