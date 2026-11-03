import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBlogPostSchema } from '@shared/validation/blog.schema';

const TOPAZ_FREE_TRIAL_SNIPPET = {
  slug: 'topaz-labs-free-trial',
  title: 'Topaz Labs Free Trial 2026: Current Terms and Limits',
  seoDescription:
    'Topaz Labs has no free trial for current Topaz Photo in 2026; you buy first and have a 2-day refund window. Compare legacy, web, and desktop terms.',
  // Tier-safe: the welcome grant is regional (5/3/0), so the published body must not
  // name one tier's number. See tests/unit/seo/capability-claims.unit.spec.ts.
  bodySupport: 'browser-based alternative with welcome credits after signup',
} as const;

describe('Topaz free-trial snippet recovery contract', () => {
  it('uses a truthful answer-led SEO description without reverting the Topaz facts', () => {
    const result = createBlogPostSchema.safeParse({
      slug: TOPAZ_FREE_TRIAL_SNIPPET.slug,
      title: TOPAZ_FREE_TRIAL_SNIPPET.title,
      description: TOPAZ_FREE_TRIAL_SNIPPET.seoDescription,
      content: `Topaz Labs no longer offers a conventional free trial. Try a ${TOPAZ_FREE_TRIAL_SNIPPET.bodySupport}.`,
      author: 'MyImageUpscaler Team',
      category: 'Comparisons',
      tags: ['Topaz', 'free trial', 'AI upscaler'],
      seo_title: TOPAZ_FREE_TRIAL_SNIPPET.title,
      seo_description: TOPAZ_FREE_TRIAL_SNIPPET.seoDescription,
    });

    // Retired rung-2 variant, rolled back 2026-10-26 (see tests/unit/seo/three-kings-2026-10-26.unit.spec.ts).
    expect(result.success).toBe(true);
    expect(TOPAZ_FREE_TRIAL_SNIPPET.seoDescription).toHaveLength(147);
    expect(TOPAZ_FREE_TRIAL_SNIPPET.seoDescription).toMatch(/^Topaz Labs has no free trial/);
    expect(TOPAZ_FREE_TRIAL_SNIPPET.seoDescription).toContain('2-day refund window');
    expect(TOPAZ_FREE_TRIAL_SNIPPET.seoDescription).toContain(
      'Compare legacy, web, and desktop terms'
    );
  });

  it('records the reopened indexing request as one API-resolved row', () => {
    const backlog = readFileSync('docs/SEO/maintenance/gsc-request-indexing-backlog.md', 'utf8');
    const rowPattern =
      /- \[[ x]\] `https:\/\/myimageupscaler\.com\/blog\/topaz-labs-free-trial`[^\n]*/g;
    const rows = backlog.match(rowPattern) ?? [];

    expect(rows).toHaveLength(1);
    // Reopened 2026-10-26 after the rung-2 LOSS rollback, then API-resolved on Oct 29.
    expect(rows[0]).toContain('- [x]');
    expect(rows[0]).toContain('API-resolved 2026-10-29');
    expect(rows[0]).toContain('2026-10-26 reopening');
    expect(rows[0]).toContain('rung-2 LOSS');
    expect(rows[0]).toContain('API-resolved Oct 5');
  });
});
