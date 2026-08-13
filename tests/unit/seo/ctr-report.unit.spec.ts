import { describe, expect, it } from 'vitest';
import { buildCtrReport, extractPageRows, formatCtrReport } from '../../../scripts/seo/ctr-report';
import { INFORMATIONAL_CITATION_URLS } from '@lib/seo/page-intent';

describe('blog CTR report', () => {
  it('splits commercial and informational pages and names excluded URLs', () => {
    const rows = extractPageRows({
      searchTypes: {
        web: {
          pages: [
            {
              keys: ['/blog/best-free-ai-image-upscaler-2026-tested-compared'],
              clicks: 25,
              impressions: 100,
              position: 4,
            },
            {
              keys: ['/tools/ai-image-upscaler'],
              clicks: 20,
              impressions: 100,
              position: 3,
            },
            {
              keys: ['https://myimageupscaler.com/blog/fixing-pixelated-photos'],
              clicks: 99,
              impressions: 1000,
              position: 8,
            },
            {
              keys: ['/blog/a-new-guide'],
              clicks: 5,
              impressions: 100,
              position: 8,
            },
          ],
        },
      },
    });

    const report = buildCtrReport(rows, { days: 28 });
    expect(report.commercial.pages).toBe(2);
    expect(report.commercial.clicks).toBe(45);
    expect(report.informational.pages).toBe(1);
    expect(report.informational.clicks).toBe(5);
    expect(report.days).toBe(28);

    const formatted = formatCtrReport(report);
    for (const url of INFORMATIONAL_CITATION_URLS) expect(formatted).toContain(url);
  });

  it('refuses an empty GSC response instead of reporting healthy zeroes', () => {
    expect(() => buildCtrReport([])).toThrow(/No GSC page rows/);
  });
});
