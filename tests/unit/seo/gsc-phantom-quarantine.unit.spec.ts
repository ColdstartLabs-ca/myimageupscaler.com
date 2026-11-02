import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  quarantinePhantomQueries,
  buildPreviousQuarantine,
  buildLowHangingFruit,
  summarizeInspections,
} = require('../../../.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs');

const phantom = {
  query: 'how to fix pixelated photos',
  impressions: 168153,
  clicks: 3,
  ctr: 3 / 168153,
  position: 10,
};
const healthy = {
  query: 'image upscaler',
  impressions: 168153,
  clicks: 3000,
  ctr: 3000 / 168153,
  position: 6,
};

describe('GSC phantom query quarantine', () => {
  it('should quarantine a 168k-impression 3-click query', () => {
    const result = quarantinePhantomQueries([phantom], phantom, {
      [phantom.query]: { topCountry: 'usa', topDevice: 'mobile' },
    });
    expect(result.quarantinedQueries[0]).toMatchObject({
      query: phantom.query,
      reason: expect.stringContaining('CTR < 0.05%'),
      topCountry: 'usa',
      topDevice: 'mobile',
    });
  });

  it('should not quarantine a high-impression query with normal CTR', () => {
    expect(quarantinePhantomQueries([healthy], healthy).quarantinedQueries).toEqual([]);
  });

  it('should still list quarantined queries in the queries array', () => {
    expect(quarantinePhantomQueries([phantom], phantom).queries).toContainEqual(
      expect.objectContaining({ query: phantom.query, isQuarantined: true })
    );
  });

  it('should report CTR excluding quarantine above raw CTR', () => {
    const summary = {
      clicks: phantom.clicks + healthy.clicks,
      impressions: phantom.impressions + healthy.impressions,
      ctr: (phantom.clicks + healthy.clicks) / (phantom.impressions + healthy.impressions),
      position: 8,
    };
    const result = quarantinePhantomQueries([phantom, healthy], summary);
    expect(result.ctrExQuarantine).toBeGreaterThan(summary.ctr);
  });

  it('should expose a phantom spike that sits only in the previous window', () => {
    const summary = {
      clicks: phantom.clicks + healthy.clicks,
      impressions: phantom.impressions + healthy.impressions,
      ctr: (phantom.clicks + healthy.clicks) / (phantom.impressions + healthy.impressions),
      position: 8,
    };
    const result = buildPreviousQuarantine([phantom, healthy], summary);
    expect(result.quarantinedQueries.map((row: { query: string }) => row.query)).toEqual([
      phantom.query,
    ]);
    expect(result.impressionsExQuarantine).toBe(healthy.impressions);
    expect(result.positionExQuarantine).toBeCloseTo(6);
  });
});

describe('GSC suspect phantom quick wins', () => {
  const row = (query: string, impressions: number, clicks: number, position: number) => ({
    query,
    impressions,
    clicks,
    position,
    ctr: clicks / impressions,
  });

  it('should flag a page-one query with no clicks and rank it last, without removing it', () => {
    const wins = buildLowHangingFruit([
      row('jpg to pdf', 1036, 0, 5.6),
      row('image enlarger free', 378, 1, 9.8),
      row('clear photo online', 100, 0, 8),
      row('png upscaling algorithm', 2818, 0, 12),
    ]);

    expect(wins.at(-1)).toMatchObject({ query: 'jpg to pdf', suspectPhantom: true });
    expect(
      wins.filter((win: { suspectPhantom: boolean }) => win.suspectPhantom)
    ).toHaveLength(1);
  });
});

describe('GSC inspection summary', () => {
  it('should not report an empty Google sitemap record as missing from our sitemaps', () => {
    const summary = summarizeInspections([{ url: 'https://example.com/a', sitemap: [] }]);

    expect(summary).not.toHaveProperty('pagesMissingFromKnownSitemaps');
    expect(summary.pagesGoogleLinksToNoSitemap).toEqual(['https://example.com/a']);
  });
});
