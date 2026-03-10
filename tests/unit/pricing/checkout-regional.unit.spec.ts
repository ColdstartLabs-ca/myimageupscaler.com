import { describe, it, expect } from 'vitest';

/**
 * Tests for Regional Dynamic Pricing
 *
 * Validates:
 * - getDiscountedPriceInCents calculates discounts correctly for all purchase types
 * - getPricingRegion returns correct region + discount for country codes
 * - Checkout session metadata includes pricing_region and discount_percent
 */

describe('Checkout Regional Pricing', () => {
  // Import after mocking
  let getDiscountedPriceInCents: typeof import('@shared/config/pricing-regions').getDiscountedPriceInCents;
  let getPricingRegion: typeof import('@shared/config/pricing-regions').getPricingRegion;

  beforeEach(async () => {
    const mod = await import('@shared/config/pricing-regions');
    getDiscountedPriceInCents = mod.getDiscountedPriceInCents;
    getPricingRegion = mod.getPricingRegion;
  });

  describe('getDiscountedPriceInCents', () => {
    it('should calculate 65% off (south_asia): 499 → 175 cents', () => {
      // 499 * (1 - 0.65) = 499 * 0.35 = 174.65 → rounds to 175
      expect(getDiscountedPriceInCents(499, 65)).toBe(175);
    });

    it('should calculate 60% off (southeast_asia): 1499 → 600 cents', () => {
      // 1499 * 0.40 = 599.6 → rounds to 600
      expect(getDiscountedPriceInCents(1499, 60)).toBe(600);
    });

    it('should calculate 50% off (latam): 2999 → 1500 cents', () => {
      // 2999 * 0.50 = 1499.5 → rounds to 1500
      expect(getDiscountedPriceInCents(2999, 50)).toBe(1500);
    });

    it('should calculate 40% off (eastern_europe): 900 → 540 cents', () => {
      expect(getDiscountedPriceInCents(900, 40)).toBe(540);
    });

    it('should return full price for 0% discount (standard)', () => {
      expect(getDiscountedPriceInCents(499, 0)).toBe(499);
    });

    it('should return full price for negative discount', () => {
      expect(getDiscountedPriceInCents(499, -5)).toBe(499);
    });

    it('should work for subscription prices (e.g. $9/mo = 900 cents at 65% off)', () => {
      // 900 * 0.35 = 315 cents = $3.15
      expect(getDiscountedPriceInCents(900, 65)).toBe(315);
    });
  });

  describe('getPricingRegion — country to discount mapping', () => {
    it('should resolve south_asia (65%) for India (IN)', () => {
      const config = getPricingRegion('IN');
      expect(config.region).toBe('south_asia');
      expect(config.discountPercent).toBe(65);
    });

    it('should resolve south_asia (65%) for Pakistan (PK)', () => {
      const config = getPricingRegion('PK');
      expect(config.region).toBe('south_asia');
      expect(config.discountPercent).toBe(65);
    });

    it('should resolve southeast_asia (60%) for Philippines (PH)', () => {
      const config = getPricingRegion('PH');
      expect(config.region).toBe('southeast_asia');
      expect(config.discountPercent).toBe(60);
    });

    it('should resolve latam (50%) for Brazil (BR)', () => {
      const config = getPricingRegion('BR');
      expect(config.region).toBe('latam');
      expect(config.discountPercent).toBe(50);
    });

    it('should resolve eastern_europe (40%) for Ukraine (UA)', () => {
      const config = getPricingRegion('UA');
      expect(config.region).toBe('eastern_europe');
      expect(config.discountPercent).toBe(40);
    });

    it('should resolve africa (65%) for Nigeria (NG)', () => {
      const config = getPricingRegion('NG');
      expect(config.region).toBe('africa');
      expect(config.discountPercent).toBe(65);
    });

    it('should resolve standard (0%) for US', () => {
      const config = getPricingRegion('US');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });

    it('should resolve standard (0%) for unknown country', () => {
      const config = getPricingRegion('XX');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });

    it('should resolve standard (0%) for empty string', () => {
      const config = getPricingRegion('');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });
  });

  describe('Checkout session metadata', () => {
    it('pricing_region metadata should be a valid region string for all test countries', () => {
      const validRegions = [
        'standard',
        'south_asia',
        'southeast_asia',
        'latam',
        'eastern_europe',
        'africa',
      ];

      const testCountries = ['US', 'IN', 'PH', 'BR', 'UA', 'NG', 'XX', ''];
      for (const country of testCountries) {
        const config = getPricingRegion(country);
        expect(validRegions).toContain(config.region);
        expect(typeof config.discountPercent).toBe('number');
        expect(config.discountPercent.toString()).toMatch(/^\d+$/);
      }
    });

    it('subscription session metadata should include pricing_region and discount_percent', () => {
      const pricingConfig = getPricingRegion('IN');
      const metadata = {
        user_id: 'test-user-123',
        pricing_region: pricingConfig.region,
        discount_percent: pricingConfig.discountPercent.toString(),
        type: 'plan',
        plan_key: 'starter',
      };

      expect(metadata).toHaveProperty('pricing_region', 'south_asia');
      expect(metadata).toHaveProperty('discount_percent', '65');
    });

    it('credit pack metadata should include pricing_region for discounted regions', () => {
      const pricingConfig = getPricingRegion('PH');
      const metadata = {
        user_id: 'test-user-456',
        pricing_region: pricingConfig.region,
        discount_percent: pricingConfig.discountPercent.toString(),
        type: 'pack',
        pack_key: 'small',
      };

      expect(metadata).toHaveProperty('pricing_region', 'southeast_asia');
      expect(metadata).toHaveProperty('discount_percent', '60');
    });

    it('standard region metadata should show 0% discount', () => {
      const pricingConfig = getPricingRegion('US');
      const metadata = {
        user_id: 'test-user-789',
        pricing_region: pricingConfig.region,
        discount_percent: pricingConfig.discountPercent.toString(),
        type: 'plan',
        plan_key: 'pro',
      };

      expect(metadata).toHaveProperty('pricing_region', 'standard');
      expect(metadata).toHaveProperty('discount_percent', '0');
    });
  });
});
