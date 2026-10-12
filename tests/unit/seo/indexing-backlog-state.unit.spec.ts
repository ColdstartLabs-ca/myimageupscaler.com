import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const backlog = fs.readFileSync(
  path.resolve(process.cwd(), 'docs/SEO/maintenance/gsc-request-indexing-backlog.md'),
  'utf8'
);
const rows = backlog.split('\n').filter(line => /^- \[[ x]\] `https:\/\//.test(line));
const rowFor = (slug: string) =>
  rows.filter(line => line.includes(`\`https://myimageupscaler.com/blog/${slug}\``));

describe('indexing backlog state', () => {
  it('keeps one checkbox row per URL across pending and completed groups', () => {
    const urls = rows.map(line => line.match(/`(https:\/\/[^`]+)`/)![1]);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('records the accepted October 12 UI requests without duplicating earlier requests', () => {
    for (const slug of [
      'best-free-ai-image-upscaler-2026-tested-compared',
      'how-to-clear-up-a-photo',
    ]) {
      const matches = rowFor(slug);
      expect(matches, slug).toHaveLength(1);
      expect(matches[0], slug).toMatch(/^- \[x\]/);
      expect(matches[0], slug).toContain('indexing requested 2026-10-12');
      expect(matches[0], slug).toContain('confirmed "URL was added to a priority crawl queue"');
    }
  });

  it('does not submit best-image while its final public copy remains pending', () => {
    const ledger = JSON.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), 'docs/SEO/maintenance/three-kings-ledger.json'),
        'utf8'
      )
    );
    const entry = ledger.entries.find(
      (item: { url: string }) => item.url === '/blog/best-image-upscaler'
    );
    if (entry.history.at(-1).liveVerification.status === 'pending') {
      const matches = rowFor('best-image-upscaler');
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatch(/^- \[ \]/);
      expect(matches[0]).toContain('HOLD measurement and indexing');
    }
  });
});
