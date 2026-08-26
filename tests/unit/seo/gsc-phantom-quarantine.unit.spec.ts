import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  quarantinePhantomQueries,
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
});
