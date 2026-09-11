import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildOrganicFunnelDimensions } from '@client/analytics/funnel-attribution';
import { splitBrandRows } from '@/scripts/seo/organic-funnel-report';

describe('organic funnel attribution', () => {
  it('normalizes landing page, device and mode without a second attribution store', () => {
    expect(
      buildOrganicFunnelDimensions({
        entryPage: '/blog/best-free-ai-image-upscaler-2026-tested-compared',
        firstTouchLandingPage: undefined,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
        mode: 'upscale',
      })
    ).toEqual({
      landing_page: '/blog/best-free-ai-image-upscaler-2026-tested-compared',
      device: 'mobile',
      mode: 'upscale',
    });
  });

  it('prefers the existing first-touch landing page when one is present', () => {
    expect(
      buildOrganicFunnelDimensions({
        entryPage: '/dashboard',
        firstTouchLandingPage: '/tools/ai-image-upscaler',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        mode: 'enhance',
      }).landing_page
    ).toBe('/tools/ai-image-upscaler');
  });

  it('splits branded and non-brand GSC rows into different cohorts', () => {
    const rows = [
      { query: 'myimageupscaler', clicks: 10 },
      { query: 'best image upscaler', clicks: 20 },
      { query: 'my image upscaler', clicks: 5 },
    ];

    const split = splitBrandRows(rows);
    expect(split.branded.map(row => row.query)).toEqual(['myimageupscaler', 'my image upscaler']);
    expect(split.nonBrand.map(row => row.query)).toEqual(['best image upscaler']);
    expect(split.branded).not.toEqual(split.nonBrand);
  });

  it('wires funnel dimensions into browser and server analytics without a second cookie', () => {
    const client = readFileSync('client/analytics/analyticsClient.ts', 'utf8');
    const route = readFileSync('app/api/analytics/event/route.ts', 'utf8');
    const middleware = readFileSync('middleware.ts', 'utf8');

    expect(client).toContain('buildOrganicFunnelDimensions');
    expect(client).toContain('landing_page');
    expect(route).toContain("req.headers.get('cf-ipcountry')");
    expect(route).toContain('country:');
    expect(middleware.match(/miu_first_touch_utm/g)?.length ?? 0).toBeGreaterThan(0);
    expect(middleware).not.toContain('miu_organic_landing');
  });

  it('registers an offline funnel report instead of doing report work on the request path', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['seo:funnel:report']).toBe('tsx scripts/seo/organic-funnel-report.ts');

    const route = readFileSync('app/api/analytics/event/route.ts', 'utf8');
    expect(route).not.toContain('organic-funnel-report');
  });
});
