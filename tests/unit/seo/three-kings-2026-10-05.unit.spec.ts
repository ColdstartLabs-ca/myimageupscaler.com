import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { applyYoutubeThumbnailRung3 } = require('../../../scripts/seo/three-kings-2026-10-05.cjs');
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
