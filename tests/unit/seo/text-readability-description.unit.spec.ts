import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { updateBlogPostSchema } from '@shared/validation/blog.schema';

const require = createRequire(import.meta.url);
const {
  buildDescriptionPatch,
  PREVIOUS_DESCRIPTION,
  SEO_DESCRIPTION,
} = require('../../../scripts/seo/text-readability-description.cjs');
const post = {
  slug: 'text-image-enhancer',
  status: 'published',
  seo_description: PREVIOUS_DESCRIPTION,
  title: 'How to Improve Image Clarity and Text Readability',
  seo_title: 'Improve Image Clarity & Make Text Readable [2026]',
  description: PREVIOUS_DESCRIPTION,
  content: 'Existing source-preparation workflow, images, links, and CTAs.',
};

describe('text readability rung-2 single-variable description', () => {
  it('changes only seo_description, passes the production schema, and is reversible', () => {
    const before = structuredClone(post);
    const patch = buildDescriptionPatch(post);
    expect(patch).toEqual({ seo_description: SEO_DESCRIPTION });
    expect(updateBlogPostSchema.safeParse(patch).success).toBe(true);
    expect(post).toEqual(before);
    expect({ ...post, ...patch, seo_description: PREVIOUS_DESCRIPTION }).toEqual(post);
  });

  it('describes the existing readability workflow without competing tool promises', () => {
    expect(SEO_DESCRIPTION.length).toBeGreaterThanOrEqual(120);
    expect(SEO_DESCRIPTION.length).toBeLessThanOrEqual(160);
    expect(SEO_DESCRIPTION).toMatch(/^Make text in images easier to read:/);
    expect(SEO_DESCRIPTION).toContain('before OCR');
    expect(SEO_DESCRIPTION).toContain('screenshots, labels, and scans');
    expect(SEO_DESCRIPTION).not.toMatch(/perfect|guarantee|free|no signup|recover|best|tested/i);
  });

  it('refuses other posts, drafts, and intervening description edits', () => {
    expect(() => buildDescriptionPatch({ ...post, slug: 'enhance-text-in-image' })).toThrow();
    expect(() => buildDescriptionPatch({ ...post, status: 'draft' })).toThrow();
    expect(() =>
      buildDescriptionPatch({ ...post, seo_description: 'A newer description' })
    ).toThrow();
  });

  it('records the exact reversible rung, public exposure, and one reopened indexing row', () => {
    const ledger = JSON.parse(readFileSync('docs/SEO/maintenance/three-kings-ledger.json', 'utf8'));
    const entry = ledger.entries.find(
      (e: { url: string }) => e.url === '/blog/text-image-enhancer'
    );
    const rows = entry.history.filter((h: { date: string }) => h.date === '2026-10-29');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rung: 2,
      field: 'seo_description',
      previousValue: PREVIOUS_DESCRIPTION,
      dbEditDate: '2026-10-29',
      liveVerification: { status: 'verified', checkedOn: '2026-10-29' },
    });
    expect(rows[0].backup.verified).toContain('gzip -t');
    const backlog = readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8');
    const indexing = backlog
      .split('\n')
      .filter(line => line.includes('`https://myimageupscaler.com/blog/text-image-enhancer`'));
    expect(indexing).toHaveLength(1);
    if (indexing[0].startsWith('- [x]')) {
      expect(indexing[0]).toContain('API-resolved 2026-11-05, not a manual request');
      expect(indexing[0]).toContain('Submitted and indexed');
      expect(indexing[0]).toContain('indexing allowed');
      expect(indexing[0]).toContain('successful post-description-write crawl');
      expect(indexing[0]).toContain('matching Google/user canonicals');
      expect(indexing[0]).toContain('2026-11-04T11:13:45Z');
    } else {
      expect(indexing[0]).toMatch(/^- \[ \]/);
    }
    expect(indexing[0]).toContain('2026-10-29');
    expect(indexing[0]).toContain('2026-11-16');
  });

  it('resolves the Topaz rollback crawl as API evidence, not a manual indexing request', () => {
    const backlog = readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8');
    const row = backlog
      .split('\n')
      .find(line => line.includes('`https://myimageupscaler.com/blog/topaz-labs-free-trial`'))!;
    expect(row).toMatch(/^- \[x\]/);
    expect(row).toContain('API-resolved 2026-10-29, not a manual request');
    expect(row).toContain('2026-10-28T09:11:25Z');
    expect(row).toContain('2026-10-26');
    expect(row).toContain('2026-11-13');
  });

  it('is idempotent after the description is applied', () => {
    expect(buildDescriptionPatch({ ...post, seo_description: SEO_DESCRIPTION })).toEqual({});
  });
});
