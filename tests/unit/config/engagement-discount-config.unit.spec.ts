/**
 * Engagement Discount Configuration Tests
 *
 * Validates that the engagement discount configuration is well-formed
 * and that the helper functions behave correctly.
 *
 * @see shared/config/engagement-discount.ts
 * @see docs/PRDs/engagement-based-first-purchase-discount.md
 */

import { describe, test, expect } from 'vitest';
import {
  ENGAGEMENT_THRESHOLDS,
  REQUIRED_THRESHOLDS_MET,
  ENGAGEMENT_DISCOUNT_CONFIG,
  DISCOUNT_TARGET_PACK,
  createEmptyEngagementSignals,
  checkEngagementEligibility,
  calculateOfferExpiry,
  isOfferExpired,
  getRemainingSeconds,
  formatCountdown,
  createDiscountOffer,
} from '@shared/config/engagement-discount';

describe('Engagement Discount Configuration', () => {
  describe('ENGAGEMENT_THRESHOLDS', () => {
    test('all thresholds are positive integers', () => {
      expect(ENGAGEMENT_THRESHOLDS.upscales).toBeGreaterThan(0);
      expect(ENGAGEMENT_THRESHOLDS.downloads).toBeGreaterThan(0);
      expect(ENGAGEMENT_THRESHOLDS.modelSwitches).toBeGreaterThan(0);
    });

    test('thresholds are reasonable values', () => {
      expect(ENGAGEMENT_THRESHOLDS.upscales).toBeLessThanOrEqual(10);
      expect(ENGAGEMENT_THRESHOLDS.downloads).toBeLessThanOrEqual(10);
      expect(ENGAGEMENT_THRESHOLDS.modelSwitches).toBeLessThanOrEqual(5);
    });
  });

  describe('REQUIRED_THRESHOLDS_MET', () => {
    test('required thresholds is between 1 and 3', () => {
      expect(REQUIRED_THRESHOLDS_MET).toBeGreaterThanOrEqual(1);
      expect(REQUIRED_THRESHOLDS_MET).toBeLessThanOrEqual(3);
    });
  });

  describe('ENGAGEMENT_DISCOUNT_CONFIG', () => {
    test('discount percent is between 1 and 50', () => {
      expect(ENGAGEMENT_DISCOUNT_CONFIG.discountPercent).toBeGreaterThanOrEqual(1);
      expect(ENGAGEMENT_DISCOUNT_CONFIG.discountPercent).toBeLessThanOrEqual(50);
    });

    test('offer validity is positive', () => {
      expect(ENGAGEMENT_DISCOUNT_CONFIG.offerValidityMinutes).toBeGreaterThan(0);
    });

    test('target pack key is a valid credit pack key', () => {
      expect(['small', 'medium', 'large']).toContain(ENGAGEMENT_DISCOUNT_CONFIG.targetPackKey);
    });

    test('original price is positive', () => {
      expect(ENGAGEMENT_DISCOUNT_CONFIG.originalPriceCents).toBeGreaterThan(0);
    });

    test('discounted price is less than original price', () => {
      expect(ENGAGEMENT_DISCOUNT_CONFIG.discountedPriceCents).toBeLessThan(
        ENGAGEMENT_DISCOUNT_CONFIG.originalPriceCents
      );
    });

    test('discounted price matches expected discount calculation', () => {
      const expectedDiscounted = Math.round(
        ENGAGEMENT_DISCOUNT_CONFIG.originalPriceCents *
          (1 - ENGAGEMENT_DISCOUNT_CONFIG.discountPercent / 100)
      );
      // Allow for small rounding differences (within 2 cents)
      expect(Math.abs(ENGAGEMENT_DISCOUNT_CONFIG.discountedPriceCents - expectedDiscounted)).toBeLessThanOrEqual(2);
    });

    test('session storage keys are non-empty strings', () => {
      expect(ENGAGEMENT_DISCOUNT_CONFIG.sessionKey).toBeTruthy();
      expect(ENGAGEMENT_DISCOUNT_CONFIG.offerKey).toBeTruthy();
    });

    test('dismiss cooldown is positive', () => {
      expect(ENGAGEMENT_DISCOUNT_CONFIG.dismissCooldownMinutes).toBeGreaterThan(0);
    });
  });

  describe('DISCOUNT_TARGET_PACK', () => {
    test('target pack has valid key', () => {
      expect(['small', 'medium', 'large']).toContain(DISCOUNT_TARGET_PACK.key);
    });

    test('target pack key matches config', () => {
      expect(DISCOUNT_TARGET_PACK.key).toBe(ENGAGEMENT_DISCOUNT_CONFIG.targetPackKey);
    });

    test('target pack has positive credits', () => {
      expect(DISCOUNT_TARGET_PACK.credits).toBeGreaterThan(0);
    });
  });
});

describe('checkEngagementEligibility', () => {
  test('returns ineligible when no signals', () => {
    const signals = createEmptyEngagementSignals();
    const result = checkEngagementEligibility(signals);
    expect(result.isEligible).toBe(false);
    expect(result.thresholdsMet).toBe(0);
  });

  test('returns ineligible when only 1 of 3 thresholds met (only upscales)', () => {
    const signals = {
      ...createEmptyEngagementSignals(),
      upscales: ENGAGEMENT_THRESHOLDS.upscales,
    };
    const result = checkEngagementEligibility(signals);
    expect(result.isEligible).toBe(false);
    expect(result.thresholdsMet).toBe(1);
    expect(result.thresholdsStatus.upscales).toBe(true);
    expect(result.thresholdsStatus.downloads).toBe(false);
    expect(result.thresholdsStatus.modelSwitches).toBe(false);
  });

  test('returns eligible when upscales + downloads thresholds met', () => {
    const signals = {
      ...createEmptyEngagementSignals(),
      upscales: ENGAGEMENT_THRESHOLDS.upscales,
      downloads: ENGAGEMENT_THRESHOLDS.downloads,
    };
    const result = checkEngagementEligibility(signals);
    expect(result.isEligible).toBe(true);
    expect(result.thresholdsMet).toBe(2);
    expect(result.thresholdsStatus.upscales).toBe(true);
    expect(result.thresholdsStatus.downloads).toBe(true);
  });

  test('returns eligible when upscales + model switches thresholds met', () => {
    const signals = {
      ...createEmptyEngagementSignals(),
      upscales: ENGAGEMENT_THRESHOLDS.upscales,
      modelSwitches: ENGAGEMENT_THRESHOLDS.modelSwitches,
    };
    const result = checkEngagementEligibility(signals);
    expect(result.isEligible).toBe(true);
    expect(result.thresholdsMet).toBe(2);
  });

  test('returns eligible when downloads + model switches thresholds met', () => {
    const signals = {
      ...createEmptyEngagementSignals(),
      downloads: ENGAGEMENT_THRESHOLDS.downloads,
      modelSwitches: ENGAGEMENT_THRESHOLDS.modelSwitches,
    };
    const result = checkEngagementEligibility(signals);
    expect(result.isEligible).toBe(true);
    expect(result.thresholdsMet).toBe(2);
  });

  test('returns eligible when all 3 thresholds met', () => {
    const signals = {
      upscales: ENGAGEMENT_THRESHOLDS.upscales,
      downloads: ENGAGEMENT_THRESHOLDS.downloads,
      modelSwitches: ENGAGEMENT_THRESHOLDS.modelSwitches,
      sessionStartedAt: Date.now(),
    };
    const result = checkEngagementEligibility(signals);
    expect(result.isEligible).toBe(true);
    expect(result.thresholdsMet).toBe(3);
    expect(result.thresholdsStatus.upscales).toBe(true);
    expect(result.thresholdsStatus.downloads).toBe(true);
    expect(result.thresholdsStatus.modelSwitches).toBe(true);
  });

  test('returns ineligible when signals are just below thresholds', () => {
    const signals = {
      upscales: ENGAGEMENT_THRESHOLDS.upscales - 1,
      downloads: ENGAGEMENT_THRESHOLDS.downloads - 1,
      modelSwitches: 0,
      sessionStartedAt: Date.now(),
    };
    const result = checkEngagementEligibility(signals);
    expect(result.isEligible).toBe(false);
    expect(result.thresholdsMet).toBe(0);
  });

  test('counts signals at exactly threshold as met', () => {
    const signals = {
      upscales: ENGAGEMENT_THRESHOLDS.upscales,
      downloads: 0,
      modelSwitches: 0,
      sessionStartedAt: Date.now(),
    };
    const result = checkEngagementEligibility(signals);
    expect(result.thresholdsStatus.upscales).toBe(true);
  });

  test('counts signals above threshold as met', () => {
    const signals = {
      upscales: ENGAGEMENT_THRESHOLDS.upscales + 5,
      downloads: ENGAGEMENT_THRESHOLDS.downloads + 10,
      modelSwitches: 0,
      sessionStartedAt: Date.now(),
    };
    const result = checkEngagementEligibility(signals);
    expect(result.isEligible).toBe(true);
  });
});

describe('isOfferExpired', () => {
  test('returns true for past timestamp', () => {
    const pastTime = Date.now() - 1000; // 1 second ago
    expect(isOfferExpired(pastTime)).toBe(true);
  });

  test('returns false for future timestamp', () => {
    const futureTime = Date.now() + 60 * 1000; // 1 minute from now
    expect(isOfferExpired(futureTime)).toBe(false);
  });

  test('accepts ISO string format', () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    expect(isOfferExpired(pastDate)).toBe(true);

    const futureDate = new Date(Date.now() + 60 * 1000).toISOString();
    expect(isOfferExpired(futureDate)).toBe(false);
  });
});

describe('getRemainingSeconds', () => {
  test('returns 0 for expired timestamps', () => {
    const pastTime = Date.now() - 1000;
    expect(getRemainingSeconds(pastTime)).toBe(0);
  });

  test('returns positive value for future timestamps', () => {
    const futureTime = Date.now() + 60 * 1000; // 1 minute from now
    const remaining = getRemainingSeconds(futureTime);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(60);
  });

  test('accepts ISO string format', () => {
    const futureDate = new Date(Date.now() + 60 * 1000).toISOString();
    const remaining = getRemainingSeconds(futureDate);
    expect(remaining).toBeGreaterThan(0);
  });
});

describe('formatCountdown', () => {
  test('formats 0 seconds as 00:00', () => {
    expect(formatCountdown(0)).toBe('00:00');
  });

  test('formats 90 seconds as 01:30', () => {
    expect(formatCountdown(90)).toBe('01:30');
  });

  test('formats 1800 seconds as 30:00', () => {
    expect(formatCountdown(1800)).toBe('30:00');
  });

  test('pads single-digit minutes and seconds', () => {
    expect(formatCountdown(65)).toBe('01:05');
    expect(formatCountdown(9)).toBe('00:09');
  });

  test('handles large values correctly', () => {
    expect(formatCountdown(3661)).toBe('61:01'); // Over an hour
  });
});

describe('calculateOfferExpiry', () => {
  test('returns a future timestamp', () => {
    const expiry = calculateOfferExpiry();
    expect(expiry).toBeGreaterThan(Date.now());
  });

  test('expiry is approximately offerValidityMinutes in the future', () => {
    const before = Date.now();
    const expiry = calculateOfferExpiry();
    const after = Date.now();

    const expectedMin =
      before + ENGAGEMENT_DISCOUNT_CONFIG.offerValidityMinutes * 60 * 1000 - 100;
    const expectedMax =
      after + ENGAGEMENT_DISCOUNT_CONFIG.offerValidityMinutes * 60 * 1000 + 100;

    expect(expiry).toBeGreaterThanOrEqual(expectedMin);
    expect(expiry).toBeLessThanOrEqual(expectedMax);
  });
});

describe('createDiscountOffer', () => {
  test('creates offer with correct structure', () => {
    const userId = 'test-user-id';
    const offer = createDiscountOffer(userId);

    expect(offer.userId).toBe(userId);
    expect(offer.offeredAt).toBeTruthy();
    expect(offer.expiresAt).toBeTruthy();
    expect(offer.discountPercent).toBe(ENGAGEMENT_DISCOUNT_CONFIG.discountPercent);
    expect(offer.targetPackKey).toBe(ENGAGEMENT_DISCOUNT_CONFIG.targetPackKey);
    expect(offer.originalPriceCents).toBe(ENGAGEMENT_DISCOUNT_CONFIG.originalPriceCents);
    expect(offer.discountedPriceCents).toBe(ENGAGEMENT_DISCOUNT_CONFIG.discountedPriceCents);
    expect(offer.redeemed).toBe(false);
  });

  test('offer expires in the future', () => {
    const offer = createDiscountOffer('user-1');
    const expiresAt = new Date(offer.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  test('offeredAt is now', () => {
    const before = new Date().toISOString();
    const offer = createDiscountOffer('user-1');
    const after = new Date().toISOString();

    expect(offer.offeredAt >= before).toBe(true);
    expect(offer.offeredAt <= after).toBe(true);
  });
});

describe('createEmptyEngagementSignals', () => {
  test('creates signals with zero counts', () => {
    const signals = createEmptyEngagementSignals();
    expect(signals.upscales).toBe(0);
    expect(signals.downloads).toBe(0);
    expect(signals.modelSwitches).toBe(0);
  });

  test('sets sessionStartedAt to approximately now', () => {
    const before = Date.now();
    const signals = createEmptyEngagementSignals();
    const after = Date.now();

    expect(signals.sessionStartedAt).toBeGreaterThanOrEqual(before);
    expect(signals.sessionStartedAt).toBeLessThanOrEqual(after);
  });
});
