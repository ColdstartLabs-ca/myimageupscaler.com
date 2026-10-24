import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

describe('Comparison proof and metadata preservation', () => {
  const require = createRequire(import.meta.url);
  const {
    BEST_AI_UPSCALER_EVIDENCE,
    BEST_IMAGE_UPSCALER_PRIOR_SEO_DESCRIPTION,
    TOPAZ_VIDEO_EVIDENCE,
    applyBestAiUpscalerRung3,
    applyTopazVideoUpscalerRung3,
    revertBestImageUpscalerRung2,
  } = require('../../fixtures/seo/comparison-proof.cjs');

  describe('2026-09-24 Three Kings actions', () => {
    it('adds one above-fold evidence module to the best AI upscaler article', () => {
      const anchor =
        'This comparison ranks each AI upscaler by output quality, artifacts, free limits, speed, privacy, and best use case so you can choose the right tool before uploading an image.\n\n';
      const content = `${anchor}## Quick Answer: Best AI Image Upscaler Websites in 2026`;

      const updated = applyBestAiUpscalerRung3({ content });

      expect(updated.content).toContain(BEST_AI_UPSCALER_EVIDENCE);
      expect(updated.content.indexOf(BEST_AI_UPSCALER_EVIDENCE)).toBeLessThan(
        updated.content.indexOf('## Quick Answer')
      );
      expect(updated.content.match(/### What the 12-tool comparison checks/g)).toHaveLength(1);
    });

    it('adds one direct Personal-vs-Pro evidence module to the Topaz article', () => {
      const anchor =
        'Topaz is still the serious option for controlled restoration, stabilization, frame interpolation, and high-quality video enhancement, but it is not always the fastest or cheapest path for a one-off clip.\n\n';
      const content = `${anchor}| Option | Best fit |`;

      const updated = applyTopazVideoUpscalerRung3({ content });

      expect(updated.content).toContain(TOPAZ_VIDEO_EVIDENCE);
      expect(updated.content.indexOf(TOPAZ_VIDEO_EVIDENCE)).toBeLessThan(
        updated.content.indexOf('| Option | Best fit |')
      );
      expect(
        updated.content.match(/### Direct answer: Topaz Video vs Topaz Video Pro/g)
      ).toHaveLength(1);
    });

    it('fails closed when a rung-3 anchor is missing or duplicated', () => {
      expect(() => applyBestAiUpscalerRung3({ content: 'wrong body' })).toThrow(
        'anchor count must be 1'
      );
      expect(() =>
        applyTopazVideoUpscalerRung3({
          content:
            'Topaz is still the serious option for controlled restoration, stabilization, frame interpolation, and high-quality video enhancement, but it is not always the fastest or cheapest path for a one-off clip.\n\n'.repeat(
              2
            ),
        })
      ).toThrow('anchor count must be 1');
    });

    it('restores the exact recorded pre-rung-2 best-image-upscaler description', () => {
      const updated = revertBestImageUpscalerRung2({
        seo_description: 'failed experiment',
        title: 'unchanged',
      });

      expect(updated.seo_description).toBe(BEST_IMAGE_UPSCALER_PRIOR_SEO_DESCRIPTION);
      expect(updated.title).toBe('unchanged');
    });

    it('keeps one truthful indexing row per affected URL', () => {
      const backlog = fs.readFileSync(
        path.resolve(process.cwd(), 'docs/SEO/maintenance/gsc-request-indexing-backlog.md'),
        'utf8'
      );

      for (const slug of ['best-ai-upscaler', 'topaz-video-upscaler', 'best-image-upscaler']) {
        const url = `https://myimageupscaler.com/blog/${slug}`;
        const rows = backlog.split('\n').filter(line => line.includes(`\`${url}\``));
        expect(rows, url).toHaveLength(1);
        expect(rows[0], url).toMatch(/^- \[( |x)\]/);
        if (rows[0].startsWith('- [x]')) {
          expect(rows[0], url).toMatch(
            /API-resolved.*successful crawl|indexing requested.*confirmed/
          );
        }
        expect(rows[0], url).toContain('2026-09-24');
      }
    });
  });
});

describe('Thumbnail evidence and source preservation', () => {
  const require = createRequire(import.meta.url);
  const { applyYoutubeThumbnailRung3 } = require('../../fixtures/seo/thumbnail-proof.cjs');
  const opening =
    '**Quick answer:** YouTube thumbnails usually look blurry or low quality because the source is below 1280×720, text was rasterized before resizing, the export was heavily compressed, or YouTube recompressed the upload. Fix the source first, use 2560×1440 when possible, keep text and logos crisp, and upscale only genuinely low-resolution images before export.';
  const content = `# Why Your YouTube Thumbnail Looks Blurry or Low Quality\n\n${opening}\n\nUse the checklist below to identify the cause, then follow the two-minute repair workflow.\n\n---\n\n## Why YouTube Thumbnails Look Blurry\n\nYouTube recommends uploading thumbnails at 1280x720 pixels in JPG, PNG, or GIF format, with a file size limit of 2MB. Sounds straightforward. But several things can go wrong between your design software and what viewers actually see.\n\n- Always export at exactly 1280x720 (16:9 ratio)\n- If you are over the 2MB limit, try lightly compressed JPG at 80% quality\n\n[Try our AI upscaler on your thumbnail](/tools/ai-image-upscaler) — results in seconds, no account required.\n\n![existing image](https://example.com/image.webp)\n\n## Unchanged section\n\nKeep this body and link [intact](/blog/example).`;

  describe('2026-10-05 YouTube thumbnail rung 3', () => {
    it('adds an above-fold diagnostic proof module, not an invented benchmark', () => {
      const updated = applyYoutubeThumbnailRung3({ content });
      expect(updated.content).toContain('### Prove where the thumbnail loses clarity');
      expect(updated.content.indexOf('### Prove')).toBeLessThan(updated.content.indexOf('## Why'));
      expect(updated.content).toContain('Original → export → YouTube');
      expect(updated.content).toContain('Changing only DPI metadata does not add pixels');
      expect(updated.content).not.toContain('we tested');
    });

    it('corrects contradictory upload and guest claims within the same body field', () => {
      const updated = applyYoutubeThumbnailRung3({ content });
      expect(updated.content).toContain('3840×2160');
      expect(updated.content).toContain('50 MB');
      expect(updated.content).toContain('2 MB');
      expect(updated.content).toContain('https://support.google.com/youtube/answer/72431');
      expect(updated.content).toContain('account required');
      expect(updated.content).not.toContain('no account required');
      expect(updated.content).not.toContain('Always export at exactly 1280x720');
    });

    it('preserves metadata, H1, existing media, links, and unrelated body sections', () => {
      const post = {
        content,
        title: 'Keep title',
        seo_title: 'Keep SEO title',
        seo_description: 'Keep meta',
        slug: 'keep-slug',
      };
      const updated = applyYoutubeThumbnailRung3(post);
      const { content: ignored, ...fields } = updated;
      const { content: original, ...priorFields } = post;
      expect(fields).toEqual(priorFields);
      expect(
        updated.content.startsWith('# Why Your YouTube Thumbnail Looks Blurry or Low Quality')
      ).toBe(true);
      expect(updated.content).toContain('![existing image](https://example.com/image.webp)');
      expect(updated.content).toContain(
        '## Unchanged section\n\nKeep this body and link [intact](/blog/example).'
      );
    });

    it('fails closed for missing or duplicated opening anchors', () => {
      expect(() => applyYoutubeThumbnailRung3({ content: 'unexpected body' })).toThrow(
        'anchor count must be 1'
      );
      expect(() => applyYoutubeThumbnailRung3({ content: content + opening })).toThrow(
        'anchor count must be 1'
      );
    });

    it('refuses a second application of the same rung', () => {
      const once = applyYoutubeThumbnailRung3({ content });
      expect(() => applyYoutubeThumbnailRung3(once)).toThrow('evidence module already exists');
    });
  });
});

describe('Credit policy and proof exposure', () => {
  const require = createRequire(import.meta.url);
  const { applyBestImageUpscalerRung3 } = require('../../fixtures/seo/free-upscaler-proof.cjs');
  const opening =
    '**Quick answer:** The best image upscaling software depends on your workflow: use a free web tool for quick 2x–8x enlargements, or pro desktop software for RAW editing, privacy, batch processing, and print controls. This guide compares 12 free and paid tools for 2026.';
  const body = `${opening}\n\n| Workflow | Best Fit | Why |\n\n## Existing tools\n\nGet **10 free credits**. The free trial is limited to 10 credits.\n\n![existing image](https://example.com/keep.webp)\n\n[free comparison](/blog/best-free-ai-image-upscaler-2026-tested-compared)\n\n[Try upscaling](/) and use your 10 free credits today.`;

  describe('2026-10-12 best-image-upscaler rung 3', () => {
    it('puts a reproducible software-selection evidence module above the workflow table', () => {
      const result = applyBestImageUpscalerRung3({ content: body });
      expect(result.content).toContain('### Check the evidence before choosing upscaling software');
      expect(result.content.indexOf('### Check the evidence')).toBeLessThan(
        result.content.indexOf('| Workflow |')
      );
      expect(result.content).toContain('same source file');
      expect(result.content).toContain('same output dimensions');
      expect(result.content).not.toMatch(/we tested|guaranteed|only 3 worked/i);
    });

    it('answers PNG algorithm intent with primary-source support, without retargeting the free comparison', () => {
      const result = applyBestImageUpscalerRung3({ content: body });
      expect(result.content).toContain('PNG is a file format, not an upscaling algorithm');
      expect(result.content).toContain('https://www.w3.org/TR/png-3/');
      expect(result.content).toContain('transparency');
      expect(result.content).toContain('/blog/best-free-ai-image-upscaler-2026-tested-compared');
    });

    it('uses computed resolution proof and verification steps instead of invented vendor benchmarks', () => {
      const result = applyBestImageUpscalerRung3({ content: body });
      expect(result.content).toContain('4000×3000');
      expect(result.content).toContain('8000×6000');
      expect(result.content).toContain('four times the pixel count');
      expect(result.content).not.toContain('Adobe documents');
      expect(result.content).toContain('local processing');
      expect(result.content).toMatch(/renewal/i);
    });

    it('changes content only, preserving metadata, media and the support-owner link', () => {
      const post = {
        content: body,
        title: 'Unchanged',
        seo_title: 'Unchanged SEO',
        seo_description: 'Unchanged meta',
        slug: 'best-image-upscaler',
        status: 'published',
      };
      const result = applyBestImageUpscalerRung3(post);
      expect({ ...result, content: body }).toEqual(post);
      expect(result.content).toContain('## Existing tools');
      expect(result.content).toContain('![existing image](https://example.com/keep.webp)');
      expect(result.content).not.toContain('10 free credits');
      expect(result.content).not.toContain('limited to 10 credits');
      expect(result.content).toContain('free-credit availability varies by region');
    });

    it('preserves unrelated vendor sections rather than rewriting from unverified sources', () => {
      const unchanged = '\n## Existing vendor details\n\nPreserve the original details.';
      const result = applyBestImageUpscalerRung3({ content: body + unchanged });
      expect(result.content.endsWith(unchanged)).toBe(true);
    });

    it('preserves the exact production rollback body and verifies the recorded replacement hash', () => {
      const ledger = JSON.parse(
        fs.readFileSync('docs/SEO/maintenance/three-kings-ledger.json', 'utf8')
      );
      const entry = ledger.entries.find(
        (item: { url: string }) => item.url === '/blog/best-image-upscaler'
      );
      const row = entry.history.find(
        (item: { dbEditDate?: string }) => item.dbEditDate === '2026-10-12'
      );
      expect(row.rung).toBe(3);
      expect(row.field).toBe('proof-led body pass');
      expect(createHash('sha256').update(row.previousValue).digest('hex')).toBe(
        'fddb86f4a921147fe9fae9374967e2331873ff470077e4562e51945e9775cf94'
      );
      const replacement = applyBestImageUpscalerRung3({ content: row.previousValue });
      expect(createHash('sha256').update(replacement.content).digest('hex')).toBe(
        row.liveVerification.sha256
      );
      expect(row.backup.verified).toContain('gzip -t');
    });

    it('keeps exactly one indexing row for the new production edit', () => {
      const backlog = fs.readFileSync(
        'docs/SEO/maintenance/gsc-request-indexing-backlog.md',
        'utf8'
      );
      const rows = backlog
        .split('\n')
        .filter(line => line.includes('`https://myimageupscaler.com/blog/best-image-upscaler`'));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toContain('2026-10-12');
      expect(rows[0]).toMatch(/not yet requested|API-resolved|indexing requested.*confirmed/i);
    });

    it('fails closed on missing or duplicated anchors and repeated application', () => {
      expect(() => applyBestImageUpscalerRung3({ content: 'unexpected' })).toThrow(
        'anchor count must be 1'
      );
      expect(() => applyBestImageUpscalerRung3({ content: body + opening })).toThrow(
        'anchor count must be 1'
      );
      expect(() =>
        applyBestImageUpscalerRung3(applyBestImageUpscalerRung3({ content: body }))
      ).toThrow('evidence module already exists');
    });
  });
});

describe('Rollback and content recovery', () => {
  const require = createRequire(import.meta.url);
  const { repairPost } = require('../../fixtures/seo/blog-recovery.cjs');

  const cases = {
    bestFree: {
      slug: 'best-free-ai-image-upscaler-2026-tested-compared',
      description:
        'Find the best free AI image upscaler for 2026: we tested 12 and only 3 produced clean results. Compare no-signup limits, watermarks, 4K/8K output, and speed.',
      seo_description:
        'Find the best free AI image upscaler for 2026: we tested 12 and only 3 produced clean results. Compare no-signup limits, watermarks, 4K/8K output, and speed.',
      content: `# Best Free AI Image Upscaler 2026: Only 3 Worked

Existing evidence-led opening.

## What Our 2026 Test Actually Found

| Result | Evidence |
|---|---|
| Only three worked | Test result |

## What Makes the Best Free AI Image Upscaler?

Keep this section and 5 welcome credits.`,
    },
    pixelated: {
      slug: 'fixing-pixelated-photos',
      description:
        'How to fix pixelated photos online: use a tested 2x/4x AI workflow. See when to upscale, sharpen, or rescan blocky images before editing makes them worse.',
      seo_description:
        'How to fix pixelated photos online: use a tested 2x/4x AI workflow. See when to upscale, sharpen, or rescan blocky images before editing makes them worse.',
      content: `To fix pixelated photos online, use a 2x or 4x AI upscale before sharpening. Pixelation is usually a missing-resolution problem, so a normal sharpen filter often makes the square blocks harsher. The clean workflow is: identify whether the source is small, compressed, cropped, or scanned; enlarge it with an AI upscaler; inspect faces, text, and edges at 100%; then sharpen only if the upscaled result is still soft.

## Quick Fix: Repair a Pixelated Photo Online

Keep this section.

## What Actually Works on Pixelated Photos

Remove this failed proof module.

## Understanding Why Your Photos Look Pixelated

Keep this section and 5 welcome credits.`,
    },
    restoration: {
      slug: 'photo-restoration-program',
      description: 'Existing truthful description',
      seo_description: 'Existing truthful SEO description',
      content: `Opening.

## What Is a Photo Restoration Program?

Keep this section.

## Best Photo Restoration Programs Compared

| Program | Evidence |
|---|---|
| Example | Published policy |

## How the AI Behind Photo Restoration Works

Keep this section and five welcome credits.`,
    },
  } as const;

  describe('Three Kings regression repair', () => {
    it('reverts the failed best-free meta/H1/proof experiment without restoring stale credit copy', () => {
      const repaired = repairPost(cases.bestFree);

      expect(repaired.description).toBe(
        'Best free AI image upscaler 2026: we tested 12 tools for quality, speed, no signup, no watermark, and 4K/8K output. See winners and try free.'
      );
      expect(repaired.seo_description).toBe(repaired.description);
      expect(repaired.content).toContain('# Best Free AI Image Upscaler Online 2026: 12 Tested');
      expect(repaired.content).not.toContain('What Our 2026 Test Actually Found');
      expect(repaired.content).toContain('What Makes the Best Free AI Image Upscaler?');
      expect(repaired.content).toContain('5 welcome credits');
      expect(repaired.content).not.toContain('10 free credits');
    });

    it('restores the prior pixelated-photo meta/opening and removes only the failed proof module', () => {
      const repaired = repairPost(cases.pixelated);

      expect(repaired.description).toBe(
        'Learn how to fix pixelated photos online in 3 steps: upscale, sharpen, or rescan blocky images, then try the free AI upscaler.'
      );
      expect(repaired.seo_description).toBe(repaired.description);
      expect(repaired.content).toMatch(/^To fix pixelated photos, start by upscaling the image/);
      expect(repaired.content).not.toContain('What Actually Works on Pixelated Photos');
      expect(repaired.content).toContain('Understanding Why Your Photos Look Pixelated');
      expect(repaired.content).toContain('5 welcome credits');
      expect(repaired.content).not.toContain('10 free credits');
    });

    it('removes the failed restoration comparison while preserving truthful metadata and later body', () => {
      const repaired = repairPost(cases.restoration);

      expect(repaired.description).toBe(cases.restoration.description);
      expect(repaired.seo_description).toBe(cases.restoration.seo_description);
      expect(repaired.content).not.toContain('Best Photo Restoration Programs Compared');
      expect(repaired.content).toContain('How the AI Behind Photo Restoration Works');
      expect(repaired.content).toContain('five welcome credits');
    });

    it('fails closed when the expected experiment anchors are missing', () => {
      expect(() => repairPost({ ...cases.bestFree, content: 'unexpected body' })).toThrow(
        /expected current H1/
      );
    });
  });
});
