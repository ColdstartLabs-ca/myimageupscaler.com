import { describe, expect, it, vi } from 'vitest';

vi.unmock('dayjs');
import {
  analyzeConversionCohorts,
  MIN_SEGMENT_SIGNUPS,
  type ICohortAnalysisInput,
} from '@/scripts/analyze-conversion-cohorts';

const segment = {
  sourceMedium: 'google / organic',
  landingPageFamily: 'tools',
  pricingTier: 'tier_1',
  region: 'US',
  device: 'desktop',
  authState: 'authenticated',
  isPseo: false,
} as const;

function signups(month: '2026-02' | '2026-06', count: number, suffix: string) {
  return Array.from({ length: count }, (_, index) => ({
    signupId: `${suffix}-${index}`,
    signedUpAt: `${month}-01T00:00:00.000Z`,
    ...segment,
  }));
}

function purchases(ids: string[], month: '2026-02' | '2026-06') {
  return ids.map((signupId, index) => ({
    purchaseId: `${signupId}-purchase`,
    signupId,
    confirmedAt: `${month}-02T00:00:${String(index).padStart(2, '0')}.000Z`,
    refunded: false,
    isInternal: false,
    isTest: false,
  }));
}

function analyze(input: Partial<ICohortAnalysisInput>) {
  return analyzeConversionCohorts({
    asOf: '2026-07-10T00:00:00.000Z',
    baselineMonth: '2026-02',
    comparisonMonth: '2026-06',
    signups: [],
    purchases: [],
    minSegmentSignups: 1,
    ...input,
  });
}

describe('conversion cohort decomposition', () => {
  it('should isolate a known traffic mix shift when segment conversion rates are unchanged', () => {
    const febA = signups('2026-02', 80, 'feb-a');
    const febB = signups('2026-02', 20, 'feb-b').map(row => ({
      ...row,
      sourceMedium: 'social / paid',
    }));
    const juneA = signups('2026-06', 20, 'jun-a');
    const juneB = signups('2026-06', 80, 'jun-b').map(row => ({
      ...row,
      sourceMedium: 'social / paid',
    }));

    const result = analyze({
      signups: [...febA, ...febB, ...juneA, ...juneB],
      purchases: [
        ...purchases(
          febA.slice(0, 16).map(row => row.signupId),
          '2026-02'
        ),
        ...purchases(
          febB.slice(0, 1).map(row => row.signupId),
          '2026-02'
        ),
        ...purchases(
          juneA.slice(0, 4).map(row => row.signupId),
          '2026-06'
        ),
        ...purchases(
          juneB.slice(0, 4).map(row => row.signupId),
          '2026-06'
        ),
      ],
    });

    const window = result.windows.find(row => row.maturityDays === 30)!;
    expect(window.decomposition.baselineRate).toBeCloseTo(0.17);
    expect(window.decomposition.comparisonRate).toBeCloseTo(0.08);
    expect(window.decomposition.mixEffectBuyers).toBeCloseTo(-9);
    expect(window.decomposition.withinSegmentEffectBuyers).toBeCloseTo(0);
  });

  it('should isolate and rank a known within-segment regression', () => {
    const feb = signups('2026-02', 100, 'feb');
    const june = signups('2026-06', 100, 'jun').map((row, index) => ({
      ...row,
      activatedAt: `2026-06-02T00:00:${String(index % 60).padStart(2, '0')}.000Z`,
      upgradeClickedAt: `2026-06-03T00:00:${String(index % 40).padStart(2, '0')}.000Z`,
      checkoutOpenedAt: index < 10 ? '2026-06-04T00:00:00.000Z' : undefined,
    }));
    const febWithFunnel = feb.map((row, index) => ({
      ...row,
      activatedAt: '2026-02-02T00:00:00.000Z',
      upgradeClickedAt: index < 60 ? '2026-02-03T00:00:00.000Z' : undefined,
      checkoutOpenedAt: index < 40 ? '2026-02-04T00:00:00.000Z' : undefined,
    }));

    const result = analyze({
      signups: [...febWithFunnel, ...june],
      purchases: [
        ...purchases(
          feb.slice(0, 20).map(row => row.signupId),
          '2026-02'
        ),
        ...purchases(
          june.slice(0, 5).map(row => row.signupId),
          '2026-06'
        ),
      ],
    });
    const window = result.windows.find(row => row.maturityDays === 30)!;

    expect(window.decomposition.mixEffectBuyers).toBeCloseTo(0);
    expect(window.decomposition.withinSegmentEffectBuyers).toBeCloseTo(-15);
    expect(window.rankedLostBuyerSegments[0]).toMatchObject({
      expectedBuyers: 20,
      actualBuyers: 5,
      baselineConversionRate: 0.2,
      comparisonConversionRate: 0.05,
      lostBuyers: 15,
      action: { kind: 'prd_phase', phase: 'Phase 1 — model_gate Direct Checkout' },
    });
  });

  it('should enforce maturity, exclusions, join coverage, and tiny-segment suppression', () => {
    const mature = signups('2026-06', 2, 'mature');
    const input: ICohortAnalysisInput = {
      asOf: '2026-07-10T00:00:00.000Z',
      baselineMonth: '2026-02',
      comparisonMonth: '2026-06',
      minSegmentSignups: 3,
      signups: [
        ...signups('2026-02', 2, 'baseline'),
        ...mature,
        { ...mature[0], signupId: 'internal', isInternal: true },
        { ...mature[0], signupId: 'test', isTest: true },
        { ...mature[0], signupId: 'late', signedUpAt: '2026-06-20T00:00:00.000Z' },
      ],
      purchases: [
        ...purchases([mature[0].signupId], '2026-06'),
        { ...purchases(['refunded'], '2026-06')[0], refunded: true },
        { ...purchases(['external'], '2026-06')[0], signupId: null },
      ],
    };

    const result = analyzeConversionCohorts(input);
    const thirtyDay = result.windows.find(row => row.maturityDays === 30)!;
    expect(MIN_SEGMENT_SIGNUPS).toBe(20);
    expect(thirtyDay.cohorts.find(row => row.month === '2026-06')?.signupCount).toBe(2);
    expect(thirtyDay.suppressedSegmentCount).toBe(1);
    expect(result.purchaseJoinCoverage).toMatchObject({
      eligiblePurchaseCount: 2,
      joinedPurchaseCount: 1,
      unmatchedPurchaseCount: 1,
      joinRate: 0.5,
      unmatchedByReason: { missing_signup_id: 1 },
    });
  });
});
