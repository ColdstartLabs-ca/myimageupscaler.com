import { describe, expect, it } from 'vitest';
import { LEGACY_REDIRECTS } from '@/lib/seo/legacy-redirects';

/**
 * next.config redirects run before middleware, and `next dev` matches their
 * source patterns case-insensitively. A rule whose source and destination
 * differ only by case therefore matches its own destination and produces an
 * infinite redirect loop (ERR_TOO_MANY_REDIRECTS) instead of a 301.
 *
 * Case normalization for tool paths already happens in middleware.ts, so such
 * rules are redundant as well as unsafe.
 */
describe('LEGACY_REDIRECTS loop safety', () => {
  it('has no rule whose source and destination differ only by case', () => {
    const caseOnly = LEGACY_REDIRECTS.filter(
      redirect =>
        redirect.source !== redirect.destination &&
        redirect.source.toLowerCase() === redirect.destination.toLowerCase()
    ).map(redirect => `${redirect.source} -> ${redirect.destination}`);

    expect(caseOnly).toEqual([]);
  });

  it('has no rule that redirects a path to itself', () => {
    const selfReferential = LEGACY_REDIRECTS.filter(
      redirect => redirect.source === redirect.destination
    ).map(redirect => redirect.source);

    expect(selfReferential).toEqual([]);
  });

  it('still routes the mixed-case social resize slugs through middleware casing rules', () => {
    // The removed rules covered these paths; middleware.ts lowercases any
    // /tools/ path, so the canonical lowercase slugs must remain reachable.
    const canonical = [
      '/tools/resize/resize-image-for-youtube',
      '/tools/resize/resize-image-for-twitter',
    ];

    for (const path of canonical) {
      expect(LEGACY_REDIRECTS.some(redirect => redirect.source === path)).toBe(false);
    }
  });
});
