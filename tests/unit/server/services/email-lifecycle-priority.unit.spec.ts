import { describe, expect, it } from 'vitest';
import {
  evaluateCampaignFrequencyCap,
  LIFECYCLE_DELIVERED_HISTORY_STATUS,
  type CampaignPriority,
} from '@server/services/email-lifecycle.service';

const emptyHistory = {
  revenueCriticalLast72Hours: 0,
  revenueCriticalLast7Days: 0,
  lifecycleEducationLast7Days: 0,
  allMarketingLast7Days: 0,
};

interface IHistoryFixture {
  status: 'pending' | 'sent';
  priority: Exclude<CampaignPriority, 'transactional'>;
  ageHours: number;
}

function evaluateFixture(priority: CampaignPriority, rows: IHistoryFixture[]): string | null {
  const sent = rows.filter(row => row.status === LIFECYCLE_DELIVERED_HISTORY_STATUS);
  return evaluateCampaignFrequencyCap({
    priority,
    revenueCriticalLast72Hours: sent.filter(
      row => row.priority === 'revenue_critical' && row.ageHours <= 72
    ).length,
    revenueCriticalLast7Days: sent.filter(
      row => row.priority === 'revenue_critical' && row.ageHours <= 7 * 24
    ).length,
    lifecycleEducationLast7Days: sent.filter(
      row =>
        (row.priority === 'lifecycle' || row.priority === 'education') && row.ageHours <= 7 * 24
    ).length,
    allMarketingLast7Days: sent.filter(row => row.ageHours <= 7 * 24).length,
  });
}

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

  it('should exclude pending rows at the delivered-history query boundary', () => {
    expect(LIFECYCLE_DELIVERED_HISTORY_STATUS).toBe('sent');
    expect(
      evaluateFixture('revenue_critical', [
        { status: 'pending', priority: 'revenue_critical', ageHours: 1 },
      ])
    ).toBeNull();
  });

  it('should count only sent rows for revenue lifecycle and emergency cap matrix', () => {
    expect(
      evaluateFixture('revenue_critical', [
        { status: 'pending', priority: 'revenue_critical', ageHours: 1 },
        { status: 'sent', priority: 'revenue_critical', ageHours: 1 },
      ])
    ).toBe('suppressed_revenue_72h_cap');

    expect(
      evaluateFixture('education', [
        { status: 'pending', priority: 'education', ageHours: 1 },
        { status: 'sent', priority: 'lifecycle', ageHours: 1 },
      ])
    ).toBe('suppressed_lifecycle_weekly_cap');

    expect(
      evaluateFixture('revenue_critical', [
        { status: 'pending', priority: 'education', ageHours: 1 },
        { status: 'sent', priority: 'education', ageHours: 1 },
        { status: 'sent', priority: 'lifecycle', ageHours: 2 },
        { status: 'sent', priority: 'revenue_critical', ageHours: 80 },
      ])
    ).toBe('suppressed_emergency_ceiling');
  });
});
