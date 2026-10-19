import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { updateBlogPostSchema } from '@shared/validation/blog.schema';

const require = createRequire(import.meta.url);
const {
  buildTitlePatch,
  SEO_TITLE,
  PREVIOUS_TITLE,
} = require('../../../scripts/seo/tiktok-pfp-title.cjs');
const post = {
  slug: 'tiktok-profile-picture-ideas',
  status: 'published',
  seo_title: '8 TikTok Profile Picture Ideas to Stand Out in 2026',
  title: '8 TikTok Profile Picture Ideas to Stand Out in 2026',
  content: 'Existing eight styles, media, credit copy and CTAs stay unchanged.',
  description: 'Existing description remains unchanged.',
  seo_description: 'Existing SEO description remains unchanged.',
};

describe('TikTok PFP single-variable title experiment', () => {
  it('patches only the SERP title and passes the real API update schema', () => {
    const before = structuredClone(post);
    const patch = buildTitlePatch(post);
    expect(patch).toEqual({ seo_title: 'TikTok Profile Picture Ideas: 8 PFP Styles (2026)' });
    expect(updateBlogPostSchema.safeParse(patch).success).toBe(true);
    expect(post).toEqual(before);
    expect({ ...post, ...patch, seo_title: PREVIOUS_TITLE }).toEqual(post);
  });

  it('keeps the canonical intent and eight-style promise within the title limit', () => {
    expect(SEO_TITLE).toMatch(/^TikTok Profile Picture Ideas:/);
    expect(SEO_TITLE).toContain('8 PFP Styles');
    expect(SEO_TITLE.length).toBeLessThanOrEqual(60);
    expect(SEO_TITLE).not.toMatch(/tested|best|free|no signup|download/i);
  });

  it('does not overwrite a concurrent edit or touch another/unpublished post', () => {
    expect(() =>
      buildTitlePatch({ ...post, seo_title: 'A newer title by another editor' })
    ).toThrow();
    expect(() => buildTitlePatch({ ...post, slug: 'another-post' })).toThrow();
    expect(() => buildTitlePatch({ ...post, status: 'draft' })).toThrow();
  });

  it('is idempotent once the title is applied', () => {
    expect(buildTitlePatch({ ...post, seo_title: SEO_TITLE })).toEqual({});
  });

  it('records one reversible rung and a single indexing row after public exposure', () => {
    const ledger = JSON.parse(readFileSync('docs/SEO/maintenance/three-kings-ledger.json', 'utf8'));
    const entry = ledger.entries.find(
      (item: { url: string }) => item.url === '/blog/tiktok-profile-picture-ideas'
    );
    expect(entry.rung).toBeGreaterThanOrEqual(1);
    const experiment = entry.history.filter((item: { date: string }) => item.date === '2026-10-19');
    expect(experiment).toHaveLength(1);
    expect(experiment[0]).toMatchObject({
      rung: 1,
      field: 'seo_title',
      previousValue: PREVIOUS_TITLE,
      liveVerification: { status: 'verified', checkedOn: '2026-10-19' },
    });
    const rows = readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8')
      .split('\n')
      .filter(
        (line: string) =>
          line.startsWith('- [') && line.includes('/blog/tiktok-profile-picture-ideas`')
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('2026-10-19');
    expect(rows[0]).toContain('2026-11-06');
  });

  it('includes the target in recurring final-data collection', () => {
    const fetcher = readFileSync(
      '.claude/skills/gsc-causation-correlation/scripts/gsc-daily-correlate.cjs',
      'utf8'
    );
    expect(fetcher).toContain(
      "['https://myimageupscaler.com/blog/tiktok-profile-picture-ideas', '/blog/tiktok-profile-picture-ideas', 'equals']"
    );
    expect(fetcher).toContain("for (const [expr, label, operator = 'contains'] of pageFilters)");
    expect(fetcher).toContain("dimension: 'page', operator, expression: expr");
  });
});
