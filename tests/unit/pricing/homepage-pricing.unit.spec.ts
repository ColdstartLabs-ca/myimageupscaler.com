import { describe, it, expect } from 'vitest';

/**
 * Tests for Phase 4: Homepage Pricing with Regional Discounts
 *
 * Validates the calculateDiscountedPrice function used by the homepage
 * Pricing component to display PPP-adjusted prices.
 * Tests pure math — no React rendering required.
 */

// Mirror the exported function from Pricing.tsx
function calculateDiscountedPrice(priceValue: number, discountPercent: number): number {
  if (discountPercent <= 0 || priceValue === 0) return priceValue;
  return Math.round(priceValue * (1 - discountPercent / 100) * 100) / 100;
}

describe('Homepage Pricing — Regional Discounts', () => {
  describe('Discounted price calculation for homepage tiers', () => {
    it('should calculate $49 at 65% off = $17.15', () => {
      expect(calculateDiscountedPrice(49, 65)).toBe(17.15);
    });

    it('should calculate $19 at 60% off = $7.60', () => {
      expect(calculateDiscountedPrice(19, 60)).toBe(7.6);
    });

    it('should keep $0 (free tier) at $0 regardless of discount', () => {
      expect(calculateDiscountedPrice(0, 65)).toBe(0);
      expect(calculateDiscountedPrice(0, 100)).toBe(0);
      expect(calculateDiscountedPrice(0, 0)).toBe(0);
    });

    it('should keep $9 unchanged at 0% discount', () => {
      expect(calculateDiscountedPrice(9, 0)).toBe(9);
    });
  });

  describe('Additional homepage tier scenarios', () => {
    it('should calculate $9 at 65% off = $3.15 (south_asia)', () => {
      expect(calculateDiscountedPrice(9, 65)).toBe(3.15);
    });

    it('should calculate $9 at 60% off = $3.60 (southeast_asia)', () => {
      expect(calculateDiscountedPrice(9, 60)).toBe(3.6);
    });

    it('should calculate $9 at 50% off = $4.50 (latam)', () => {
      expect(calculateDiscountedPrice(9, 50)).toBe(4.5);
    });

    it('should calculate $9 at 40% off = $5.40 (eastern_europe)', () => {
      expect(calculateDiscountedPrice(9, 40)).toBe(5.4);
    });

    it('should calculate $49 at 50% off = $24.50', () => {
      expect(calculateDiscountedPrice(49, 50)).toBe(24.5);
    });

    it('should calculate $49 at 40% off = $29.40', () => {
      expect(calculateDiscountedPrice(49, 40)).toBe(29.4);
    });

    it('should calculate $19 at 65% off = $6.65', () => {
      expect(calculateDiscountedPrice(19, 65)).toBe(6.65);
    });
  });

  describe('Edge cases', () => {
    it('should return original price for negative discount', () => {
      expect(calculateDiscountedPrice(49, -10)).toBe(49);
    });

    it('should return 0 for 100% discount on a paid tier', () => {
      expect(calculateDiscountedPrice(49, 100)).toBe(0);
    });

    it('should handle very small prices correctly', () => {
      expect(calculateDiscountedPrice(1, 65)).toBe(0.35);
    });
  });
});

describe('Homepage Pricing — Export consistency', () => {
  it('should export calculateDiscountedPrice from Pricing.tsx', async () => {
    const mod = await import('@client/components/features/landing/Pricing');
    expect(typeof mod.calculateDiscountedPrice).toBe('function');
  });

  it('exported calculateDiscountedPrice should match local mirror', async () => {
    const mod = await import('@client/components/features/landing/Pricing');
    // Verify the exported function produces the same results
    expect(mod.calculateDiscountedPrice(49, 65)).toBe(17.15);
    expect(mod.calculateDiscountedPrice(19, 60)).toBe(7.6);
    expect(mod.calculateDiscountedPrice(0, 65)).toBe(0);
    expect(mod.calculateDiscountedPrice(9, 0)).toBe(9);
  });
});
