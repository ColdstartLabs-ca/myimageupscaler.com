import { describe, expect, it } from 'vitest';
import { evaluateHeadTermGate, type IHeadTermEvidence } from '@/scripts/seo/check-head-term-gate';

function evidence(position: number, generatedAt = '2026-08-25T00:00:00Z'): IHeadTermEvidence {
  return {
    generatedAt,
    query: 'image upscaler',
    position,
    period: { startDate: '2026-07-26', endDate: '2026-08-22', days: 28 },
  };
}

describe('image upscaler head-term gate', () => {
  it('should fail at the observed Aug 12-23 position', () => {
    expect(evaluateHeadTermGate(evidence(14.4), new Date('2026-08-25T00:00:00Z')).blocked).toBe(
      true
    );
  });

  it('should pass at the Jul 31-Aug 11 baseline', () => {
    expect(evaluateHeadTermGate(evidence(9.5), new Date('2026-08-25T00:00:00Z')).blocked).toBe(
      false
    );
  });

  it('should fail when the evidence is stale', () => {
    expect(() =>
      evaluateHeadTermGate(evidence(9.5, '2026-07-01T00:00:00Z'), new Date('2026-08-25T00:00:00Z'))
    ).toThrow('stale or invalid');
  });
});
