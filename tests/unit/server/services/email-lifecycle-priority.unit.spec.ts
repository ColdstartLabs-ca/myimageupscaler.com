import { describe, expect, it } from 'vitest';
import { evaluateCampaignFrequencyCap } from '@server/services/email-lifecycle.service';

const emptyHistory = {
  revenueCriticalLast72Hours: 0,
  revenueCriticalLast7Days: 0,
  lifecycleEducationLast7Days: 0,
  allMarketingLast7Days: 0,
};

describe('lifecycle campaign priority caps', () => {
  it('should allow revenue-critical email after 72 hours', () => {
    expect(
      evaluateCampaignFrequencyCap({
        ...emptyHistory,
        priority: 'revenue_critical',
        revenueCriticalLast7Days: 1,
      })
    ).toBeNull();
  });

  it('should cap revenue-critical email at two per rolling seven days', () => {
    expect(
      evaluateCampaignFrequencyCap({
        ...emptyHistory,
        priority: 'revenue_critical',
        revenueCriticalLast7Days: 2,
      })
    ).toBe('suppressed_revenue_weekly_cap');
  });

  it('should keep lifecycle and education limited to one per seven days', () => {
    expect(
      evaluateCampaignFrequencyCap({
        ...emptyHistory,
        priority: 'education',
        lifecycleEducationLast7Days: 1,
      })
    ).toBe('suppressed_lifecycle_weekly_cap');
  });

  it('should enforce emergency ceiling across campaign priorities', () => {
    expect(
      evaluateCampaignFrequencyCap({
        ...emptyHistory,
        priority: 'revenue_critical',
        allMarketingLast7Days: 3,
      })
    ).toBe('suppressed_emergency_ceiling');
  });

  it('should not frequency-cap transactional email', () => {
    expect(
      evaluateCampaignFrequencyCap({
        priority: 'transactional',
        revenueCriticalLast72Hours: 10,
        revenueCriticalLast7Days: 10,
        lifecycleEducationLast7Days: 10,
        allMarketingLast7Days: 10,
      })
    ).toBeNull();
  });
});
