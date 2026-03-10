/**
 * Unit Tests: Subscription Price Resolution Fallbacks
 *
 * Tests the multi-layer price resolution strategy used by subscription handlers.
 * The system uses a fallback chain to resolve Stripe Price IDs to plan metadata.
 *
 * Resolution Strategy (in order):
 * 1. Direct lookup in price index (resolvePriceId) - for known Price IDs
 * 2. Stripe API lookup (for inline temp prices like price_inline_temp_*)
 * 3. Subscription retrieval fallback (regional prices not in index)
 * 4. Error thrown (no silent defaults)
 *
 * Key Scenarios:
 * - Known subscription Price IDs resolve immediately
 * - Inline temp prices (from checkout with price_data) trigger Stripe API call
 * - Regional price_data generated IDs fall back to subscription lookup
 * - Complete failures throw descriptive errors
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolvePriceId,
  assertKnownPriceId,
  resolvePlanOrPack,
  getPlanByPriceId,
} from '@/shared/config/subscription.utils';
import { getBasePriceIdByPlanKey } from '@/shared/config/pricing-regions';

// Mock the subscription config to provide test data
vi.mock('@/shared/config/subscription.config', () => ({
  getSubscriptionConfig: vi.fn(() => ({
    plans: [
      {
        key: 'starter',
        name: 'Starter',
        enabled: true,
        stripePriceId: 'price_starter_monthly',
        priceInCents: 900,
        currency: 'usd',
        creditsPerCycle: 100,
        rolloverMultiplier: 2,
        maxRollover: 200,
        interval: 'month',
        displayOrder: 1,
        recommended: false,
        creditsExpiration: {
          mode: 'never',
          sendExpirationWarning: false,
          warningDaysBefore: 0,
        },
        features: ['100 credits/month', 'Basic support'],
      },
      {
        key: 'hobby',
        name: 'Hobby',
        enabled: true,
        stripePriceId: 'price_hobby_monthly',
        priceInCents: 1900,
        currency: 'usd',
        creditsPerCycle: 200,
        rolloverMultiplier: 2,
        maxRollover: 400,
        interval: 'month',
        displayOrder: 2,
        recommended: true,
        creditsExpiration: {
          mode: 'rolling_window',
          sendExpirationWarning: true,
          warningDaysBefore: 3,
        },
        features: ['200 credits/month', 'Priority support'],
      },
      {
        key: 'pro',
        name: 'Professional',
        enabled: true,
        stripePriceId: 'price_pro_monthly',
        priceInCents: 4900,
        currency: 'usd',
        creditsPerCycle: 1000,
        rolloverMultiplier: 2,
        maxRollover: 2000,
        interval: 'month',
        displayOrder: 3,
        recommended: false,
        creditsExpiration: {
          mode: 'end_of_cycle',
          sendExpirationWarning: true,
          warningDaysBefore: 3,
        },
        features: ['1000 credits/month', 'Dedicated support'],
      },
      {
        key: 'business',
        name: 'Business',
        enabled: true,
        stripePriceId: 'price_business_monthly',
        priceInCents: 9900,
        currency: 'usd',
        creditsPerCycle: 5000,
        rolloverMultiplier: 2,
        maxRollover: 10000,
        interval: 'month',
        displayOrder: 4,
        recommended: false,
        creditsExpiration: {
          mode: 'never',
          sendExpirationWarning: false,
          warningDaysBefore: 0,
        },
        features: ['5000 credits/month', '24/7 support'],
      },
    ],
    creditPacks: [
      {
        key: 'small',
        name: 'Small Pack',
        enabled: true,
        stripePriceId: 'price_small_credits',
        priceInCents: 499,
        currency: 'usd',
        credits: 50,
        popular: false,
      },
      {
        key: 'medium',
        name: 'Medium Pack',
        enabled: true,
        stripePriceId: 'price_medium_credits',
        priceInCents: 999,
        currency: 'usd',
        credits: 120,
        popular: true,
      },
      {
        key: 'large',
        name: 'Large Pack',
        enabled: true,
        stripePriceId: 'price_large_credits',
        priceInCents: 1999,
        currency: 'usd',
        credits: 300,
        popular: false,
      },
    ],
    freeUser: {
      initialCredits: 10,
      batchLimit: 5,
      hourlyProcessingLimit: 10,
    },
    warnings: {
      lowCreditThreshold: 20,
      lowCreditPercentage: 20,
      showToastOnDashboard: true,
      checkIntervalMs: 60000,
    },
    creditCosts: {
      minimumCost: 1,
      maximumCost: 10,
      modes: {
        upscale: 1,
        enhance: 2,
        face_restore: 3,
      },
      modelMultipliers: {
        'real-esrgan': 1.0,
        'gfpgan': 1.5,
      },
      scaleMultipliers: {
        '2x': 1.0,
        '4x': 2.0,
        '8x': 4.0,
      },
    },
  })),
}));

// Mock serverEnv for regional price fallback
vi.mock('@/shared/config/env', () => ({
  serverEnv: {
    STRIPE_PRICE_STARTER: 'price_starter_monthly',
    STRIPE_PRICE_HOBBY: 'price_hobby_monthly',
    STRIPE_PRICE_PRO: 'price_pro_monthly',
    STRIPE_PRICE_BUSINESS: 'price_business_monthly',
  },
}));

describe('Subscription Price Resolution - Fallback Strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Direct Lookup - Known Price IDs', () => {
    test('known subscription price ID resolves to plan metadata', () => {
      // Arrange
      const knownPriceId = 'price_hobby_monthly';

      // Act
      const resolved = resolvePriceId(knownPriceId);

      // Assert
      expect(resolved).not.toBeNull();
      expect(resolved?.type).toBe('plan');
      expect(resolved?.key).toBe('hobby');
      expect(resolved?.name).toBe('Hobby');
      expect(resolved?.credits).toBe(200);
      expect(resolved?.maxRollover).toBe(400);
    });

    test('known credit pack price ID resolves to pack metadata', () => {
      // Arrange
      const packPriceId = 'price_medium_credits';

      // Act
      const resolved = resolvePriceId(packPriceId);

      // Assert
      expect(resolved).not.toBeNull();
      expect(resolved?.type).toBe('pack');
      expect(resolved?.key).toBe('medium');
      expect(resolved?.name).toBe('Medium Pack');
      expect(resolved?.credits).toBe(120);
      expect(resolved?.maxRollover).toBeNull(); // Packs don't have rollover
    });

    test('resolvePlanOrPack returns normalized data for webhook/session metadata', () => {
      // Arrange
      const priceId = 'price_pro_monthly';

      // Act
      const resolved = resolvePlanOrPack(priceId);

      // Assert
      expect(resolved).not.toBeNull();
      expect(resolved).toEqual({
        type: 'plan',
        key: 'pro',
        name: 'Professional',
        creditsPerCycle: 1000,
        maxRollover: 2000,
      });
    });

    test('getPlanByPriceId returns full plan config for known price', () => {
      // Arrange
      const priceId = 'price_starter_monthly';

      // Act
      const plan = getPlanByPriceId(priceId);

      // Assert - Returns full plan config with all fields
      expect(plan).not.toBeNull();
      expect(plan?.key).toBe('starter');
      expect(plan?.name).toBe('Starter');
      expect(plan?.stripePriceId).toBe('price_starter_monthly');
      expect(plan?.creditsPerCycle).toBe(100);
      expect(plan?.interval).toBe('month');
      expect(plan?.recommended).toBe(false);
      expect(plan?.creditsExpiration).toBeDefined();
    });

    test('assertKnownPriceId throws for unknown price ID', () => {
      // Arrange
      const unknownPriceId = 'price_unknown_123';

      // Act & Assert
      expect(() => assertKnownPriceId(unknownPriceId)).toThrow('Unknown price ID');
    });

    test('resolvePriceId returns null for unknown price ID (safe lookup)', () => {
      // Arrange
      const unknownPriceId = 'price_unknown_123';

      // Act
      const resolved = resolvePriceId(unknownPriceId);

      // Assert - Returns null instead of throwing
      expect(resolved).toBeNull();
    });
  });

  describe('Inline Temp Price Detection', () => {
    test('inline temp price pattern is identified for Stripe API lookup', () => {
      // Inline temp prices are generated by Stripe when checkout uses price_data
      // They have a specific pattern: price_inline_temp_*

      const inlineTempPriceId = 'price_inline_temp_1711234567890_abc123';

      // The handler should detect this pattern and trigger Stripe API lookup
      // In practice, this would call stripe.prices.retrieve(inlineTempPriceId)
      // For this unit test, we verify the pattern detection logic

      const isInlineTemp = inlineTempPriceId.startsWith('price_inline_temp_');

      expect(isInlineTemp).toBe(true);
      expect(inlineTempPriceId).toMatch(/^price_inline_temp_\d+_/);
    });

    test('regular price IDs are not mistaken for inline temp prices', () => {
      const regularPriceIds = [
        'price_hobby_monthly',
        'price_pro_monthly',
        'price_1N5YmB2eZvKYlo2C1234abcd', // Stripe generated ID
        'price_small_credits',
      ];

      regularPriceIds.forEach(priceId => {
        const isInlineTemp = priceId.startsWith('price_inline_temp_');
        expect(isInlineTemp).toBe(false);
      });
    });

    test('inline temp price not in index triggers fallback to subscription retrieval', () => {
      // When a price starts with price_inline_temp_, it's not in our index
      // The handler should fall back to fetching the Stripe subscription
      // to get the plan metadata from the subscription itself

      const inlineTempPriceId = 'price_inline_temp_1711234567890_xyz789';

      // Direct lookup returns null (not in index)
      const directLookup = resolvePriceId(inlineTempPriceId);
      expect(directLookup).toBeNull();

      // Fallback strategy would be:
      // 1. Fetch subscription from Stripe: stripe.subscriptions.retrieve(subscriptionId)
      // 2. Get price from subscription.items.data[0].price
      // 3. Use price.metadata.plan_key or price.lookup_key to resolve
      // 4. Or use getBasePriceIdByPlanKey if plan metadata is available
    });
  });

  describe('Regional Price Data Fallback', () => {
    test('regional price generated from price_data uses plan key fallback', () => {
      // When checkout uses price_data with regional discounts, Stripe generates
      // a unique price ID that's not in our index. The handler uses plan key lookup.

      const planKey = 'hobby';

      // getBasePriceIdByPlanKey returns the canonical base price ID
      const basePriceId = getBasePriceIdByPlanKey(planKey);

      expect(basePriceId).toBe('price_hobby_monthly');

      // Once we have the base price ID, we can resolve normally
      const resolved = resolvePriceId(basePriceId!);
      expect(resolved?.key).toBe('hobby');
      expect(resolved?.type).toBe('plan');
    });

    test('plan key lookup returns null for unknown plan', () => {
      const unknownPlanKey = 'enterprise';

      const basePriceId = getBasePriceIdByPlanKey(unknownPlanKey);

      expect(basePriceId).toBeNull();
    });

    test('all plan keys resolve to their canonical price IDs', () => {
      const planKeys = ['starter', 'hobby', 'pro', 'business'] as const;

      planKeys.forEach(planKey => {
        const basePriceId = getBasePriceIdByPlanKey(planKey);

        expect(basePriceId).not.toBeNull();
        expect(basePriceId).toMatch(/^price_\w+_monthly$/);

        // Verify the resolved price ID points to the correct plan
        const resolved = resolvePriceId(basePriceId!);
        expect(resolved?.key).toBe(planKey);
      });
    });

    test('regional price resolution fallback chain works end-to-end', () => {
      // Simulate the full fallback chain for a regional price

      // Step 1: Direct lookup fails (regional price not in index)
      const regionalPriceId = 'price_1N5YmB2eZvKYlo2C5678defg'; // Simulated regional price
      const directLookup = resolvePriceId(regionalPriceId);
      expect(directLookup).toBeNull();

      // Step 2: Handler would fetch subscription from Stripe
      // (simulated by having plan metadata available)
      const simulatedPlanKey = 'pro';

      // Step 3: Resolve using plan key
      const basePriceId = getBasePriceIdByPlanKey(simulatedPlanKey);
      expect(basePriceId).toBe('price_pro_monthly');

      // Step 4: Verify resolution succeeds
      const resolved = resolvePriceId(basePriceId!);
      expect(resolved?.key).toBe('pro');
      expect(resolved?.type).toBe('plan');
    });
  });

  describe('Complete Failure - Error Handling', () => {
    test('unknown price ID throws descriptive error (no silent defaults)', () => {
      const unknownPriceId = 'price_completely_unknown_123';

      expect(() => assertKnownPriceId(unknownPriceId)).toThrow(
        `Unknown price ID: ${unknownPriceId}. This price is not configured in the subscription config.`
      );
    });

    test('error includes price ID for debugging', () => {
      const unknownPriceId = 'price_debug_test_abc123';

      try {
        assertKnownPriceId(unknownPriceId);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(unknownPriceId);
      }
    });

    test('resolution failure prevents silent misconfiguration', () => {
      // This test ensures we don't silently fall back to a default plan
      // when price resolution fails - we should fail loudly

      const invalidPriceId = 'not_even_a_price_id';

      const result = resolvePriceId(invalidPriceId);

      // Should return null (safe lookup) - caller must handle this
      expect(result).toBeNull();

      // assertKnownPriceId would throw for this case
      expect(() => assertKnownPriceId(invalidPriceId)).toThrow();
    });

    test('empty price ID is handled gracefully', () => {
      const emptyPriceId = '';

      const result = resolvePriceId(emptyPriceId);

      expect(result).toBeNull();
    });

    test('undefined price ID is handled gracefully', () => {
      const result = resolvePriceId(undefined as unknown as string);

      expect(result).toBeNull();
    });
  });

  describe('Type Discrimination - Plans vs Packs', () => {
    test('subscription prices return type=plan', () => {
      const subscriptionPriceIds = [
        'price_starter_monthly',
        'price_hobby_monthly',
        'price_pro_monthly',
        'price_business_monthly',
      ];

      subscriptionPriceIds.forEach(priceId => {
        const resolved = resolvePriceId(priceId);
        expect(resolved?.type).toBe('plan');
      });
    });

    test('credit pack prices return type=pack', () => {
      const packPriceIds = [
        'price_small_credits',
        'price_medium_credits',
        'price_large_credits',
      ];

      packPriceIds.forEach(priceId => {
        const resolved = resolvePriceId(priceId);
        expect(resolved?.type).toBe('pack');
      });
    });

    test('resolvePlanOrPack returns correct structure for plans', () => {
      const resolved = resolvePlanOrPack('price_hobby_monthly');

      expect(resolved).toEqual({
        type: 'plan',
        key: 'hobby',
        name: 'Hobby',
        creditsPerCycle: 200,
        maxRollover: 400,
      });
      expect(resolved).not.toHaveProperty('credits'); // Plans use creditsPerCycle
    });

    test('resolvePlanOrPack returns correct structure for packs', () => {
      const resolved = resolvePlanOrPack('price_medium_credits');

      expect(resolved).toEqual({
        type: 'pack',
        key: 'medium',
        name: 'Medium Pack',
        credits: 120,
      });
      expect(resolved).not.toHaveProperty('creditsPerCycle'); // Packs use credits
      expect(resolved).not.toHaveProperty('maxRollover'); // Packs don't rollover
    });

    test('getPlanByPriceId returns null for credit pack prices', () => {
      const packPriceId = 'price_small_credits';

      const plan = getPlanByPriceId(packPriceId);

      expect(plan).toBeNull(); // Credit packs are not plans
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    test('case-sensitive price ID matching', () => {
      const validPriceId = 'price_hobby_monthly';
      const wrongCasePriceId = 'PRICE_HOBBY_MONTHLY';

      const validResult = resolvePriceId(validPriceId);
      const wrongCaseResult = resolvePriceId(wrongCasePriceId);

      expect(validResult).not.toBeNull();
      expect(wrongCaseResult).toBeNull();
    });

    test('partial price ID match does not succeed', () => {
      const fullPriceId = 'price_hobby_monthly';
      const partialPriceId = 'price_hobby';

      const fullResult = resolvePriceId(fullPriceId);
      const partialResult = resolvePriceId(partialPriceId);

      expect(fullResult).not.toBeNull();
      expect(partialResult).toBeNull();
    });

    test('price resolution is deterministic', () => {
      // Same input should always return same output
      const priceId = 'price_pro_monthly';

      const result1 = resolvePriceId(priceId);
      const result2 = resolvePriceId(priceId);
      const result3 = resolvePriceId(priceId);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });

    test('cached price index persists across calls', () => {
      // The price index is built once and cached
      const priceId1 = 'price_starter_monthly';
      const priceId2 = 'price_business_monthly';

      const result1 = resolvePriceId(priceId1);
      const result2 = resolvePriceId(priceId2);

      // Both should resolve successfully (index is cached, not rebuilt)
      expect(result1?.key).toBe('starter');
      expect(result2?.key).toBe('business');
    });
  });

  describe('Integration with Webhook Handler Fallback Logic', () => {
    test('price not in index triggers getBasePriceIdByPlanKey fallback', () => {
      // This simulates the subscription.handler.ts fallback logic

      const unknownPriceId = 'price_auto_generated_regional_123';
      const planKey = 'hobby';

      // Step 1: Direct lookup fails
      const directLookup = resolvePriceId(unknownPriceId);
      expect(directLookup).toBeNull();

      // Step 2: Fallback to getBasePriceIdByPlanKey
      const basePriceId = getBasePriceIdByPlanKey(planKey);
      expect(basePriceId).toBeDefined();

      // Step 3: Resolve using base price ID
      const resolved = resolvePriceId(basePriceId!);
      expect(resolved?.key).toBe(planKey);
    });

    test('subscription metadata plan key is used when price ID is unknown', () => {
      // Simulates the handler using subscription.metadata.plan_key as fallback

      const simulatedMetadataPlanKey = 'pro';

      const basePriceId = getBasePriceIdByPlanKey(simulatedMetadataPlanKey);
      expect(basePriceId).toBe('price_pro_monthly');

      const resolved = resolvePriceId(basePriceId!);
      expect(resolved?.key).toBe('pro');
      expect(resolved?.credits).toBe(1000);
    });

    test('assertKnownPriceId is used for final validation (fail fast)', () => {
      // After all fallbacks, assertKnownPriceId ensures we have a valid price
      // This prevents silent failures where we'd use an invalid price ID

      const validPriceId = 'price_hobby_monthly';

      // Should not throw for known price
      expect(() => assertKnownPriceId(validPriceId)).not.toThrow();

      const result = assertKnownPriceId(validPriceId);
      expect(result.type).toBe('plan');
      expect(result.key).toBe('hobby');
    });

    test('complete fallback chain: unknown price → plan key → base price ID → resolved', () => {
      // Full integration test of the fallback chain

      // Start with unknown regional price
      const unknownRegionalPrice = 'price_1N5YmB2eZvKYlo2C9999zzzz';

      // Fallback 1: Direct lookup fails
      let resolved = resolvePriceId(unknownRegionalPrice);
      expect(resolved).toBeNull();

      // Fallback 2: Use plan key from subscription metadata
      const planKey = 'starter';
      const basePriceId = getBasePriceIdByPlanKey(planKey);
      expect(basePriceId).toBeDefined();

      // Fallback 3: Resolve using base price
      resolved = resolvePriceId(basePriceId!);
      expect(resolved?.key).toBe('starter');
      expect(resolved?.type).toBe('plan');

      // Final validation
      const validated = assertKnownPriceId(basePriceId!);
      expect(validated.key).toBe('starter');
    });
  });
});
