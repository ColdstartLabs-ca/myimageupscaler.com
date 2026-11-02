import { describe, expect, it, vi } from 'vitest';

import { LEGACY_REDIRECTS } from '@/lib/seo/legacy-redirects';
import { shouldSubmitPath, getEligibilityReason } from '@/lib/seo/page-eligibility';

const OLD = '2025-01-01T00:00:00.000Z';

/**
 * PRD 01 consolidates retired URLs into a small set of owner pages with 301s,
 * and PRD 03 prunes zero-impression pages out of the sitemaps. A redirect
 * destination is a consolidation owner by construction: its historical
 * impressions sit on the source URL, so the performance snapshot reports zero
 * for the owner and the pruner would de-list exactly the pages PRD 01 is
 * funnelling signals into. Owners must stay submitted.
 */
function redirectDestinationPaths(): string[] {
  const paths = new Set<string>();

  for (const redirect of LEGACY_REDIRECTS) {
    const destination = redirect.destination.replace(/^\/:locale/, '');
    if (destination.startsWith('/') && !destination.includes(':')) {
      paths.add(destination);
    }
  }

  return [...paths];
}

describe('redirect destinations stay in the sitemaps', () => {
  it('keeps every legacy redirect destination submittable', () => {
    const dropped = redirectDestinationPaths().filter(path => !shouldSubmitPath(path));

    expect(dropped).toEqual([]);
  });

  it('reports redirect owners as pinned rather than pruned', () => {
    expect(getEligibilityReason('tools', 'png-to-jpg')).toBe('pinned');
    expect(shouldSubmitPath('/tools/convert/png-to-jpg')).toBe(true);
    expect(shouldSubmitPath('/free/free-ai-upscaler')).toBe(true);
    expect(shouldSubmitPath('/guides/how-to-upscale-images')).toBe(true);
  });

  it('still prunes a zero-impression page that no redirect points at', () => {
    // Negative control: the policy must stay capable of pruning. This identity
    // reports zero impressions and zero clicks across every snapshot row and is
    // not a redirect destination.
    expect(shouldSubmitPath('/de/guides/tiff-format-guide')).toBe(false);
  });
});

describe('duplicate snapshot rows do not hide real traffic', () => {
  it('keeps a page whose duplicate rows disagree about impressions', async () => {
    // Hermetic: the committed snapshot may carry no duplicate rows after a
    // refresh, so feed the merge logic its own duplicates. Last-write-wins
    // pruned a page when a zero-impression row followed a one-impression row.
    vi.resetModules();
    vi.doMock('@/content/pseo-performance.json', () => ({
      default: {
        pages: [
          { category: 'ai-features', slug: 'dup-page', locale: 'en', impressions: 1, clicks: 0 },
          { category: 'ai-features', slug: 'dup-page', locale: 'en', impressions: 0, clicks: 0 },
        ],
      },
    }));
    const eligibility = await import('@/lib/seo/page-eligibility');
    expect(eligibility.getPagePerformance('ai-features', 'dup-page')?.impressions).toBe(1);
    expect(eligibility.shouldSubmitPath('/ai-features/dup-page')).toBe(true);
    vi.doUnmock('@/content/pseo-performance.json');
    vi.resetModules();
  });
});

describe('locale-specific sitemaps use the matching locale record', () => {
  it('does not judge a French sitemap entry by the English record', () => {
    // tools/svg-to-jpg earns impressions in English and none in French. The
    // unprefixed path in a French sitemap must still resolve to the French
    // record, otherwise every locale inherits the English verdict.
    expect(shouldSubmitPath('/tools/convert/svg-to-jpg', OLD, 'en')).toBe(true);
    expect(shouldSubmitPath('/tools/convert/svg-to-jpg', OLD, 'fr')).toBe(false);
  });
});
