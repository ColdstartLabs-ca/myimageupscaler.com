import { describe, expect, it } from 'vitest';
import {
  buildRecoveryCohortCheckResults,
  formatRecoveryCohortCheckLine,
  maskCohortId,
} from '@/scripts/check-recovery-cohorts';

describe('check-recovery-cohorts script helpers', () => {
  it('should mask configured cohort IDs in output', () => {
    expect(maskCohortId('i1u84c2g')).toBe('i1***2g');
    expect(maskCohortId('abc')).toBe('***');
  });

  it('should report discoverable cohorts without member identifiers', () => {
    const results = buildRecoveryCohortCheckResults(
      [
        {
          id: 'i1u84c2g',
          name: 'Checkout Abandoners',
          size: 60,
          syncMetadata: [{ destination: 'none' }],
        },
      ],
      [
        {
          label: 'checkout abandoners',
          cohortId: 'i1u84c2g',
        },
      ]
    );

    expect(results).toEqual([
      {
        label: 'checkout abandoners',
        cohortId: 'i1u84c2g',
        maskedCohortId: 'i1***2g',
        found: true,
        name: 'Checkout Abandoners',
        size: 60,
        syncDestinations: 1,
      },
    ]);
    expect(formatRecoveryCohortCheckLine(results[0])).toBe(
      'OK checkout abandoners: cohort i1***2g | name="Checkout Abandoners" | size=60 | syncDestinations=1'
    );
  });

  it('should report missing cohorts with only masked IDs', () => {
    const [result] = buildRecoveryCohortCheckResults(
      [],
      [
        {
          label: 'upgrade clickers no purchase',
          cohortId: 'o4y4ltj8',
        },
      ]
    );

    expect(result.found).toBe(false);
    expect(formatRecoveryCohortCheckLine(result)).toBe(
      'FAIL upgrade clickers no purchase: cohort o4***j8 was not discoverable'
    );
  });
});
