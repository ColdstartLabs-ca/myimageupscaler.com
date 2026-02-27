import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../../..');
const BLOG_DIR = join(ROOT, 'content/blog');

const PSEO_LINK_PATTERN = /\]\(\/(scale|free|formats|use-cases|alternatives|compare)\//;

/**
 * Also match /alternatives] (no trailing slash) and /free] (the hub without sub-path)
 * to capture links like [hub](/alternatives) and [hub](/free)
 */
const PSEO_LINK_PATTERN_NO_SLASH = /\]\(\/(alternatives|free)\)/;

function hasAnyPSEOLink(content: string): boolean {
  return PSEO_LINK_PATTERN.test(content) || PSEO_LINK_PATTERN_NO_SLASH.test(content);
}

describe('Blog → pSEO internal linking', () => {
  it('At least 8 blog posts should contain pSEO page links', () => {
    const files = readdirSync(BLOG_DIR).filter(f => f.endsWith('.mdx'));
    const postsWithLinks = files.filter(f => {
      const content = readFileSync(join(BLOG_DIR, f), 'utf-8');
      return hasAnyPSEOLink(content);
    });
    expect(postsWithLinks.length).toBeGreaterThanOrEqual(8);
  });

  it('All 18 blog posts should contain at least one pSEO link', () => {
    const files = readdirSync(BLOG_DIR).filter(f => f.endsWith('.mdx'));
    const postsWithoutLinks = files.filter(f => {
      const content = readFileSync(join(BLOG_DIR, f), 'utf-8');
      return !hasAnyPSEOLink(content);
    });
    expect(
      postsWithoutLinks,
      `The following blog posts are missing pSEO links: ${postsWithoutLinks.join(', ')}`
    ).toHaveLength(0);
  });

  it('Blog posts should not link to zombie categories', () => {
    const files = readdirSync(BLOG_DIR).filter(f => f.endsWith('.mdx'));
    for (const f of files) {
      const content = readFileSync(join(BLOG_DIR, f), 'utf-8');
      expect(content, `${f} links to zombie /ai-features/ category`).not.toMatch(
        /\]\(\/ai-features\//
      );
    }
  });

  it('Blog posts should not link to orphan pSEO categories', () => {
    const ORPHAN_CATEGORIES = [
      '/comparisons-expanded/',
      '/personas-expanded/',
      '/technical-guides/',
      '/use-cases-expanded/',
    ];
    const files = readdirSync(BLOG_DIR).filter(f => f.endsWith('.mdx'));
    for (const f of files) {
      const content = readFileSync(join(BLOG_DIR, f), 'utf-8');
      for (const orphan of ORPHAN_CATEGORIES) {
        expect(content, `${f} links to orphan category ${orphan}`).not.toContain(orphan);
      }
    }
  });

  it('pSEO links in blog posts should use descriptive anchor text (not "click here" or "here")', () => {
    // Matches markdown links where the anchor text is just "here", "click here", or "this"
    const BAD_ANCHOR_PATTERN = /\[(click here|here|this)\]\(\/(scale|free|formats|use-cases|alternatives|tools\/ai)\//i;
    const files = readdirSync(BLOG_DIR).filter(f => f.endsWith('.mdx'));
    for (const f of files) {
      const content = readFileSync(join(BLOG_DIR, f), 'utf-8');
      expect(content, `${f} uses non-descriptive anchor text for a pSEO link`).not.toMatch(
        BAD_ANCHOR_PATTERN
      );
    }
  });

  it('specific high-priority posts should link to their mapped pSEO targets', () => {
    const checks: Array<{ file: string; expectedPath: string; description: string }> = [
      {
        file: 'how-to-upscale-images-without-losing-quality.mdx',
        expectedPath: '/scale/upscale-to-4k',
        description: 'links to 4K upscale page',
      },
      {
        file: 'how-to-upscale-images-without-losing-quality.mdx',
        expectedPath: '/free/free-image-upscaler',
        description: 'links to free upscaler page',
      },
      {
        file: 'ai-image-enhancement-ecommerce-guide.mdx',
        expectedPath: '/use-cases/ecommerce-product-photos',
        description: 'links to e-commerce use case',
      },
      {
        file: 'restore-old-photos-ai-enhancement-guide.mdx',
        expectedPath: '/use-cases/old-photo-restoration',
        description: 'links to photo restoration use case',
      },
      {
        file: 'real-estate-photo-enhancement-guide.mdx',
        expectedPath: '/use-cases/real-estate-photo-enhancement',
        description: 'links to real estate use case',
      },
      {
        file: 'anime-upscaling-4k-art-guide.mdx',
        expectedPath: '/use-cases/anime-image-upscaler',
        description: 'links to anime illustration use case',
      },
      {
        file: 'anime-upscaling-4k-art-guide.mdx',
        expectedPath: '/scale/upscale-to-4k',
        description: 'links to 4K upscale page',
      },
      {
        file: 'image-resolution-for-printing-complete-guide.mdx',
        expectedPath: '/scale/upscale-to-1080p',
        description: 'links to 1920x1080 upscale page',
      },
      {
        file: 'upscale-midjourney-images-4k-8k-print-guide.mdx',
        expectedPath: '/scale/upscale-to-4k',
        description: 'links to 4K upscale page',
      },
      {
        file: 'fix-blurry-photos-ai-methods-guide.mdx',
        expectedPath: '/use-cases/old-photo-restoration',
        description: 'links to photo restoration use case',
      },
      {
        file: 'dalle-3-image-enhancement-guide.mdx',
        expectedPath: '/alternatives',
        description: 'links to alternatives hub',
      },
    ];

    for (const { file, expectedPath, description } of checks) {
      const content = readFileSync(join(BLOG_DIR, file), 'utf-8');
      expect(content, `${file} should contain "${expectedPath}" (${description})`).toContain(
        expectedPath
      );
    }
  });
});
