/**
 * Tests for blog schema SERP-compliance validation.
 *
 * Ensures seo_title and seo_description enforce SERP-optimal character ranges
 * when provided (they remain optional — but when set, must be SERP-compliant).
 */

import { describe, it, expect } from 'vitest';
import { createBlogPostSchema } from '@shared/validation/blog.schema';

const VALID_BASE = {
  slug: 'test-post-slug',
  title: 'A Valid Blog Post Title For Testing',
  description: 'This is a valid description that is long enough to pass the minimum character count for blog posts.',
  content: 'A'.repeat(200),
  author: 'MyImageUpscaler Team',
  category: 'Tutorials',
  tags: ['test'],
};

describe('Blog schema — seo_title SERP validation', () => {
  it('accepts seo_title within 30-60 chars', () => {
    const result = createBlogPostSchema.safeParse({
      ...VALID_BASE,
      seo_title: 'Best Free AI Image Upscaler Tools 2026', // 38 chars
    });
    expect(result.success).toBe(true);
  });

  it('rejects seo_title shorter than 30 chars', () => {
    const result = createBlogPostSchema.safeParse({
      ...VALID_BASE,
      seo_title: 'AI Upscaler', // 11 chars
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const titleIssue = result.error.issues.find(i => i.path.includes('seo_title'));
      expect(titleIssue).toBeDefined();
      expect(titleIssue?.message).toContain('30');
    }
  });

  it('rejects seo_title longer than 60 chars', () => {
    const result = createBlogPostSchema.safeParse({
      ...VALID_BASE,
      seo_title: 'The Complete and Ultimate Guide to Best Free AI Image Upscaler Tools in 2026', // 76 chars
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const titleIssue = result.error.issues.find(i => i.path.includes('seo_title'));
      expect(titleIssue).toBeDefined();
      expect(titleIssue?.message).toContain('60');
    }
  });

  it('allows omitting seo_title entirely', () => {
    const result = createBlogPostSchema.safeParse(VALID_BASE);
    expect(result.success).toBe(true);
  });
});

describe('Blog schema — seo_description SERP validation', () => {
  it('accepts seo_description within 120-160 chars', () => {
    const desc = 'We tested 7 AI image upscalers head-to-head to find the best free options. See results, comparisons, and try the top pick free with no signup required.';
    expect(desc.length).toBeGreaterThanOrEqual(120);
    expect(desc.length).toBeLessThanOrEqual(160);

    const result = createBlogPostSchema.safeParse({
      ...VALID_BASE,
      seo_description: desc,
    });
    expect(result.success).toBe(true);
  });

  it('rejects seo_description shorter than 120 chars', () => {
    const result = createBlogPostSchema.safeParse({
      ...VALID_BASE,
      seo_description: 'A short meta description that will not fill the SERP snippet space.', // 66 chars
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const descIssue = result.error.issues.find(i => i.path.includes('seo_description'));
      expect(descIssue).toBeDefined();
      expect(descIssue?.message).toContain('120');
    }
  });

  it('rejects seo_description longer than 160 chars', () => {
    const result = createBlogPostSchema.safeParse({
      ...VALID_BASE,
      seo_description: 'A'.repeat(170),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const descIssue = result.error.issues.find(i => i.path.includes('seo_description'));
      expect(descIssue).toBeDefined();
      expect(descIssue?.message).toContain('160');
    }
  });

  it('allows omitting seo_description entirely', () => {
    const result = createBlogPostSchema.safeParse(VALID_BASE);
    expect(result.success).toBe(true);
  });
});

describe('Blog schema — both seo fields together', () => {
  it('accepts both seo_title and seo_description in valid ranges', () => {
    const result = createBlogPostSchema.safeParse({
      ...VALID_BASE,
      seo_title: '7 Best Free AI Image Upscalers (2026)', // 37 chars
      seo_description: 'We tested 7 AI image upscalers head-to-head to find the best free options. See results, comparisons, and try the top pick free with no signup required.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects both when both are out of range', () => {
    const result = createBlogPostSchema.safeParse({
      ...VALID_BASE,
      seo_title: 'Short', // too short
      seo_description: 'Also too short', // too short
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.filter(i => i.path.includes('seo_title'))).toHaveLength(1);
      expect(result.error.issues.filter(i => i.path.includes('seo_description'))).toHaveLength(1);
    }
  });
});
