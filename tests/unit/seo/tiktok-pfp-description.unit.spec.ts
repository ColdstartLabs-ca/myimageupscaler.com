import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { updateBlogPostSchema } from '@shared/validation/blog.schema';

const require = createRequire(import.meta.url);
const { buildDescriptionPatch } = require('../../../scripts/seo/tiktok-pfp-title.cjs');
const previous =
  'Level up your brand with these 8 TikTok profile picture ideas for 2026. Learn how to create crisp, high-res PFPs that get noticed and drive clicks.';
const replacement =
  'Explore 8 TikTok PFP ideas: headshots, anime avatars, neon designs, logos, and more. Choose a style and use crop and clarity tips to prepare your photo.';
const post = {
  slug: 'tiktok-profile-picture-ideas',
  status: 'published',
  seo_title: 'TikTok Profile Picture Ideas: 8 PFP Styles (2026)',
  seo_description: previous,
  title: '8 TikTok Profile Picture Ideas to Stand Out in 2026',
  description: previous,
  content: 'The existing eight styles, crop advice, media and CTAs remain unchanged.',
};

describe('TikTok PFP rung-2 description', () => {
  it('payload changes only the description, satisfies the API schema and is reversible', () => {
    const before = structuredClone(post);
    const patch = buildDescriptionPatch(post);
    expect(patch).toEqual({ seo_description: replacement });
    expect(updateBlogPostSchema.safeParse(patch).success).toBe(true);
    expect(post).toEqual(before);
    expect({ ...post, ...patch, seo_description: previous }).toEqual(post);
    expect(replacement.length).toBeLessThanOrEqual(160);
    expect(replacement.length).toBeGreaterThanOrEqual(120);
    expect(replacement).not.toMatch(/guarantee|drive clicks|free|no signup|tested|download/i);
  });

  it('payload refuses concurrent edits, another canonical, drafts and title drift', () => {
    expect(() => buildDescriptionPatch({ ...post, seo_description: 'Newer copy' })).toThrow(
      'Description changed'
    );
    expect(() => buildDescriptionPatch({ ...post, slug: 'another-post' })).toThrow(
      'published canonical'
    );
    expect(() => buildDescriptionPatch({ ...post, status: 'draft' })).toThrow(
      'published canonical'
    );
    expect(() => buildDescriptionPatch({ ...post, seo_title: 'Newer title' })).toThrow(
      'Title changed'
    );
  });

  it('payload is idempotent after the description lands', () => {
    expect(buildDescriptionPatch({ ...post, seo_description: replacement })).toEqual({});
  });

  it('records a reversible second rung after the closed title window without resetting history', () => {
    const ledger = JSON.parse(readFileSync('docs/SEO/maintenance/three-kings-ledger.json', 'utf8'));
    const entry = ledger.entries.find(
      (e: { url: string }) => e.url === '/blog/tiktok-profile-picture-ideas'
    );
    expect(entry.rung).toBeGreaterThanOrEqual(2);
    expect(entry.lastEdit >= '2026-11-09').toBe(true);
    expect(entry.history[0]).toMatchObject({
      date: '2026-10-19',
      rung: 1,
      outcome: { verdict: 'FLAT', measuredThrough: '2026-11-02' },
      liveVerification: { status: 'verified', checkedOn: '2026-10-19' },
    });
    const edits = entry.history.filter((h: { date: string }) => h.date === '2026-11-09');
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({
      rung: 2,
      field: 'seo_description',
      previousValue: previous,
      dbEditDate: '2026-11-09',
      liveVerification: {
        status: 'verified',
        field: 'seo_description',
        checkedOn: '2026-11-09',
        sha256: createHash('sha256').update(replacement).digest('hex'),
      },
    });
    expect(edits[0].backup.verified).toContain('gzip -t');
    expect(edits[0].outcome).toBeNull();
  });

  it('reopens the existing indexing row without duplicating or inventing a request', () => {
    const backlog = readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8');
    const rows = backlog
      .split('\n')
      .filter(
        line =>
          line.startsWith('- [') &&
          line.includes('`https://myimageupscaler.com/blog/tiktok-profile-picture-ideas`')
      );
    expect(rows).toHaveLength(1);
    if (rows[0].startsWith('- [x]')) {
      const crawl = rows[0].match(/successful post-description-write crawl `([^`]+)`/);
      expect(crawl).not.toBeNull();
      expect(new Date(crawl![1]).getTime()).toBeGreaterThan(
        new Date('2026-11-09T16:19:55.531234+00:00').getTime()
      );
      expect(rows[0]).toContain('API-resolved');
      expect(rows[0]).toContain('indexing allowed');
      expect(rows[0]).toContain('matching Google/user canonicals');
    } else {
      expect(rows[0]).toMatch(/^- \[ \]/);
    }
    expect(rows[0]).toContain('Reopened 2026-11-09');
    expect(rows[0]).toContain('2026-11-27');
    expect(rows[0]).toContain('2026-11-06');
    expect(rows[0]).toContain('no manual request claimed');
    expect(rows[0]).not.toContain('indexing requested 2026-11-09');
  });
});
