import { describe, expect, it } from 'vitest';
import {
  getBlogIndexFeatured,
  getBlogStartHere,
  getHomepageBlogPicks,
  getPseoRelatedBlogPosts,
  getRelatedPostsForSlug,
  validateSeoEquityPromotedUrls,
} from '@lib/seo/seo-equity';
import type { ISeoEquitySnapshot } from '@lib/seo/seo-equity.schema';

const snapshot: ISeoEquitySnapshot = {
  generatedAt: '2026-06-07T00:00:00.000Z',
  source: {
    gscExport: 'tmp/gsc/test.json',
    window: { startDate: '2026-03-07', endDate: '2026-06-04', days: 90 },
  },
  settings: {
    refreshCadence: 'weekly-or-monthly',
    minStableDaysAfterEdit: 14,
    minMaterialScoreDelta: 3,
  },
  entities: [
    {
      url: '/blog/a',
      type: 'blog',
      canonicalCluster: 'a',
      canonicalWinner: true,
      score: 90,
      scoreBreakdown: { impressions: 1, position: 1, ctrGap: 1, businessValue: 1, freshness: 0, cannibalization: 1, conversion: 0 },
      eligibleSurfaces: ['homepageBlogPicks', 'blogIndexFeatured', 'blogStartHere', 'blogFooterRelated', 'pseoRelatedBlogPosts'],
      guardrails: [],
    },
    {
      url: '/blog/b',
      type: 'blog',
      canonicalCluster: 'b',
      canonicalWinner: true,
      score: 80,
      scoreBreakdown: { impressions: 1, position: 1, ctrGap: 1, businessValue: 1, freshness: 0, cannibalization: 1, conversion: 0 },
      eligibleSurfaces: ['homepageBlogPicks', 'blogFooterRelated', 'pseoRelatedBlogPosts'],
      guardrails: [],
    },
  ],
  surfaces: {
    homepageBlogPicks: ['/blog/a', '/blog/b'],
    blogIndexFeatured: ['/blog/a'],
    blogStartHere: [
      { label: 'A', href: '/blog/a', description: 'Read A' },
      { label: 'B', href: '/blog/b', description: 'Read B' },
    ],
    blogFooterRelated: {
      '/blog/a': ['/blog/b'],
    },
    pseoRelatedBlogPosts: {
      '/tools/ai-image-upscaler': ['/blog/a', '/blog/b'],
    },
    hubSpokeLinks: {},
  },
};

describe('seo equity loader/selectors', () => {
  it('returns homepage picks ordered and capped by budget', () => {
    expect(getHomepageBlogPicks(snapshot, 1)).toEqual(['a']);
    expect(getHomepageBlogPicks(snapshot, 4)).toEqual(['a', 'b']);
  });

  it('returns blog index featured and start-here links', () => {
    expect(getBlogIndexFeatured(snapshot, 1)).toEqual(['a']);
    expect(getBlogStartHere(snapshot, 1)).toEqual([{ label: 'A', href: '/blog/a', description: 'Read A' }]);
  });

  it('excludes the current post from related posts', () => {
    expect(getRelatedPostsForSlug('a', snapshot, 3)).toEqual(['b']);
    expect(getRelatedPostsForSlug('b', snapshot, 3)).not.toContain('b');
  });

  it('returns pSEO related blog posts as slugs', () => {
    expect(getPseoRelatedBlogPosts('/tools/ai-image-upscaler', snapshot, 2)).toEqual(['a', 'b']);
  });

  it('validates promoted URLs against known routes', () => {
    expect(validateSeoEquityPromotedUrls(snapshot, { blogSlugs: ['a', 'b'], routes: ['/tools/ai-image-upscaler'] })).toEqual([]);
    expect(validateSeoEquityPromotedUrls(snapshot, { blogSlugs: ['a'], routes: ['/tools/ai-image-upscaler'] })).toContain('/blog/b');
  });
});
