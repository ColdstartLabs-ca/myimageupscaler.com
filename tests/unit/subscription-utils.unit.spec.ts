import { describe, expect, test } from 'vitest';
import { CREDIT_COSTS } from '../../shared/config/credits.config';
import { getSubscriptionConfig } from '../../shared/config/subscription.config';
import {
  buildHomepageTiers,
  calculateBalanceWithExpiration,
  creditsExpireForPlan,
  getEnabledPlans,
  getExpirationConfig,
  getPlanByKey,
} from '../../shared/config/subscription.utils';

describe('getPlanByKey', () => {
  test('should return Starter plan configuration for "starter" key', () => {
    const plan = getPlanByKey('starter');

    expect(plan).not.toBeNull();
    expect(plan?.key).toBe('starter');
    expect(plan?.name).toBe('Starter');
    expect(plan?.enabled).toBe(true);
    expect(plan?.priceInCents).toBe(900);
    expect(plan?.creditsPerCycle).toBe(CREDIT_COSTS.STARTER_MONTHLY_CREDITS);
    expect(plan?.maxRollover).toBe(CREDIT_COSTS.STARTER_MONTHLY_CREDITS * 3);
    expect(plan?.creditsExpiration.mode).toBe('never');
  });

  test('should return correct configuration for all known plans', () => {
    const config = getSubscriptionConfig();

    config.plans.forEach(plan => {
      const retrievedPlan = getPlanByKey(plan.key);
      expect(retrievedPlan).not.toBeNull();
      expect(retrievedPlan?.key).toBe(plan.key);
      expect(retrievedPlan?.name).toBe(plan.name);
      expect(retrievedPlan?.creditsPerCycle).toBe(plan.creditsPerCycle);
      expect(retrievedPlan?.maxRollover).toBe(plan.maxRollover);
      expect(retrievedPlan?.creditsExpiration.mode).toBe(plan.creditsExpiration.mode);
    });
  });

  test('should return null for unknown plan keys', () => {
    const unknownPlan = getPlanByKey('unknown');
    expect(unknownPlan).toBeNull();

    const emptyPlan = getPlanByKey('');
    expect(emptyPlan).toBeNull();
  });

  test('should be case sensitive', () => {
    const lowerCase = getPlanByKey('starter');
    const upperCase = getPlanByKey('STARTER');
    const mixedCase = getPlanByKey('Starter');

    expect(lowerCase).not.toBeNull();
    expect(upperCase).toBeNull();
    expect(mixedCase).toBeNull();
  });
});

describe('calculateBalanceWithExpiration', () => {
  describe('with "never" expiration mode (rollover enabled)', () => {
    test('should add new credits to existing balance', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: 50,
        newCredits: 100,
        expirationMode: 'never',
        maxRollover: 600,
      });

      expect(result.newBalance).toBe(150);
      expect(result.expiredAmount).toBe(0);
    });

    test('should cap balance at maxRollover limit', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: 550,
        newCredits: 100,
        expirationMode: 'never',
        maxRollover: 600,
      });

      expect(result.newBalance).toBe(600); // Capped at 600
      expect(result.expiredAmount).toBe(0);
    });

    test('should handle balance already at cap', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: 600,
        newCredits: 100,
        expirationMode: 'never',
        maxRollover: 600,
      });

      expect(result.newBalance).toBe(600); // Still capped
      expect(result.expiredAmount).toBe(0);
    });

    test('should handle zero maxRollover (no cap)', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: 1000,
        newCredits: 100,
        expirationMode: 'never',
        maxRollover: null,
      });

      expect(result.newBalance).toBe(1100);
      expect(result.expiredAmount).toBe(0);
    });

    test('should handle zero new credits', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: 300,
        newCredits: 0,
        expirationMode: 'never',
        maxRollover: 600,
      });

      expect(result.newBalance).toBe(300);
      expect(result.expiredAmount).toBe(0);
    });

    test('should handle zero current balance', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: 0,
        newCredits: 100,
        expirationMode: 'never',
        maxRollover: 600,
      });

      expect(result.newBalance).toBe(100);
      expect(result.expiredAmount).toBe(0);
    });
  });

  describe('with "end_of_cycle" expiration mode (no rollover)', () => {
    test('should expire all credits and replace with new allocation', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: 500,
        newCredits: 100,
        expirationMode: 'end_of_cycle',
        maxRollover: 600, // Ignored in this mode
      });

      expect(result.newBalance).toBe(100);
      expect(result.expiredAmount).toBe(500);
    });

    test('should handle empty current balance', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: 0,
        newCredits: 100,
        expirationMode: 'end_of_cycle',
        maxRollover: 600,
      });

      expect(result.newBalance).toBe(100);
      expect(result.expiredAmount).toBe(0);
    });
  });

  describe('with "rolling_window" expiration mode', () => {
    test('should behave like end_of_cycle', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: 400,
        newCredits: 100,
        expirationMode: 'rolling_window',
        maxRollover: 600,
      });

      expect(result.newBalance).toBe(100);
      expect(result.expiredAmount).toBe(400);
    });
  });

  describe('edge cases', () => {
    test('should handle negative values gracefully', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: -10,
        newCredits: 100,
        expirationMode: 'never',
        maxRollover: 600,
      });

      expect(result.newBalance).toBe(90);
      expect(result.expiredAmount).toBe(0);
    });

    test('should handle very large numbers', () => {
      const result = calculateBalanceWithExpiration({
        currentBalance: Number.MAX_SAFE_INTEGER - 1000,
        newCredits: 100,
        expirationMode: 'never',
        maxRollover: null,
      });

      expect(result.newBalance).toBeGreaterThan(0);
      expect(result.expiredAmount).toBe(0);
    });
  });
});

describe('getExpirationConfig', () => {
  test('should return correct config for Starter plan', () => {
    const config = getSubscriptionConfig();
    const starterPlan = config.plans.find(p => p.key === 'starter');
    const expirationConfig = getExpirationConfig(starterPlan!.stripePriceId);

    expect(expirationConfig).not.toBeNull();
    expect(expirationConfig?.mode).toBe('never');
    expect(expirationConfig?.gracePeriodDays).toBe(0);
    expect(expirationConfig?.sendExpirationWarning).toBe(false);
    expect(expirationConfig?.warningDaysBefore).toBe(0);
  });

  test('should return null for unknown price ID', () => {
    const expirationConfig = getExpirationConfig('price_unknown');
    expect(expirationConfig).toBeNull();
  });
});

describe('creditsExpireForPlan', () => {
  test('should return false for plans with rollover enabled', () => {
    const config = getSubscriptionConfig();

    config.plans
      .filter(p => p.enabled)
      .forEach(plan => {
        expect(creditsExpireForPlan(plan.stripePriceId)).toBe(false);
      });
  });
});

describe('getEnabledPlans', () => {
  test('should include Starter plan in enabled plans', () => {
    const enabledPlans = getEnabledPlans();
    const starterPlan = enabledPlans.find(p => p.key === 'starter');

    expect(starterPlan).toBeDefined();
    expect(starterPlan?.enabled).toBe(true);
  });

  test('should return plans in correct display order', () => {
    const enabledPlans = getEnabledPlans();

    for (let i = 1; i < enabledPlans.length; i++) {
      expect(enabledPlans[i].displayOrder).toBeGreaterThan(enabledPlans[i - 1].displayOrder);
    }
  });

  test('should not include disabled plans', () => {
    const config = getSubscriptionConfig();
    const enabledPlans = getEnabledPlans();

    enabledPlans.forEach(plan => {
      expect(plan.enabled).toBe(true);
    });

    const disabledPlans = config.plans.filter(p => !p.enabled);
    disabledPlans.forEach(disabledPlan => {
      const foundInEnabled = enabledPlans.find(p => p.key === disabledPlan.key);
      expect(foundInEnabled).toBeUndefined();
    });
  });
});

describe('buildHomepageTiers', () => {
  test('should include Starter tier in homepage tiers', () => {
    const tiers = buildHomepageTiers();
    const starterTier = tiers.find(t => t.name === 'Starter');

    expect(starterTier).toBeDefined();
    expect(starterTier?.price).toBe('$9');
    expect(starterTier?.priceValue).toBe(9);
    expect(starterTier?.period).toBe('/mo');
    expect(starterTier?.description).toBe('Perfect for getting started');
    expect(starterTier?.recommended).toBe(false);
    expect(starterTier?.variant).toBe('secondary');
  });

  test('should have correct features for Starter tier', () => {
    const tiers = buildHomepageTiers();
    const starterTier = tiers.find(t => t.name === 'Starter');

    expect(starterTier?.features).toContain('100 credits per month');
    expect(starterTier?.features).toContain('Credits roll over (up to 300)');
    expect(starterTier?.features).toContain('Email support');
    expect(starterTier?.features).toContain('All AI models included');
    expect(starterTier?.features).toContain('Batch upload up to 5 images');
  });

  test('should have correct CTA for Starter tier', () => {
    const tiers = buildHomepageTiers();
    const starterTier = tiers.find(t => t.name === 'Starter');

    expect(starterTier?.cta).toBe('Get Started');
  });

  test('should maintain correct order including free tier', () => {
    const tiers = buildHomepageTiers();

    expect(tiers[0].name).toBe('Free Tier');
    expect(tiers[1].name).toBe('Starter');
    expect(tiers[2].name).toBe('Hobby');
    expect(tiers[3].name).toBe('Professional');
    expect(tiers[4].name).toBe('Business');
  });
});
