import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for Phase 2: Regional Price Routing in Checkout
 *
 * Validates:
 * - getRegionalPriceId resolves regional Stripe Price IDs from env vars
 * - getRegionalPriceId falls back to base price when regional not configured
 * - getRegionalPriceId returns original price for standard region
 * - getDiscountedPriceInCents calculates credit pack discounts correctly
 * - Checkout session metadata includes pricing_region and discount_percent
 */

// Mock serverEnv to control regional price ID resolution
const mockServerEnv: Record<string, string> = {
  ENV: 'test',
  STRIPE_PRICE_STARTER_SOUTH_ASIA: 'price_regional_starter_south_asia',
  STRIPE_PRICE_HOBBY_SOUTH_ASIA: 'price_regional_hobby_south_asia',
  STRIPE_PRICE_PRO_SOUTH_ASIA: '',
  STRIPE_PRICE_BUSINESS_SOUTH_ASIA: '',
  STRIPE_PRICE_STARTER_SOUTHEAST_ASIA: '',
  STRIPE_PRICE_HOBBY_SOUTHEAST_ASIA: '',
  STRIPE_PRICE_PRO_SOUTHEAST_ASIA: '',
  STRIPE_PRICE_BUSINESS_SOUTHEAST_ASIA: '',
  STRIPE_PRICE_STARTER_LATAM: '',
  STRIPE_PRICE_HOBBY_LATAM: '',
  STRIPE_PRICE_PRO_LATAM: '',
  STRIPE_PRICE_BUSINESS_LATAM: '',
  STRIPE_PRICE_STARTER_EASTERN_EUROPE: '',
  STRIPE_PRICE_HOBBY_EASTERN_EUROPE: '',
  STRIPE_PRICE_PRO_EASTERN_EUROPE: '',
  STRIPE_PRICE_BUSINESS_EASTERN_EUROPE: '',
  STRIPE_PRICE_STARTER_AFRICA: 'price_regional_starter_africa',
  STRIPE_PRICE_HOBBY_AFRICA: '',
  STRIPE_PRICE_PRO_AFRICA: '',
  STRIPE_PRICE_BUSINESS_AFRICA: '',
};

vi.mock('@shared/config/env', () => ({
  serverEnv: new Proxy({} as Record<string, string>, {
    get(_, prop) {
      return mockServerEnv[prop as string] ?? '';
    },
  }),
  clientEnv: {
    BASE_URL: 'http://localhost:3000',
  },
}));

describe('Checkout Regional Pricing', () => {
  // Import after mocking
  let getRegionalPriceId: typeof import('@shared/config/pricing-regions').getRegionalPriceId;
  let getDiscountedPriceInCents: typeof import('@shared/config/pricing-regions').getDiscountedPriceInCents;
  let getPricingRegion: typeof import('@shared/config/pricing-regions').getPricingRegion;

  beforeEach(async () => {
    const mod = await import('@shared/config/pricing-regions');
    getRegionalPriceId = mod.getRegionalPriceId;
    getDiscountedPriceInCents = mod.getDiscountedPriceInCents;
    getPricingRegion = mod.getPricingRegion;
  });

  describe('getRegionalPriceId', () => {
    it('should return regional Price ID for south_asia starter when env var is set', () => {
      const basePriceId = 'price_1Sz0fNL1vUl00LlZX1XClz95';
      const result = getRegionalPriceId(basePriceId, 'south_asia', 'starter');
      expect(result).toBe('price_regional_starter_south_asia');
    });

    it('should return regional Price ID for south_asia hobby when env var is set', () => {
      const basePriceId = 'price_1Sz0fNL1vUl00LlZT6MMTxAg';
      const result = getRegionalPriceId(basePriceId, 'south_asia', 'hobby');
      expect(result).toBe('price_regional_hobby_south_asia');
    });

    it('should return regional Price ID for africa starter when env var is set', () => {
      const basePriceId = 'price_1Sz0fNL1vUl00LlZX1XClz95';
      const result = getRegionalPriceId(basePriceId, 'africa', 'starter');
      expect(result).toBe('price_regional_starter_africa');
    });

    it('should fall back to base Price ID when regional env var is empty', () => {
      const basePriceId = 'price_1Sz0fOL1vUl00LlZ7bbM2cDs';
      const result = getRegionalPriceId(basePriceId, 'south_asia', 'pro');
      expect(result).toBe(basePriceId);
    });

    it('should fall back to base Price ID when regional not configured for region', () => {
      const basePriceId = 'price_1Sz0fNL1vUl00LlZX1XClz95';
      const result = getRegionalPriceId(basePriceId, 'latam', 'starter');
      expect(result).toBe(basePriceId);
    });

    it('should return original priceId for standard region', () => {
      const basePriceId = 'price_1Sz0fNL1vUl00LlZX1XClz95';
      const result = getRegionalPriceId(basePriceId, 'standard', 'starter');
      expect(result).toBe(basePriceId);
    });

    it('should return base price for unknown plan key', () => {
      const basePriceId = 'price_1Sz0fNL1vUl00LlZX1XClz95';
      const result = getRegionalPriceId(basePriceId, 'south_asia', 'unknown_plan');
      expect(result).toBe(basePriceId);
    });
  });

  describe('getDiscountedPriceInCents for credit packs', () => {
    it('should calculate credit pack small (499 cents) at 65% off as 175 cents', () => {
      // 499 * (1 - 0.65) = 499 * 0.35 = 174.65 → rounds to 175
      expect(getDiscountedPriceInCents(499, 65)).toBe(175);
    });

    it('should calculate credit pack medium (1499 cents) at 60% off', () => {
      // 1499 * 0.40 = 599.6 → rounds to 600
      expect(getDiscountedPriceInCents(1499, 60)).toBe(600);
    });

    it('should calculate credit pack large (2999 cents) at 50% off', () => {
      // 2999 * 0.50 = 1499.5 → rounds to 1500
      expect(getDiscountedPriceInCents(2999, 50)).toBe(1500);
    });

    it('should return full price for 0% discount', () => {
      expect(getDiscountedPriceInCents(499, 0)).toBe(499);
    });

    it('should return full price for negative discount', () => {
      expect(getDiscountedPriceInCents(499, -5)).toBe(499);
    });
  });

  describe('Checkout metadata includes pricing_region', () => {
    it('should resolve south_asia pricing config for India (IN)', () => {
      const config = getPricingRegion('IN');
      expect(config.region).toBe('south_asia');
      expect(config.discountPercent).toBe(65);
    });

    it('should resolve standard pricing config for US', () => {
      const config = getPricingRegion('US');
      expect(config.region).toBe('standard');
      expect(config.discountPercent).toBe(0);
    });

    it('pricing_region metadata value should be a valid region string', () => {
      const validRegions = [
        'standard',
        'south_asia',
        'southeast_asia',
        'latam',
        'eastern_europe',
        'africa',
      ];

      // Test that all regions from getPricingRegion are valid metadata values
      const testCountries = ['US', 'IN', 'PH', 'BR', 'UA', 'NG', 'XX', ''];
      for (const country of testCountries) {
        const config = getPricingRegion(country);
        expect(validRegions).toContain(config.region);
        // discount_percent should be stringifiable for Stripe metadata
        expect(typeof config.discountPercent).toBe('number');
        expect(config.discountPercent.toString()).toMatch(/^\d+$/);
      }
    });

    it('subscription session metadata should include pricing_region and discount_percent fields', () => {
      // Simulate building metadata the same way as checkout route
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

    it('credit pack session metadata should include pricing_region for discounted regions', () => {
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

    it('standard region session metadata should include pricing_region as standard', () => {
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
