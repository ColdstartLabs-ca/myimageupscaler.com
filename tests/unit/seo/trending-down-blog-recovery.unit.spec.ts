import { describe, expect, it } from 'vitest';
import { createBlogPostSchema } from '@shared/validation/blog.schema';

const RECOVERY_METADATA = [
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
      'Find out why your YouTube thumbnail looks blurry or low quality, then fix resolution, compression, text, and export settings with this 2026 checklist.',
  },
] as const;

describe('Trending-down blog SERP recovery metadata', () => {
  it('keeps each title and description within the enforced SERP ranges', () => {
    for (const recovery of RECOVERY_METADATA) {
      const result = createBlogPostSchema.safeParse({
        slug: recovery.slug,
        title: recovery.title,
        description: recovery.description,
        content: 'A'.repeat(200),
        author: 'MyImageUpscaler Team',
        category: 'Guides',
        tags: ['SEO'],
        seo_title: recovery.title,
        seo_description: recovery.description,
      });

      expect(result.success, recovery.slug).toBe(true);
      expect(recovery.title.length, recovery.slug).toBeGreaterThanOrEqual(30);
      expect(recovery.title.length, recovery.slug).toBeLessThanOrEqual(60);
      expect(recovery.description.length, recovery.slug).toBeGreaterThanOrEqual(120);
      expect(recovery.description.length, recovery.slug).toBeLessThanOrEqual(160);
    }
  });

  it('keeps the GSC-backed query language in the title and description', () => {
    for (const recovery of RECOVERY_METADATA) {
      const title = recovery.title.toLowerCase();
      const description = recovery.description.toLowerCase();

      for (const term of recovery.targetTerms) {
        expect(title, `${recovery.slug} title missing ${term}`).toContain(term);
        expect(description, `${recovery.slug} description missing ${term}`).toContain(term);
      }
    }
  });

  it('uses distinct titles for the two different search intents', () => {
    expect(new Set(RECOVERY_METADATA.map(recovery => recovery.title)).size).toBe(
      RECOVERY_METADATA.length
    );
  });
});
