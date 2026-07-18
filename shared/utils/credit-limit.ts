import { ErrorCodes, type ErrorCode } from './errors';

/**
 * Distinguishes a depleted balance from a balance that is simply too small for
 * the requested operation. The client uses this stable code to hard-gate the
 * former without relying on a message string.
 */
export function getCreditLimitErrorCode(
  availableCredits: number,
  requiredCredits: number,
  isFreeUser = true
): ErrorCode {
  return isFreeUser && availableCredits <= 0 && requiredCredits > 0
    ? ErrorCodes.FREE_LIMIT_EXCEEDED
    : ErrorCodes.INSUFFICIENT_CREDITS;
}
