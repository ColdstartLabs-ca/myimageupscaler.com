import { describe, expect, it, vi } from 'vitest';

/**
 * PRD-TR-2026-11-02 Phase 3: translated pSEO twins must earn clicks, not just
 * impressions, to stay indexable. English keeps the impressions rule.
 */
vi.mock('@/content/pseo-performance.json', () => ({
  default: {
    generatedAt: '2026-11-21T00:00:00.000Z',
    pages: [
      {
        category: 'alternatives',
        slug: 'vs-canva',
        locale: 'fr',
        impressions: 10,
        clicks: 0,
        lastUpdated: '2025-01-01',
      },
      {
        category: 'alternatives',
        slug: 'vs-waifu2x',
        locale: 'es',
        impressions: 40,
        clicks: 2,
        lastUpdated: '2025-01-01',
      },
      {
        category: 'alternatives',
        slug: 'vs-canva',
        locale: 'en',
        impressions: 50,
        clicks: 0,
        lastUpdated: '2025-01-01',
      },
    ],
  },
}));

import { shouldSubmit, getEligibilityReason } from '@/lib/seo/page-eligibility';

const NOW = new Date('2026-11-21T00:00:00.000Z');

describe('translated zero-click pSEO pages', () => {
  it('drops a translated twin with impressions but no clicks', () => {
    expect(shouldSubmit('alternatives', 'vs-canva', 'fr', '2025-01-01', NOW)).toBe(false);
    expect(getEligibilityReason('alternatives', 'vs-canva', 'fr', '2025-01-01', NOW)).toBe(
      'pruned'
    );
  });

  it('keeps a translated twin that earns clicks', () => {
    expect(shouldSubmit('alternatives', 'vs-waifu2x', 'es', '2025-01-01', NOW)).toBe(true);
  });

  it('keeps the English impressions rule', () => {
    expect(shouldSubmit('alternatives', 'vs-canva', 'en', '2025-01-01', NOW)).toBe(true);
  });

  it('still gives a new translated page its grace period', () => {
    expect(shouldSubmit('alternatives', 'vs-canva', 'fr', '2026-11-01', NOW)).toBe(true);
  });
});
