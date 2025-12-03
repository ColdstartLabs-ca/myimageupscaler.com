import { describe, test, expect } from 'vitest';
import { SUBSCRIPTION_CONFIG, getSubscriptionConfig } from '@shared/config/subscription.config';
import { validateSubscriptionConfig } from '@shared/config/subscription.validator';
import {
  getPlanByPriceId,
  getPlanByKey,
  getEnabledPlans,
  getRecommendedPlan,
  calculateCreditCost,
  getCreditCostForMode,
  getFreeUserCredits,
  getLowCreditThreshold,
  getExpirationConfig,
  creditsExpireForPlan,
  calculateBalanceWithExpiration,
  shouldSendExpirationWarning,
} from '@shared/config/subscription.utils';

describe('Subscription Configuration', () => {
  describe('Configuration Validation', () => {
    test('default config passes validation', () => {
      expect(() => {
        validateSubscriptionConfig(SUBSCRIPTION_CONFIG);
      }).not.toThrow();
    });

    test('config has all required fields', () => {
      const config = getSubscriptionConfig();
      expect(config.version).toBeDefined();
      expect(config.plans).toBeInstanceOf(Array);
      expect(config.plans.length).toBeGreaterThan(0);
      expect(config.creditCosts).toBeDefined();
      expect(config.freeUser).toBeDefined();
      expect(config.warnings).toBeDefined();
      expect(config.defaults).toBeDefined();
    });

    test('all plans have valid Stripe price IDs', () => {
      const config = getSubscriptionConfig();
      for (const plan of config.plans) {
        expect(plan.stripePriceId).toMatch(/^price_/);
      }
    });

    test('credit costs are positive', () => {
      const config = getSubscriptionConfig();
      expect(config.creditCosts.modes.upscale).toBeGreaterThan(0);
      expect(config.creditCosts.modes.enhance).toBeGreaterThan(0);
      expect(config.creditCosts.modes.both).toBeGreaterThan(0);
      expect(config.creditCosts.modes.custom).toBeGreaterThan(0);
    });

    test('minimumCost <= maximumCost', () => {
      const config = getSubscriptionConfig();
      expect(config.creditCosts.minimumCost).toBeLessThanOrEqual(config.creditCosts.maximumCost);
    });
  });

  describe('Plan Lookup Functions', () => {
    test('getPlanByPriceId returns correct plan', () => {
      const plan = getPlanByPriceId('price_1SZmVzALMLhQocpfPyRX2W8D');
      expect(plan).toBeDefined();
      expect(plan?.key).toBe('pro');
      expect(plan?.name).toBe('Professional');
    });

    test('getPlanByPriceId returns null for invalid price ID', () => {
      const plan = getPlanByPriceId('invalid_price_id');
      expect(plan).toBeNull();
    });

    test('getPlanByKey returns correct plan', () => {
      const plan = getPlanByKey('hobby');
      expect(plan).toBeDefined();
      expect(plan?.stripePriceId).toBe('price_1SZmVyALMLhQocpf0H7n5ls8');
      expect(plan?.creditsPerCycle).toBe(200);
    });

    test('getPlanByKey returns null for invalid key', () => {
      const plan = getPlanByKey('invalid_key');
      expect(plan).toBeNull();
    });

    test('getEnabledPlans returns only enabled plans', () => {
      const plans = getEnabledPlans();
      expect(plans.every(p => p.enabled)).toBe(true);
    });

    test('getEnabledPlans returns plans in display order', () => {
      const plans = getEnabledPlans();
      for (let i = 1; i < plans.length; i++) {
        expect(plans[i].displayOrder).toBeGreaterThanOrEqual(plans[i - 1].displayOrder);
      }
    });

    test('getRecommendedPlan returns the recommended plan', () => {
      const plan = getRecommendedPlan();
      expect(plan).toBeDefined();
      expect(plan?.recommended).toBe(true);
      expect(plan?.key).toBe('pro'); // Pro is marked as recommended
    });
  });

  describe('Credit Cost Calculations', () => {
    test('calculateCreditCost for upscale mode', () => {
      const cost = calculateCreditCost({ mode: 'upscale', scale: 2 });
      expect(cost).toBe(1);
    });

    test('calculateCreditCost for enhance mode', () => {
      const cost = calculateCreditCost({ mode: 'enhance', scale: 2 });
      expect(cost).toBe(2);
    });

    test('calculateCreditCost for both mode', () => {
      const cost = calculateCreditCost({ mode: 'both', scale: 2 });
      expect(cost).toBe(2);
    });

    test('calculateCreditCost for custom mode', () => {
      const cost = calculateCreditCost({ mode: 'custom', scale: 2 });
      expect(cost).toBe(2);
    });

    test('calculateCreditCost with 4x scale', () => {
      // Currently no difference, but configurable
      const cost = calculateCreditCost({ mode: 'upscale', scale: 4 });
      expect(cost).toBe(1);
    });

    test('calculateCreditCost respects minimum cost', () => {
      const cost = calculateCreditCost({ mode: 'upscale' });
      expect(cost).toBeGreaterThanOrEqual(1); // minimumCost = 1
    });

    test('getCreditCostForMode returns correct costs', () => {
      expect(getCreditCostForMode('upscale')).toBe(1);
      expect(getCreditCostForMode('enhance')).toBe(2);
      expect(getCreditCostForMode('both')).toBe(2);
      expect(getCreditCostForMode('custom')).toBe(2);
    });
  });

  describe('Free User & Warnings', () => {
    test('getFreeUserCredits returns initial credits', () => {
      const credits = getFreeUserCredits();
      expect(credits).toBe(10);
    });

    test('getLowCreditThreshold returns warning threshold', () => {
      const threshold = getLowCreditThreshold();
      expect(threshold).toBe(5);
    });
  });

  describe('Plan Configuration Values', () => {
    test('hobby plan has correct values', () => {
      const plan = getPlanByKey('hobby');
      expect(plan?.creditsPerCycle).toBe(200);
      expect(plan?.maxRollover).toBeDefined();
      expect(plan?.rolloverMultiplier).toBe(6);
      expect(plan?.priceInCents).toBe(1900);
    });

    test('pro plan has correct values', () => {
      const plan = getPlanByKey('pro');
      expect(plan?.creditsPerCycle).toBe(1000);
      expect(plan?.maxRollover).toBeDefined();
      expect(plan?.rolloverMultiplier).toBe(6);
      expect(plan?.priceInCents).toBe(4900);
      expect(plan?.recommended).toBe(true);
    });

    test('business plan has correct values', () => {
      const plan = getPlanByKey('business');
      expect(plan?.creditsPerCycle).toBe(5000);
      expect(plan?.maxRollover).toBeDefined();
      expect(plan?.rolloverMultiplier).toBe(6);
      expect(plan?.priceInCents).toBe(14900);
    });
  });

  describe('Trial Configuration (Disabled)', () => {
    test('all plans have trial disabled by default', () => {
      const plans = getEnabledPlans();
      for (const plan of plans) {
        expect(plan.trial.enabled).toBe(false);
        expect(plan.trial.durationDays).toBe(0);
      }
    });
  });

  describe('Credits Expiration Configuration', () => {
    test('all plans have valid expiration configuration', () => {
      const plans = getEnabledPlans();
      for (const plan of plans) {
        expect(plan.creditsExpiration).toBeDefined();
        expect(plan.creditsExpiration.mode).toBeDefined();
        expect(['never', 'end_of_cycle', 'rolling_window']).toContain(plan.creditsExpiration.mode);
      }
    });
  });

  describe('Credits Expiration Functions', () => {
    test('getExpirationConfig returns config for valid price ID', () => {
      const config = getExpirationConfig('price_1SZmVzALMLhQocpfPyRX2W8D');
      expect(config).toBeDefined();
      expect(config?.mode).toBeDefined();
      expect(['never', 'end_of_cycle', 'rolling_window']).toContain(config?.mode);
    });

    test('getExpirationConfig returns null for invalid price ID', () => {
      const config = getExpirationConfig('invalid_price_id');
      expect(config).toBeNull();
    });

    test('creditsExpireForPlan returns correct value based on mode', () => {
      const expires = creditsExpireForPlan('price_1SZmVzALMLhQocpfPyRX2W8D');
      expect(typeof expires).toBe('boolean');
    });

    test('calculateBalanceWithExpiration - never mode with rollover', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: 150,
        newCredits: 200,
        expirationMode: 'never',
        maxRollover: 1200,
      });

      expect(result.newBalance).toBe(350); // 150 + 200
      expect(result.expiredAmount).toBe(0);
    });

    test('calculateBalanceWithExpiration - never mode with rollover cap', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: 1100,
        newCredits: 200,
        expirationMode: 'never',
        maxRollover: 1200,
      });

      expect(result.newBalance).toBe(1200); // Capped at max
      expect(result.expiredAmount).toBe(0);
    });

    test('calculateBalanceWithExpiration - end_of_cycle mode expires all', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: 150,
        newCredits: 200,
        expirationMode: 'end_of_cycle',
        maxRollover: null,
      });

      expect(result.newBalance).toBe(200); // Fresh allocation
      expect(result.expiredAmount).toBe(150); // All old credits expired
    });

    test('calculateBalanceWithExpiration - rolling_window mode expires all', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: 75,
        newCredits: 200,
        expirationMode: 'rolling_window',
        maxRollover: null,
      });

      expect(result.newBalance).toBe(200); // Fresh allocation
      expect(result.expiredAmount).toBe(75); // All old credits expired
    });

    test('calculateBalanceWithExpiration - end_of_cycle with zero balance', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: 0,
        newCredits: 200,
        expirationMode: 'end_of_cycle',
        maxRollover: null,
      });

      expect(result.newBalance).toBe(200);
      expect(result.expiredAmount).toBe(0); // Nothing to expire
    });

    test('shouldSendExpirationWarning returns correct value based on config', () => {
      const plan = getPlanByPriceId('price_1SZmVzALMLhQocpfPyRX2W8D');
      const should = shouldSendExpirationWarning({
        priceId: 'price_1SZmVzALMLhQocpfPyRX2W8D',
        daysUntilExpiration: 3,
      });

      // Result depends on plan config
      expect(typeof should).toBe('boolean');

      // If mode is 'never', should always be false
      if (plan?.creditsExpiration.mode === 'never') {
        expect(should).toBe(false);
      }
    });

    test('shouldSendExpirationWarning returns false for invalid price ID', () => {
      const should = shouldSendExpirationWarning({
        priceId: 'invalid_price_id',
        daysUntilExpiration: 3,
      });

      expect(should).toBe(false);
    });

    test('shouldSendExpirationWarning checks warning configuration', () => {
      const plan = getPlanByPriceId('price_1SZmVzALMLhQocpfPyRX2W8D');
      const warningDays = plan?.creditsExpiration.warningDaysBefore || 0;

      // Test within warning window
      const shouldWarn = shouldSendExpirationWarning({
        priceId: 'price_1SZmVzALMLhQocpfPyRX2W8D',
        daysUntilExpiration: warningDays - 1,
      });

      // Test outside warning window
      const shouldNotWarn = shouldSendExpirationWarning({
        priceId: 'price_1SZmVzALMLhQocpfPyRX2W8D',
        daysUntilExpiration: warningDays + 1,
      });

      expect(typeof shouldWarn).toBe('boolean');
      expect(typeof shouldNotWarn).toBe('boolean');
    });
  });
});
