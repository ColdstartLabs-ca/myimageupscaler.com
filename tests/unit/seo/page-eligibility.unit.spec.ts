import { describe, expect, it } from 'vitest';
import {
  GRACE_PERIOD_DAYS,
  PINNED_SLUGS,
  getEligibilityReason,
  shouldSubmit,
} from '@/lib/seo/page-eligibility';

const NOW = new Date('2026-08-13T12:00:00.000Z');

describe('pSEO page eligibility', () => {
  it('keeps a page with impressions in the last 90 days', () => {
    expect(shouldSubmit('tools', 'convert-jpeg-to-png', 'en', '2025-01-01', NOW)).toBe(true);
    expect(getEligibilityReason('tools', 'convert-jpeg-to-png', 'en', '2025-01-01', NOW)).toBe(
      'impressions'
    );
  });

  it('keeps pages younger than the grace period even without impressions', () => {
    const lastUpdated = new Date(NOW.getTime() - (GRACE_PERIOD_DAYS - 1) * 24 * 60 * 60 * 1000);

    expect(shouldSubmit('tools', 'new-matrix-page', 'en', lastUpdated.toISOString(), NOW)).toBe(
      true
    );
    expect(
      getEligibilityReason('tools', 'new-matrix-page', 'en', lastUpdated.toISOString(), NOW)
    ).toBe('grace-period');
  });

  it('never prunes blog posts', () => {
    expect(shouldSubmit('blog', 'old-post', 'en', '2020-01-01', NOW)).toBe(true);
    expect(getEligibilityReason('blog', 'old-post', 'en', '2020-01-01', NOW)).toBe('blog');
  });

  it('prunes an old zero-impression page from the committed verdict', () => {
    expect(
      shouldSubmit('tools', 'resize-image-for-instagram', 'fr', '2025-01-01T00:00:00.000Z', NOW)
    ).toBe(false);
  });

  it('keeps explicitly pinned pages', () => {
    expect(PINNED_SLUGS.has('tools/ai-image-upscaler')).toBe(true);
    expect(shouldSubmit('tools', 'ai-image-upscaler', 'ja', '2020-01-01', NOW)).toBe(true);
  });
});
