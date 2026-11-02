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

  it('resolves only the November 2 verified post-change crawls without inventing UI requests', () => {
    for (const [slug, crawl] of [
      ['best-ai-upscaler', '2026-11-01T12:58:39Z'],
      ['what-resolution-for-print', '2026-10-27T16:07:15Z'],
    ]) {
      const matches = rowFor(slug);
      expect(matches, slug).toHaveLength(1);
      expect(matches[0], slug).toMatch(/^- \[x\]/);
      expect(matches[0], slug).toContain('API-resolved 2026-11-02, not a manual request');
      expect(matches[0], slug).toContain('Submitted and indexed');
      expect(matches[0], slug).toContain('indexing allowed');
      expect(matches[0], slug).toContain('matching Google/user canonicals');
      expect(matches[0], slug).toContain(crawl);
      expect(matches[0], slug).toContain('2026-10-26');
      expect(matches[0], slug).toContain('2026-11-13');
    }
  });

  it('records closed flagship and software windows without restarting either ladder', () => {
    const ledger = JSON.parse(
      fs.readFileSync('docs/SEO/maintenance/three-kings-ledger.json', 'utf8')
    );
    for (const [url, date, verdict, measuredThrough, adjRatio] of [
      [
        '/blog/best-free-ai-image-upscaler-2026-tested-compared',
        '2026-10-13',
        'FLAT',
        '2026-10-27',
        0.93,
      ],
      ['/blog/best-image-upscaler', '2026-10-15', 'WIN', '2026-10-29', 1.38],
    ]) {
      const entry = ledger.entries.find((item: { url: string }) => item.url === url);
      const edit = entry.history.find((item: { date: string }) => item.date === date);
      expect(edit.outcome).toMatchObject({ verdict, measuredThrough, adjRatio });
      expect(edit.rung).toBe(3);
      expect(edit.previousValue).toBeTruthy();
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
