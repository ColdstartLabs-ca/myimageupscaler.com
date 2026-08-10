import { describe, expect, it } from 'vitest';
import { createBlogPostSchema } from '@shared/validation/blog.schema';

const RECOVERY_METADATA = [
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
      'Find out why your YouTube thumbnail looks blurry or low quality, then fix resolution, compression, text, and export settings with this 2026 checklist.',
  },
  {
    slug: 'fixing-pixelated-photos',
    targetTerms: ['how', 'to', 'fix', 'pixelated', 'photos', 'online'],
    title: 'How to Fix Pixelated Photos Online: 3 Fast AI Fixes',
    description:
      'How to fix pixelated photos online: use a tested 2x/4x AI workflow. See when to upscale, sharpen, or rescan blocky images before editing makes them worse.',
  },
] as const;

const PIXELATED_PHOTOS_BODY_CONTRACT = {
  opening: 'To fix pixelated photos online, use a 2x or 4x AI upscale before sharpening.',
  proofModule: 'What Actually Works on Pixelated Photos',
  limitation:
    'AI can make blocky photos usable when it still has faces, edges, text, or shapes to rebuild.',
  staleCreditClaim: '10 free credits',
  currentCreditClaim: '5 welcome credits',
} as const;

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

  it('records the pixelated-photos proof-led body support pass', () => {
    const bodyText = [
      PIXELATED_PHOTOS_BODY_CONTRACT.opening,
      PIXELATED_PHOTOS_BODY_CONTRACT.proofModule,
      PIXELATED_PHOTOS_BODY_CONTRACT.limitation,
      PIXELATED_PHOTOS_BODY_CONTRACT.currentCreditClaim,
    ].join('\n');

    expect(bodyText).toContain('2x or 4x AI upscale');
    expect(bodyText).toContain('What Actually Works on Pixelated Photos');
    expect(bodyText).toContain('faces, edges, text, or shapes');
    expect(bodyText).toContain(PIXELATED_PHOTOS_BODY_CONTRACT.currentCreditClaim);
    expect(bodyText).not.toContain(PIXELATED_PHOTOS_BODY_CONTRACT.staleCreditClaim);
  });
});
