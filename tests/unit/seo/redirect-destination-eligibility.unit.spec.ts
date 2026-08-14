import { describe, expect, it } from 'vitest';

import { LEGACY_REDIRECTS } from '@/lib/seo/legacy-redirects';
import {
  shouldSubmitPath,
  getEligibilityReason,
  getPagePerformance,
} from '@/lib/seo/page-eligibility';

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
  it('keeps a page whose duplicate rows disagree about impressions', () => {
    // ai-features/ai-sharpness-enhancement-upscaler has two snapshot rows:
    // one reporting 1 impression and one reporting 0. Last-write-wins pruned it.
    expect(getPagePerformance('ai-features', 'ai-sharpness-enhancement-upscaler')?.impressions).toBe(
      1
    );
    expect(shouldSubmitPath('/ai-features/ai-sharpness-enhancement-upscaler')).toBe(true);
    expect(shouldSubmitPath('/alternatives/vs-topaz')).toBe(true);
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
