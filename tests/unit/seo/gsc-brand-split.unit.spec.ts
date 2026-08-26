import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildBrandSplit } = require('../../../.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs');

const totals = (clicks: number, impressions: number) => ({
  clicks,
  impressions,
  ctr: impressions ? clicks / impressions : 0,
  position: 1,
});

describe('GSC brand split', () => {
  it('should attribute myimageupscaler and my image upscaler to the branded segment', () => {
    const rows = [
      { query: 'myimageupscaler', clicks: 20, impressions: 30, ctr: 2 / 3, position: 1 },
      { query: 'my image upscaler', clicks: 10, impressions: 20, ctr: 0.5, position: 1 },
      { query: 'upscale photos', clicks: 5, impressions: 100, ctr: 0.05, position: 8 },
    ];
    const split = buildBrandSplit(rows, [], 'myimageupscaler.com', totals(35, 150), totals(0, 0));
    expect(split.current.branded.clicks).toBe(30);
    expect(split.current.nonBranded.clicks).toBe(5);
  });

  it('should report a growing non-brand segment when the branded segment shrinks', () => {
    const current = [
      { query: 'myimageupscaler', clicks: 49, impressions: 70, ctr: 0.7, position: 1 },
      { query: 'upscale photos', clicks: 80, impressions: 800, ctr: 0.1, position: 5 },
    ];
    const previous = [
      { query: 'myimageupscaler', clicks: 1500, impressions: 2100, ctr: 0.71, position: 1 },
      { query: 'upscale photos', clicks: 60, impressions: 700, ctr: 0.086, position: 6 },
    ];
    const split = buildBrandSplit(
      current,
      previous,
      'myimageupscaler.com',
      totals(129, 870),
      totals(1560, 2800)
    );
    expect(split.delta.branded.clicks).toBe(-1451);
    expect(split.delta.nonBranded.clicks).toBe(20);
  });

  it('should keep classified and unclassified clicks summing to the blended total', () => {
    const rows = [
      { query: 'myimageupscaler.com', clicks: 7, impressions: 10, ctr: 0.7, position: 1 },
      { query: 'photo enhancer', clicks: 3, impressions: 40, ctr: 0.075, position: 6 },
    ];
    const split = buildBrandSplit(rows, [], 'myimageupscaler.com', totals(10, 50), totals(0, 0));
    expect(
      split.current.branded.clicks +
        split.current.nonBranded.clicks +
        split.current.unclassified.clicks
    ).toBe(10);
  });

  it('should not silently assign privacy-suppressed rows to non-brand', () => {
    const rows = [
      { query: 'myimageupscaler', clicks: 2, impressions: 4, ctr: 0.5, position: 1 },
      { query: 'photo enhancer', clicks: 3, impressions: 40, ctr: 0.075, position: 6 },
    ];
    const split = buildBrandSplit(rows, [], 'myimageupscaler.com', totals(10, 100), totals(0, 0));
    expect(split.current.nonBranded.clicks).toBe(3);
    expect(split.current.unclassified).toMatchObject({
      clicks: 5,
      impressions: 56,
      position: null,
    });
  });
});
