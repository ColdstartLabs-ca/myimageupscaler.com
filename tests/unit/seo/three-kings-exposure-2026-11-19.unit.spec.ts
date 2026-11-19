import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const ledger = JSON.parse(readFileSync('docs/SEO/maintenance/three-kings-ledger.json', 'utf8'));
const backlog = readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8');
const seoBacklog = readFileSync('docs/SEO/maintenance/seo-changes-backlog.md', 'utf8');
const rowFor = (slug: string) => {
  const rows = backlog
    .split('\n')
    .filter(line => line.includes('`https://myimageupscaler.com/blog/' + slug + '`'));
  expect(rows).toHaveLength(1);
  return rows[0];
};

describe('2026-11-19 public-exposure reconciliation', () => {
  it('anchors Topaz first confirmed public exposure without rewriting or advancing its rung', () => {
    const entry = ledger.entries.find(
      (e: { url: string }) => e.url === '/blog/topaz-labs-free-trial'
    );
    const h = entry.history.find((h: { dbEditDate?: string }) => h.dbEditDate === '2026-11-16');
    expect(entry.rung).toBe(3);
    expect(entry.lastEdit >= '2026-11-19').toBe(true);
    expect(h.date).toBe('2026-11-19');
    expect(h.dbEditDate).toBe('2026-11-16');
    expect(h.liveVerification).toMatchObject({
      status: 'verified',
      checkedOn: '2026-11-19',
      field: 'content',
      apiUpdatedAt: '2026-11-16T16:21:29.640128+00:00',
      sha256: 'a9fa46705fe9ea9c4c7c9c4301ab1b76f1bddead8b30149d6eedd685c6df199b',
    });
    expect(createHash('sha256').update(h.previousValue).digest('hex')).toBe(
      '0dc14432e92264121caee750b033d097af5af64aa119489b39dbe262e8f6b2eb'
    );
    expect(h.backup.verified).toContain('gzip -t');
    expect(h.liveVerification.reason).toContain('Nov 20-Dec 3');
    expect(h.liveVerification.reason).toContain('Dec 7');
    if (h.outcome) expect(h.outcome.measuredThrough >= '2026-12-03').toBe(true);
  });

  it('does not invent a new Topaz indexing request or resolve it from a pre-write crawl', () => {
    const row = rowFor('topaz-labs-free-trial');
    expect(row).toContain('Reopened 2026-11-16');
    expect(row).toContain('2026-11-19');
    expect(row).toContain('2026-12-07');
    if (row.startsWith('- [ ]')) {
      expect(row).toContain('2026-11-07T19:47:30Z');
      expect(row).toContain('no manual request claimed');
      expect(row).not.toContain('HOLD measurement and indexing');
    } else {
      expect(row).toMatch(/API-resolved|indexing requested/i);
    }
  });

  it('resolves Photoshop only with matching content and a successful post-repair crawl', () => {
    const row = rowFor('photoshop-upscale-image');
    expect(row).toMatch(/^- \[x\]/);
    expect(row).toContain('API-resolved 2026-11-19, not a manual request');
    expect(row).toContain('2026-11-19T12:24:21Z');
    expect(row).toContain('2026-11-16T17:37:03.466358+00:00');
    expect(row).toContain('Submitted and indexed');
    expect(row).toContain('5/5');
    expect(row).toContain('9d9b92103fc566f838b221d065ac527a30825f0e2212a762ad88d6a0fa0132d2');
    expect(row).toContain('2026-09-04');
    expect(row).toContain('visibly accepted in the priority crawl queue');
  });

  it('keeps one indexing row per URL and records the seven processed sitemap readbacks', () => {
    const rows = [...backlog.matchAll(/^- \[[ x]\] `(https:\/\/[^`]+)`/gm)].map(m => m[1]);
    expect(new Set(rows).size).toBe(rows.length);
    expect(backlog).toContain('Processing verified 2026-11-19');
    expect(backlog).toContain('7/7');
    expect(backlog).toContain('isPending: false');
    expect(seoBacklog).toContain('## 2026-11-19');
    expect(seoBacklog).toContain('2026-12-07');
  });
});
