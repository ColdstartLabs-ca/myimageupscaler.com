import { describe, it, expect } from 'vitest';
import {
  STRIPE_PRICES,
  SUBSCRIPTION_PRICE_MAP,
  SUBSCRIPTION_PRICE_IDS,
  getPlanForPriceId,
  getPlanByKey,
  getPlanDisplayName,
  isStripePricesConfigured,
  validateStripeConfig,
  CREDIT_PACKS,
} from '@shared/config/stripe';

describe('Subscription Configuration', () => {
  describe('STRIPE_PRICES', () => {
    it('should contain only subscription price IDs', () => {
      expect(STRIPE_PRICES).toBeDefined();
      expect(Object.keys(STRIPE_PRICES)).toContain('HOBBY_MONTHLY');
      expect(Object.keys(STRIPE_PRICES)).toContain('PRO_MONTHLY');
      expect(Object.keys(STRIPE_PRICES)).toContain('BUSINESS_MONTHLY');
    });

    it('should have valid Stripe price ID format', () => {
      Object.values(STRIPE_PRICES).forEach(priceId => {
        expect(priceId).toMatch(/^price_[a-zA-Z0-9]+$/);
      });
    });

    it('should have unique price IDs', () => {
      const priceIds = Object.values(STRIPE_PRICES);
      const uniquePriceIds = [...new Set(priceIds)];
      expect(priceIds).toHaveLength(uniquePriceIds.length);
    });
  });

  describe('SUBSCRIPTION_PRICE_MAP', () => {
    it('should have entry for each subscription price (but not credit packs)', () => {
      const priceIds = Object.values(STRIPE_PRICES).filter((priceId, index) => {
        // Only check subscription plans, not credit packs (first 3 are plans)
        const key = Object.keys(STRIPE_PRICES)[index];
        return !key.includes('_CREDITS');
      });
      priceIds.forEach(priceId => {
        expect(SUBSCRIPTION_PRICE_MAP[priceId]).toBeDefined();
        expect(SUBSCRIPTION_PRICE_MAP[priceId]).toMatchObject({
          key: expect.any(String),
          name: expect.any(String),
          creditsPerMonth: expect.any(Number),
          maxRollover: expect.any(Number),
          features: expect.any(Array),
        });
      });
    });

    it('should have correct plan structure for each tier', () => {
      const hobbyPlan = SUBSCRIPTION_PRICE_MAP[STRIPE_PRICES.HOBBY_MONTHLY];
      const proPlan = SUBSCRIPTION_PRICE_MAP[STRIPE_PRICES.PRO_MONTHLY];
      const businessPlan = SUBSCRIPTION_PRICE_MAP[STRIPE_PRICES.BUSINESS_MONTHLY];

      // Hobby plan validation
      expect(hobbyPlan).toMatchObject({
        key: 'hobby',
        name: 'Hobby',
        creditsPerMonth: 200,
        maxRollover: 1200,
        recommended: false,
      });
      expect(hobbyPlan.features).toContain('200 credits per month');

      // Pro plan validation
      expect(proPlan).toMatchObject({
        key: 'pro',
        name: 'Professional',
        creditsPerMonth: 1000,
        maxRollover: 6000,
        recommended: true,
      });
      expect(proPlan.features).toContain('1000 credits per month');

      // Business plan validation
      expect(businessPlan).toMatchObject({
        key: 'business',
        name: 'Business',
        creditsPerMonth: 5000,
        maxRollover: 30000,
        recommended: false,
      });
      expect(businessPlan.features).toContain('5000 credits per month');
    });

    it('should have progressive credit amounts and rollover caps', () => {
      const hobbyPlan = SUBSCRIPTION_PRICE_MAP[STRIPE_PRICES.HOBBY_MONTHLY];
      const proPlan = SUBSCRIPTION_PRICE_MAP[STRIPE_PRICES.PRO_MONTHLY];
      const businessPlan = SUBSCRIPTION_PRICE_MAP[STRIPE_PRICES.BUSINESS_MONTHLY];

      expect(hobbyPlan.creditsPerMonth).toBeLessThan(proPlan.creditsPerMonth);
      expect(proPlan.creditsPerMonth).toBeLessThan(businessPlan.creditsPerMonth);

      expect(hobbyPlan.maxRollover).toBeLessThan(proPlan.maxRollover);
      expect(proPlan.maxRollover).toBeLessThan(businessPlan.maxRollover);
    });

    it('should have exactly one recommended plan', () => {
      const plans = Object.values(SUBSCRIPTION_PRICE_MAP);
      const recommendedPlans = plans.filter(plan => plan.recommended);
      expect(recommendedPlans).toHaveLength(1);
      expect(recommendedPlans[0].key).toBe('pro');
    });
  });

  describe('SUBSCRIPTION_PRICE_IDS', () => {
    it('should contain all subscription price IDs (but not credit packs)', () => {
      // Count only subscription plans, not credit packs
      const subscriptionCount = Object.keys(STRIPE_PRICES).filter(
        key => !key.includes('_CREDITS')
      ).length;
      expect(SUBSCRIPTION_PRICE_IDS).toHaveLength(subscriptionCount);

      // SUBSCRIPTION_PRICE_IDS should only contain subscription plan price IDs
      SUBSCRIPTION_PRICE_IDS.forEach(priceId => {
        expect(Object.values(STRIPE_PRICES)).toContain(priceId);
      });
    });

    it('should be an array of strings', () => {
      expect(Array.isArray(SUBSCRIPTION_PRICE_IDS)).toBe(true);
      SUBSCRIPTION_PRICE_IDS.forEach(priceId => {
        expect(typeof priceId).toBe('string');
      });
    });
  });

  describe('getPlanForPriceId()', () => {
    it('should return correct plan for valid subscription price IDs', () => {
      const hobbyPlan = getPlanForPriceId(STRIPE_PRICES.HOBBY_MONTHLY);
      expect(hobbyPlan).toBeTruthy();
      expect(hobbyPlan!.key).toBe('hobby');
      expect(hobbyPlan!.name).toBe('Hobby');

      const proPlan = getPlanForPriceId(STRIPE_PRICES.PRO_MONTHLY);
      expect(proPlan).toBeTruthy();
      expect(proPlan!.key).toBe('pro');
      expect(proPlan!.name).toBe('Professional');

      const businessPlan = getPlanForPriceId(STRIPE_PRICES.BUSINESS_MONTHLY);
      expect(businessPlan).toBeTruthy();
      expect(businessPlan!.key).toBe('business');
      expect(businessPlan!.name).toBe('Business');
    });

    it('should return null for invalid price IDs', () => {
      const invalidPriceIds = [
        'price_invalid_nonexistent',
        'price_one_time_legacy',
        'not_a_price_id',
        '',
        'price_123_invalid',
      ];

      invalidPriceIds.forEach(priceId => {
        const plan = getPlanForPriceId(priceId);
        expect(plan).toBeNull();
      });
    });

    it('should return null for undefined/null input', () => {
      expect(getPlanForPriceId(undefined as unknown as string)).toBeNull();
      expect(getPlanForPriceId(null as unknown as string)).toBeNull();
    });
  });

  describe('getPlanByKey()', () => {
    it('should return correct plan for valid plan keys', () => {
      const hobbyPlan = getPlanByKey('hobby');
      expect(hobbyPlan).toBeTruthy();
      expect(hobbyPlan!.key).toBe('hobby');
      expect(hobbyPlan!.name).toBe('Hobby');

      const proPlan = getPlanByKey('pro');
      expect(proPlan).toBeTruthy();
      expect(proPlan!.key).toBe('pro');
      expect(proPlan!.name).toBe('Professional');

      const businessPlan = getPlanByKey('business');
      expect(businessPlan).toBeTruthy();
      expect(businessPlan!.key).toBe('business');
      expect(businessPlan!.name).toBe('Business');
    });

    it('should return null for invalid plan keys', () => {
      const invalidKeys = ['invalid', 'enterprise', 'basic', 'premium', ''];
      invalidKeys.forEach(key => {
        const plan = getPlanByKey(key);
        expect(plan).toBeNull();
      });
    });

    it('should return null for undefined/null input', () => {
      expect(getPlanByKey(undefined as unknown as string)).toBeNull();
      expect(getPlanByKey(null as unknown as string)).toBeNull();
    });
  });

  describe('isStripePricesConfigured()', () => {
    it('should return true for static configuration', () => {
      expect(isStripePricesConfigured()).toBe(true);
    });
  });

  describe('validateStripeConfig()', () => {
    it('should validate configuration structure', () => {
      const validation = validateStripeConfig();
      expect(validation).toMatchObject({
        isValid: expect.any(Boolean),
        errors: expect.any(Array),
        warnings: expect.any(Array),
      });
      expect(Array.isArray(validation.errors)).toBe(true);
      expect(Array.isArray(validation.warnings)).toBe(true);
    });

    it('should not have errors for valid price IDs', () => {
      const validation = validateStripeConfig();
      const priceErrors = validation.errors.filter(error =>
        error.includes('Missing or invalid Stripe Price IDs')
      );
      expect(priceErrors).toHaveLength(0);
    });
  });

  describe('Credit Packs Configuration', () => {
    it('should contain credit pack references', () => {
      // Check that CREDIT_PACKS is populated (credits pack feature is implemented)
      expect(CREDIT_PACKS).toBeDefined();
      expect(Object.keys(CREDIT_PACKS)).toHaveLength(3); // small, medium, large

      // Check structure of credit packs
      expect(CREDIT_PACKS.SMALL_CREDITS).toMatchObject({
        name: 'Small Pack',
        credits: 50,
        price: 4.99,
      });
      expect(CREDIT_PACKS.MEDIUM_CREDITS).toMatchObject({
        name: 'Medium Pack',
        credits: 200,
        price: 14.99,
        popular: true,
      });
      expect(CREDIT_PACKS.LARGE_CREDITS).toMatchObject({
        name: 'Large Pack',
        credits: 600,
        price: 39.99,
      });
    });

    it('should only expose subscription-related functions', () => {
      // All exported functions should work with subscriptions only
      const subscriptionPriceId = STRIPE_PRICES.HOBBY_MONTHLY;

      expect(getPlanForPriceId(subscriptionPriceId)).toBeTruthy();
      expect(SUBSCRIPTION_PRICE_IDS).toContain(subscriptionPriceId);
      expect(SUBSCRIPTION_PRICE_MAP[subscriptionPriceId]).toBeTruthy();
    });
  });

  describe('getPlanDisplayName()', () => {
    it('should prioritize subscription_tier over other sources', () => {
      const result = getPlanDisplayName({
        subscriptionTier: 'Custom Display Name',
        priceId: STRIPE_PRICES.HOBBY_MONTHLY,
      });
      expect(result).toBe('Custom Display Name');
    });

    it('should fallback to priceId lookup when subscription_tier is null', () => {
      const result = getPlanDisplayName({
        subscriptionTier: null,
        priceId: STRIPE_PRICES.PRO_MONTHLY,
      });
      expect(result).toBe('Professional');
    });

    it('should fallback to planKey lookup when both subscription_tier and priceId are null', () => {
      const result = getPlanDisplayName({
        subscriptionTier: null,
        priceId: null,
        planKey: 'business',
      });
      expect(result).toBe('Business');
    });

    it('should return "Unknown Plan" when all inputs are invalid', () => {
      const result = getPlanDisplayName({
        subscriptionTier: null,
        priceId: 'price_invalid',
        planKey: 'invalid_key',
      });
      expect(result).toBe('Unknown Plan');
    });

    it('should handle empty/undefined inputs', () => {
      expect(getPlanDisplayName({})).toBe('Unknown Plan');
      expect(
        getPlanDisplayName({
          subscriptionTier: undefined,
          priceId: undefined,
          planKey: undefined,
        })
      ).toBe('Unknown Plan');
    });

    it('should work with all subscription price IDs', () => {
      // Only test subscription plan price IDs, not credit pack price IDs
      Object.entries(STRIPE_PRICES).forEach(([key, priceId]) => {
        if (!key.includes('_CREDITS')) {
          // Skip credit packs
          const result = getPlanDisplayName({ priceId });
          expect(result).toBeTruthy();
          expect(result).not.toBe('Unknown Plan');
          expect(typeof result).toBe('string');
        }
      });
    });
  });
});
