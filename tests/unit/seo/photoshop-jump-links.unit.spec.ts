import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { updateBlogPostSchema } from '@shared/validation/blog.schema';

const require = createRequire(import.meta.url);
const {
  buildPhotoshopJumpLinkPatch,
  JUMP_LINK_FIXES,
} = require('../../../scripts/seo/photoshop-jump-links.cjs');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const fixes = [
  [
    'when-to-use-neural-filters-after-upscaling',
    'how-to-upscale-an-image-in-photoshop-using-neural-filters',
    'How to Upscale an Image in Photoshop Using Neural Filters',
  ],
  [
    'batch-upscaling-images-in-photoshop',
    'how-to-upscale-multiple-images-in-photoshop-batch-upscaling',
    'How to Upscale Multiple Images in Photoshop (Batch Upscaling)',
  ],
  [
    'photoshop-upscaling-for-print-size-and-300-dpi',
    'how-to-upscale-a-photo-in-photoshop-for-print-300-dpi-guide',
    'How to Upscale a Photo in Photoshop for Print (300 DPI Guide)',
  ],
];
const content =
  '# Photoshop guide\n\nKeep free-offer CTAs, images and metadata unchanged.\n\n' +
  fixes
    .map(
      ([old, , heading]) => `[Jump to method](#${old})\n\n## ${heading}\n\nOriginal instructions.\n`
    )
    .join('\n');
const post = { slug: 'photoshop-upscale-image', status: 'published', content };

describe('Photoshop guide jump-link repair', () => {
  it('repairs all three confirmed dead fragments with a content-only valid PATCH', () => {
    const before = structuredClone(post);
    const patch = buildPhotoshopJumpLinkPatch(post, hash(content));
    expect(Object.keys(patch)).toEqual(['content']);
    expect(updateBlogPostSchema.safeParse(patch).success).toBe(true);
    expect(JUMP_LINK_FIXES).toHaveLength(3);
    for (const [old, target, heading] of fixes) {
      expect(patch.content).not.toContain(`](#${old})`);
      expect(patch.content).toContain(`](#${target})`);
      expect(patch.content).toContain(`## ${heading}`);
    }
    const restored = fixes.reduce(
      (body, [old, target]) => body.replace(`](#${target})`, `](#${old})`),
      patch.content
    );
    expect(restored).toBe(content);
    expect(post).toEqual(before);
  });

  it('preserves every byte except the three fragment destinations', () => {
    const patch = buildPhotoshopJumpLinkPatch(post, hash(content));
    const stripFragments = (value: string) => value.replace(/\]\(#[^)]+\)/g, '](#fragment)');
    expect(stripFragments(patch.content)).toBe(stripFragments(content));
  });

  it('refuses concurrent changes, a different page, and unpublished content', () => {
    expect(() => buildPhotoshopJumpLinkPatch(post, 'unreviewed')).toThrow();
    expect(() =>
      buildPhotoshopJumpLinkPatch({ ...post, slug: 'another' }, hash(content))
    ).toThrow();
    expect(() =>
      buildPhotoshopJumpLinkPatch({ ...post, status: 'draft' }, hash(content))
    ).toThrow();
  });

  it('refuses missing or ambiguous source links and missing destination headings', () => {
    const broken = [
      content.replace(`](#${fixes[0][0]})`, '](#unexpected)'),
      content + `\n[Duplicate](#${fixes[0][0]})`,
      content.replace(`## ${fixes[0][2]}`, '## Renamed heading'),
      content + `\n## ${fixes[0][2]}\n`,
    ];
    for (const candidate of broken) {
      expect(() =>
        buildPhotoshopJumpLinkPatch({ ...post, content: candidate }, hash(candidate))
      ).toThrow();
    }
  });

  it('is idempotent and refuses an old hash on retry', () => {
    const patch = buildPhotoshopJumpLinkPatch(post, hash(content));
    const updated = { ...post, ...patch };
    expect(() => buildPhotoshopJumpLinkPatch(updated, hash(content))).toThrow();
    expect(buildPhotoshopJumpLinkPatch(updated, hash(patch.content))).toEqual({});
  });
});
