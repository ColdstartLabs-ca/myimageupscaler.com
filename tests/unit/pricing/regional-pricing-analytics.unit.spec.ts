import { describe, it, expect } from 'vitest';
import type {
  IPricingPageViewedProperties,
  ICheckoutStartedProperties,
  ICheckoutCompletedProperties,
} from '@/server/analytics/types';

/**
 * Tests for Phase 4: Regional Pricing Analytics Types
 *
 * Validates that the analytics event interfaces include pricingRegion
 * fields for regional dynamic pricing tracking.
 */

describe('Regional Pricing Analytics Types', () => {
  describe('IPricingPageViewedProperties', () => {
    it('should include pricingRegion field', () => {
      const props: IPricingPageViewedProperties = {
        entryPoint: 'direct',
        currentPlan: 'free',
        pricingRegion: 'south_asia',
        discountPercent: 65,
      };

      expect(props.pricingRegion).toBe('south_asia');
      expect(props.discountPercent).toBe(65);
    });

    it('should allow pricingRegion to be undefined (optional)', () => {
      const props: IPricingPageViewedProperties = {
        entryPoint: 'navbar',
        currentPlan: 'pro',
      };

      expect(props.pricingRegion).toBeUndefined();
      expect(props.discountPercent).toBeUndefined();
    });

    it('should accept standard region with 0 discount', () => {
      const props: IPricingPageViewedProperties = {
        entryPoint: 'direct',
        currentPlan: 'free',
        pricingRegion: 'standard',
        discountPercent: 0,
      };

      expect(props.pricingRegion).toBe('standard');
      expect(props.discountPercent).toBe(0);
    });
  });

  describe('ICheckoutStartedProperties', () => {
    it('should include pricingRegion field', () => {
      const props: ICheckoutStartedProperties = {
        priceId: 'price_123',
        purchaseType: 'subscription',
        sessionId: 'cs_test_123',
        pricingRegion: 'southeast_asia',
        discountPercent: 60,
      };

      expect(props.pricingRegion).toBe('southeast_asia');
      expect(props.discountPercent).toBe(60);
    });

    it('should allow pricingRegion to be undefined (optional)', () => {
      const props: ICheckoutStartedProperties = {
        priceId: 'price_456',
        purchaseType: 'credit_pack',
        sessionId: 'cs_test_456',
      };

      expect(props.pricingRegion).toBeUndefined();
    });
  });

  describe('ICheckoutCompletedProperties', () => {
    it('should include pricingRegion field', () => {
      const props: ICheckoutCompletedProperties = {
        priceId: 'price_789',
        purchaseType: 'subscription',
        sessionId: 'cs_test_789',
        pricingRegion: 'latam',
      };

      expect(props.pricingRegion).toBe('latam');
    });

    it('should allow pricingRegion to be undefined (optional)', () => {
      const props: ICheckoutCompletedProperties = {
        priceId: 'price_abc',
        purchaseType: 'credit_pack',
        sessionId: 'cs_test_abc',
      };

      expect(props.pricingRegion).toBeUndefined();
    });

    it('should have required fields: priceId, purchaseType, sessionId', () => {
      const props: ICheckoutCompletedProperties = {
        priceId: 'price_def',
        purchaseType: 'subscription',
        sessionId: 'cs_test_def',
      };

      expect(props).toHaveProperty('priceId');
      expect(props).toHaveProperty('purchaseType');
      expect(props).toHaveProperty('sessionId');
    });

    it('should accept all valid region strings', () => {
      const regions = [
        'standard',
        'south_asia',
        'southeast_asia',
        'latam',
        'eastern_europe',
        'africa',
      ];

      for (const region of regions) {
        const props: ICheckoutCompletedProperties = {
          priceId: 'price_test',
          purchaseType: 'subscription',
          sessionId: 'cs_test',
          pricingRegion: region,
        };
        expect(props.pricingRegion).toBe(region);
      }
    });
  });
});
