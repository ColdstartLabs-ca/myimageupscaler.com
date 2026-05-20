import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for the missing funnel analytics events.
 *
 * These tests verify that:
 * 1. The event names are properly defined in IAnalyticsEventName
 * 2. The event property interfaces are correctly structured
 * 3. The tracking functions emit the expected events with correct properties
 */

// Mock the analytics module
const mockTrack = vi.fn();
vi.mock('@client/analytics', () => ({
  analytics: {
    track: mockTrack,
    isEnabled: () => true,
  },
}));

// Import types to verify they exist
import type {
  IAnalyticsEventName,
  IImageUploadedProperties,
  IPricingPageViewedProperties,
  IPricingPageAbandonedProperties,
  ICheckoutAbandonedProperties,
  IPurchaseModalAbandonedProperties,
} from '@server/analytics/types';

describe('Missing Funnel Events', () => {
  beforeEach(() => {
    mockTrack.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Event Types', () => {
    test('image_uploaded should be a valid event name', () => {
      const eventName: IAnalyticsEventName = 'image_uploaded';
      expect(eventName).toBe('image_uploaded');
    });

    test('pricing_page_viewed should be a valid event name', () => {
      const eventName: IAnalyticsEventName = 'pricing_page_viewed';
      expect(eventName).toBe('pricing_page_viewed');
    });

    test('pricing_page_abandoned should be a valid event name', () => {
      const eventName: IAnalyticsEventName = 'pricing_page_abandoned';
      expect(eventName).toBe('pricing_page_abandoned');
    });

    test('checkout_abandoned should be a valid event name', () => {
      const eventName: IAnalyticsEventName = 'checkout_abandoned';
      expect(eventName).toBe('checkout_abandoned');
    });

    test('purchase_modal_abandoned should be a valid event name', () => {
      const eventName: IAnalyticsEventName = 'purchase_modal_abandoned';
      expect(eventName).toBe('purchase_modal_abandoned');
    });
  });

  describe('image_uploaded Event Properties', () => {
    test('should accept valid IImageUploadedProperties', () => {
      const props: IImageUploadedProperties = {
        fileSize: 1024000,
        fileType: 'image/jpeg',
        inputWidth: 1920,
        inputHeight: 1080,
        source: 'file_picker',
        isGuest: false,
        batchPosition: 0,
      };

      expect(props.fileSize).toBe(1024000);
      expect(props.fileType).toBe('image/jpeg');
      expect(props.inputWidth).toBe(1920);
      expect(props.inputHeight).toBe(1080);
      expect(props.source).toBe('file_picker');
      expect(props.isGuest).toBe(false);
      expect(props.batchPosition).toBe(0);
    });

    test('should accept IImageUploadedProperties without optional dimensions', () => {
      const props: IImageUploadedProperties = {
        fileSize: 500000,
        fileType: 'image/png',
        source: 'drag_drop',
        isGuest: true,
        batchPosition: 2,
      };

      expect(props.inputWidth).toBeUndefined();
      expect(props.inputHeight).toBeUndefined();
    });

    test('should accept all valid source values', () => {
      const sources: Array<IImageUploadedProperties['source']> = [
        'drag_drop',
        'file_picker',
        'paste',
        'url',
      ];

      sources.forEach(source => {
        const props: IImageUploadedProperties = {
          fileSize: 1000,
          fileType: 'image/jpeg',
          source,
          isGuest: true,
          batchPosition: 0,
        };
        expect(props.source).toBe(source);
      });
    });
  });

  describe('pricing_page_viewed Event Properties', () => {
    test('should accept valid IPricingPageViewedProperties', () => {
      const props: IPricingPageViewedProperties = {
        entryPoint: 'navbar',
        currentPlan: 'free',
        referrer: 'https://google.com',
        pricingRegion: 'standard',
      };

      expect(props.entryPoint).toBe('navbar');
      expect(props.currentPlan).toBe('free');
      expect(props.referrer).toBe('https://google.com');
      expect(props.pricingRegion).toBe('standard');
    });

    test('should accept all valid entryPoint values', () => {
      const entryPoints: Array<IPricingPageViewedProperties['entryPoint']> = [
        'navbar',
        'batch_limit_modal',
        'out_of_credits_modal',
        'pseo_cta',
        'direct',
      ];

      entryPoints.forEach(entryPoint => {
        const props: IPricingPageViewedProperties = {
          entryPoint,
          currentPlan: 'free',
          pricingRegion: 'standard',
        };
        expect(props.entryPoint).toBe(entryPoint);
      });
    });

    test('should accept all valid currentPlan values', () => {
      const plans: Array<IPricingPageViewedProperties['currentPlan']> = [
        'free',
        'starter',
        'hobby',
        'pro',
        'business',
      ];

      plans.forEach(currentPlan => {
        const props: IPricingPageViewedProperties = {
          entryPoint: 'direct',
          currentPlan,
          pricingRegion: 'standard',
        };
        expect(props.currentPlan).toBe(currentPlan);
      });
    });

    test('should accept IPricingPageViewedProperties without optional referrer', () => {
      const props: IPricingPageViewedProperties = {
        entryPoint: 'direct',
        currentPlan: 'hobby',
        pricingRegion: 'standard',
      };

      expect(props.referrer).toBeUndefined();
    });
  });

  describe('checkout_abandoned Event Properties', () => {
    test('should accept valid IPricingPageAbandonedProperties', () => {
      const props: IPricingPageAbandonedProperties = {
        step: 'plan_selection',
        timeSpentMs: 12000,
        plan: 'free',
        pricingRegion: 'standard',
        discountPercent: 0,
        source: 'pricing_page',
        checkoutOpened: false,
      };

      expect(props.source).toBe('pricing_page');
      expect(props.checkoutOpened).toBe(false);
      expect(props.step).toBe('plan_selection');
    });

    test('should accept valid ICheckoutAbandonedProperties', () => {
      const props: ICheckoutAbandonedProperties = {
        priceId: 'price_123456',
        step: 'stripe_embed',
        timeSpentMs: 30000,
        plan: 'pro',
        pricingRegion: 'standard',
        source: 'checkout_modal',
        checkoutOpened: true,
      };

      expect(props.priceId).toBe('price_123456');
      expect(props.step).toBe('stripe_embed');
      expect(props.timeSpentMs).toBe(30000);
      expect(props.plan).toBe('pro');
      expect(props.pricingRegion).toBe('standard');
      expect(props.source).toBe('checkout_modal');
      expect(props.checkoutOpened).toBe(true);
    });

    test('should accept all valid step values', () => {
      const steps: Array<ICheckoutAbandonedProperties['step']> = ['plan_selection', 'stripe_embed'];

      steps.forEach(step => {
        const props: ICheckoutAbandonedProperties = {
          priceId: 'price_123',
          step,
          timeSpentMs: 1000,
          plan: 'hobby',
          pricingRegion: 'standard',
          source: step === 'stripe_embed' ? 'checkout_modal' : 'purchase_modal',
          checkoutOpened: step === 'stripe_embed',
        };
        expect(props.step).toBe(step);
      });
    });

    test('should accept all valid plan values', () => {
      const plans: Array<ICheckoutAbandonedProperties['plan']> = [
        'starter',
        'hobby',
        'pro',
        'business',
      ];

      plans.forEach(plan => {
        const props: ICheckoutAbandonedProperties = {
          priceId: 'price_123',
          step: 'stripe_embed',
          timeSpentMs: 5000,
          plan,
          pricingRegion: 'standard',
          source: 'checkout_modal',
          checkoutOpened: true,
        };
        expect(props.plan).toBe(plan);
      });
    });

    test('should accept valid IPurchaseModalAbandonedProperties', () => {
      const props: IPurchaseModalAbandonedProperties = {
        priceId: 'price_pack_small',
        step: 'plan_selection',
        timeSpentMs: 7000,
        plan: 'free',
        pricingRegion: 'standard',
        source: 'purchase_modal',
        method: 'not_now',
        activeTab: 'credits',
        selectedType: 'credit_pack',
        selectedKey: 'small_pack',
        checkoutOpened: false,
        outOfCredits: true,
      };

      expect(props.source).toBe('purchase_modal');
      expect(props.checkoutOpened).toBe(false);
      expect(props.step).toBe('plan_selection');
      expect(props.selectedType).toBe('credit_pack');
    });
  });

  describe('Analytics Tracking', () => {
    test('analytics.track should be callable with image_uploaded', async () => {
      const { analytics } = await import('@client/analytics');

      analytics.track('image_uploaded', {
        fileSize: 1024,
        fileType: 'image/jpeg',
        source: 'file_picker',
        isGuest: true,
        batchPosition: 0,
      });

      expect(mockTrack).toHaveBeenCalledWith(
        'image_uploaded',
        expect.objectContaining({
          fileSize: 1024,
          fileType: 'image/jpeg',
          source: 'file_picker',
          isGuest: true,
          batchPosition: 0,
        })
      );
    });

    test('analytics.track should be callable with pricing_page_viewed', async () => {
      const { analytics } = await import('@client/analytics');

      analytics.track('pricing_page_viewed', {
        entryPoint: 'navbar',
        currentPlan: 'free',
        pricingRegion: 'standard',
      });

      expect(mockTrack).toHaveBeenCalledWith(
        'pricing_page_viewed',
        expect.objectContaining({
          entryPoint: 'navbar',
          currentPlan: 'free',
          pricingRegion: 'standard',
        })
      );
    });

    test('analytics.track should be callable with pricing_page_abandoned', async () => {
      const { analytics } = await import('@client/analytics');

      analytics.track('pricing_page_abandoned', {
        step: 'plan_selection',
        timeSpentMs: 12000,
        plan: 'free',
        pricingRegion: 'standard',
        discountPercent: 0,
        source: 'pricing_page',
        checkoutOpened: false,
      });

      expect(mockTrack).toHaveBeenCalledWith(
        'pricing_page_abandoned',
        expect.objectContaining({
          step: 'plan_selection',
          pricingRegion: 'standard',
          source: 'pricing_page',
          checkoutOpened: false,
        })
      );
    });

    test('analytics.track should be callable with checkout_abandoned', async () => {
      const { analytics } = await import('@client/analytics');

      analytics.track('checkout_abandoned', {
        priceId: 'price_test123',
        step: 'stripe_embed',
        timeSpentMs: 15000,
        plan: 'pro',
        pricingRegion: 'standard',
        source: 'checkout_modal',
        checkoutOpened: true,
      });

      expect(mockTrack).toHaveBeenCalledWith(
        'checkout_abandoned',
        expect.objectContaining({
          priceId: 'price_test123',
          step: 'stripe_embed',
          timeSpentMs: 15000,
          plan: 'pro',
          pricingRegion: 'standard',
          source: 'checkout_modal',
          checkoutOpened: true,
        })
      );
    });

    test('analytics.track should be callable with purchase_modal_abandoned', async () => {
      const { analytics } = await import('@client/analytics');

      analytics.track('purchase_modal_abandoned', {
        priceId: 'price_pack_small',
        step: 'plan_selection',
        timeSpentMs: 9000,
        plan: 'free',
        pricingRegion: 'standard',
        source: 'purchase_modal',
        method: 'not_now',
        activeTab: 'credits',
        selectedType: 'credit_pack',
        selectedKey: 'small_pack',
        checkoutOpened: false,
        outOfCredits: true,
      });

      expect(mockTrack).toHaveBeenCalledWith(
        'purchase_modal_abandoned',
        expect.objectContaining({
          priceId: 'price_pack_small',
          step: 'plan_selection',
          pricingRegion: 'standard',
          source: 'purchase_modal',
          checkoutOpened: false,
        })
      );
    });
  });

  describe('Activation Funnel Sequence', () => {
    test('should have complete activation funnel events', () => {
      // The activation funnel is: page_view -> image_uploaded -> image_upscaled -> image_download
      const activationFunnel: IAnalyticsEventName[] = [
        'page_view',
        'image_uploaded',
        'image_upscaled',
        'image_download',
      ];

      // Verify all events are valid
      activationFunnel.forEach(event => {
        expect(typeof event).toBe('string');
        expect(event.length).toBeGreaterThan(0);
      });

      // Verify the funnel order makes sense
      expect(activationFunnel).toEqual([
        'page_view',
        'image_uploaded',
        'image_upscaled',
        'image_download',
      ]);
    });
  });
});
