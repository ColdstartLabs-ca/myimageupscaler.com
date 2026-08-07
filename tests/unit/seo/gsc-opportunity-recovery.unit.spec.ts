import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBlogPostSchema } from '@shared/validation/blog.schema';

const RECOVERY_PAGES = {
  textImageEnhancer: {
    slug: 'text-image-enhancer',
    title: 'How to Improve Image Clarity and Text Readability',
    seoTitle: 'Improve Image Clarity & Make Text Readable [2026]',
    hasImmediateAnswer: true,
    issueTableRows: ['blur', 'low contrast', 'compression', 'skew', 'insufficient resolution'],
    separatesHumanAndOcrAdvice: true,
    internalLinks: ['/tools/ai-photo-enhancer'],
  },
  posterDimensions: {
    slug: 'poster-size-dimensions-pixels',
    seoTitle: '24×36 Poster Size in Pixels: 150–300 DPI Chart',
    seoDescription:
      'See exact 24×36 poster dimensions at 150, 200, and 300 DPI, plus minimum resolution, file setup, and when to upscale before printing.',
    dpiTableNearTop: true,
    welcomeCreditCopy: 'five welcome credits',
  },
  restorationComparison: {
    slug: 'photo-restoration-program',
    title: 'Best Photo Restoration Programs in 2026',
    seoTitle: 'Best Photo Restoration Programs 2026: 4 Options Compared',
    comparisonColumns: ['restoration tasks', 'limits', 'pricing model', 'privacy', 'best use case'],
    restorationTasks: ['face restoration', 'scratch repair', 'colorization', 'general enhancement'],
    welcomeCreditCopy: 'five welcome credits when you sign up',
    comparisonBasis: 'published features and policies, not a hands-on test',
  },
} as const;

const INTENT_OWNERS = [
  ['GIF upscaler', '/formats/upscale-gif-images'],
  ['Best free AI upscaler', '/blog/best-free-ai-image-upscaler-2026-tested-compared'],
  ['Spanish image improvement', '/es'],
  ['AI photo enhancer tool', '/tools/ai-photo-enhancer'],
  ['No-signup photo enhancer research', '/blog/free-photo-enhancer-no-signup'],
  ['Broad enhancer comparison', '/blog/best-free-ai-photo-enhancer-online'],
] as const;

describe('GSC opportunity recovery contract', () => {
  it('uses the approved text-image title and direct-answer content structure', () => {
    const page = RECOVERY_PAGES.textImageEnhancer;

    expect(page.title).toBe('How to Improve Image Clarity and Text Readability');
    expect(page.seoTitle).toBe('Improve Image Clarity & Make Text Readable [2026]');
    expect(page.hasImmediateAnswer).toBe(true);
    expect(page.issueTableRows).toEqual([
      'blur',
      'low contrast',
      'compression',
      'skew',
      'insufficient resolution',
    ]);
    expect(page.separatesHumanAndOcrAdvice).toBe(true);
    expect(page.internalLinks).toContain('/tools/ai-photo-enhancer');
  });

  it('uses the approved poster snippet while keeping the first-screen DPI table', () => {
    const page = RECOVERY_PAGES.posterDimensions;
    const result = createBlogPostSchema.safeParse({
      slug: page.slug,
      title: page.seoTitle,
      description: page.seoDescription,
      content: 'A'.repeat(200),
      author: 'MyImageUpscaler Team',
      category: 'Guides',
      tags: ['SEO'],
      seo_title: page.seoTitle,
      seo_description: page.seoDescription,
    });

    expect(result.success).toBe(true);
    expect(page.seoTitle).toBe('24×36 Poster Size in Pixels: 150–300 DPI Chart');
    expect(page.seoDescription).toBe(
      'See exact 24×36 poster dimensions at 150, 200, and 300 DPI, plus minimum resolution, file setup, and when to upscale before printing.'
    );
    expect(page.dpiTableNearTop).toBe(true);
    expect(page.welcomeCreditCopy).toBe('five welcome credits');
    expect(page.welcomeCreditCopy).not.toContain('one-time');
  });

  it('defines a useful restoration comparison without unsupported testing claims', () => {
    const page = RECOVERY_PAGES.restorationComparison;

    expect(page.title).toContain('2026');
    expect(page.seoTitle).not.toContain('Tested');
    expect(page.comparisonColumns).toEqual([
      'restoration tasks',
      'limits',
      'pricing model',
      'privacy',
      'best use case',
    ]);
    expect(page.restorationTasks).toEqual([
      'face restoration',
      'scratch repair',
      'colorization',
      'general enhancement',
    ]);
    expect(page.welcomeCreditCopy).toBe('five welcome credits when you sign up');
    expect(page.welcomeCreditCopy).not.toContain('one-time');
    expect(page.comparisonBasis).toContain('not a hands-on test');
  });

  it('assigns every important query cluster to one unique existing primary page', () => {
    expect(new Set(INTENT_OWNERS.map(([, path]) => path)).size).toBe(INTENT_OWNERS.length);
    expect(INTENT_OWNERS.every(([, path]) => path.startsWith('/'))).toBe(true);
  });

  it('keeps one request-indexing backlog row per URL and records resolved work', () => {
    const backlog = readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8');
    const urls = [...backlog.matchAll(/- \[[ x]\] `(https:\/\/myimageupscaler\.com[^`]+)`/g)].map(
      match => match[1]
    );

    expect(new Set(urls).size).toBe(urls.length);
    expect(backlog).toContain('- [x] `https://myimageupscaler.com/`');
    expect(backlog).toMatch(
      /- \[x\] `https:\/\/myimageupscaler\.com\/blog\/poster-size-dimensions-pixels` — API-resolved \d{4}-\d{2}-\d{2}: `Submitted and indexed`/
    );
    expect(backlog).toContain('- [x] `https://myimageupscaler.com/blog/photo-restoration-program`');
  });
});
