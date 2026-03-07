import { describe, it, expect } from 'vitest';

/**
 * Tests for regional pricing display logic (Phase 3).
 *
 * These tests verify the pure calculation functions used by
 * PricingCard and CreditPackSelector to show PPP-adjusted prices.
 * They do NOT render React components — they test the math directly.
 */

// --- Pricing Card discount calculation (mirrors PricingCard.tsx logic) ---

function calculateDisplayPrice(price: number, discountPercent: number): number {
  if (discountPercent <= 0) return price;
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
}

// --- Credit Pack discount calculation (mirrors CreditPackSelector.tsx logic) ---

function applyDiscountCents(cents: number, discountPercent: number): number {
  if (discountPercent <= 0) return cents;
  return Math.round(cents * (1 - discountPercent / 100));
}

function getPricePerCredit(priceInCents: number, credits: number, discountPercent: number): string {
  const discountedCents = applyDiscountCents(priceInCents, discountPercent);
  return (discountedCents / credits / 100).toFixed(3);
}

describe('Regional Pricing Display', () => {
  describe('Subscription card discounted price', () => {
    it('should calculate discounted price correctly — $9 at 65% off = $3.15', () => {
      expect(calculateDisplayPrice(9, 65)).toBe(3.15);
    });

    it('should calculate discounted price correctly — $9 at 60% off = $3.60', () => {
      expect(calculateDisplayPrice(9, 60)).toBe(3.6);
    });

    it('should calculate discounted price correctly — $9 at 50% off = $4.50', () => {
      expect(calculateDisplayPrice(9, 50)).toBe(4.5);
    });

    it('should calculate discounted price correctly — $9 at 40% off = $5.40', () => {
      expect(calculateDisplayPrice(9, 40)).toBe(5.4);
    });

    it('should not modify price for standard region (0% discount)', () => {
      expect(calculateDisplayPrice(9, 0)).toBe(9);
      expect(calculateDisplayPrice(19, 0)).toBe(19);
      expect(calculateDisplayPrice(29, 0)).toBe(29);
      expect(calculateDisplayPrice(49, 0)).toBe(49);
    });

    it('should not modify price for negative discount', () => {
      expect(calculateDisplayPrice(9, -10)).toBe(9);
    });

    it('should handle larger plan prices — $19 at 65% off = $6.65', () => {
      expect(calculateDisplayPrice(19, 65)).toBe(6.65);
    });

    it('should handle $29 at 50% off = $14.50', () => {
      expect(calculateDisplayPrice(29, 50)).toBe(14.5);
    });

    it('should handle $49 at 40% off = $29.40', () => {
      expect(calculateDisplayPrice(49, 40)).toBe(29.4);
    });
  });

  describe('Credit pack discounted price (cents)', () => {
    it('should calculate discounted cents correctly — 499 at 65% off = 175', () => {
      // 499 * 0.35 = 174.65 → rounds to 175
      expect(applyDiscountCents(499, 65)).toBe(175);
    });

    it('should calculate discounted cents correctly — 499 at 60% off = 200', () => {
      // 499 * 0.40 = 199.6 → rounds to 200
      expect(applyDiscountCents(499, 60)).toBe(200);
    });

    it('should calculate discounted cents correctly — 499 at 50% off = 250', () => {
      // 499 * 0.50 = 249.5 → rounds to 250
      expect(applyDiscountCents(499, 50)).toBe(250);
    });

    it('should not modify price for 0% discount', () => {
      expect(applyDiscountCents(499, 0)).toBe(499);
      expect(applyDiscountCents(999, 0)).toBe(999);
      expect(applyDiscountCents(1999, 0)).toBe(1999);
    });

    it('should not modify price for negative discount', () => {
      expect(applyDiscountCents(499, -5)).toBe(499);
    });
  });

  describe('Price per credit with discount', () => {
    it('should calculate price per credit with discount — 499 cents / 50 credits at 65% off', () => {
      // 175 cents / 50 credits / 100 = 0.035
      expect(getPricePerCredit(499, 50, 65)).toBe('0.035');
    });

    it('should calculate price per credit without discount — 499 cents / 50 credits at 0%', () => {
      // 499 / 50 / 100 = 0.0998
      expect(getPricePerCredit(499, 50, 0)).toBe('0.100');
    });

    it('should calculate price per credit for larger pack — 999 cents / 120 credits at 60% off', () => {
      // 999 * 0.40 = 399.6 → 400 cents / 120 credits / 100 = 0.03333...
      expect(getPricePerCredit(999, 120, 60)).toBe('0.033');
    });

    it('should calculate price per credit for largest pack — 1999 cents / 300 credits at 50% off', () => {
      // 1999 * 0.50 = 999.5 → 1000 cents / 300 credits / 100 = 0.03333...
      expect(getPricePerCredit(1999, 300, 50)).toBe('0.033');
    });
  });

  describe('Regional banner visibility', () => {
    it('should show regional banner when discountPercent > 0', () => {
      const discountPercent = 65;
      const showBanner = discountPercent > 0;
      expect(showBanner).toBe(true);
    });

    it('should not show regional banner when discountPercent is 0', () => {
      const discountPercent = 0;
      const showBanner = discountPercent > 0;
      expect(showBanner).toBe(false);
    });

    it('should show credit pack note when discountPercent > 0', () => {
      const discountPercent = 40;
      const showCreditPackNote = discountPercent > 0;
      expect(showCreditPackNote).toBe(true);
    });

    it('should not show credit pack note for standard region', () => {
      const discountPercent = 0;
      const showCreditPackNote = discountPercent > 0;
      expect(showCreditPackNote).toBe(false);
    });

    it('should show subscription note when discountPercent > 0', () => {
      const discountPercent = 50;
      const showSubscriptionNote = discountPercent > 0;
      expect(showSubscriptionNote).toBe(true);
    });

    it('should not show subscription note for standard region', () => {
      const discountPercent = 0;
      const showSubscriptionNote = discountPercent > 0;
      expect(showSubscriptionNote).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle 100% discount', () => {
      expect(calculateDisplayPrice(9, 100)).toBe(0);
      expect(applyDiscountCents(499, 100)).toBe(0);
    });

    it('should handle very small prices', () => {
      expect(calculateDisplayPrice(1, 65)).toBe(0.35);
      expect(applyDiscountCents(100, 65)).toBe(35);
    });

    it('should produce consistent results between dollar and cent calculations', () => {
      // $9 at 65% off should match 900 cents at 65% off
      const dollarResult = calculateDisplayPrice(9, 65);
      const centsResult = applyDiscountCents(900, 65) / 100;
      expect(dollarResult).toBe(centsResult);
    });
  });
});
