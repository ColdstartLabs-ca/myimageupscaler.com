import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBlogPostSchema } from '@shared/validation/blog.schema';

const REPORT_REFRESH = {
  poster: {
    slug: 'poster-size-dimensions-pixels',
    title: 'Poster Size in Pixels: 150–300 DPI Chart (24×36 & More)',
    description:
      "A poster's size in pixels depends on two things: print size and DPI (pixels = inches × DPI). A 24×36 poster is 7,200 × 10,800 px at 300 DPI, or 3,600 × 5,400 px at 150. Below are charts for every common poster size at 150, 200, and 300 DPI, plus when to upscale before printing. Try free now.",
    seoDescription:
      'Poster size in pixels = inches × DPI. See charts for 24×36, 18×24, A-series and more at 150, 200, and 300 DPI, plus minimum print resolution tips.',
  },
  photoshop: {
    slug: 'photoshop-upscale-image',
    title: 'How to Upscale Images in Photoshop: Preserve Details vs Super Resolution',
    seoTitle: 'How to Upscale an Image in Photoshop [2026]',
    description:
      'To upscale an image in Photoshop, open it, go to Image → Image Size, turn on Resample, and pick Preserve Details 2.0 for the sharpest result. This guide covers every method — Preserve Details 2.0, Super Resolution, Neural Filters, batch processing, and print sizing — and when each one is worth using.',
  },
  adobe: {
    slug: 'vs-adobe-express',
    metaTitle: 'Adobe Express Image Upscaler: Limits & Free Alternative',
    metaDescription:
      "See the Adobe Express image upscaler's export and resolution limits, and compare them with a dedicated free AI upscaler for detail recovery and print-size work.",
    h1: 'Adobe Express Image Upscaler vs MyImageUpscaler',
    intro:
      "The Adobe Express image upscaler is built for quick resizing inside Adobe's design suite — not for recovering fine detail in soft, compressed, or print-bound photos. Here is how its limits compare with a dedicated AI upscaler, and when the extra detail actually matters.",
  },
} as const;

describe('2026-09-03 Three Kings refresh contract', () => {
  it('keeps both blog refreshes valid and puts the target phrase first', () => {
    for (const page of [REPORT_REFRESH.poster, REPORT_REFRESH.photoshop]) {
      const result = createBlogPostSchema.safeParse({
        slug: page.slug,
        title: page.title,
        description: page.description,
        content: 'A'.repeat(200),
        author: 'MyImageUpscaler Team',
        category: 'Guides',
        tags: ['SEO'],
        seo_title: 'seoTitle' in page ? page.seoTitle : page.title,
        seo_description:
          'seoDescription' in page ? page.seoDescription : page.description.slice(0, 150),
      });

      expect(result.success, page.slug).toBe(true);
    }

    expect(REPORT_REFRESH.poster.title).toMatch(/^Poster Size in Pixels:/);
    expect(REPORT_REFRESH.poster.description).toMatch(/^A poster's size in pixels/);
    expect(REPORT_REFRESH.poster.title).toHaveLength(55);
    expect(REPORT_REFRESH.poster.seoDescription.length).toBeLessThanOrEqual(160);
    expect(REPORT_REFRESH.photoshop.description).toMatch(/^To upscale an image in Photoshop,/);
  });

  it('applies the approved Adobe Express title, meta description, and intro in pSEO data', () => {
    const alternatives = JSON.parse(readFileSync('app/seo/data/alternatives.json', 'utf8')) as {
      pages: Array<Record<string, string>>;
    };
    const page = alternatives.pages.find(candidate => candidate.slug === REPORT_REFRESH.adobe.slug);

    expect(page).toBeDefined();
    expect(page?.metaTitle).toBe(REPORT_REFRESH.adobe.metaTitle);
    expect(page?.metaDescription).toBe(REPORT_REFRESH.adobe.metaDescription);
    expect(page?.h1).toBe(REPORT_REFRESH.adobe.h1);
    expect(page?.intro).toBe(REPORT_REFRESH.adobe.intro);
    expect(page?.metaTitle).toHaveLength(55);
    expect(page?.metaDescription.length).toBeLessThanOrEqual(160);
  });

  it('queues each changed URL exactly once for manual request indexing', () => {
    const backlog = readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8');
    const urls = [
      'https://myimageupscaler.com/blog/poster-size-dimensions-pixels',
      'https://myimageupscaler.com/alternatives/vs-adobe-express',
      'https://myimageupscaler.com/blog/photoshop-upscale-image',
    ];

    for (const url of urls) {
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rows =
        backlog.match(new RegExp('- \\[([ x])\\] `' + escapedUrl + '`[^\\n]*', 'g')) ?? [];

      expect(rows, url).toHaveLength(1);
      expect(rows[0], url).toContain('[ ]');
      expect(rows[0], url).toContain('2026-09-03 Three Kings refresh');
    }
  });
});
