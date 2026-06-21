import { describe, expect, it } from 'vitest';
import {
  buildSeoEquitySnapshot,
  hasMaterialSeoEquityChange,
  normalizeSeoPath,
} from '@lib/seo/seo-equity-scoring';
import type { ISeoEquityConfig, ISeoEquityGscPage } from '@lib/seo/seo-equity.schema';

const config: ISeoEquityConfig = {
  version: 1,
  siteUrl: 'https://myimageupscaler.com',
  settings: {
    refreshCadence: 'weekly-or-monthly',
    minStableDaysAfterEdit: 14,
    minMaterialScoreDelta: 3,
  },
  maxSurfaceSlots: {
    homepageBlogPicks: 2,
    blogIndexFeatured: 1,
    blogStartHere: 2,
    blogFooterRelated: 2,
    pseoRelatedBlogPosts: 2,
    hubSpokeLinks: 4,
  },
  allowlist: [],
  blocklist: ['/blog/blocked'],
  pinnedBySurface: {},
  canonicalClusters: [
    {
      id: 'cluster-a',
      intent: 'Cluster A',
      members: [
        { url: '/blog/winner', winner: true },
        { url: '/blog/loser', winner: false },
      ],
    },
    {
      id: 'cluster-b',
      intent: 'Cluster B',
      members: [{ url: '/blog/low-ctr', winner: true }],
    },
  ],
  businessValueWeights: {
    '/blog/winner': 1.2,
  },
  recentlyEditedUntil: {
    '/blog/winner': '2026-06-21',
  },
  localePolicy: {
    default: 'english-only',
    overrides: {},
  },
  pseoRelatedTargets: {},
};

const pages: ISeoEquityGscPage[] = [
  { url: '/blog/winner', clicks: 5, impressions: 1000, ctr: 0.005, position: 8 },
  { url: '/blog/loser', clicks: 3, impressions: 900, ctr: 0.003, position: 7 },
  { url: '/blog/normal-ctr', clicks: 90, impressions: 1000, ctr: 0.09, position: 8 },
  { url: '/blog/low-ctr', clicks: 1, impressions: 1000, ctr: 0.001, position: 8 },
];

describe('seo equity scoring', () => {
  it('normalizes full URLs to site-relative paths', () => {
    expect(normalizeSeoPath('https://myimageupscaler.com/blog/winner')).toBe('/blog/winner');
    expect(normalizeSeoPath('/blog/winner?utm=1')).toBe('/blog/winner');
  });

  it('creates deterministic ordering and byte-identical JSON', () => {
    const first = buildSeoEquitySnapshot({ config, pages, generatedAt: '2026-06-07T00:00:00.000Z' });
    const second = buildSeoEquitySnapshot({ config, pages, generatedAt: '2026-06-07T00:00:00.000Z' });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.entities.map(entity => entity.url)).toEqual([...first.entities.map(entity => entity.url)].sort((a, b) => {
      const byScore = (first.entities.find(entity => entity.url === b)?.score ?? 0) - (first.entities.find(entity => entity.url === a)?.score ?? 0);
      return byScore || a.localeCompare(b);
    }));
  });

  it('boosts low CTR opportunity at the same impressions and position', () => {
    const snapshot = buildSeoEquitySnapshot({ config, pages, generatedAt: '2026-06-07T00:00:00.000Z' });
    const lowCtr = snapshot.entities.find(entity => entity.url === '/blog/low-ctr');
    const normalCtr = snapshot.entities.find(entity => entity.url === '/blog/normal-ctr');

    expect(lowCtr?.scoreBreakdown.ctrGap).toBeGreaterThan(normalCtr?.scoreBreakdown.ctrGap ?? 0);
    expect(lowCtr?.score).toBeGreaterThan(normalCtr?.score ?? 0);
  });

  it('suppresses canonical losers and guardrailed pages from experiment surfaces unless pinned', () => {
    const snapshot = buildSeoEquitySnapshot({ config, pages, generatedAt: '2026-06-07T00:00:00.000Z' });
    const loser = snapshot.entities.find(entity => entity.url === '/blog/loser');
    const guardedWinner = snapshot.entities.find(entity => entity.url === '/blog/winner');

    expect(loser?.canonicalWinner).toBe(false);
    expect(loser?.eligibleSurfaces).toEqual([]);
    expect(guardedWinner?.guardrails).toContain('recently-edited');
    expect(guardedWinner?.eligibleSurfaces).not.toContain('homepageBlogPicks');
  });
});

describe('seo equity diff gate', () => {
  it('ignores timestamp-only changes', () => {
    const before = buildSeoEquitySnapshot({ config, pages, generatedAt: '2026-06-07T00:00:00.000Z' });
    const after = { ...before, generatedAt: '2026-06-08T00:00:00.000Z' };

    expect(hasMaterialSeoEquityChange(before, after, { minScoreDelta: 3 }).material).toBe(false);
  });

  it('suppresses unchanged promoted sets with below-threshold score movement', () => {
    const before = buildSeoEquitySnapshot({ config, pages, generatedAt: '2026-06-07T00:00:00.000Z' });
    const after = {
      ...before,
      entities: before.entities.map(entity =>
        entity.url === '/blog/low-ctr' ? { ...entity, score: entity.score + 1.5 } : entity
      ),
    };

    expect(hasMaterialSeoEquityChange(before, after, { minScoreDelta: 3 }).material).toBe(false);
  });
});
