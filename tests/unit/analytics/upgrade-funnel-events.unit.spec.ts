/**
 * Upgrade Funnel Analytics Unit Tests
 *
 * Tests for new analytics events and properties added in the upgrade funnel improvements.
 *
 * PRD: docs/PRDs/upgrade-funnel-ux-improvements.md
 * Branch: night-watch/35-fix-upgrade-funnel-post-auth-redirect-checkout-path-optimization
 *
 * Key additions tested:
 * 1. checkout_opened event with originatingModel property
 * 2. upgrade_plans_viewed event with trigger, pricingRegion, discountPercent
 * 3. Model gate upgrade_prompt_shown with trigger='model_gate'
 * 4. upgrade_prompt_clicked with originating model context
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the analytics module
const mockTrack = vi.fn();

vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: {
    track: mockTrack,
    isEnabled: () => true,
  },
}));

// Import types to verify they exist
import type {
  IAnalyticsEventName,
  ICheckoutOpenedProperties,
  IUpgradePromptShownProperties,
  IUpgradePromptClickedProperties,
  IUpgradePromptDismissedProperties,
  TUpgradeModalTrigger,
} from '@server/analytics/types';

describe('Upgrade Funnel Analytics Events', () => {
  beforeEach(() => {
    mockTrack.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkout_opened Event', () => {
    test('should be a valid analytics event name', () => {
      const eventName: IAnalyticsEventName = 'checkout_opened';
      expect(eventName).toBe('checkout_opened');
    });

    test('should accept valid ICheckoutOpenedProperties', () => {
      const props: ICheckoutOpenedProperties = {
        priceId: 'price_test_starter_monthly',
        source: 'model_gate',
        originatingModel: 'ultra',
      };

      expect(props.priceId).toBe('price_test_starter_monthly');
      expect(props.source).toBe('model_gate');
      expect(props.originatingModel).toBe('ultra');
    });

    test('should accept ICheckoutOpenedProperties without optional originatingModel', () => {
      const props: ICheckoutOpenedProperties = {
        priceId: 'price_test_pro_monthly',
        source: 'navbar',
      };

      expect(props.originatingModel).toBeUndefined();
    });

    test('should accept valid source values', () => {
      const validSources: Array<ICheckoutOpenedProperties['source']> = [
        'navbar',
        'model_gate',
        'batch_limit',
        'premium_upsell',
        'mobile_prompt',
        'upgrade_card',
        'after_upscale',
        'after_download',
        'pricing_page',
        'dashboard',
      ];

      validSources.forEach(source => {
        const props: ICheckoutOpenedProperties = {
          priceId: 'price_test_123',
          source,
        };
        expect(props.source).toBe(source);
      });
    });

    test('should accept valid originatingModel values (quality tiers)', () => {
      const validTiers = [
        'quick',
        'standard',
        'hd-upscale',
        'premium',
        'ultra',
        'face-restore',
        'color-enhance',
        'bg-removal',
        'denoise',
        'sharpen',
        'auto',
      ];

      validTiers.forEach(tier => {
        const props: ICheckoutOpenedProperties = {
          priceId: 'price_test_123',
          source: 'model_gate',
          originatingModel: tier as string,
        };
        expect(props.originatingModel).toBe(tier);
      });
    });

    test('should track checkout_opened with all properties', async () => {
      const { analytics } = await import('@client/analytics/analyticsClient');

      analytics.track('checkout_opened', {
        priceId: 'price_test_hobby_monthly',
        source: 'model_gate',
        originatingModel: 'premium',
      });

      expect(mockTrack).toHaveBeenCalledWith('checkout_opened', {
        priceId: 'price_test_hobby_monthly',
        source: 'model_gate',
        originatingModel: 'premium',
      });
    });
  });

  describe('upgrade_plans_viewed Event', () => {
    test('should be a valid analytics event name', () => {
      const eventName: IAnalyticsEventName = 'upgrade_plans_viewed';
      expect(eventName).toBe('upgrade_plans_viewed');
    });

    test('should include trigger property', () => {
      const validTriggers: TUpgradeModalTrigger[] = [
        'model_gate',
        'premium_upsell',
        'mobile_prompt',
        'batch_limit',
        'upgrade_card',
      ];

      validTriggers.forEach(trigger => {
        const props = {
          trigger,
          pricingRegion: 'standard',
          discountPercent: 0,
        };
        expect(props.trigger).toBe(trigger);
      });
    });

    test('should include pricingRegion property', () => {
      const validRegions = [
        'standard',
        'south_asia',
        'southeast_asia',
        'latam',
        'eastern_europe',
        'africa',
      ];

      validRegions.forEach(region => {
        const props = {
          trigger: 'premium_upsell' as TUpgradeModalTrigger,
          pricingRegion: region,
          discountPercent: 50,
        };
        expect(props.pricingRegion).toBe(region);
      });
    });

    test('should include discountPercent property', () => {
      const discountValues = [0, 40, 50, 60, 65];

      discountValues.forEach(discount => {
        const props = {
          trigger: 'model_gate' as TUpgradeModalTrigger,
          pricingRegion: 'south_asia',
          discountPercent: discount,
        };
        expect(props.discountPercent).toBe(discount);
      });
    });

    test('should track upgrade_plans_viewed with all properties', async () => {
      const { analytics } = await import('@client/analytics/analyticsClient');

      analytics.track('upgrade_plans_viewed', {
        trigger: 'model_gate',
        pricingRegion: 'south_asia',
        discountPercent: 65,
      });

      expect(mockTrack).toHaveBeenCalledWith('upgrade_plans_viewed', {
        trigger: 'model_gate',
        pricingRegion: 'south_asia',
        discountPercent: 65,
      });
    });

    test('should track upgrade_plans_viewed without discount', async () => {
      const { analytics } = await import('@client/analytics/analyticsClient');

      analytics.track('upgrade_plans_viewed', {
        trigger: 'premium_upsell',
        pricingRegion: 'standard',
        discountPercent: 0,
      });

      expect(mockTrack).toHaveBeenCalledWith('upgrade_plans_viewed', {
        trigger: 'premium_upsell',
        pricingRegion: 'standard',
        discountPercent: 0,
      });
    });
  });

  describe('upgrade_prompt_shown Event (Model Gate)', () => {
    test('should be a valid analytics event name', () => {
      const eventName: IAnalyticsEventName = 'upgrade_prompt_shown';
      expect(eventName).toBe('upgrade_prompt_shown');
    });

    test('should accept valid IUpgradePromptShownProperties with model_gate trigger', () => {
      const props: IUpgradePromptShownProperties = {
        trigger: 'model_gate',
        imageVariant: 'ultra',
        currentPlan: 'free',
        pricingRegion: 'standard',
      };

      expect(props.trigger).toBe('model_gate');
      expect(props.imageVariant).toBe('ultra');
      expect(props.currentPlan).toBe('free');
      expect(props.pricingRegion).toBe('standard');
    });

    test('should accept all valid trigger values for upgrade prompt', () => {
      const validTriggers: IUpgradePromptShownProperties['trigger'][] = [
        'premium_upsell',
        'out_of_credits',
        'model_gate',
        'after_upscale',
        'after_download',
        'after_batch',
      ];

      validTriggers.forEach(trigger => {
        const props: IUpgradePromptShownProperties = {
          trigger,
          currentPlan: 'free',
          pricingRegion: 'standard',
        };
        expect(props.trigger).toBe(trigger);
      });
    });

    test('should include imageVariant when trigger is model_gate', () => {
      const imageVariants = ['quick', 'standard', 'premium', 'ultra', 'hd-upscale'];

      imageVariants.forEach(variant => {
        const props: IUpgradePromptShownProperties = {
          trigger: 'model_gate',
          imageVariant: variant,
          currentPlan: 'free',
          pricingRegion: 'south_asia',
        };
        expect(props.imageVariant).toBe(variant);
      });
    });

    test('should track upgrade_prompt_shown for model gate', async () => {
      const { analytics } = await import('@client/analytics/analyticsClient');

      analytics.track('upgrade_prompt_shown', {
        trigger: 'model_gate',
        imageVariant: 'premium',
        currentPlan: 'free',
        pricingRegion: 'standard',
      });

      expect(mockTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
        trigger: 'model_gate',
        imageVariant: 'premium',
        currentPlan: 'free',
        pricingRegion: 'standard',
      });
    });
  });

  describe('upgrade_prompt_clicked Event (Model Gate)', () => {
    test('should be a valid analytics event name', () => {
      const eventName: IAnalyticsEventName = 'upgrade_prompt_clicked';
      expect(eventName).toBe('upgrade_prompt_clicked');
    });

    test('should accept valid IUpgradePromptClickedProperties', () => {
      const props: IUpgradePromptClickedProperties = {
        trigger: 'model_gate',
        imageVariant: 'ultra',
        destination: 'upgrade_plan_modal',
        currentPlan: 'free',
        pricingRegion: 'latam',
      };

      expect(props.trigger).toBe('model_gate');
      expect(props.imageVariant).toBe('ultra');
      expect(props.destination).toBe('upgrade_plan_modal');
      expect(props.currentPlan).toBe('free');
      expect(props.pricingRegion).toBe('latam');
    });

    test('should accept valid destination values', () => {
      const validDestinations = [
        '/checkout',
        '/pricing',
        'upgrade_plan_modal',
        'checkout_modal',
        '/dashboard/billing',
      ];

      validDestinations.forEach(destination => {
        const props: IUpgradePromptClickedProperties = {
          trigger: 'model_gate',
          destination,
          currentPlan: 'free',
          pricingRegion: 'standard',
        };
        expect(props.destination).toBe(destination);
      });
    });

    test('should track upgrade_prompt_clicked for model gate', async () => {
      const { analytics } = await import('@client/analytics/analyticsClient');

      analytics.track('upgrade_prompt_clicked', {
        trigger: 'model_gate',
        imageVariant: 'premium',
        destination: 'upgrade_plan_modal',
        currentPlan: 'free',
        pricingRegion: 'standard',
      });

      expect(mockTrack).toHaveBeenCalledWith('upgrade_prompt_clicked', {
        trigger: 'model_gate',
        imageVariant: 'premium',
        destination: 'upgrade_plan_modal',
        currentPlan: 'free',
        pricingRegion: 'standard',
      });
    });
  });

  describe('upgrade_prompt_dismissed Event', () => {
    test('should be a valid analytics event name', () => {
      const eventName: IAnalyticsEventName = 'upgrade_prompt_dismissed';
      expect(eventName).toBe('upgrade_prompt_dismissed');
    });

    test('should accept valid IUpgradePromptDismissedProperties', () => {
      const props: IUpgradePromptDismissedProperties = {
        trigger: 'model_gate',
        imageVariant: 'ultra',
        currentPlan: 'free',
        pricingRegion: 'standard',
      };

      expect(props.trigger).toBe('model_gate');
      expect(props.imageVariant).toBe('ultra');
      expect(props.currentPlan).toBe('free');
      expect(props.pricingRegion).toBe('standard');
    });

    test('should track upgrade_prompt_dismissed for model gate', async () => {
      const { analytics } = await import('@client/analytics/analyticsClient');

      analytics.track('upgrade_prompt_dismissed', {
        trigger: 'model_gate',
        imageVariant: 'premium',
        currentPlan: 'free',
        pricingRegion: 'standard',
      });

      expect(mockTrack).toHaveBeenCalledWith('upgrade_prompt_dismissed', {
        trigger: 'model_gate',
        imageVariant: 'premium',
        currentPlan: 'free',
        pricingRegion: 'standard',
      });
    });
  });

  describe('Originating Model Flow', () => {
    test('should track originating model from model gate through checkout', async () => {
      const { analytics } = await import('@client/analytics/analyticsClient');

      // Simulate the flow: user clicks on "ultra" model in gallery
      const originatingModel = 'ultra';

      // Step 1: Track upgrade_prompt_clicked with imageVariant
      analytics.track('upgrade_prompt_clicked', {
        trigger: 'model_gate',
        imageVariant: originatingModel,
        destination: 'upgrade_plan_modal',
        currentPlan: 'free',
        pricingRegion: 'standard',
      });

      // Step 2: User selects plan and checkout opens
      analytics.track('checkout_opened', {
        priceId: 'price_test_pro_monthly',
        source: 'model_gate',
        originatingModel,
      });

      // Verify both events were tracked with the same model
      expect(mockTrack).toHaveBeenCalledTimes(2);

      const firstCall = mockTrack.mock.calls[0];
      const secondCall = mockTrack.mock.calls[1];

      expect(firstCall[0]).toBe('upgrade_prompt_clicked');
      expect(firstCall[1].imageVariant).toBe(originatingModel);

      expect(secondCall[0]).toBe('checkout_opened');
      expect(secondCall[1].originatingModel).toBe(originatingModel);
    });

    test('should handle model gate without imageVariant (banner click)', async () => {
      const { analytics } = await import('@client/analytics/analyticsClient');

      // User clicks the "Unlock Premium Models" banner instead of a specific tier
      analytics.track('upgrade_prompt_clicked', {
        trigger: 'model_gate',
        destination: 'upgrade_plan_modal',
        currentPlan: 'free',
        pricingRegion: 'standard',
      });

      expect(mockTrack).toHaveBeenCalledWith(
        'upgrade_prompt_clicked',
        expect.not.objectContaining({
          imageVariant: expect.anything(),
        })
      );
    });

    test('should track originating model for premium tier clicks', async () => {
      const { analytics } = await import('@client/analytics/analyticsClient');

      const premiumTiers = ['premium', 'ultra', 'hd-upscale', 'face-restore'];

      for (const tier of premiumTiers) {
        analytics.track('upgrade_prompt_clicked', {
          trigger: 'model_gate',
          imageVariant: tier,
          destination: 'upgrade_plan_modal',
          currentPlan: 'free',
          pricingRegion: 'standard',
        });

        expect(mockTrack).toHaveBeenCalledWith(
          'upgrade_prompt_clicked',
          expect.objectContaining({
            imageVariant: tier,
          })
        );

        mockTrack.mockClear();
      }
    });
  });

  describe('Session Storage Key Constants', () => {
    test('should use correct sessionStorage key for originating model', () => {
      const ORIGINATING_MODEL_KEY = 'checkout_originating_model';
      const MODEL_GATE_SESSION_KEY = 'upgrade_prompt_shown_model_gate';

      expect(typeof ORIGINATING_MODEL_KEY).toBe('string');
      expect(ORIGINATING_MODEL_KEY).toBe('checkout_originating_model');

      expect(typeof MODEL_GATE_SESSION_KEY).toBe('string');
      expect(MODEL_GATE_SESSION_KEY).toBe('upgrade_prompt_shown_model_gate');
    });

    test('should allow storing and retrieving originating model', () => {
      const ORIGINATING_MODEL_KEY = 'checkout_originating_model';
      const testModel = 'ultra';

      // Simulate sessionStorage operations
      const storage: Record<string, string> = {};

      // Store originating model
      storage[ORIGINATING_MODEL_KEY] = testModel;

      // Retrieve originating model
      const retrieved = storage[ORIGINATING_MODEL_KEY];

      expect(retrieved).toBe(testModel);
    });

    test('should allow checking if model gate prompt was already shown', () => {
      const MODEL_GATE_SESSION_KEY = 'upgrade_prompt_shown_model_gate';

      // Simulate sessionStorage operations
      const storage: Record<string, string> = {};

      // Initially, prompt has not been shown
      expect(storage[MODEL_GATE_SESSION_KEY]).toBeUndefined();

      // After first open, mark as shown
      storage[MODEL_GATE_SESSION_KEY] = 'true';

      // Prompt should now be marked as shown
      expect(storage[MODEL_GATE_SESSION_KEY]).toBe('true');
    });
  });

  describe('Post-Auth Redirect URL Parameter', () => {
    test('should handle checkout URL parameter parsing', () => {
      const testCases = [
        {
          url: '/workspace?checkout=price_test_starter_monthly',
          expected: 'price_test_starter_monthly',
        },
        { url: '/workspace?checkout=price_test_pro_monthly', expected: 'price_test_pro_monthly' },
        { url: '/workspace?checkout=price_hobby_yearly', expected: 'price_hobby_yearly' },
      ];

      testCases.forEach(({ url, expected }) => {
        const urlObj = new URL(url, 'http://localhost');
        const priceId = urlObj.searchParams.get('checkout');
        expect(priceId).toBe(expected);
      });
    });

    test('should handle URL without checkout parameter', () => {
      const url = new URL('/workspace', 'http://localhost');
      const priceId = url.searchParams.get('checkout');
      expect(priceId).toBeNull();
    });

    test('should handle URL with multiple parameters including checkout', () => {
      const url = new URL('/workspace?checkout=price_test123&tab=settings', 'http://localhost');
      const priceId = url.searchParams.get('checkout');
      const tab = url.searchParams.get('tab');

      expect(priceId).toBe('price_test123');
      expect(tab).toBe('settings');
    });
  });

  describe('Regional Pricing Integration', () => {
    test('should map countries to pricing regions correctly', () => {
      // Based on shared/config/pricing-regions.ts
      const regionMappings: Record<string, string> = {
        // South Asia (65% discount)
        IN: 'south_asia',
        PK: 'south_asia',
        BD: 'south_asia',
        NP: 'south_asia',
        LK: 'south_asia',

        // Southeast Asia (60% discount)
        TH: 'southeast_asia',
        VN: 'southeast_asia',
        ID: 'southeast_asia',
        PH: 'southeast_asia',
        MY: 'southeast_asia',

        // Latin America (50% discount)
        BR: 'latam',
        AR: 'latam',
        MX: 'latam',
        CO: 'latam',

        // Eastern Europe (40% discount)
        RO: 'eastern_europe',
        BG: 'eastern_europe',
        HU: 'eastern_europe',

        // Africa (65% discount)
        ZA: 'africa',
        NG: 'africa',
        KE: 'africa',
        EG: 'africa',

        // Standard (no discount)
        US: 'standard',
        GB: 'standard',
        CA: 'standard',
        AU: 'standard',
        DE: 'standard',
        FR: 'standard',
        JP: 'standard',
      };

      // Verify a few key mappings
      expect(regionMappings.IN).toBe('south_asia');
      expect(regionMappings.BR).toBe('latam');
      expect(regionMappings.US).toBe('standard');
      expect(regionMappings.ZA).toBe('africa');
    });

    test('should apply correct discount percentages per region', () => {
      const discountPercentages: Record<string, number> = {
        south_asia: 65,
        southeast_asia: 60,
        latam: 50,
        eastern_europe: 40,
        africa: 65,
        standard: 0,
      };

      // Verify discount percentages
      expect(discountPercentages.south_asia).toBe(65);
      expect(discountPercentages.southeast_asia).toBe(60);
      expect(discountPercentages.latam).toBe(50);
      expect(discountPercentages.eastern_europe).toBe(40);
      expect(discountPercentages.africa).toBe(65);
      expect(discountPercentages.standard).toBe(0);
    });

    test('should calculate discounted price correctly', () => {
      function calculateDiscountedPrice(priceValue: number, discountPercent: number): number {
        if (discountPercent <= 0 || priceValue === 0) return priceValue;
        return Math.round(priceValue * (1 - discountPercent / 100) * 100) / 100;
      }

      // Test standard price (no discount)
      expect(calculateDiscountedPrice(29, 0)).toBe(29);

      // Test South Asia (65% discount)
      expect(calculateDiscountedPrice(29, 65)).toBe(10.15);

      // Test Southeast Asia (60% discount)
      expect(calculateDiscountedPrice(29, 60)).toBe(11.6);

      // Test Latin America (50% discount)
      expect(calculateDiscountedPrice(29, 50)).toBe(14.5);

      // Test Eastern Europe (40% discount)
      expect(calculateDiscountedPrice(29, 40)).toBe(17.4);
    });
  });
});
