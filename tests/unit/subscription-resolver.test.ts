import { describe, test, expect } from 'vitest';
import {
  resolvePriceId,
  assertKnownPriceId,
  resolvePlanOrPack,
  getPriceIndex,
} from '../../shared/config/subscription.utils';

describe('Unified Pricing Resolver', () => {
  // These tests rely on the actual configuration from subscription.config.ts
  // If the configuration changes, these tests should be updated accordingly

  describe('getPriceIndex', () => {
    test('should return price index containing all configured plans and credit packs', () => {
      const index = getPriceIndex();

      // Should contain hobby plan
      expect(index).toHaveProperty('price_1SZmVyALMLhQocpf0H7n5ls8');
      expect(index['price_1SZmVyALMLhQocpf0H7n5ls8']).toMatchObject({
        type: 'plan',
        key: 'hobby',
        name: 'Hobby',
        currency: 'usd',
        credits: 200,
      });

      // Should contain pro plan
      expect(index).toHaveProperty('price_1SZmVzALMLhQocpfPyRX2W8D');
      expect(index['price_1SZmVzALMLhQocpfPyRX2W8D']).toMatchObject({
        type: 'plan',
        key: 'pro',
        name: 'Professional',
        currency: 'usd',
        credits: 1000,
      });

      // Should contain business plan
      expect(index).toHaveProperty('price_1SZmVzALMLhQocpfqPk9spg4');
      expect(index['price_1SZmVzALMLhQocpfqPk9spg4']).toMatchObject({
        type: 'plan',
        key: 'business',
        name: 'Business',
        currency: 'usd',
        credits: 5000,
      });

      // Should contain credit packs
      expect(index).toHaveProperty('price_1SbAASALMLhQocpfGUg3wLXM');
      expect(index['price_1SbAASALMLhQocpfGUg3wLXM']).toMatchObject({
        type: 'pack',
        key: 'small',
        name: 'Small Pack',
        currency: 'usd',
        credits: 50,
      });
    });

    test('should cache the index on subsequent calls', () => {
      const index1 = getPriceIndex();
      const index2 = getPriceIndex();
      expect(index1).toBe(index2); // Same object reference
    });
  });

  describe('resolvePriceId', () => {
    test('should resolve known subscription plan price IDs', () => {
      const hobby = resolvePriceId('price_1SZmVyALMLhQocpf0H7n5ls8');
      expect(hobby).toMatchObject({
        type: 'plan',
        key: 'hobby',
        name: 'Hobby',
        stripePriceId: 'price_1SZmVyALMLhQocpf0H7n5ls8',
        priceInCents: 1900,
        currency: 'usd',
        credits: 200,
        maxRollover: 1200, // 200 * 6
      });

      const pro = resolvePriceId('price_1SZmVzALMLhQocpfPyRX2W8D');
      expect(pro).toMatchObject({
        type: 'plan',
        key: 'pro',
        name: 'Professional',
        credits: 1000,
      });
    });

    test('should resolve known credit pack price IDs', () => {
      const smallPack = resolvePriceId('price_1SbAASALMLhQocpfGUg3wLXM');
      expect(smallPack).toMatchObject({
        type: 'pack',
        key: 'small',
        name: 'Small Pack',
        stripePriceId: 'price_1SbAASALMLhQocpfGUg3wLXM',
        priceInCents: 499,
        currency: 'usd',
        credits: 50,
        maxRollover: null,
      });

      const mediumPack = resolvePriceId('price_1SbAASALMLhQocpf7nw3wRj7');
      expect(mediumPack).toMatchObject({
        type: 'pack',
        key: 'medium',
        name: 'Medium Pack',
        credits: 200,
      });
    });

    test('should return null for unknown price IDs', () => {
      const unknown = resolvePriceId('price_unknown123456789');
      expect(unknown).toBeNull();
    });

    test('should return null for invalid price ID formats', () => {
      expect(resolvePriceId('')).toBeNull();
      expect(resolvePriceId('invalid_price')).toBeNull();
      expect(resolvePriceId('price_')).toBeNull();
    });
  });

  describe('assertKnownPriceId', () => {
    test('should return resolved data for known price IDs', () => {
      const result = assertKnownPriceId('price_1SZmVyALMLhQocpf0H7n5ls8');
      expect(result).toMatchObject({
        type: 'plan',
        key: 'hobby',
        name: 'Hobby',
      });
    });

    test('should throw error for unknown price IDs', () => {
      expect(() => {
        assertKnownPriceId('price_unknown123456789');
      }).toThrow('Unknown price ID: price_unknown123456789. This price is not configured in the subscription config.');
    });

    test('should throw error for invalid price ID formats', () => {
      expect(() => {
        assertKnownPriceId('');
      }).toThrow('Unknown price ID: . This price is not configured in the subscription config.');

      expect(() => {
        assertKnownPriceId('invalid_price');
      }).toThrow('Unknown price ID: invalid_price. This price is not configured in the subscription config.');
    });
  });

  describe('resolvePlanOrPack', () => {
    test('should resolve subscription plans with correct structure', () => {
      const result = resolvePlanOrPack('price_1SZmVyALMLhQocpf0H7n5ls8');
      expect(result).toMatchObject({
        type: 'plan',
        key: 'hobby',
        name: 'Hobby',
        creditsPerCycle: 200,
        maxRollover: 1200,
      });
      expect(result).not.toHaveProperty('credits');
    });

    test('should resolve credit packs with correct structure', () => {
      const result = resolvePlanOrPack('price_1SbAASALMLhQocpfGUg3wLXM');
      expect(result).toMatchObject({
        type: 'pack',
        key: 'small',
        name: 'Small Pack',
        credits: 50,
      });
      expect(result).not.toHaveProperty('creditsPerCycle');
      expect(result).not.toHaveProperty('maxRollover');
    });

    test('should return null for unknown price IDs', () => {
      const result = resolvePlanOrPack('price_unknown123456789');
      expect(result).toBeNull();
    });

    test('should handle malformed price IDs gracefully', () => {
      expect(resolvePlanOrPack('')).toBeNull();
      expect(resolvePlanOrPack('invalid_price')).toBeNull();
    });
  });

  describe('Integration with existing configuration', () => {
    test('should ensure all price IDs from subscription config are resolvable', () => {
      const { getSubscriptionConfig } = require('../../shared/config/subscription.config');
      const config = getSubscriptionConfig();

      // Test all enabled plans
      for (const plan of config.plans.filter(p => p.enabled)) {
        const resolved = resolvePriceId(plan.stripePriceId);
        expect(resolved).not.toBeNull();
        expect(resolved?.type).toBe('plan');
        expect(resolved?.key).toBe(plan.key);
        expect(resolved?.name).toBe(plan.name);
        expect(resolved?.credits).toBe(plan.creditsPerCycle);
      }

      // Test all enabled credit packs
      for (const pack of config.creditPacks.filter(p => p.enabled)) {
        const resolved = resolvePriceId(pack.stripePriceId);
        expect(resolved).not.toBeNull();
        expect(resolved?.type).toBe('pack');
        expect(resolved?.key).toBe(pack.key);
        expect(resolved?.name).toBe(pack.name);
        expect(resolved?.credits).toBe(pack.credits);
      }
    });

    test('should maintain consistency between resolver and legacy helpers', () => {
      // This test ensures backward compatibility
      const { getPlanByPriceId, getCreditPackByPriceId } = require('../../shared/config/subscription.utils');

      // Test a known plan
      const planPriceId = 'price_1SZmVyALMLhQocpf0H7n5ls8';
      const legacyPlan = getPlanByPriceId(planPriceId);
      const resolvedPlan = resolvePriceId(planPriceId);

      expect(legacyPlan).not.toBeNull();
      expect(resolvedPlan).not.toBeNull();
      expect(legacyPlan?.key).toBe(resolvedPlan?.key);
      expect(legacyPlan?.name).toBe(resolvedPlan?.name);

      // Test a known credit pack
      const packPriceId = 'price_1SbAASALMLhQocpfGUg3wLXM';
      const legacyPack = getCreditPackByPriceId(packPriceId);
      const resolvedPack = resolvePriceId(packPriceId);

      expect(legacyPack).not.toBeNull();
      expect(resolvedPack).not.toBeNull();
      expect(legacyPack?.key).toBe(resolvedPack?.key);
      expect(legacyPack?.name).toBe(resolvedPack?.name);
    });
  });
});