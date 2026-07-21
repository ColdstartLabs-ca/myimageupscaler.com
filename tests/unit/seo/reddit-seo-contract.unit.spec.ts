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
  'version: 2.1.0',
  'Hard Linked-Target Contract',
  'fresh GSC query/page evidence',
  'Never use the homepage',
  'at most 3 attempts',
  'position 4-20',
  'at least 50 impressions',
  'CTR below 5%',
  'Relevance evidence',
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
    expect(validator).toContain('MIN_BUMP_IMPRESSIONS = 50');
    expect(validator).toContain('MIN_BUMP_POSITION = 4.0');
    expect(validator).toContain('MAX_BUMP_POSITION = 20.0');
    expect(validator).toContain('MAX_BUMP_CTR = 0.05');
    expect(validator).toContain('lack a concrete shared problem term');
  });

  it('keeps behavioral regression cases for homepage, missing GSC, and URL mismatch', () => {
    expect(validatorTests).toContain('test_rejects_homepage_link');
    expect(validatorTests).toContain('test_rejects_missing_gsc_export');
    expect(validatorTests).toContain('test_rejects_reply_url_that_differs_from_target');
    expect(validatorTests).toContain('test_accepts_exact_gsc_backed_bump_worthy_9_plus_1_sheet');
    expect(validatorTests).toContain('test_rejects_query_with_too_little_demand');
    expect(validatorTests).toContain('test_rejects_query_outside_striking_distance');
    expect(validatorTests).toContain('test_rejects_query_that_already_has_strong_ctr');
    expect(validatorTests).toContain('test_rejects_semantically_unrelated_reddit_question');
  });

  it('keeps the canonical action sheet pinned to a GSC-backed blog target', () => {
    expect(template).toContain('https://myimageupscaler.com/blog/...');
    expect(template).toContain('homepage/tool URLs forbidden');
    expect(template).toContain('GSC evidence');
    expect(template).toContain('Relevance evidence');
    expect(template).toContain('position 4-20');
    expect(template).toContain('at least 50 impressions');
    expect(template).toContain('CTR below 5%');
    expect(template).toContain('exactly ten unique, qualified opportunities');
  });
});
