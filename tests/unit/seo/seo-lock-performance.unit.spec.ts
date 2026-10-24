import { describe, expect, it } from 'vitest';
import {
  classifySeoChange,
  type ISeoChangeInput,
} from '@/lib/seo/seo-lock-performance';

const BASE: ISeoChangeInput = {
  beforeClicks: 100,
  afterClicks: 100,
  controlBeforeClicks: 1000,
  controlAfterClicks: 1000,
  heldDays: 21,
};

function classify(overrides: Partial<ISeoChangeInput>) {
  return classifySeoChange({ ...BASE, ...overrides });
}

describe('classifySeoChange', () => {
  it('returns FLAT when the whole site declines proportionally to the page', () => {
    expect(
      classify({
        beforeClicks: 100,
        afterClicks: 50,
        controlBeforeClicks: 1000,
        controlAfterClicks: 500,
      }),
    ).toBe('FLAT');
  });

  it('returns LOSS when the page underperforms the control by more than 25%', () => {
    expect(
      classify({
        beforeClicks: 100,
        afterClicks: 40,
        controlBeforeClicks: 1000,
        controlAfterClicks: 900,
      }),
    ).toBe('LOSS');
  });

  it('returns WIN when the page beats the control by at least 25%', () => {
    expect(
      classify({
        beforeClicks: 100,
        afterClicks: 140,
        controlBeforeClicks: 1000,
        controlAfterClicks: 1000,
      }),
    ).toBe('WIN');
  });

  it('returns FLAT for a gain below the 25% threshold', () => {
    expect(
      classify({
        beforeClicks: 100,
        afterClicks: 110,
        controlBeforeClicks: 1000,
        controlAfterClicks: 1000,
      }),
    ).toBe('FLAT');
  });

  it('returns null before 14 held days and classifies from day 14', () => {
    expect(classify({ heldDays: 13 })).toBeNull();
    expect(classify({ heldDays: 13.99 })).toBeNull();
    expect(
      classify({
        heldDays: 14,
        beforeClicks: 100,
        afterClicks: 150,
        controlBeforeClicks: 1000,
        controlAfterClicks: 1000,
      }),
    ).toBe('WIN');
  });

  it('returns null when a comparison window is unavailable', () => {
    expect(classify({ beforeClicks: 0 })).toBeNull();
    expect(classify({ controlBeforeClicks: 0 })).toBeNull();
    expect(classify({ controlAfterClicks: 0 })).toBeNull();
  });

  it('returns null for non-finite, negative or missing inputs', () => {
    expect(classify({ beforeClicks: Number.NaN })).toBeNull();
    expect(classify({ afterClicks: Number.POSITIVE_INFINITY })).toBeNull();
    expect(classify({ controlBeforeClicks: Number.NEGATIVE_INFINITY })).toBeNull();
    expect(classify({ controlAfterClicks: -1 })).toBeNull();
    expect(classify({ afterClicks: -1 })).toBeNull();
    expect(classify({ heldDays: Number.NaN })).toBeNull();
    expect(classify({ heldDays: -1 })).toBeNull();
    expect(classifySeoChange({} as ISeoChangeInput)).toBeNull();
  });

  it('returns LOSS when the page loses every click against a healthy control', () => {
    expect(
      classify({
        beforeClicks: 100,
        afterClicks: 0,
        controlBeforeClicks: 1000,
        controlAfterClicks: 1000,
      }),
    ).toBe('LOSS');
  });

  it('classifies mathematically exact gains of 25% as WIN despite float error', () => {
    expect(
      classify({
        beforeClicks: 3,
        afterClicks: 13,
        controlBeforeClicks: 15,
        controlAfterClicks: 52,
      }),
    ).toBe('WIN');
  });

  it('classifies mathematically exact losses of 25% as LOSS despite float error', () => {
    expect(
      classify({
        beforeClicks: 3,
        afterClicks: 17,
        controlBeforeClicks: 9,
        controlAfterClicks: 68,
      }),
    ).toBe('LOSS');
  });

  it('includes the exact thresholds', () => {
    expect(
      classify({ beforeClicks: 100, afterClicks: 125, controlBeforeClicks: 100, controlAfterClicks: 100 }),
    ).toBe('WIN');
    expect(
      classify({ beforeClicks: 100, afterClicks: 75, controlBeforeClicks: 100, controlAfterClicks: 100 }),
    ).toBe('LOSS');
  });
});
