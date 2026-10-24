import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBlogPostSchema } from '@shared/validation/blog.schema';

describe('SEO edit-policy ledger contract', () => {
  const ledger = JSON.parse(readFileSync('docs/SEO/maintenance/three-kings-ledger.json', 'utf8'));
  const entry = ledger.entries.find(
    (item: { url: string }) => item.url === '/blog/best-image-upscaler'
  );
  const row = entry.history.find(
    (item: { dbEditDate?: string }) => item.dbEditDate === '2026-10-12'
  );

  it('starts measurement at first confirmed final exposure without changing the DB date or rung', () => {
    expect(entry.lastEdit >= row.date).toBe(true);
    expect(row.date).toBe('2026-10-15');
    expect(row.dbEditDate).toBe('2026-10-12');
    expect(entry.rung).toBe(3);
    expect(row.rung).toBe(3);
    if (row.outcome) {
      expect(row.outcome.measuredThrough >= '2026-10-29').toBe(true);
    }
    expect(row.liveVerification.status).toBe('verified');
    expect(row.liveVerification.checkedOn).toBe('2026-10-15');
    expect(row.liveVerification.apiUpdatedAt).toBe('2026-10-12T16:46:09.796203+00:00');
  });

  it('keeps the exact prior body and verified replacement hash as rollback anchors', () => {
    expect(createHash('sha256').update(row.previousValue).digest('hex')).toBe(
      'fddb86f4a921147fe9fae9374967e2331873ff470077e4562e51945e9775cf94'
    );
    expect(row.liveVerification.sha256).toBe(
      'f3180ce35db4a0f7b910faa9a2bddae130d2fc66bb4a0efa74e8b84a555473a9'
    );
    expect(row.liveVerification.reason).toContain('corrected closing CTA');
  });
});

describe('SEO edit-policy indexing contract', () => {
  const exposureBacklog = readFileSync(
    'docs/SEO/maintenance/gsc-request-indexing-backlog.md',
    'utf8'
  );

  it('resolves one existing indexing row from post-write crawl evidence, not an invented manual request', () => {
    const rows = exposureBacklog
      .split('\n')
      .filter(line => line.includes('`https://myimageupscaler.com/blog/best-image-upscaler`'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^- \[x\]/);
    expect(rows[0]).toContain('API-resolved 2026-10-15, not a manual request');
    expect(rows[0]).toContain('Submitted and indexed');
    expect(rows[0]).toContain('2026-10-13T17:00:05Z');
    expect(rows[0]).toContain('2026-11-02');
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
      } else {
        expect(rows[0], url).toContain('[x]');
        expect(rows[0], url).toContain('2026-09-03 Three Kings refresh');
      }
    }
  });

  it('records the post-update indexing request as one resolved row', () => {
    const backlog = readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8');
    const rowPattern =
      /- \[[ x]\] `https:\/\/myimageupscaler\.com\/blog\/topaz-labs-free-trial`[^\n]*/g;
    const rows = backlog.match(rowPattern) ?? [];

    expect(rows).toHaveLength(1);
    // Resolved 2026-10-05 via URL Inspection API after the 2026-09-21 rung-2 write.
    expect(rows[0]).toContain('[x]');
    expect(rows[0]).toContain('API-resolved 2026-10-05');
    expect(rows[0]).toContain('2026-09-21');
  });
});

describe('SEO edit-policy approved-copy contract', () => {
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
        "See the Adobe Express image upscaler's export and resolution limits, and compare them with a dedicated free AI upscaler for detail recovery and print-size work.",
      h1: 'Adobe Express Image Upscaler vs MyImageUpscaler',
      intro:
        "The Adobe Express image upscaler is built for quick resizing inside Adobe's design suite — not for recovering fine detail in soft, compressed, or print-bound photos. Here is how its limits compare with a dedicated AI upscaler, and when the extra detail actually matters.",
    },
  } as const;

  const TOPAZ_FREE_TRIAL_SNIPPET = {
    slug: 'topaz-labs-free-trial',
    title: 'Topaz Labs Free Trial 2026: Current Terms and Limits',
    seoDescription:
      'Topaz Labs has no free trial for current Topaz Photo in 2026; you buy first and have a 2-day refund window. Compare legacy, web, and desktop terms.',
    // Tier-safe: the welcome grant is regional (5/3/0), so the published body must not
    // name one tier's number. See tests/unit/seo/capability-claims.unit.spec.ts.
    bodySupport: 'browser-based alternative with welcome credits after signup',
  } as const;

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

  it('uses a truthful answer-led SEO description without reverting the Topaz facts', () => {
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
    expect(TOPAZ_FREE_TRIAL_SNIPPET.seoDescription).toHaveLength(147);
    expect(TOPAZ_FREE_TRIAL_SNIPPET.seoDescription).toMatch(/^Topaz Labs has no free trial/);
    expect(TOPAZ_FREE_TRIAL_SNIPPET.seoDescription).toContain('2-day refund window');
    expect(TOPAZ_FREE_TRIAL_SNIPPET.seoDescription).toContain(
      'Compare legacy, web, and desktop terms'
    );
  });
});
