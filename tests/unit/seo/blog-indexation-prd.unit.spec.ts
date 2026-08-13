import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PRD_PATH = join(
  __dirname,
  '../../../docs/PRDs/gsc-recovery-2026-08/06-blog-indexation-zero-click.md'
);
const ROOT = join(__dirname, '../../..');
const ROUNDUP_CHECKLIST_PATH = join(ROOT, '.claude/skills/blog-writing/roundup-checklist.md');
const ROUNDUP_SOURCE_PATH = join(ROOT, 'content/blog/best-bulk-image-upscalers-2026.mdx');
const PRD = readFileSync(PRD_PATH, 'utf8');
const ROUNDUP_CHECKLIST = readFileSync(ROUNDUP_CHECKLIST_PATH, 'utf8');
const ROUNDUP_SOURCE = readFileSync(ROUNDUP_SOURCE_PATH, 'utf8');
const LEDGER = PRD.slice(
  PRD.indexOf('## Integration Ledger'),
  PRD.indexOf('## 3. Execution Phases')
);

describe('PRD 06 delivery claims', () => {
  it('keeps every Integration Ledger caller concrete and free of TBD cells', () => {
    expect(LEDGER).not.toMatch(/\bTBD\b/);
    expect(LEDGER).toContain('package.json:101');
    expect(LEDGER).toContain('scripts/validate-seo-equity.ts:20');
    expect(LEDGER).toContain('package.json:29');
  });

  it('separates the committed local roundup from post-deploy acceptance', () => {
    expect(PRD).toContain('The roundup checklist exists and the next roundup ships against it.');
    expect(PRD).toMatch(
      /Production publication, deployment, GSC\/IndexNow indexing,\s+and\s+live measurements remain post-deploy external acceptance items\./
    );
  });

  it('requires the real roundup source to carry the checklist-backed evidence and tool links', () => {
    expect(ROUNDUP_CHECKLIST).toContain(
      'Test every named tool on the same representative inputs: faces, text, low-resolution photos, and one difficult edge case.'
    );
    expect(ROUNDUP_CHECKLIST).toContain(
      'Record version/date, plan or trial limits, output scale, watermark behavior, speed, and the exact test setup.'
    );
    expect(ROUNDUP_CHECKLIST).toContain(
      'Link to the canonical tool page for each product tested and use descriptive anchor text.'
    );
    expect(ROUNDUP_CHECKLIST).toContain(
      'Include a relevant tool CTA above the fold and a linked primary CTA in the conclusion.'
    );

    expect(ROUNDUP_SOURCE).toMatch(/Sharp 0\.34\.5/);
    expect(ROUNDUP_SOURCE).toMatch(/dated local Sharp record|August 13, 2026/);
    expect(ROUNDUP_SOURCE).toMatch(/resize to exactly 2x width and height/);
    for (const inputLabel of ['Face:', 'Text:', 'Low-resolution photo:', 'Difficult edge case:']) {
      expect(ROUNDUP_SOURCE, `roundup is missing the ${inputLabel} input record`).toContain(
        inputLabel
      );
    }

    expect(ROUNDUP_SOURCE).toContain('The exact output record is reproducible');
    expect(ROUNDUP_SOURCE).toContain('Provenance-backed visual record');
    expect(ROUNDUP_SOURCE).toMatch(/Output dimensions.*WebP bytes/s);
    expect(ROUNDUP_SOURCE).toContain(
      '| Tool tested | Best for | Quality evidence | Speed | Limits | Price | Watermark |'
    );
    expect(ROUNDUP_SOURCE).toContain('Evidence-led verdict');
    expect(ROUNDUP_SOURCE).toContain('**Limitation:**');
    expect(ROUNDUP_SOURCE).toContain('## Final recommendation');
    for (const visualArtifact of [
      'bird-before-v2.webp',
      'low-resolution-sharp-2x.webp',
      'text-fixture.svg',
      'text-sharp-2x.webp',
    ]) {
      expect(ROUNDUP_SOURCE, `roundup is missing provenance artifact ${visualArtifact}`).toContain(
        visualArtifact
      );
    }

    expect(ROUNDUP_SOURCE).toContain('https://github.com/lovell/sharp/releases/tag/v0.34.5');
    expect(ROUNDUP_SOURCE).toContain('https://sharp.pixelplumbing.com/');
    expect(ROUNDUP_SOURCE).toContain('> [!CTA_TOOL:ai-image-upscaler]');
    expect(ROUNDUP_SOURCE).toContain('> [!CTA_TRY]');
    expect(ROUNDUP_SOURCE).toContain('/tools/ai-image-upscaler');
    expect(ROUNDUP_SOURCE).toContain('/formats/upscale-jpeg-images');
  });
});
