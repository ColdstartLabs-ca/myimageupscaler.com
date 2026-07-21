import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath: string): string =>
  readFileSync(path.resolve(root, relativePath), 'utf8');

const claudeSkill = read('.claude/skills/reddit-seo-response/SKILL.md');
const agentSkill = read('.agents/skills/reddit-seo-response/SKILL.md');
const validator = read('.claude/skills/reddit-seo-response/scripts/verify_action_sheet.py');
const validatorTests = read(
  '.claude/skills/reddit-seo-response/scripts/test_verify_action_sheet.py'
);
const template = read('.claude/skills/reddit-seo-response/templates/miu-action-sheet.md');

const hardContractMarkers = [
  'version: 2.0.0',
  'Hard Linked-Target Contract',
  'fresh GSC query/page evidence',
  'Never use the homepage',
  'at most 3 attempts',
  'Regression Lock — Version-Controlled Contract',
  '.claude/skills/reddit-seo-response/scripts/verify_action_sheet.py',
];

describe('MIU Reddit SEO version-controlled contract', () => {
  it.each([
    ['Claude skill', claudeSkill],
    ['agent skill', agentSkill],
  ])('%s preserves the non-negotiable GSC/blog/retry rules', (_name, skill) => {
    for (const marker of hardContractMarkers) {
      expect(skill).toContain(marker);
    }
  });

  it('keeps the executable validator strict about 9:1 and GSC-backed blog links', () => {
    expect(validator).toContain('parser.add_argument("--gsc"');
    expect(validator).toContain('expected 9+1');
    expect(validator).toContain('homepage/tool links are forbidden');
    expect(validator).toContain('linked blog target is absent from the fresh GSC');
    expect(validator).toContain('reply URL does not exactly match');
    expect(validator).toContain('link-share reply must contain exactly one MIU URL');
  });

  it('keeps behavioral regression cases for homepage, missing GSC, and URL mismatch', () => {
    expect(validatorTests).toContain('test_rejects_homepage_link');
    expect(validatorTests).toContain('test_rejects_missing_gsc_export');
    expect(validatorTests).toContain('test_rejects_reply_url_that_differs_from_target');
    expect(validatorTests).toContain('test_accepts_exact_gsc_backed_9_plus_1_sheet');
  });

  it('keeps the canonical action sheet pinned to a GSC-backed blog target', () => {
    expect(template).toContain('https://myimageupscaler.com/blog/...');
    expect(template).toContain('homepage/tool URLs forbidden');
    expect(template).toContain('GSC evidence');
    expect(template).toContain('exactly ten unique, qualified opportunities');
  });
});
