import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { updateBlogPostSchema } from '@shared/validation/blog.schema';

const require = createRequire(import.meta.url);
const { buildInternalLinkPatch, INSERT_AFTER, LINK_SENTENCE, TARGET_PATH } = require(
  '../../../scripts/seo/print-format-internal-link.cjs'
);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const post = {
  slug: 'what-resolution-for-print',
  status: 'published',
  title: '8x10 Print Resolution: DPI and Pixels',
  seo_title: '8x10 Print Resolution: DPI and Pixels',
  content: `# Print resolution\n\nOpening, charts, images and free-offer CTAs remain unchanged.\n\n${INSERT_AFTER}\n\n- **Order a test print** before buying a full run.\n\n> [!CTA_DEMO]\n`,
};

describe('contextual print-to-format internal link', () => {
  it('adds exactly one contextual link through a content-only schema-valid PATCH', () => {
    const before = structuredClone(post);
    const patch = buildInternalLinkPatch(post, hash(post.content));
    expect(Object.keys(patch)).toEqual(['content']);
    expect(updateBlogPostSchema.safeParse(patch).success).toBe(true);
    expect(patch.content.split(TARGET_PATH)).toHaveLength(2);
    expect(patch.content.replace(`\n\n${LINK_SENTENCE}`, '')).toBe(post.content);
    expect(patch.content).toContain(`${INSERT_AFTER}\n\n${LINK_SENTENCE}\n`);
    expect(post).toEqual(before);
  });

  it('refuses an unreviewed body, wrong page, draft, or missing/ambiguous anchor', () => {
    expect(() => buildInternalLinkPatch(post, 'unreviewed')).toThrow();
    expect(() => buildInternalLinkPatch({ ...post, slug: 'another' }, hash(post.content))).toThrow();
    expect(() => buildInternalLinkPatch({ ...post, status: 'draft' }, hash(post.content))).toThrow();
    for (const content of [post.content.replace(INSERT_AFTER, ''), post.content + INSERT_AFTER]) {
      expect(() => buildInternalLinkPatch({ ...post, content }, hash(content))).toThrow();
    }
  });

  it('tracks the changed source once, without restarting a destination snippet experiment', () => {
    const backlog = readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8');
    const rows = backlog.split('\n').filter(
      line => line.startsWith('- [') && line.includes('`https://myimageupscaler.com/blog/what-resolution-for-print`')
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^- \[[ x]\]/);
    expect(rows[0]).toContain('Reopened 2026-10-26');
    expect(rows[0]).toContain('2026-11-13');
    expect(rows[0]).toContain('no manual request claimed');
    const changelog = readFileSync('.claude/skills/blog-changelog.md', 'utf8');
    expect(changelog).toContain('what-resolution-for-print → best-high-resolution-image-format');
    expect(changelog).toContain('Only `content` and `updated_at` changed');
  });

  it('does not duplicate a link or overwrite a concurrent edit on retry', () => {
    const patch = buildInternalLinkPatch(post, hash(post.content));
    expect(() => buildInternalLinkPatch({ ...post, ...patch }, hash(post.content))).toThrow();
    expect(buildInternalLinkPatch({ ...post, ...patch }, hash(patch.content))).toEqual({});
  });
});
