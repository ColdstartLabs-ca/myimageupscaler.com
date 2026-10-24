import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBlogPostSchema } from '@shared/validation/blog.schema';

interface IBlogMetaFields {
  title: string;
  description: string;
  seo_title?: string | null;
  seo_description?: string | null;
}

interface IQueryAlignedPage {
  slug: string;
  seoTitle: string;
  h1: string;
  firstSentence: string;
  targetQuery: string;
}

interface ISerpRecoveryPage {
  slug: string;
  targetTerms: readonly string[];
  title: string;
  description: string;
}

const META_RESOLUTION_POSTS: readonly IBlogMetaFields[] = [
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

const QUERY_ALIGNED_PAGES: readonly IQueryAlignedPage[] = [
  {
    slug: 'best-free-ai-image-upscaler-2026-tested-compared',
    seoTitle: 'Best Free AI Image Upscaler 2026: 12 Tools Tested',
    h1: 'Best Free AI Image Upscaler 2026: 12 Tools Tested',
    firstSentence:
      'We tested the best free AI image upscaler tools for 2026 to see which ones upscale images online without signup, watermarks, or soft-looking results.',
    targetQuery: 'best free ai image upscaler 2026',
  },
  {
    slug: 'ai-image-upscaling-vs-sharpening-explained',
    seoTitle: 'AI Upscaling vs Sharpening Explained: Key Difference',
    h1: 'AI Upscaling vs Sharpening Explained',
    firstSentence:
      'AI upscaling vs sharpening is the difference between adding new image detail and making existing edges look clearer.',
    targetQuery: 'ai upscaling vs sharpening',
  },
  {
    slug: 'best-ai-image-quality-enhancer-free',
    seoTitle: 'Best Free AI Image Sharpener Online 2026: Tested',
    h1: 'Best Free AI Image Sharpener Online 2026',
    firstSentence:
      'We tested the best free AI image sharpener tools online in 2026 for blurry photos, soft details, noise, and image quality enhancement.',
    targetQuery: 'best free ai image sharpener online 2026',
  },
  {
    slug: 'free-ai-upscaler-no-watermark',
    seoTitle: 'Best Free AI Image Upscaler 2026: No Watermark',
    h1: 'Best Free AI Image Upscaler With No Watermark',
    firstSentence:
      'This guide compares the best free AI image upscaler options in 2026 that avoid watermarks, signup friction, and low-quality exports.',
    targetQuery: 'best free ai image upscaler',
  },
  {
    slug: 'upscale-image-for-print-300-dpi-guide',
    seoTitle: 'Upscale Image to 300 DPI for Print: Free AI Guide',
    h1: 'Upscale Image to 300 DPI for Print',
    firstSentence:
      'To upscale an image to 300 DPI for print, you need enough pixels for the print size, then use AI upscaling only when the source image is too small.',
    targetQuery: 'upscale image to 300 dpi',
  },
];

const SERP_RECOVERY_PAGES: readonly ISerpRecoveryPage[] = [
  {
    slug: 'best-free-ai-image-upscaler-2026-tested-compared',
    targetTerms: ['best', 'free', 'ai', 'image', 'upscaler', '2026'],
    title: 'Best Free AI Image Upscaler 2026: Only 3 Worked',
    description:
      'Best free AI image upscaler 2026: we tested 12 tools for quality, speed, no signup, no watermark, and 4K/8K output. See winners and try free.',
  },
  {
    slug: 'best-image-upscaler',
    targetTerms: ['best', 'image', 'upscaling', 'software', '2026'],
    title: 'Best Image Upscaling Software 2026: 12 Tools Compared',
    description:
      'Compare 12 image upscaling tools for 2026, including free web apps and pro software. See output limits, pricing tradeoffs, and the best fit for your workflow.',
  },
  {
    slug: 'how-to-upscale-youtube-thumbnails',
    targetTerms: ['youtube', 'thumbnail', 'blurry', 'low quality'],
    title: 'Why Your YouTube Thumbnail Looks Blurry or Low Quality',
    description:
      'Fix blurry YouTube thumbnails and low quality uploads with the right size, export, and compression settings. Check 1280×720 and 2560×1440 before uploading.',
  },
  {
    slug: 'fixing-pixelated-photos',
    targetTerms: ['how', 'to', 'fix', 'pixelated', 'photos', 'online'],
    title: 'How to Fix Pixelated Photos Online: 3 Fast AI Fixes',
    description:
      'Learn how to fix pixelated photos online in 3 steps: upscale, sharpen, or rescan blocky images, then try the free AI upscaler.',
  },
];

const BLOG_POST_PAGE_SOURCE = readFileSync(
  resolve(process.cwd(), 'app/[locale]/blog/[slug]/page.tsx'),
  'utf8'
);

function resolveMetaTitle(post: IBlogMetaFields): string {
  return post.seo_title || post.title;
}

function resolveMetaDescription(post: IBlogMetaFields): string {
  return post.seo_description || post.description;
}

describe('Blog SEO field contract', () => {
  it('keeps seo_description within 160 characters', () => {
    for (const post of META_RESOLUTION_POSTS) {
      expect(post.seo_description, post.title).toBeDefined();
      expect(post.seo_description!.length, post.title).toBeLessThanOrEqual(160);
    }
  });

  it('keeps SEO titles within the SERP-safe range', () => {
    for (const page of QUERY_ALIGNED_PAGES) {
      expect(page.seoTitle.length, page.slug).toBeGreaterThanOrEqual(30);
      expect(page.seoTitle.length, page.slug).toBeLessThanOrEqual(60);
    }
  });

  it('keeps recovery titles and descriptions valid and within SERP ranges', () => {
    for (const page of SERP_RECOVERY_PAGES) {
      const result = createBlogPostSchema.safeParse({
        slug: page.slug,
        title: page.title,
        description: page.description,
        content: 'A'.repeat(200),
        author: 'MyImageUpscaler Team',
        category: 'Guides',
        tags: ['SEO'],
        seo_title: page.title,
        seo_description: page.description,
      });

      expect(result.success, page.slug).toBe(true);
      expect(page.title.length, page.slug).toBeGreaterThanOrEqual(30);
      expect(page.title.length, page.slug).toBeLessThanOrEqual(60);
      expect(page.description.length, page.slug).toBeGreaterThanOrEqual(120);
      expect(page.description.length, page.slug).toBeLessThanOrEqual(160);
    }
  });

  it('uses distinct titles for distinct search intents', () => {
    expect(new Set(SERP_RECOVERY_PAGES.map(page => page.title)).size).toBe(
      SERP_RECOVERY_PAGES.length
    );
  });
});

describe('Blog SEO source contract', () => {
  it('prefers seo_title over title when present', () => {
    for (const post of META_RESOLUTION_POSTS) {
      const resolved = resolveMetaTitle(post);
      expect(resolved, post.title).toBe(post.seo_title);
      expect(resolved, post.title).not.toBe(post.title);
    }
  });

  it('falls back to title when seo_title is absent', () => {
    const post: IBlogMetaFields = {
      title: 'Fallback Title',
      description: 'Fallback description.',
      seo_title: undefined,
      seo_description: undefined,
    };
    expect(resolveMetaTitle(post)).toBe('Fallback Title');
  });

  it('falls back to title when seo_title is an empty string', () => {
    const post: IBlogMetaFields = {
      title: 'Fallback Title',
      description: 'Fallback description.',
      seo_title: '',
      seo_description: '',
    };
    expect(resolveMetaTitle(post)).toBe('Fallback Title');
  });

  it('prefers seo_description over description when present', () => {
    for (const post of META_RESOLUTION_POSTS) {
      const resolved = resolveMetaDescription(post);
      expect(resolved, post.title).toBe(post.seo_description);
      expect(resolved, post.title).not.toBe(post.description);
    }
  });

  it('uses the seo_title fallback for the metadata title', () => {
    expect(BLOG_POST_PAGE_SOURCE).toContain('post.seo_title || post.title');
  });

  it('uses the seo_description fallback for the metadata description', () => {
    expect(BLOG_POST_PAGE_SOURCE).toContain('post.seo_description || post.description');
  });

  it('uses the seo_title fallback for the Twitter card title', () => {
    const twitterSection = BLOG_POST_PAGE_SOURCE.match(/twitter\s*:\s*\{[\s\S]*?\}/);
    expect(twitterSection).toBeTruthy();
    expect(twitterSection![0]).toContain('seo_title');
  });
});

describe('Blog SEO intro contract', () => {
  it('front-loads the target query across title, H1, and first sentence', () => {
    for (const page of QUERY_ALIGNED_PAGES) {
      const title = page.seoTitle.toLowerCase();
      const h1 = page.h1.toLowerCase();
      const firstSentence = page.firstSentence.toLowerCase();

      for (const token of page.targetQuery.split(' ')) {
        expect(title, `${page.slug} title missing ${token}`).toContain(token);
        expect(h1, `${page.slug} H1 missing ${token}`).toContain(token);
        expect(firstSentence, `${page.slug} intro missing ${token}`).toContain(token);
      }
    }
  });

  it('keeps the query language in recovery titles and descriptions', () => {
    for (const page of SERP_RECOVERY_PAGES) {
      const title = page.title.toLowerCase();
      const description = page.description.toLowerCase();

      for (const term of page.targetTerms) {
        expect(title, `${page.slug} title missing ${term}`).toContain(term);
        expect(description, `${page.slug} description missing ${term}`).toContain(term);
      }
    }
  });
});
