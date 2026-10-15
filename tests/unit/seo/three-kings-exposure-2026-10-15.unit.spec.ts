import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const ledger = JSON.parse(fs.readFileSync('docs/SEO/maintenance/three-kings-ledger.json', 'utf8'));
const entry = ledger.entries.find(
  (item: { url: string }) => item.url === '/blog/best-image-upscaler'
);
const row = entry.history.find((item: { dbEditDate?: string }) => item.dbEditDate === '2026-10-12');
const backlog = fs.readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8');

describe('2026-10-15 best-image final-copy exposure reconciliation', () => {
  it('starts measurement at first confirmed final exposure without changing the DB date or rung', () => {
    expect(entry.lastEdit >= row.date).toBe(true);
    expect(row.date).toBe('2026-10-15');
    expect(row.dbEditDate).toBe('2026-10-12');
    expect(entry.rung).toBe(3);
    expect(row.rung).toBe(3);
    if (row.outcome) {
      expect(row.outcome.measuredThrough >= '2026-10-29').toBe(true);
    }
    expect(row.liveVerification.status).toBe('verified');
    expect(row.liveVerification.checkedOn).toBe('2026-10-15');
    expect(row.liveVerification.apiUpdatedAt).toBe('2026-10-12T16:46:09.796203+00:00');
  });

  it('keeps the exact prior body and verified replacement hash as rollback anchors', () => {
    expect(createHash('sha256').update(row.previousValue).digest('hex')).toBe(
      'fddb86f4a921147fe9fae9374967e2331873ff470077e4562e51945e9775cf94'
    );
    expect(row.liveVerification.sha256).toBe(
      'f3180ce35db4a0f7b910faa9a2bddae130d2fc66bb4a0efa74e8b84a555473a9'
    );
    expect(row.liveVerification.reason).toContain('corrected closing CTA');
  });

  it('resolves one existing indexing row from post-write crawl evidence, not an invented manual request', () => {
    const rows = backlog
      .split('\n')
      .filter(line => line.includes('`https://myimageupscaler.com/blog/best-image-upscaler`'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^- \[x\]/);
    expect(rows[0]).toContain('API-resolved 2026-10-15, not a manual request');
    expect(rows[0]).toContain('Submitted and indexed');
    expect(rows[0]).toContain('2026-10-13T17:00:05Z');
    expect(rows[0]).toContain('2026-11-02');
  });
});
