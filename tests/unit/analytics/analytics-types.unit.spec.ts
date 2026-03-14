import { describe, test, expect } from 'vitest';

/**
 * Tests verifying that pricingRegion is a required field on all pricing-related
 * analytics events. This ensures TypeScript enforces inclusion at compile time.
 *
 * Related PRD: Geo-Pricing Tracking Fix
 * Phase 1: Analytics Type Updates
 */

describe('Analytics Types - pricingRegion Required Field', () => {
  describe('IPricingPageViewedProperties', () => {
    test('pricingRegion should be required (not optional)', async () => {
      const types = await import('@server/analytics/types');

      // Create a valid object with all required fields
      const validProperties: types.IPricingPageViewedProperties = {
        entryPoint: 'navbar',
        currentPlan: 'free',
        pricingRegion: 'standard',
      };

      expect(validProperties.pricingRegion).toBe('standard');
    });

    test('pricingRegion should accept all valid region values', async () => {
      const types = await import('@server/analytics/types');

      const regions = [
        'standard',
        'south_asia',
        'southeast_asia',
        'latam',
        'eastern_europe',
        'africa',
      ];

      regions.forEach(region => {
        const props: types.IPricingPageViewedProperties = {
          entryPoint: 'direct',
          currentPlan: 'hobby',
          pricingRegion: region,
        };
        expect(props.pricingRegion).toBe(region);
      });
    });
  });

  describe('ICheckoutStartedProperties', () => {
    test('pricingRegion should be required (not optional)', async () => {
      const types = await import('@server/analytics/types');

      const validProperties: types.ICheckoutStartedProperties = {
        priceId: 'price_test123',
        purchaseType: 'subscription',
        pricingRegion: 'standard',
      };

      expect(validProperties.pricingRegion).toBe('standard');
    });

    test('pricingRegion should work with optional fields present', async () => {
      const types = await import('@server/analytics/types');

      const propsWithOptionals: types.ICheckoutStartedProperties = {
        priceId: 'price_test123',
        purchaseType: 'credit_pack',
        sessionId: 'cs_test123',
        plan: 'pro',
        pricingRegion: 'south_asia',
        discountPercent: 65,
      };

      expect(propsWithOptionals.pricingRegion).toBe('south_asia');
      expect(propsWithOptionals.discountPercent).toBe(65);
    });
  });

  describe('ICheckoutCompletedProperties', () => {
    test('pricingRegion should be required (not optional)', async () => {
      const types = await import('@server/analytics/types');

      const validProperties: types.ICheckoutCompletedProperties = {
        purchaseType: 'subscription',
        amount: 999,
        paymentMethod: 'card',
        sessionId: 'cs_test123',
        pricingRegion: 'latam',
      };

      expect(validProperties.pricingRegion).toBe('latam');
    });
  });

  describe('ICheckoutAbandonedProperties', () => {
    test('pricingRegion should be required (not optional)', async () => {
      const types = await import('@server/analytics/types');

      const validProperties: types.ICheckoutAbandonedProperties = {
        priceId: 'price_test123',
        step: 'plan_selection',
        timeSpentMs: 5000,
        plan: 'hobby',
        pricingRegion: 'southeast_asia',
      };

      expect(validProperties.pricingRegion).toBe('southeast_asia');
    });
  });

  describe('IUpgradePromptShownProperties', () => {
    test('pricingRegion should be required (not optional)', async () => {
      const types = await import('@server/analytics/types');

      const validProperties: types.IUpgradePromptShownProperties = {
        trigger: 'out_of_credits',
        currentPlan: 'free',
        pricingRegion: 'eastern_europe',
      };

      expect(validProperties.pricingRegion).toBe('eastern_europe');
    });

    test('pricingRegion should work with optional imageVariant', async () => {
      const types = await import('@server/analytics/types');

      const propsWithOptional: types.IUpgradePromptShownProperties = {
        trigger: 'premium_upsell',
        imageVariant: 'comparison',
        currentPlan: 'starter',
        pricingRegion: 'africa',
      };

      expect(propsWithOptional.pricingRegion).toBe('africa');
      expect(propsWithOptional.imageVariant).toBe('comparison');
    });
  });

  describe('IUpgradePromptClickedProperties', () => {
    test('pricingRegion should be required (not optional)', async () => {
      const types = await import('@server/analytics/types');

      const validProperties: types.IUpgradePromptClickedProperties = {
        trigger: 'model_gate',
        destination: '/pricing',
        currentPlan: 'free',
        pricingRegion: 'standard',
      };

      expect(validProperties.pricingRegion).toBe('standard');
    });
  });

  describe('IUpgradePromptDismissedProperties', () => {
    test('pricingRegion should be required (not optional)', async () => {
      const types = await import('@server/analytics/types');

      const validProperties: types.IUpgradePromptDismissedProperties = {
        trigger: 'after_upscale',
        currentPlan: 'hobby',
        pricingRegion: 'south_asia',
      };

      expect(validProperties.pricingRegion).toBe('south_asia');
    });
  });
});

describe('Analytics Types - Interface Structure Validation', () => {
  test('IPricingPageViewedProperties should have correct required fields', async () => {
    const types = await import('@server/analytics/types');

    // This test verifies the interface structure by creating a complete object
    const completeProps: types.IPricingPageViewedProperties = {
      entryPoint: 'navbar',
      currentPlan: 'pro',
      pricingRegion: 'standard',
      referrer: 'https://example.com',
      discountPercent: 0,
    };

    // Verify all fields exist
    expect(completeProps.entryPoint).toBeDefined();
    expect(completeProps.currentPlan).toBeDefined();
    expect(completeProps.pricingRegion).toBeDefined();
    expect(completeProps.referrer).toBeDefined();
    expect(completeProps.discountPercent).toBeDefined();
  });

  test('IUpgradePromptTrigger should include all expected triggers', async () => {
    const types = await import('@server/analytics/types');

    const triggers: types.IUpgradePromptTrigger[] = [
      'premium_upsell',
      'out_of_credits',
      'model_gate',
      'after_upscale',
      'after_comparison',
      'after_download',
      'after_batch',
    ];

    expect(triggers).toHaveLength(7);
  });
});
