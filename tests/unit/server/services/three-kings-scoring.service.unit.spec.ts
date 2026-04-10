import { describe, it, expect } from 'vitest';
import { scoreBlogPages } from '@server/services/three-kings-scoring.service';
import type { IGscPageRow, IGscQueryPageRow } from '@server/services/three-kings-scoring.service';

const BASE_URL = 'https://myimageupscaler.com';

function makePageRow(slug: string, position: number, impressions = 1000, clicks = 50, ctr = 0.05): IGscPageRow {
  return {
    keys: [`${BASE_URL}/blog/${slug}`],
    position,
    impressions,
    clicks,
    ctr,
  };
}

function makeQueryPageRow(query: string, slug: string, impressions = 500): IGscQueryPageRow {
  return {
    keys: [query, `${BASE_URL}/blog/${slug}`],
    position: 8,
    impressions,
    clicks: 25,
    ctr: 0.05,
  };
}

describe('scoreBlogPages', () => {
  it('scores a position 8 page above a position 25 page', () => {
    const pageRows: IGscPageRow[] = [
      makePageRow('good-post', 8, 1000, 50, 0.05),
      makePageRow('far-post', 25, 1000, 50, 0.05),
    ];

    const results = scoreBlogPages(pageRows, []);

    const goodPost = results.find(r => r.slug === 'good-post');
    const farPost = results.find(r => r.slug === 'far-post');

    expect(goodPost).toBeDefined();
    expect(farPost).toBeDefined();
    expect(goodPost!.opportunityScore).toBeGreaterThan(farPost!.opportunityScore);
  });

  it('ranks a high-impression position 10 page first', () => {
    const pageRows: IGscPageRow[] = [
      makePageRow('low-impressions', 10, 100, 5, 0.05),
      makePageRow('high-impressions', 10, 10000, 500, 0.05),
      makePageRow('far-away', 30, 5000, 250, 0.05),
    ];

    const results = scoreBlogPages(pageRows, []);

    expect(results[0].slug).toBe('high-impressions');
  });

  it('caps results at 50 entries', () => {
    const pageRows: IGscPageRow[] = Array.from({ length: 60 }, (_, i) =>
      makePageRow(`post-${i}`, 8 + (i % 5), 1000 - i, 50, 0.05)
    );

    const results = scoreBlogPages(pageRows, []);

    expect(results.length).toBeLessThanOrEqual(50);
  });

  it('filters blocked blog slugs via shared constant', () => {
    const blockedSlug = 'dalle-3-image-enhancement-guide';
    const pageRows: IGscPageRow[] = [
      makePageRow(blockedSlug, 8, 2000, 100, 0.05),
      makePageRow('valid-post', 10, 1000, 50, 0.05),
    ];

    const results = scoreBlogPages(pageRows, []);

    const slugs = results.map(r => r.slug);
    expect(slugs).not.toContain(blockedSlug);
    expect(slugs).toContain('valid-post');
  });

  it('extracts a blog slug from a blog URL', () => {
    const pageRows: IGscPageRow[] = [
      makePageRow('my-post', 8, 1000, 50, 0.05),
    ];

    const results = scoreBlogPages(pageRows, []);

    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe('my-post');
  });

  it('assigns topQuery from queryPageRows', () => {
    const slug = 'upscale-images-guide';
    const pageRows: IGscPageRow[] = [
      makePageRow(slug, 8, 1000, 50, 0.05),
    ];
    const queryPageRows: IGscQueryPageRow[] = [
      makeQueryPageRow('how to upscale images', slug, 800),
      makeQueryPageRow('image upscaler free', slug, 400),
    ];

    const results = scoreBlogPages(pageRows, queryPageRows);

    expect(results).toHaveLength(1);
    // Top query is the one with highest impressions
    expect(results[0].topQuery).toBe('how to upscale images');
  });

  it('returns null topQuery when no queryPageRows exist for a page', () => {
    const pageRows: IGscPageRow[] = [
      makePageRow('no-queries-post', 10, 1000, 50, 0.05),
    ];

    const results = scoreBlogPages(pageRows, []);

    expect(results[0].topQuery).toBeNull();
  });

  it('excludes non-blog pages', () => {
    const pageRows: IGscPageRow[] = [
      {
        keys: [`${BASE_URL}/`],
        position: 8,
        impressions: 5000,
        clicks: 250,
        ctr: 0.05,
      },
      {
        keys: [`${BASE_URL}/pricing`],
        position: 9,
        impressions: 3000,
        clicks: 150,
        ctr: 0.05,
      },
      makePageRow('valid-blog-post', 8, 1000, 50, 0.05),
    ];

    const results = scoreBlogPages(pageRows, []);

    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe('valid-blog-post');
  });

  it('sets title to null for all entries', () => {
    const pageRows: IGscPageRow[] = [
      makePageRow('some-post', 10, 1000, 50, 0.05),
    ];

    const results = scoreBlogPages(pageRows, []);

    expect(results[0].title).toBeNull();
  });

  it('calculates queryIntentScore as 1.0 when topQuery contains an intent keyword', () => {
    const slug = 'free-upscaler';
    const pageRows: IGscPageRow[] = [
      makePageRow(slug, 8, 1000, 50, 0.05),
    ];
    const queryPageRows: IGscQueryPageRow[] = [
      makeQueryPageRow('best free image upscaler', slug, 1000),
    ];

    const results = scoreBlogPages(pageRows, queryPageRows);

    expect(results[0].queryIntentScore).toBe(1.0);
  });

  it('calculates queryIntentScore as 0 when topQuery has no intent keywords', () => {
    const slug = 'photography-tips';
    const pageRows: IGscPageRow[] = [
      makePageRow(slug, 8, 1000, 50, 0.05),
    ];
    const queryPageRows: IGscQueryPageRow[] = [
      makeQueryPageRow('photography golden hour', slug, 1000),
    ];

    const results = scoreBlogPages(pageRows, queryPageRows);

    expect(results[0].queryIntentScore).toBe(0);
  });
});
