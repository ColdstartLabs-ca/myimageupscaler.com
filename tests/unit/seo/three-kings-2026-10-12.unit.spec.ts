import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { applyBestImageUpscalerRung3 } = require('../../../scripts/seo/three-kings-2026-10-12.cjs');
const opening =
  '**Quick answer:** The best image upscaling software depends on your workflow: use a free web tool for quick 2x–8x enlargements, or pro desktop software for RAW editing, privacy, batch processing, and print controls. This guide compares 12 free and paid tools for 2026.';
const body = `${opening}\n\n| Workflow | Best Fit | Why |\n\n## Existing tools\n\nGet **10 free credits**. The free trial is limited to 10 credits.\n\n![existing image](https://example.com/keep.webp)\n\n[free comparison](/blog/best-free-ai-image-upscaler-2026-tested-compared)\n\n[Try upscaling](/) and use your 10 free credits today.`;

describe('2026-10-12 best-image-upscaler rung 3', () => {
  it('puts a reproducible software-selection evidence module above the workflow table', () => {
    const result = applyBestImageUpscalerRung3({ content: body });
    expect(result.content).toContain('### Check the evidence before choosing upscaling software');
    expect(result.content.indexOf('### Check the evidence')).toBeLessThan(
      result.content.indexOf('| Workflow |')
    );
    expect(result.content).toContain('same source file');
    expect(result.content).toContain('same output dimensions');
    expect(result.content).not.toMatch(/we tested|guaranteed|only 3 worked/i);
  });

  it('answers PNG algorithm intent with primary-source support, without retargeting the free comparison', () => {
    const result = applyBestImageUpscalerRung3({ content: body });
    expect(result.content).toContain('PNG is a file format, not an upscaling algorithm');
    expect(result.content).toContain('https://www.w3.org/TR/png-3/');
    expect(result.content).toContain('transparency');
    expect(result.content).toContain('/blog/best-free-ai-image-upscaler-2026-tested-compared');
  });

  it('uses computed resolution proof and verification steps instead of invented vendor benchmarks', () => {
    const result = applyBestImageUpscalerRung3({ content: body });
    expect(result.content).toContain('4000×3000');
    expect(result.content).toContain('8000×6000');
    expect(result.content).toContain('four times the pixel count');
    expect(result.content).not.toContain('Adobe documents');
    expect(result.content).toContain('local processing');
    expect(result.content).toMatch(/renewal/i);
  });

  it('changes content only, preserving metadata, media and the support-owner link', () => {
    const post = {
      content: body,
      title: 'Unchanged',
      seo_title: 'Unchanged SEO',
      seo_description: 'Unchanged meta',
      slug: 'best-image-upscaler',
      status: 'published',
    };
    const result = applyBestImageUpscalerRung3(post);
    expect({ ...result, content: body }).toEqual(post);
    expect(result.content).toContain('## Existing tools');
    expect(result.content).toContain('![existing image](https://example.com/keep.webp)');
    expect(result.content).not.toContain('10 free credits');
    expect(result.content).not.toContain('limited to 10 credits');
    expect(result.content).toContain('free-credit availability varies by region');
  });

  it('preserves unrelated vendor sections rather than rewriting from unverified sources', () => {
    const unchanged = '\n## Existing vendor details\n\nPreserve the original details.';
    const result = applyBestImageUpscalerRung3({ content: body + unchanged });
    expect(result.content.endsWith(unchanged)).toBe(true);
  });

  it('preserves the exact production rollback body and verifies the recorded replacement hash', () => {
    const ledger = JSON.parse(
      fs.readFileSync('docs/SEO/maintenance/three-kings-ledger.json', 'utf8')
    );
    const entry = ledger.entries.find(
      (item: { url: string }) => item.url === '/blog/best-image-upscaler'
    );
    const row = entry.history.find(
      (item: { dbEditDate?: string }) => item.dbEditDate === '2026-10-12'
    );
    expect(row.rung).toBe(3);
    expect(row.field).toBe('proof-led body pass');
    expect(createHash('sha256').update(row.previousValue).digest('hex')).toBe(
      'fddb86f4a921147fe9fae9374967e2331873ff470077e4562e51945e9775cf94'
    );
    const replacement = applyBestImageUpscalerRung3({ content: row.previousValue });
    expect(createHash('sha256').update(replacement.content).digest('hex')).toBe(
      row.liveVerification.sha256
    );
    expect(row.backup.verified).toContain('gzip -t');
  });

  it('keeps exactly one indexing row for the new production edit', () => {
    const backlog = fs.readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8');
    const rows = backlog
      .split('\n')
      .filter(line => line.includes('`https://myimageupscaler.com/blog/best-image-upscaler`'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('2026-10-12');
    expect(rows[0]).toMatch(/not yet requested|API-resolved|indexing requested.*confirmed/i);
  });

  it('fails closed on missing or duplicated anchors and repeated application', () => {
    expect(() => applyBestImageUpscalerRung3({ content: 'unexpected' })).toThrow(
      'anchor count must be 1'
    );
    expect(() => applyBestImageUpscalerRung3({ content: body + opening })).toThrow(
      'anchor count must be 1'
    );
    expect(() =>
      applyBestImageUpscalerRung3(applyBestImageUpscalerRung3({ content: body }))
    ).toThrow('evidence module already exists');
  });
});
