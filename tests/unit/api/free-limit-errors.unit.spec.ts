import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ErrorCodes } from '@shared/utils/errors';
import { getCreditLimitErrorCode } from '@shared/utils/credit-limit';

describe('getCreditLimitErrorCode', () => {
  it('should return FREE_LIMIT_EXCEEDED when the balance is zero', () => {
    expect(getCreditLimitErrorCode(0, 1)).toBe(ErrorCodes.FREE_LIMIT_EXCEEDED);
  });

  it('should preserve INSUFFICIENT_CREDITS when a positive balance cannot cover the cost', () => {
    expect(getCreditLimitErrorCode(1, 2)).toBe(ErrorCodes.INSUFFICIENT_CREDITS);
  });

  it('does not hard-gate a paid user whose current balance is zero', () => {
    expect(getCreditLimitErrorCode(0, 1, false)).toBe(ErrorCodes.INSUFFICIENT_CREDITS);
  });

  it('uses the typed limit code in every credit-consuming processing route', () => {
    const processingRoutes = ['app/api/upscale/route.ts', 'app/api/bg-removal/deduct/route.ts'];

    for (const route of processingRoutes) {
      expect(readFileSync(route, 'utf8')).toContain('getCreditLimitErrorCode');
    }
  });
});
