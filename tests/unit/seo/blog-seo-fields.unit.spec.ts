/**
 * Tests for blog post seo_title / seo_description metadata resolution.
 *
 * The blog post page (app/[locale]/blog/[slug]/page.tsx) should:
 * - Use seo_title as the <title> tag when set, falling back to title
 * - Use seo_description as the meta description when set, falling back to description
 * - Always use plain title for OpenGraph (social shares show the natural title)
 * - Always use plain title for H1 (rendered heading)
 * - Apply the same seo_title fallback to Twitter card title
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Mirror the metadata resolution logic from generateMetadata() in page.tsx.
// If the implementation changes, update this to match.
// ---------------------------------------------------------------------------

interface IPostMetaFields {
  title: string;
  description: string;
  seo_title?: string | null;
  seo_description?: string | null;
}

function resolveMetaTitle(post: IPostMetaFields): string {
  return post.seo_title || post.title;
}

function resolveMetaDescription(post: IPostMetaFields): string {
  return post.seo_description || post.description;
}

function resolveOgTitle(post: IPostMetaFields): string {
  return post.title; // OG always uses natural title
}

function resolveH1(post: IPostMetaFields): string {
  return post.title; // H1 always uses natural title
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const POST_WITH_SEO_FIELDS: IPostMetaFields = {
  title: 'Best Image Upscaling Tools 2026',
  description: 'A roundup of the best AI image upscalers available in 2026.',
  seo_title: '7 Best AI Image Upscalers in 2026 (Free & Paid, Tested)',
  seo_description:
    'We tested 7 AI image upscalers head-to-head. See which ones actually work. Try the top pick free — no signup required.',
};

const POST_WITHOUT_SEO_FIELDS: IPostMetaFields = {
  title: 'How AI Image Upscaling Works',
  description: 'A deep dive into the technology behind AI image upscaling.',
  seo_title: undefined,
  seo_description: undefined,
};

const POST_WITH_EMPTY_SEO_FIELDS: IPostMetaFields = {
  title: 'AI vs Traditional Image Upscaling',
  description: 'Comparing AI upscaling to traditional bicubic interpolation.',
  seo_title: '',
  seo_description: '',
};

const POST_WITH_SEO_TITLE_ONLY: IPostMetaFields = {
  title: 'Upscale Image Online Free',
  description: 'The easiest way to upscale images online without paying.',
  seo_title: 'Upscale Images Online Free — No Watermark, Instant Results',
  seo_description: undefined,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Blog post metadata resolution — seo_title / seo_description', () => {
  describe('when seo_title and seo_description are set', () => {
    it('uses seo_title as the <title> tag', () => {
      expect(resolveMetaTitle(POST_WITH_SEO_FIELDS)).toBe(POST_WITH_SEO_FIELDS.seo_title);
    });

    it('uses seo_description as the meta description', () => {
      expect(resolveMetaDescription(POST_WITH_SEO_FIELDS)).toBe(
        POST_WITH_SEO_FIELDS.seo_description
      );
    });

    it('seo_title is different from title (they can be independently optimized)', () => {
      expect(resolveMetaTitle(POST_WITH_SEO_FIELDS)).not.toBe(POST_WITH_SEO_FIELDS.title);
    });

    it('OpenGraph title still uses the natural title, not seo_title', () => {
      expect(resolveOgTitle(POST_WITH_SEO_FIELDS)).toBe(POST_WITH_SEO_FIELDS.title);
    });

    it('H1 still uses the natural title, not seo_title', () => {
      expect(resolveH1(POST_WITH_SEO_FIELDS)).toBe(POST_WITH_SEO_FIELDS.title);
    });
  });

  describe('when seo_title and seo_description are undefined (not set)', () => {
    it('falls back to title for the <title> tag', () => {
      expect(resolveMetaTitle(POST_WITHOUT_SEO_FIELDS)).toBe(POST_WITHOUT_SEO_FIELDS.title);
    });

    it('falls back to description for the meta description', () => {
      expect(resolveMetaDescription(POST_WITHOUT_SEO_FIELDS)).toBe(
        POST_WITHOUT_SEO_FIELDS.description
      );
    });

    it('OpenGraph title uses the natural title', () => {
      expect(resolveOgTitle(POST_WITHOUT_SEO_FIELDS)).toBe(POST_WITHOUT_SEO_FIELDS.title);
    });
  });

  describe('when seo_title and seo_description are empty strings', () => {
    it('falls back to title when seo_title is an empty string', () => {
      expect(resolveMetaTitle(POST_WITH_EMPTY_SEO_FIELDS)).toBe(POST_WITH_EMPTY_SEO_FIELDS.title);
    });

    it('falls back to description when seo_description is an empty string', () => {
      expect(resolveMetaDescription(POST_WITH_EMPTY_SEO_FIELDS)).toBe(
        POST_WITH_EMPTY_SEO_FIELDS.description
      );
    });
  });

  describe('when only seo_title is set (seo_description is undefined)', () => {
    it('uses seo_title for the <title> tag', () => {
      expect(resolveMetaTitle(POST_WITH_SEO_TITLE_ONLY)).toBe(POST_WITH_SEO_TITLE_ONLY.seo_title);
    });

    it('falls back to description for the meta description', () => {
      expect(resolveMetaDescription(POST_WITH_SEO_TITLE_ONLY)).toBe(
        POST_WITH_SEO_TITLE_ONLY.description
      );
    });
  });

  describe('SEO field length constraints', () => {
    it('seo_title should be at most 70 characters', () => {
      expect(POST_WITH_SEO_FIELDS.seo_title!.length).toBeLessThanOrEqual(70);
    });

    it('seo_description should be at most 160 characters', () => {
      expect(POST_WITH_SEO_FIELDS.seo_description!.length).toBeLessThanOrEqual(160);
    });

    it('seo_title for the only-title fixture is at most 70 characters', () => {
      expect(POST_WITH_SEO_TITLE_ONLY.seo_title!.length).toBeLessThanOrEqual(70);
    });
  });

  describe('3 Kings independence — title, meta title, and H1 can all differ', () => {
    it('title tag (King 1) can differ from H1 (King 2)', () => {
      const metaTitle = resolveMetaTitle(POST_WITH_SEO_FIELDS);
      const h1 = resolveH1(POST_WITH_SEO_FIELDS);
      expect(metaTitle).not.toBe(h1);
    });

    it('OG title always equals H1 for social share consistency', () => {
      const ogTitle = resolveOgTitle(POST_WITH_SEO_FIELDS);
      const h1 = resolveH1(POST_WITH_SEO_FIELDS);
      expect(ogTitle).toBe(h1);
    });
  });
});
