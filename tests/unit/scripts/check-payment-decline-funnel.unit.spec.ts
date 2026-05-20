import { describe, expect, test, vi } from 'vitest';

vi.mock('@server/analytics/dashboardApi', () => ({
  getAmplitudeEventTotals: vi.fn(),
}));

import {
  getCheckStatus,
  getFailureReason,
  shouldExitWithFailure,
} from '../../../scripts/check-payment-decline-funnel';

const criticalCheck = {
  label: 'checkout opened',
  eventType: 'checkout_opened',
  critical: true,
};

const optionalCheck = {
  label: 'purchase confirmed',
  eventType: 'purchase_confirmed',
};

function result(total: number) {
  return {
    eventType: 'checkout_opened',
    metric: 'totals' as const,
    start: '20260520',
    end: '20260520',
    xValues: ['2026-05-20'],
    dailyTotals: [total],
    total,
  };
}

describe('check-payment-decline-funnel status evaluation', () => {
  test('fails critical downstream events when direct clicks exist but event is missing', () => {
    expect(
      getCheckStatus({
        check: criticalCheck,
        result: result(0),
        directClicks: 100,
        minCriticalRatio: 0.8,
      })
    ).toBe('FAIL');
  });

  test('fails critical downstream events below the minimum direct-click ratio', () => {
    const status = getCheckStatus({
      check: criticalCheck,
      result: result(30),
      directClicks: 100,
      minCriticalRatio: 0.8,
    });

    const reason = getFailureReason({
      check: criticalCheck,
      result: result(30),
      directClicks: 100,
      minCriticalRatio: 0.8,
    });

    expect(status).toBe('FAIL');
    expect(reason).toContain('below ratio 0.30 < 0.8');
  });

  test('passes critical downstream events at or above the minimum direct-click ratio', () => {
    expect(
      getCheckStatus({
        check: criticalCheck,
        result: result(85),
        directClicks: 100,
        minCriticalRatio: 0.8,
      })
    ).toBe('OK');
  });

  test('does not fail optional events when they are missing', () => {
    expect(
      getCheckStatus({
        check: optionalCheck,
        result: result(0),
        directClicks: 100,
        minCriticalRatio: 0.8,
      })
    ).toBe('WARN');
  });

  test('strict mode fails when no direct-checkout clicks exist to verify', () => {
    expect(
      shouldExitWithFailure({
        directClicks: 0,
        failures: [],
        strict: true,
      })
    ).toBe(true);
  });

  test('non-strict mode does not fail when no direct-checkout clicks exist', () => {
    expect(
      shouldExitWithFailure({
        directClicks: 0,
        failures: [],
        strict: false,
      })
    ).toBe(false);
  });
});
