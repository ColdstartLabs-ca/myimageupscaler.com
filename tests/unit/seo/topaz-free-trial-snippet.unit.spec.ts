import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBlogPostSchema } from '@shared/validation/blog.schema';

const TOPAZ_FREE_TRIAL_SNIPPET = {
  slug: 'topaz-labs-free-trial',
  title: 'Topaz Labs Free Trial 2026: Current Terms and Limits',
  seoDescription:
    'Need a Topaz free-trial alternative? Topaz Photo has no current trial, but MyImageUpscaler lets you upscale and enhance images in your browser.',
  bodySupport: 'browser-based alternative with five welcome credits after signup',
} as const;

describe('Topaz free-trial snippet recovery contract', () => {
  it('uses a truthful alternative-led SEO description without reverting the Topaz facts', () => {
    const result = createBlogPostSchema.safeParse({
      slug: TOPAZ_FREE_TRIAL_SNIPPET.slug,
      title: TOPAZ_FREE_TRIAL_SNIPPET.title,
      description: TOPAZ_FREE_TRIAL_SNIPPET.seoDescription,
      content: `Topaz Labs no longer offers a conventional free trial. Try a ${TOPAZ_FREE_TRIAL_SNIPPET.bodySupport}.`,
      author: 'MyImageUpscaler Team',
      category: 'Comparisons',
      tags: ['Topaz', 'free trial', 'AI upscaler'],
      seo_title: TOPAZ_FREE_TRIAL_SNIPPET.title,
      seo_description: TOPAZ_FREE_TRIAL_SNIPPET.seoDescription,
    });

    expect(result.success).toBe(true);
    expect(TOPAZ_FREE_TRIAL_SNIPPET.seoDescription).toHaveLength(143);
    expect(TOPAZ_FREE_TRIAL_SNIPPET.seoDescription).toMatch(
      /^Need a Topaz free-trial alternative\?/
    );
    expect(TOPAZ_FREE_TRIAL_SNIPPET.seoDescription).toContain('Topaz Photo has no current trial');
    expect(TOPAZ_FREE_TRIAL_SNIPPET.seoDescription).toContain(
      'MyImageUpscaler lets you upscale and enhance images in your browser'
    );
    expect(TOPAZ_FREE_TRIAL_SNIPPET.seoDescription).not.toMatch(
      /^Topaz Photo has no current free trial\./
    );
  });

  it('records the post-update indexing request as one pending row', () => {
    const backlog = readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8');
    const rowPattern =
      /- \[[ x]\] `https:\/\/myimageupscaler\.com\/blog\/topaz-labs-free-trial`[^\n]*/g;
    const rows = backlog.match(rowPattern) ?? [];

    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('[ ]');
    expect(rows[0]).toContain('2026-08-31');
    expect(rows[0]).toContain('Topaz free-trial snippet recovery');
  });
});
