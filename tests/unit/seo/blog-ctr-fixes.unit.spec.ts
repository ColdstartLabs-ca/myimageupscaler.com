/**
 * Blog CTR Fixes Unit Tests — Phase 1
 *
 * Verifies that the blog post page metadata resolution logic:
 * - Prefers seo_title over title when seo_title is present
 * - Keeps all new seo_description values under 160 characters
 * - generateMetadata properly uses seo_title/seo_description from posts
 *
 * These tests mirror the resolution logic in:
 *   app/[locale]/blog/[slug]/page.tsx → generateMetadata()
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Mirror the metadata resolution logic from generateMetadata() in page.tsx.
// This matches: title: post.seo_title || post.title
// and:          description: post.seo_description || post.description
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

// ---------------------------------------------------------------------------
// Fixtures — matches the SQL migration in docs/PRDs/migrations/seo-ctr-blog-updates.sql
// ---------------------------------------------------------------------------

const UPDATED_POSTS: IPostMetaFields[] = [
  {
    title: 'Best Free AI Image Upscaler in 2026',
    description: 'A roundup of the best free AI image upscalers.',
    seo_title: '7 Best Free AI Image Upscalers in 2026 (Tested & Compared)',
    seo_description:
      'We tested 7 free AI image upscalers head-to-head. See real results, speed, and quality scores. Try the #1 pick free — no signup needed.',
  },
  {
    title: 'AI Upscaling vs Sharpening',
    description: 'The differences between AI upscaling and sharpening.',
    seo_title: 'AI Upscaling vs Sharpening: Which One Do You Actually Need?',
    seo_description:
      'Upscaling adds pixels; sharpening fakes detail. Learn which technique to use for your images — with visual examples and a free tool to try both.',
  },
  {
    title: 'How to Upscale Images Without Losing Quality',
    description: 'A step-by-step guide to upscaling images.',
    seo_title: 'How to Upscale Images Without Losing Quality (2026 Guide)',
    seo_description:
      'Enlarge photos up to 8x without blur. Step-by-step guide with free AI tool — no signup, no watermark. Works for photos, art, and screenshots.',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Blog CTR Fixes — seo_title preference', () => {
  it('should use seo_title over title when present', () => {
    for (const post of UPDATED_POSTS) {
      const resolved = resolveMetaTitle(post);
      expect(resolved).toBe(post.seo_title);
      expect(resolved).not.toBe(post.title);
    }
  });

  it('should fall back to title when seo_title is absent', () => {
    const postWithoutSeo: IPostMetaFields = {
      title: 'Fallback Title',
      description: 'Fallback description.',
      seo_title: undefined,
      seo_description: undefined,
    };
    expect(resolveMetaTitle(postWithoutSeo)).toBe('Fallback Title');
  });

  it('should fall back to title when seo_title is empty string', () => {
    const postWithEmpty: IPostMetaFields = {
      title: 'Fallback Title',
      description: 'Fallback description.',
      seo_title: '',
      seo_description: '',
    };
    expect(resolveMetaTitle(postWithEmpty)).toBe('Fallback Title');
  });
});

describe('Blog CTR Fixes — seo_description length', () => {
  it('should have seo_description under 160 characters', () => {
    for (const post of UPDATED_POSTS) {
      expect(post.seo_description).toBeDefined();
      expect(post.seo_description!.length).toBeLessThanOrEqual(160);
    }
  });

  it('should use seo_description over description when present', () => {
    for (const post of UPDATED_POSTS) {
      const resolved = resolveMetaDescription(post);
      expect(resolved).toBe(post.seo_description);
      expect(resolved).not.toBe(post.description);
    }
  });
});

describe('Blog CTR Fixes — generateMetadata uses seo_title/seo_description', () => {
  it('blog post page.tsx uses seo_title || title pattern for metadata title', () => {
    // This test verifies the actual source code pattern used in generateMetadata
    const fs = require('fs');
    const path = require('path');
    const filePath = path.resolve(process.cwd(), 'app/[locale]/blog/[slug]/page.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    // generateMetadata must prefer seo_title, falling back to title
    expect(content).toContain('post.seo_title || post.title');
  });

  it('blog post page.tsx uses seo_description || description pattern for metadata description', () => {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.resolve(process.cwd(), 'app/[locale]/blog/[slug]/page.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    // generateMetadata must prefer seo_description, falling back to description
    expect(content).toContain('post.seo_description || post.description');
  });

  it('blog post page.tsx applies seo_title fallback to Twitter card title', () => {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.resolve(process.cwd(), 'app/[locale]/blog/[slug]/page.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    // Twitter card title must also use the seo_title fallback
    // The pattern: twitter: { title: post.seo_title || post.title }
    const twitterSection = content.match(/twitter\s*:\s*\{[\s\S]*?\}/);
    expect(twitterSection).toBeTruthy();
    expect(twitterSection![0]).toContain('seo_title');
  });
});
