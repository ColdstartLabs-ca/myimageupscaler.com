/**
 * Meta-guard: no test may forbid the free offer.
 *
 * On 2026-09-10 a copy pass stripped the free framing from the homepage, and an E2E test
 * was rewritten to *enforce* the stripped copy
 * (`expect(metaDescription).not.toMatch(/\bfree\b/)` in landing-page-seo.e2e.spec.ts).
 * This spec fails on any assertion that would reject truthful free wording on a conversion surface, so
 * the next "truthfulness" pass cannot be rubber-stamped by a test.
 *
 * Allowlisted below are guards that forbid a *false* free claim (recurring/unlimited
 * grants, competitor comparisons, slug shapes) — not the free offer itself.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SELF = 'tests/unit/seo/no-test-forbids-free-offer.unit.spec.ts';
const TESTS_DIR = 'tests';

/** Assertions that ban the word "free" from a value a visitor reads or a slug they hit. */
const BANS_FREE_WORDING = [/not\.toMatch\(\/(?:\\b)?free/i, /not\.toContain\(['"`][^'"`]*free/i];

/** `file :: assertion` -> why forbidding free wording there is correct. Keyed on the
 * assertion text, not the line number, so unrelated edits don't break the guard. */
const ALLOWLIST = new Set<string>([
  // forbids a hardcoded constant, not the offer
  "tests/unit/seo/capability-claims.unit.spec.ts :: expect(freeHub).not.toContain('DEFAULT_FREE_CREDITS');",
  // 0 credits granted -> "free" would be a lie
  'tests/unit/seo/free-offer-conversion-copy.unit.spec.ts :: expect(welcomeCreditCopy(0)).not.toMatch(/free/i);',
  // forbids a recurring "free (10/mo)" claim
  'tests/unit/seo/free-credit-policy-copy.unit.spec.ts :: expect(text).not.toMatch(/free \\(10\\/mo\\)|10 credits\\/month|free credits monthly/i);',
  // forbids the obsolete "Free tier with 10 credits" claim
  "tests/unit/seo/free-credit-policy-copy.unit.spec.ts :: expect(ownedPolicyCopy).not.toContain('Free tier with 10 credits');",
  // slug uniqueness, not copy
  "tests/unit/seo/pseo-duplicate-slugs.unit.spec.ts :: expect(mainImageUpscaler.slug).not.toContain('free-');",
  // forbids an inflated "10 free credits" grant
  "tests/unit/seo/blog-content-policy.unit.spec.ts :: expect(repaired.content).not.toContain('10 free credits');",
  // forbids the same inflated "10 free credits" grant in the 2026-10-12 rung-3 body
  "tests/unit/seo/blog-content-policy.unit.spec.ts :: expect(result.content).not.toContain('10 free credits');",
]);

const testFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : testFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

const bannedAssertions = (): string[] =>
  testFiles(TESTS_DIR)
    .filter(file => file !== SELF)
    .flatMap(file =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap(line =>
          BANS_FREE_WORDING.some(pattern => pattern.test(line)) ? [`${file} :: ${line.trim()}`] : []
        )
    );

describe('no test may forbid the free offer', () => {
  it('has no unallowlisted assertion that bans free wording', () => {
    const hits = bannedAssertions();

    expect(
      {
        unexpected: hits.filter(hit => !ALLOWLIST.has(hit)),
        stale: [...ALLOWLIST].filter(entry => !hits.includes(entry)),
      },
      'tests that ban free wording must be fixed, or allowlisted file:line with a comment'
    ).toEqual({ unexpected: [], stale: [] });
  });
});
