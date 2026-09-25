import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildWeeklyBreakdown,
} = require('../../../.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs');

const day = (date: string, clicks: number, impressions = clicks * 10) => ({
  date,
  clicks,
  impressions,
});

describe('GSC weekly breakdown', () => {
  it('should bucket days into 7-day weeks ending on the range end with a brand split', () => {
    const dailyTrend = [
      day('2026-09-08', 50),
      day('2026-09-09', 50),
      day('2026-09-15', 30),
      day('2026-09-21', 20),
    ];
    const dateQueryRows = [
      { date: '2026-09-08', query: 'myimageupscaler', clicks: 40, impressions: 50 },
      { date: '2026-09-09', query: 'upscale photos', clicks: 10, impressions: 100 },
      { date: '2026-09-15', query: 'my image upscaler', clicks: 5, impressions: 10 },
      { date: '2026-09-21', query: 'upscale photos', clicks: 15, impressions: 100 },
    ];

    const { weeks } = buildWeeklyBreakdown({
      dailyTrend,
      dateQueryRows,
      datePageRows: [],
      endDate: '2026-09-21',
      site: 'myimageupscaler.com',
    });

    expect(weeks.map((w: { startDate: string }) => w.startDate)).toEqual([
      '2026-09-08',
      '2026-09-15',
    ]);
    const [prior, latest] = weeks;
    expect(prior.clicks).toBe(100);
    expect(prior.branded.clicks).toBe(40);
    expect(prior.nonBranded.clicks).toBe(10);
    expect(prior.unclassified.clicks).toBe(50);
    expect(latest.clicks).toBe(50);
    expect(latest.branded.clicks).toBe(5);
    expect(latest.nonBranded.clicks).toBe(15);
    expect(latest.unclassified.clicks).toBe(30);
  });

  it('should rank page click movers between the last two weeks', () => {
    const datePageRows = [
      { date: '2026-09-10', page: '/a', clicks: 100, impressions: 1000 },
      { date: '2026-09-10', page: '/b', clicks: 10, impressions: 100 },
      { date: '2026-09-16', page: '/a', clicks: 40, impressions: 900 },
      { date: '2026-09-16', page: '/b', clicks: 30, impressions: 300 },
    ];

    const { latestWeekPageMovers } = buildWeeklyBreakdown({
      dailyTrend: [],
      dateQueryRows: [],
      datePageRows,
      endDate: '2026-09-21',
      site: 'myimageupscaler.com',
    });

    expect(latestWeekPageMovers.losers[0]).toMatchObject({
      page: '/a',
      clickDelta: -60,
      previousClicks: 100,
    });
    expect(latestWeekPageMovers.winners[0]).toMatchObject({ page: '/b', clickDelta: 20 });
  });

  it('should rank query click movers between the last two weeks', () => {
    const { latestWeekQueryMovers } = buildWeeklyBreakdown({
      dailyTrend: [],
      dateQueryRows: [
        { date: '2026-09-10', query: 'myimageupscaler', clicks: 50, impressions: 60 },
        { date: '2026-09-17', query: 'myimageupscaler', clicks: 5, impressions: 40 },
      ],
      datePageRows: [],
      endDate: '2026-09-21',
      site: 'myimageupscaler.com',
    });

    expect(latestWeekQueryMovers.losers[0]).toMatchObject({
      query: 'myimageupscaler',
      clickDelta: -45,
      impressionDelta: -20,
    });
  });
});
