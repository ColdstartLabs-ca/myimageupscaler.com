import { describe, expect, it } from 'vitest';
import { getCreditDisplayForTier, getCreditRangeForTier } from '@shared/config/subscription.utils';

describe('credit display', () => {
  it('should display ultra as a 13-25 range', () => {
    expect(getCreditDisplayForTier('ultra', 'CR')).toBe('13-25 CR');
  });

  it('should cap the auto-tier badge at the ultra ceiling', () => {
    expect(getCreditDisplayForTier('auto', 'CR')).toBe('1-25 CR');
  });

  it('should display face-pro as a dimension-priced range', () => {
    expect(getCreditRangeForTier('face-pro')).toEqual({ min: 2, max: 12 });
    expect(getCreditDisplayForTier('face-pro', 'CR')).toBe('2-12 CR');
  });
});
