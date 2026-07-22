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

  it('should stop applying the typed free-limit gate to the upscale route', () => {
    const upscaleRoute = readFileSync('app/api/upscale/route.ts', 'utf8');
    const backgroundRemovalRoute = readFileSync('app/api/bg-removal/deduct/route.ts', 'utf8');

    expect(upscaleRoute).not.toContain('getCreditLimitErrorCode');
    expect(upscaleRoute).toContain('ErrorCodes.INSUFFICIENT_CREDITS');
    expect(backgroundRemovalRoute).toContain('getCreditLimitErrorCode');
  });
});
