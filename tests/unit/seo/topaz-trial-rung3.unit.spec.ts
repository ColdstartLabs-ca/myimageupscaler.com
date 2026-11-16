import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const path = 'scripts/seo/topaz-trial-rung3.cjs';
const opening =
  'Topaz Labs no longer offers a conventional free trial for its current Topaz Photo desktop app. In 2026, Topaz Photo is subscription-only: you purchase first and can request a refund within two days if it does not fit your workflow. The old Topaz Photo AI preview-only trial belongs to a discontinued legacy app, so advice saying you can install the current app and test indefinitely without payment is outdated.';
const remainder =
  '\n\nExisting account-required copy.\n\n![Keep media](/image.webp)\n\n[Keep CTA](/tools/ai-image-upscaler)';
const post = {
  slug: 'topaz-labs-free-trial',
  content: opening + remainder,
  seo_title: 'Keep title',
  seo_description: 'Keep restored description',
  updated_at: '2026-10-26T16:21:27.591841+00:00',
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function helpers() {
  expect(fs.existsSync(path), 'missing reversible Topaz body-rung transformer').toBe(true);
  return require('../../../scripts/seo/topaz-trial-rung3.cjs');
}

describe('Topaz trial rung 3: source-led body only', () => {
  it('adds a direct answer and primary-source proof before the unchanged article', () => {
    const { buildTopazTrialPayload, EVIDENCE } = helpers();
    const payload = buildTopazTrialPayload(post, sha(post.content));
    expect(Object.keys(payload)).toEqual(['content']);
    expect(payload.content).toMatch(/^\*\*Quick answer:\*\*/);
    expect(payload.content).toContain('Topaz Photo and Topaz Video');
    expect(payload.content).toContain('### Verify the exact Topaz app before paying');
    expect(payload.content).toContain('https://docs.topazlabs.com/topaz-photo/tpai-vs-tp');
    expect(payload.content).toContain('https://docs.topazlabs.com/topaz-video/tvai-vs-tv');
    expect(payload.content).toContain(
      'https://docs.topazlabs.com/sales-account-licensing/before-you-buy/refund-policy'
    );
    expect(payload.content).toContain('Canceling a subscription does not request a refund');
    expect(payload.content).not.toMatch(/we tested|benchmark|guaranteed|no signup/i);
    expect(payload.content.slice(payload.content.indexOf(remainder))).toBe(remainder);
    expect(
      payload.content.replace(EVIDENCE, '').replace(/^\*\*Quick answer:\*\*[^\n]+/, opening)
    ).toBe(post.content);
  });

  it('records the exact rollback anchor and keeps unexposed HTML on HOLD without indexing', () => {
    const ledger = JSON.parse(
      fs.readFileSync('docs/SEO/maintenance/three-kings-ledger.json', 'utf8')
    );
    const entry = ledger.entries.find(
      (e: { url: string }) => e.url === '/blog/topaz-labs-free-trial'
    );
    const h = entry.history.find((h: { dbEditDate: string }) => h.dbEditDate === '2026-11-16');
    expect(h.rung).toBe(3);
    expect(h.field).toBe('proof-led body pass');
    expect(sha(h.previousValue)).toBe(
      '0dc14432e92264121caee750b033d097af5af64aa119489b39dbe262e8f6b2eb'
    );
    const { buildTopazTrialPayload } = helpers();
    expect(
      sha(
        buildTopazTrialPayload(
          { slug: 'topaz-labs-free-trial', content: h.previousValue },
          sha(h.previousValue)
        ).content
      )
    ).toBe(h.liveVerification.sha256);
    expect(h.backup.verified).toContain('gzip -t');
    const rows = fs
      .readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8')
      .split('\n')
      .filter((line: string) =>
        line.includes('`https://myimageupscaler.com/blog/topaz-labs-free-trial`')
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Reopened 2026-11-16');
    expect(rows[0]).toContain(h.liveVerification.sha256);
    if (h.liveVerification.status === 'pending') {
      expect(h.outcome).toBeNull();
      expect(rows[0]).toMatch(/^- \[ \]/);
      expect(rows[0]).toContain('HOLD measurement and indexing');
      expect(rows[0]).toContain('no manual request claimed');
    }
    const rollback = entry.history.find(
      (h: { date: string; field: string }) => h.date === '2026-10-26' && h.field === 'rollback'
    );
    expect(rollback.rung).toBe(2);
    expect(rollback.outcome).toMatchObject({ verdict: 'FLAT', measuredThrough: '2026-11-09' });
  });

  it('refuses concurrent edits, duplicate modules, ambiguous anchors and the wrong URL', () => {
    const { buildTopazTrialPayload } = helpers();
    expect(() =>
      buildTopazTrialPayload({ ...post, content: post.content + 'new work' }, sha(post.content))
    ).toThrow(/changed/);
    const result = buildTopazTrialPayload(post, sha(post.content));
    expect(() => buildTopazTrialPayload({ ...post, ...result }, sha(result.content))).toThrow(
      /already/
    );
    expect(() =>
      buildTopazTrialPayload(
        { ...post, content: post.content + '\n\n' + opening },
        sha(post.content + '\n\n' + opening)
      )
    ).toThrow(/anchor/);
    expect(() =>
      buildTopazTrialPayload({ ...post, slug: 'different-post' }, sha(post.content))
    ).toThrow(/slug/);
    expect(() => buildTopazTrialPayload(post, '')).toThrow(/hash/);
  });
});
