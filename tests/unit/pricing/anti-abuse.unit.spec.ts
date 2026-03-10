import { describe, it, expect } from 'vitest';
import { getPricingRegion, getDiscountPercent } from '@shared/config/pricing-regions';

/**
 * Anti-Abuse & Edge Case Tests for Regional Dynamic Pricing (Phase 5)
 *
 * Validates:
 * - Discount is applied based on CF-IPCountry (per-request), not signup_country
 * - Standard regions get 0% discount
 * - Missing/empty CF-IPCountry defaults to standard (graceful degradation)
 * - Tor exit nodes (T1) are treated as standard
 * - Unknown country codes are treated as standard
 * - Pricing is stateless — two calls with different countries return different regions
 */
describe('Anti-Abuse & Edge Cases', () => {
  describe('should apply discount based on CF-IPCountry not signup_country', () => {
    it('returns 65% discount for IN regardless of any prior signup country', () => {
      // The pricing function only takes a country code — it has no concept of signup_country.
      // This is by design: CF-IPCountry at checkout time determines the discount.
      const config = getPricingRegion('IN');
      expect(config.region).toBe('south_asia');
      expect(config.discountPercent).toBe(65);
    });

    it('returns 60% discount for PH regardless of any prior signup country', () => {
      const config = getPricingRegion('PH');
      expect(config.region).toBe('southeast_asia');
      expect(config.discountPercent).toBe(60);
    });

    it('returns 50% discount for BR regardless of any prior signup country', () => {
      const config = getPricingRegion('BR');
      expect(config.region).toBe('latam');
      expect(config.discountPercent).toBe(50);
    });

    it('returns 40% discount for UA regardless of any prior signup country', () => {
      const config = getPricingRegion('UA');
      expect(config.region).toBe('eastern_europe');
      expect(config.discountPercent).toBe(40);
    });

    it('returns 65% discount for NG regardless of any prior signup country', () => {
      const config = getPricingRegion('NG');
      expect(config.region).toBe('africa');
      expect(config.discountPercent).toBe(65);
    });
  });

  describe('should not apply discount when CF-IPCountry is standard', () => {
    it('returns 0% discount for US', () => {
      const config = getPricingRegion('US');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });

    it('returns 0% discount for GB', () => {
      const config = getPricingRegion('GB');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });

    it('returns 0% discount for DE', () => {
      const config = getPricingRegion('DE');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });

    it('returns 0% discount for JP', () => {
      const config = getPricingRegion('JP');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });

    it('returns 0% via getDiscountPercent helper for standard countries', () => {
      expect(getDiscountPercent('US')).toBe(0);
      expect(getDiscountPercent('GB')).toBe(0);
      expect(getDiscountPercent('DE')).toBe(0);
    });
  });

  describe('should handle missing CF-IPCountry gracefully (standard)', () => {
    it('returns standard for empty string', () => {
      const config = getPricingRegion('');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });

    it('returns 0% discount via getDiscountPercent for empty string', () => {
      expect(getDiscountPercent('')).toBe(0);
    });

    it('checkout route passes empty string to getPricingRegion when country is null', () => {
      // In the checkout route: getPricingRegion(country || '')
      // This test verifies that getPricingRegion('') returns standard safely
      const countryFromHeader: string | null = null;
      const config = getPricingRegion(countryFromHeader || '');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });

    it('checkout route passes empty string to getPricingRegion when country is undefined', () => {
      const countryFromHeader: string | undefined = undefined;
      const config = getPricingRegion(countryFromHeader || '');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });
  });

  describe('should handle Tor exit nodes as standard', () => {
    it('returns standard for T1 (Cloudflare Tor identifier)', () => {
      const config = getPricingRegion('T1');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });

    it('returns 0% discount via getDiscountPercent for T1', () => {
      expect(getDiscountPercent('T1')).toBe(0);
    });
  });

  describe('should handle unknown country codes as standard', () => {
    it('returns standard for XX', () => {
      const config = getPricingRegion('XX');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });

    it('returns standard for ZZ', () => {
      const config = getPricingRegion('ZZ');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });

    it('returns standard for A1 (Cloudflare anonymous proxy)', () => {
      const config = getPricingRegion('A1');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });

    it('returns standard for random invalid codes', () => {
      expect(getPricingRegion('QQ').region).toBe('standard');
      expect(getPricingRegion('99').region).toBe('standard');
      expect(getPricingRegion('INVALID').region).toBe('standard');
    });
  });

  describe('should apply discount per-request, not per-user (statelessness)', () => {
    it('two consecutive calls with different countries return different regions', () => {
      // First request from India
      const india = getPricingRegion('IN');
      expect(india.region).toBe('south_asia');
      expect(india.discountPercent).toBe(65);

      // Second request from US (same "user", different country)
      const us = getPricingRegion('US');
      expect(us.region).toBe('standard');
      expect(us.discountPercent).toBe(0);

      // Third request from Brazil
      const brazil = getPricingRegion('BR');
      expect(brazil.region).toBe('latam');
      expect(brazil.discountPercent).toBe(50);

      // Verify they are independent — no state carried over
      expect(india.region).not.toBe(us.region);
      expect(us.discountPercent).not.toBe(brazil.discountPercent);
    });

    it('same country code always returns the same result (pure function)', () => {
      const first = getPricingRegion('PH');
      const second = getPricingRegion('PH');
      expect(first.region).toBe(second.region);
      expect(first.discountPercent).toBe(second.discountPercent);
    });

    it('function is deterministic across all regions', () => {
      const countries = ['IN', 'PH', 'BR', 'UA', 'NG', 'US', 'XX', '', 'T1'];
      const firstPass = countries.map(c => getPricingRegion(c));
      const secondPass = countries.map(c => getPricingRegion(c));

      for (let i = 0; i < countries.length; i++) {
        expect(firstPass[i].region).toBe(secondPass[i].region);
        expect(firstPass[i].discountPercent).toBe(secondPass[i].discountPercent);
      }
    });
  });
});
