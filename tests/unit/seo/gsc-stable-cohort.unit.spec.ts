import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildStableCohortPosition,
} = require('../../../.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs');

describe('GSC stable page cohort', () => {
  it('should hold cohort position steady when new deep-ranking pages are added', () => {
    const previous = [{ page: '/stable', impressions: 1000, clicks: 100, position: 5 }];
    const current = [
      { page: '/stable', impressions: 1000, clicks: 100, position: 5 },
      ...Array.from({ length: 280 }, (_, index) => ({
        page: `/new-${index}`,
        impressions: 100,
        clicks: 0,
        position: 68,
      })),
    ];
    expect(buildStableCohortPosition(current, previous)).toEqual({
      pageCount: 1,
      current: 5,
      previous: 5,
    });
  });

  it('should exclude pages absent from either period', () => {
    const result = buildStableCohortPosition(
      [
        { page: '/stable', impressions: 10, clicks: 1, position: 4 },
        { page: '/new', impressions: 20, clicks: 0, position: 60 },
      ],
      [
        { page: '/stable', impressions: 10, clicks: 1, position: 6 },
        { page: '/lost', impressions: 20, clicks: 0, position: 50 },
      ]
    );
    expect(result).toMatchObject({ pageCount: 1, current: 4, previous: 6 });
  });
});
