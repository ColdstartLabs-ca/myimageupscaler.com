import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  BEST_AI_UPSCALER_EVIDENCE,
  BEST_IMAGE_UPSCALER_PRIOR_SEO_DESCRIPTION,
  TOPAZ_VIDEO_EVIDENCE,
  applyBestAiUpscalerRung3,
  applyTopazVideoUpscalerRung3,
  revertBestImageUpscalerRung2,
} = require('../../../scripts/seo/three-kings-2026-09-24.cjs');

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

  it('keeps one pending indexing row per affected URL', () => {
    const backlog = fs.readFileSync(
      path.resolve(process.cwd(), 'docs/SEO/maintenance/gsc-request-indexing-backlog.md'),
      'utf8'
    );

    for (const slug of ['best-ai-upscaler', 'topaz-video-upscaler', 'best-image-upscaler']) {
      const url = `https://myimageupscaler.com/blog/${slug}`;
      const rows = backlog.split('\n').filter(line => line.includes(`\`${url}\``));
      expect(rows, url).toHaveLength(1);
      expect(rows[0], url).toContain('- [ ]');
      expect(rows[0], url).toContain('2026-09-24');
    }
  });
});
