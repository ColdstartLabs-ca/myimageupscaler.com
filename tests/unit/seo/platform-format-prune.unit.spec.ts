/**
 * PRD-TR-2026-11-02 Phase 3: zero-click platform-format pages are noindexed
 * and dropped from sitemaps, matching the committed bloat manifest.
 */
import { describe, it, expect } from 'vitest';
import manifest from '../../../docs/SEO/reports/2026-11-21-index-bloat-manifest.json';
import platformFormat from '../../../app/seo/data/platform-format.json';
import { filterEligibleSitemapEntries } from '@/lib/seo/page-eligibility';

interface IRow {
  slug: string;
  noindex?: boolean;
  lastUpdated?: string;
}

const pages = (platformFormat as { pages: IRow[] }).pages;
const manifestRows = (
  manifest as { pseo: { category: string; slug: string; disposition: string }[] }
).pseo;

describe('platform-format zero-click prune', () => {
  const pruned = new Set(
    manifestRows
      .filter(r => r.category === 'platform-format' && r.disposition === 'NOINDEX_UNPUBLISH')
      .map(r => r.slug)
  );

  it('flags exactly the manifest NOINDEX_UNPUBLISH rows as noindex', () => {
    const flagged = new Set(pages.filter(p => p.noindex === true).map(p => p.slug));
    expect(pruned.size).toBeGreaterThan(0);
    expect([...flagged].sort()).toEqual([...pruned].sort());
  });

  it('keeps every manifest KEEP row indexable', () => {
    const kept = manifestRows.filter(
      r => r.category === 'platform-format' && r.disposition === 'KEEP'
    );
    for (const row of kept) {
      expect(pages.find(p => p.slug === row.slug)?.noindex).not.toBe(true);
    }
  });

  it('drops noindexed rows from the sitemap', () => {
    const eligible = filterEligibleSitemapEntries(
      pages,
      'platform-format',
      'en',
      p => `/platform-format/${p.slug}`,
      p => p.lastUpdated
    );
    for (const p of eligible) expect(pruned.has(p.slug)).toBe(false);
  });
});
