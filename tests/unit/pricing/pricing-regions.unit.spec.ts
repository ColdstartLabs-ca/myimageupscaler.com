import { describe, it, expect } from 'vitest';
import {
  getPricingRegion,
  getDiscountPercent,
  getDiscountedPriceInCents,
} from '@shared/config/pricing-regions';

describe('Pricing Regions', () => {
  describe('getPricingRegion', () => {
    it('should return south_asia for IN', () => {
      expect(getPricingRegion('IN').region).toBe('south_asia');
    });

    it('should return southeast_asia for PH', () => {
      expect(getPricingRegion('PH').region).toBe('southeast_asia');
    });

    it('should return standard for US', () => {
      expect(getPricingRegion('US').region).toBe('standard');
      expect(getPricingRegion('US').discountPercent).toBe(0);
    });

    it('should return latam for BR', () => {
      expect(getPricingRegion('BR').region).toBe('latam');
    });

    it('should return eastern_europe for UA', () => {
      expect(getPricingRegion('UA').region).toBe('eastern_europe');
    });

    it('should return africa for NG', () => {
      expect(getPricingRegion('NG').region).toBe('africa');
    });

    it('should handle case-insensitive country codes', () => {
      expect(getPricingRegion('in').region).toBe('south_asia');
      expect(getPricingRegion('ph').region).toBe('southeast_asia');
      expect(getPricingRegion('br').region).toBe('latam');
    });

    it('should return standard for unknown country', () => {
      expect(getPricingRegion('XX').region).toBe('standard');
    });

    it('should return standard for Tor (T1)', () => {
      expect(getPricingRegion('T1').region).toBe('standard');
    });

    it('should return standard for empty string', () => {
      expect(getPricingRegion('').region).toBe('standard');
    });

    it('should return correct discount for all south_asia countries', () => {
      for (const cc of ['IN', 'PK', 'BD', 'LK', 'NP']) {
        expect(getPricingRegion(cc).discountPercent).toBe(65);
      }
    });

    it('should return correct discount for all southeast_asia countries', () => {
      for (const cc of ['PH', 'ID', 'VN', 'TH', 'MM', 'KH', 'LA']) {
        expect(getPricingRegion(cc).discountPercent).toBe(60);
      }
    });
  });

  describe('getDiscountPercent', () => {
    it('should return 65% discount for India', () => {
      expect(getDiscountPercent('IN')).toBe(65);
    });

    it('should return 60% discount for Philippines', () => {
      expect(getDiscountPercent('PH')).toBe(60);
    });

    it('should return 50% discount for Brazil', () => {
      expect(getDiscountPercent('BR')).toBe(50);
    });

    it('should return 40% discount for Ukraine', () => {
      expect(getDiscountPercent('UA')).toBe(40);
    });

    it('should return 65% discount for Nigeria', () => {
      expect(getDiscountPercent('NG')).toBe(65);
    });

    it('should return 0% discount for US', () => {
      expect(getDiscountPercent('US')).toBe(0);
    });

    it('should return 0% for unknown countries', () => {
      expect(getDiscountPercent('XX')).toBe(0);
    });
  });

  describe('getDiscountedPriceInCents', () => {
    it('should calculate 65% off correctly for Starter ($9)', () => {
      // $9.00 = 900 cents, 65% off = $3.15 = 315 cents
      expect(getDiscountedPriceInCents(900, 65)).toBe(315);
    });

    it('should calculate 60% off correctly for Starter ($9)', () => {
      // $9.00 = 900 cents, 60% off = $3.60 = 360 cents
      expect(getDiscountedPriceInCents(900, 60)).toBe(360);
    });

    it('should calculate 50% off correctly for credit pack ($4.99)', () => {
      // $4.99 = 499 cents, 50% off = $2.495 → rounds to 250 cents
      expect(getDiscountedPriceInCents(499, 50)).toBe(250);
    });

    it('should return base price for 0% discount', () => {
      expect(getDiscountedPriceInCents(900, 0)).toBe(900);
    });

    it('should return base price for negative discount', () => {
      expect(getDiscountedPriceInCents(900, -10)).toBe(900);
    });

    it('should calculate credit pack Small (499 cents) at 65% off', () => {
      // 499 * 0.35 = 174.65 → rounds to 175
      expect(getDiscountedPriceInCents(499, 65)).toBe(175);
    });
  });
});
