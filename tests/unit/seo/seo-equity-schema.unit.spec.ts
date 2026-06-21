import { describe, expect, it } from 'vitest';
import { seoEquityConfigSchema } from '@lib/seo/seo-equity.schema';

const validConfig = {
  version: 1,
  siteUrl: 'https://myimageupscaler.com',
  settings: {
    refreshCadence: 'weekly-or-monthly',
    minStableDaysAfterEdit: 14,
    minMaterialScoreDelta: 3,
  },
  maxSurfaceSlots: {
    homepageBlogPicks: 4,
    blogIndexFeatured: 1,
    blogStartHere: 3,
    blogFooterRelated: 3,
    pseoRelatedBlogPosts: 3,
    hubSpokeLinks: 5,
  },
  allowlist: ['/blog/winner'],
  blocklist: ['/blog/blocked'],
  pinnedBySurface: {
    homepageBlogPicks: ['/blog/winner'],
  },
  canonicalClusters: [
    {
      id: 'cluster-one',
      intent: 'Example cluster',
      members: [
        { url: '/blog/winner', winner: true },
        { url: '/blog/supporting', winner: false },
      ],
    },
  ],
  businessValueWeights: {
    '/blog/winner': 1.4,
  },
  recentlyEditedUntil: {
    '/blog/winner': '2026-06-21',
  },
  localePolicy: {
    default: 'english-only',
    overrides: {
      '/blog/winner': 'localized-safe',
    },
  },
  pseoRelatedTargets: {
    '/tools/ai-image-upscaler': ['/blog/winner'],
  },
};

describe('seoEquityConfigSchema', () => {
  it('validates editorial config and rejects invalid surface names', () => {
    expect(() => seoEquityConfigSchema.parse(validConfig)).not.toThrow();

    expect(() =>
      seoEquityConfigSchema.parse({
        ...validConfig,
        pinnedBySurface: { notASurface: ['/blog/winner'] },
      })
    ).toThrow();
  });

  it('enforces exactly one canonical winner per cluster', () => {
    expect(() =>
      seoEquityConfigSchema.parse({
        ...validConfig,
        canonicalClusters: [
          {
            id: 'bad-cluster',
            intent: 'Bad cluster',
            members: [
              { url: '/blog/a', winner: true },
              { url: '/blog/b', winner: true },
            ],
          },
        ],
      })
    ).toThrow(/exactly one winner/);

    expect(() =>
      seoEquityConfigSchema.parse({
        ...validConfig,
        canonicalClusters: [
          {
            id: 'bad-cluster',
            intent: 'Bad cluster',
            members: [{ url: '/blog/a', winner: false }],
          },
        ],
      })
    ).toThrow(/exactly one winner/);
  });

  it('supports guardrail dates', () => {
    const parsed = seoEquityConfigSchema.parse(validConfig);
    expect(parsed.recentlyEditedUntil['/blog/winner']).toBe('2026-06-21');
  });
});
