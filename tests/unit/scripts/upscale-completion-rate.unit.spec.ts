import { describe, expect, it } from 'vitest';
import {
  buildUpscaleHealthReport,
  calculateUpscaleCompletionRate,
  formatUpscaleHealthReport,
  getCompleteDayRange,
} from '../../../scripts/diagnostics/upscale-completion-rate';

function result(
  eventType: string,
  dates: string[],
  totals: number[]
): {
  eventType: string;
  metric: 'totals';
  start: string;
  end: string;
  xValues: string[];
  dailyTotals: number[];
  total: number;
} {
  return {
    eventType,
    metric: 'totals',
    start: '20260801',
    end: '20260803',
    xValues: dates,
    dailyTotals: totals,
    total: totals.reduce((sum, value) => sum + value, 0),
  };
}

describe('upscale completion-rate diagnostic', () => {
  it('reports the healthy baseline ratio for a complete day', () => {
    const report = buildUpscaleHealthReport({
      started: result('image_upscale_started', ['2026-08-01'], [257]),
      completed: result('upscale_completed', ['2026-08-01'], [249]),
      failed: result('processing_failed', ['2026-08-01'], [8]),
    });

    expect(report.lastCompleteDay).toMatchObject({
      date: '2026-08-01',
      started: 257,
      completed: 249,
      processingFailed: 8,
      completionRate: 249 / 257,
      unaccounted: 0,
    });
    expect(formatUpscaleHealthReport(report)).toContain('2026-08-01');
  });

  it('reports the August 03 incident ratio and unaccounted attempts', () => {
    const report = buildUpscaleHealthReport({
      started: result('image_upscale_started', ['2026-08-03'], [508]),
      completed: result('upscale_completed', ['2026-08-03'], [247]),
      failed: result('processing_failed', ['2026-08-03'], [16]),
    });

    expect(report.lastCompleteDay?.completionRate).toBeCloseTo(0.49, 2);
    expect(report.lastCompleteDay?.unaccounted).toBe(245);
    expect(report.lastCompleteDay?.completionRate).toBeLessThan(report.threshold);
  });

  it('uses the previous UTC date as the end of the complete-day range', () => {
    expect(getCompleteDayRange(new Date('2026-08-10T12:00:00.000Z'), 3)).toEqual({
      startDate: '20260807',
      endDate: '20260809',
    });
    expect(calculateUpscaleCompletionRate(0, 0)).toBeNull();
  });
});
