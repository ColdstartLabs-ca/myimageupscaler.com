import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { repairPost } = require('../../../scripts/seo/three-kings-regression-repair.cjs');

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
