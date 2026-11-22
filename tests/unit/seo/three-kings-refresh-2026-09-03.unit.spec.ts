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
    bodyPass: {
      directAnswer:
        'For a 24x36 poster, use **7200 x 10800 pixels at 300 PPI** for close viewing, **4800 x 7200 pixels at 200 PPI**, or **3600 x 5400 pixels at 150 PPI** for posters viewed several feet away.',
      evidence:
        'A 4000 x 3000 landscape image printed at 36 x 24 inches provides about **111 PPI** on its limiting side—not 300 PPI just because the file metadata says 300 DPI.',
    },
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
      'Adobe Express image upscaler limits at a glance: limited free features and basic resizing vs. dedicated AI detail recovery with free credits. Compare both.',
    h1: 'Adobe Express Image Upscaler vs MyImageUpscaler',
    intro:
      'At a glance: Adobe Express gives limited free features and design-suite resizing, while MyImageUpscaler gives new accounts free credits for dedicated AI detail recovery. The Adobe Express image upscaler is built for quick resizing, not for soft, compressed, or print-bound photos. Here is how its limits compare, and when the extra detail matters.',
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
    expect(REPORT_REFRESH.poster.bodyPass.directAnswer).toContain('7200 x 10800 pixels at 300 PPI');
    expect(REPORT_REFRESH.poster.bodyPass.evidence).toContain('about **111 PPI**');
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
      if (url.endsWith('/blog/poster-size-dimensions-pixels')) {
        // Resolved 2026-10-05 via URL Inspection API after the 2026-09-21 rung-3 write.
        expect(rows[0], url).toContain('[x]');
        expect(rows[0], url).toContain('API-resolved 2026-10-05');
      } else if (url.endsWith('/blog/photoshop-upscale-image')) {
        // The Sep 4 request remains accepted; a later repair can reopen the same row.
        expect(rows[0], url).toContain('2026-09-04');
        expect(rows[0], url).toContain('visibly accepted in the priority crawl queue');
        if (rows[0].startsWith('- [ ]')) {
          expect(rows[0], url).toContain('Reopened 2026-11-16: HOLD indexing');
          expect(rows[0], url).toContain('normal public HTML');
          expect(rows[0], url).toContain('2026-11-19');
          expect(rows[0], url).toContain(
            '9d9b92103fc566f838b221d065ac527a30825f0e2212a762ad88d6a0fa0132d2'
          );
          expect(rows[0], url).toMatch(/no .*manual indexing request/i);
        } else {
          expect(rows[0], url).toContain('[x]');
        }
      } else {
        expect(rows[0], url).toContain('[x]');
        expect(rows[0], url).toContain('2026-09-03 Three Kings refresh');
      }
    }
  });
});
