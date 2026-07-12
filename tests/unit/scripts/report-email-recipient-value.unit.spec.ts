import { describe, expect, it, vi } from 'vitest';

const getPerformanceReportMock = vi.hoisted(() => vi.fn());

vi.mock('@server/services/email-recipient-value.service', () => ({
  getEmailRecipientValueService: () => ({ getPerformanceReport: getPerformanceReportMock }),
}));

import {
  addEvidenceStatus,
  buildReportEmailRecipientValueOutput,
  calculateWilsonInterval,
  filterPrivacySafePerformanceRows,
  parseReportEmailRecipientValueArgs,
} from '../../../scripts/report-email-recipient-value';

function makeRow(sentCount: number) {
  return {
    country: 'US',
    pricing_region: 'standard',
    campaign_key: 'campaign',
    policy_version: 'v1',
    value_band: 'medium',
    sent_count: sentCount,
    purchased_after_email_count: Math.floor(sentCount / 10),
  };
}

describe('report-email-recipient-value CLI', () => {
  it('should suppress groups with fewer than twenty sends', () => {
    expect(filterPrivacySafePerformanceRows([makeRow(19), makeRow(20)])).toHaveLength(1);
    expect(buildReportEmailRecipientValueOutput([makeRow(19)])).toMatchObject({ rows: [] });
  });

  it('should mark fewer than one hundred sends insufficient without a recommendation', () => {
    expect(addEvidenceStatus(makeRow(99))).toMatchObject({
      evidence_status: 'insufficient_evidence',
      recommendation: null,
    });
  });

  it('should calculate the Wilson interval for a known conversion fixture', () => {
    const interval = calculateWilsonInterval(5, 20);
    expect(interval.lower).toBeCloseTo(0.1119, 3);
    expect(interval.upper).toBeCloseTo(0.4687, 3);
  });

  it('should accept only the supported 7/14/30-day report windows', () => {
    expect(parseReportEmailRecipientValueArgs([])).toEqual({ days: 30 });
    expect(parseReportEmailRecipientValueArgs(['--days=7'])).toEqual({ days: 7 });
    expect(() => parseReportEmailRecipientValueArgs(['--days'])).toThrow(/requires a value/);
    expect(() => parseReportEmailRecipientValueArgs(['--days', '8'])).toThrow(/7, 14, or 30/);
    expect(() => parseReportEmailRecipientValueArgs(['--write'])).toThrow(/Unknown argument/);
  });
});
