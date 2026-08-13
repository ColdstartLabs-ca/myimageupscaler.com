import { describe, expect, it } from 'vitest';
import {
  evaluateIndexationGate,
  getIndexationGateBaseRef,
  hasPseoRowsAdded,
  INDEXATION_THRESHOLD,
  type IIndexationGateEvidence,
} from '@/scripts/seo/check-indexation-gate';

const NOW = new Date('2026-08-13T12:00:00.000Z');
const evidence: IIndexationGateEvidence = {
  reportPath: 'seo-reports/indexation-2026-08-13.md',
  reportDate: '2026-08-13T00:00:00.000Z',
  indexationRate: 59.07,
  snapshotPath: 'content/pseo-performance.json',
  snapshotGeneratedAt: '2026-08-13T00:00:00.000Z',
};

describe('pSEO indexation gate', () => {
  it('blocks new pSEO rows below the indexation threshold', () => {
    const diff = '+      "slug": "fake-new-matrix-page",';
    const result = evaluateIndexationGate({ evidence, diff, now: NOW });

    expect(INDEXATION_THRESHOLD).toBe(85);
    expect(hasPseoRowsAdded(diff)).toBe(true);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('required: 85%');
  });

  it('allows existing changes below the threshold when no pSEO row was added', () => {
    const result = evaluateIndexationGate({
      evidence,
      diff: '+      "metaDescription": "Updated copy",',
      now: NOW,
    });

    expect(result.blocked).toBe(false);
  });

  it('allows new pSEO rows at or above the threshold', () => {
    const result = evaluateIndexationGate({
      evidence: { ...evidence, indexationRate: 85 },
      diff: '+      "slug": "new-page",',
      now: NOW,
    });

    expect(result.blocked).toBe(false);
  });

  it('blocks stale evidence with the refresh command', () => {
    const result = evaluateIndexationGate({
      evidence: { ...evidence, reportDate: '2026-07-01T00:00:00.000Z' },
      diff: '',
      now: NOW,
    });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('yarn seo:sync:performance');
  });

  it('uses the committed parent as the default diff base', () => {
    expect(getIndexationGateBaseRef([])).toBe('HEAD^');
    expect(getIndexationGateBaseRef(['node', 'gate', '--base-ref=origin/master'])).toBe(
      'origin/master'
    );
  });

  it('blocks a low-indexation row added in the post-commit diff', () => {
    const committedDiff = [
      'diff --git a/app/seo/data/tools.json b/app/seo/data/tools.json',
      '--- a/app/seo/data/tools.json',
      '+++ b/app/seo/data/tools.json',
      '+    { "slug": "new-low-indexed-matrix-page" }',
    ].join('\n');

    const result = evaluateIndexationGate({ evidence, diff: committedDiff, now: NOW });

    expect(hasPseoRowsAdded(committedDiff)).toBe(true);
    expect(result.blocked).toBe(true);
  });
});
