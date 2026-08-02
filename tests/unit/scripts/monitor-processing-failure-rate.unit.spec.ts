import { describe, expect, it } from 'vitest';
import {
  buildBoundedFailureSegments,
  calculateFailureRate,
  deduplicateTerminalAttempts,
  monitorProcessingFailureRate,
  normalizeBoundedSegment,
  parseCliArgs,
  type IProcessingTerminalAttempt,
} from '../../../scripts/monitor-processing-failure-rate';

const AS_OF = '2026-07-26T01:00:00.000Z';
const BASE_TIMESTAMP = Date.parse('2026-07-26T00:00:00.000Z');

function timestampAtMinute(minute: number): string {
  return new Date(BASE_TIMESTAMP + minute * 60 * 1000).toISOString();
}

function makeWindowAttempts(
  startMinute: number,
  failureCount: number,
  idPrefix: string
): IProcessingTerminalAttempt[] {
  return Array.from({ length: 20 }, (_, index) => ({
    attemptId: `${idPrefix}-${index}`,
    occurredAt: timestampAtMinute(startMinute + 1 + (index % 13)),
    outcome: index < failureCount ? ('failure' as const) : ('success' as const),
    errorType: index < failureCount ? 'provider_error' : undefined,
    reason: index < failureCount ? 'upstream_unavailable' : undefined,
    provider: index < failureCount ? 'replicate' : undefined,
    model: index < failureCount ? 'high' : undefined,
  }));
}

describe('processing failure-rate monitor', () => {
  it('stays normal when eligible windows remain below warning thresholds', () => {
    const evaluation = monitorProcessingFailureRate({
      attempts: [...makeWindowAttempts(30, 0, 'previous'), ...makeWindowAttempts(45, 0, 'current')],
      asOf: AS_OF,
      sevenDayBaselineRate: 0.02,
    });

    expect(evaluation.status).toBe('normal');
    expect(evaluation.currentWindow.terminalAttempts).toBe(20);
    expect(evaluation.alertPayload).toBeUndefined();
  });

  it('warns only after two consecutive eligible windows reach five percent', () => {
    const evaluation = monitorProcessingFailureRate({
      attempts: [...makeWindowAttempts(30, 1, 'previous'), ...makeWindowAttempts(45, 1, 'current')],
      asOf: AS_OF,
      sevenDayBaselineRate: 0.04,
    });

    expect(evaluation.status).toBe('warning');
    expect(evaluation.consecutiveWarningWindows).toBe(2);
    expect(evaluation.alertPayload).toMatchObject({
      successfulAttempts: 19,
      failures: 1,
      terminalAttempts: 20,
      failureRate: 0.05,
    });
  });

  it('raises critical for a single ten-percent window or a three-times baseline', () => {
    const rateCritical = monitorProcessingFailureRate({
      attempts: makeWindowAttempts(45, 2, 'rate-critical'),
      asOf: AS_OF,
      windowCount: 1,
      sevenDayBaselineRate: 0.04,
    });
    expect(rateCritical.status).toBe('critical');
    expect(rateCritical.currentWindow.failureRate).toBe(0.1);

    const baselineCritical = monitorProcessingFailureRate({
      attempts: makeWindowAttempts(45, 1, 'baseline-critical'),
      asOf: AS_OF,
      windowCount: 1,
      sevenDayBaselineRate: 0.01,
    });
    expect(baselineCritical.status).toBe('critical');
    expect(baselineCritical.baselineMultiple).toBe(5);
  });

  it('treats a positive eligible rate against a zero baseline as critical', () => {
    const evaluation = monitorProcessingFailureRate({
      attempts: makeWindowAttempts(45, 1, 'zero-baseline'),
      asOf: AS_OF,
      windowCount: 1,
      sevenDayBaselineRate: 0,
    });

    expect(evaluation.status).toBe('critical');
    expect(evaluation.reason).toContain('baseline was zero');
  });

  it('does not alert on low-volume noise', () => {
    const evaluation = monitorProcessingFailureRate({
      attempts: makeWindowAttempts(45, 5, 'low-volume').slice(0, 19),
      asOf: AS_OF,
      windowCount: 1,
    });

    expect(evaluation.status).toBe('insufficient_data');
    expect(evaluation.currentWindow.terminalAttempts).toBe(19);
    expect(evaluation.alertPayload).toBeUndefined();
  });

  it('bounds and normalizes top error/provider/model segments', () => {
    const attempts = Array.from({ length: 7 }, (_, index) => ({
      attemptId: `segment-${index}`,
      occurredAt: timestampAtMinute(46 + index),
      outcome: 'failure' as const,
      errorType: `error_${index}`,
      reason: index === 0 ? 'Provider timeout' : undefined,
      provider: index < 2 ? 'Provider A' : `provider_${index}`,
      model: index < 2 ? 'model/high' : `model_${index}`,
    }));
    const segments = buildBoundedFailureSegments(attempts);

    expect(segments.errorTypes).toHaveLength(5);
    expect(segments.reasons[0]?.value).toBe('unknown');
    expect(segments.providers.map(segment => segment.value)).toContain('provider_a');
    expect(segments.models[0]?.value).toBe('model/high');
    expect(normalizeBoundedSegment('raw provider message!')).toBe('unknown');
  });

  it('deduplicates identical terminal records and rejects conflicting outcomes', () => {
    expect(
      deduplicateTerminalAttempts([
        { attemptId: 'same', occurredAt: timestampAtMinute(1), outcome: 'success' },
        { attemptId: 'same', occurredAt: timestampAtMinute(1), outcome: 'success' },
      ])
    ).toHaveLength(1);
    expect(() =>
      deduplicateTerminalAttempts([
        { attemptId: 'same', occurredAt: timestampAtMinute(1), outcome: 'success' },
        { attemptId: 'same', occurredAt: timestampAtMinute(2), outcome: 'failure' },
      ])
    ).toThrow('Conflicting terminal outcomes');
    expect(
      calculateFailureRate([
        { attemptId: 'one', occurredAt: timestampAtMinute(1), outcome: 'failure' },
      ])
    ).toEqual({
      successfulAttempts: 0,
      failedAttempts: 1,
      terminalAttempts: 1,
      failureRate: 1,
    });
  });

  it('requires explicit mode and a local input path at the CLI boundary', () => {
    expect(() => parseCliArgs(['--mode', 'live', '--input', 'attempts.json'])).toThrow(
      'allow-live-read'
    );
    expect(parseCliArgs(['--mode', 'test', '--input', 'attempts.json', '--test-alert'])).toEqual({
      mode: 'test',
      inputPath: 'attempts.json',
      allowLiveRead: false,
      testAlert: true,
      strict: false,
      help: false,
    });
    expect(() => parseCliArgs(['--mode', 'test'])).toThrow('--input');
  });
});
