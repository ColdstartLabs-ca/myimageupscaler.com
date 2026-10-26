import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { rollbackPayload } = require('../../../scripts/seo/three-kings-2026-10-26.cjs');
const { applyBestAiUpscalerRung3 } = require('../../../scripts/seo/three-kings-2026-09-24.cjs');
const { applyYoutubeThumbnailRung3 } = require('../../../scripts/seo/three-kings-2026-10-05.cjs');
const ledger = JSON.parse(fs.readFileSync('docs/SEO/maintenance/three-kings-ledger.json', 'utf8'));
function edit(url: string) {
  return ledger.entries
    .find((e: { url: string }) => e.url === `/blog/${url}`)
    .history.findLast(
      (h: { field: string; date: string }) => h.field !== 'rollback' && h.date <= '2026-10-08'
    );
}
const topaz = edit('topaz-labs-free-trial');
const best = edit('best-ai-upscaler');
const youtube = edit('how-to-upscale-youtube-thumbnails');
const topazPost = {
  slug: 'topaz-labs-free-trial',
  seo_description:
    'Topaz Labs has no free trial for current Topaz Photo in 2026; you buy first and have a 2-day refund window. Compare legacy, web, and desktop terms.',
};
const bestPost = {
  slug: 'best-ai-upscaler',
  ...applyBestAiUpscalerRung3({ content: best.previousValue }),
};
const youtubePost = {
  slug: 'how-to-upscale-youtube-thumbnails',
  content: applyYoutubeThumbnailRung3({ content: youtube.previousValue }).content.replaceAll(
    'https://xqysaylskffsfwunczbd.supabase.co/storage/v1/object/public/blog-images/',
    'https://assets.myimageupscaler.com/'
  ),
};

describe('2026-10-26 demand-gated regression rollbacks', () => {
  it('restores exactly the recorded Topaz description and nothing else', () => {
    expect(rollbackPayload(topazPost, topaz)).toEqual({ seo_description: topaz.previousValue });
  });
  it('restores exactly the recorded best-ai body and nothing else', () => {
    expect(rollbackPayload(bestPost, best)).toEqual({ content: best.previousValue });
  });
  it('removes the YouTube experiment without undoing factual fixes or the later R2 migration', () => {
    const result = rollbackPayload(youtubePost, youtube);
    expect(Object.keys(result)).toEqual(['content']);
    expect(result.content).not.toContain('### Prove where the thumbnail loses clarity');
    expect(result.content).not.toContain('**Original → export → YouTube:**');
    expect(result.content).not.toContain('**Pixel proof:**');
    expect(result.content).not.toContain('**Decision rule:**');
    expect(result.content).toContain('3840×2160');
    expect(result.content).toContain('50 MB');
    expect(result.content).toContain('https://support.google.com/youtube/answer/72431?hl=en');
    expect(result.content).toContain(
      'https://assets.myimageupscaler.com/2026/02/1771367317184-inline-youtube-1.webp'
    );
    expect(result.content).not.toContain('supabase.co/storage');
    expect(result.content).not.toContain('no account required');
    expect(result.content).not.toContain('72 DPI');
    expect(result.content).not.toContain('evidence block above');
    expect(result.content).toContain('free-credit availability varies by region');
    expect(
      result.content
        .split('Use the checklist below')[1]
        .replaceAll('upload guidance above', 'evidence block above')
    ).toBe(youtubePost.content.split('Use the checklist below')[1]);
  });
  it('records three cooling-off rollbacks without advancing rungs and reopens only their unique indexing rows', () => {
    const backlog = fs.readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8');
    for (const slug of [
      'topaz-labs-free-trial',
      'best-ai-upscaler',
      'how-to-upscale-youtube-thumbnails',
    ]) {
      const entry = ledger.entries.find((e: { url: string }) => e.url === `/blog/${slug}`);
      const latest = entry.history.at(-1);
      expect(latest.field).toBe('rollback');
      expect(latest.date).toBe('2026-10-26');
      expect(latest.rung).toBe(entry.rung);
      expect(latest.previousValue).toBeTruthy();
      expect(latest.backup.verified).toContain('gzip -t');
      expect(latest.liveVerification.status).toBe('verified');
      const rows = backlog
        .split('\n')
        .filter(line => line.includes(`\`https://myimageupscaler.com/blog/${slug}\``));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatch(/^- \[ \]/);
      expect(rows[0]).toContain('2026-10-26');
      expect(rows[0]).toContain('2026-11-13');
    }
    const tiktok = backlog
      .split('\n')
      .find(line =>
        line.includes('`https://myimageupscaler.com/blog/tiktok-profile-picture-ideas`')
      );
    expect(tiktok).toMatch(/^- \[x\]/);
    expect(tiktok).toContain('API-resolved 2026-10-26, not a manual request');
    expect(tiktok).toContain('2026-10-23T19:16:16Z');
  });

  it('refuses intervening edits, missing prior values, non-LOSS edits, demand collapses and rollback undo loops', () => {
    expect(() =>
      rollbackPayload({ ...bestPost, content: bestPost.content + 'new work' }, best)
    ).toThrow(/changed/);
    expect(() => rollbackPayload(topazPost, { ...topaz, previousValue: undefined })).toThrow(
      /prior/
    );
    expect(() => rollbackPayload(topazPost, { ...topaz, outcome: { verdict: 'FLAT' } })).toThrow(
      /LOSS/
    );
    expect(() =>
      rollbackPayload(topazPost, {
        ...topaz,
        outcome: { verdict: 'LOSS', impDelta: -45, posDelta: 0.5 },
      })
    ).toThrow(/demand/);
    expect(() => rollbackPayload(topazPost, { ...topaz, field: 'rollback' })).toThrow(/rollback/);
  });
});
