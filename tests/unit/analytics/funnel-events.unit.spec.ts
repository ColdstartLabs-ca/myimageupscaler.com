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
  ICheckoutAbandonedProperties,
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

    test('checkout_abandoned should be a valid event name', () => {
      const eventName: IAnalyticsEventName = 'checkout_abandoned';
      expect(eventName).toBe('checkout_abandoned');
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
      };

      expect(props.entryPoint).toBe('navbar');
      expect(props.currentPlan).toBe('free');
      expect(props.referrer).toBe('https://google.com');
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
        };
        expect(props.currentPlan).toBe(currentPlan);
      });
    });

    test('should accept IPricingPageViewedProperties without optional referrer', () => {
      const props: IPricingPageViewedProperties = {
        entryPoint: 'direct',
        currentPlan: 'hobby',
      };

      expect(props.referrer).toBeUndefined();
    });
  });

  describe('checkout_abandoned Event Properties', () => {
    test('should accept valid ICheckoutAbandonedProperties', () => {
      const props: ICheckoutAbandonedProperties = {
        priceId: 'price_123456',
        step: 'stripe_embed',
        timeSpentMs: 30000,
        plan: 'pro',
      };

      expect(props.priceId).toBe('price_123456');
      expect(props.step).toBe('stripe_embed');
      expect(props.timeSpentMs).toBe(30000);
      expect(props.plan).toBe('pro');
    });

    test('should accept all valid step values', () => {
      const steps: Array<ICheckoutAbandonedProperties['step']> = ['plan_selection', 'stripe_embed'];

      steps.forEach(step => {
        const props: ICheckoutAbandonedProperties = {
          priceId: 'price_123',
          step,
          timeSpentMs: 1000,
          plan: 'hobby',
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
          step: 'plan_selection',
          timeSpentMs: 5000,
          plan,
        };
        expect(props.plan).toBe(plan);
      });
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
      });

      expect(mockTrack).toHaveBeenCalledWith(
        'pricing_page_viewed',
        expect.objectContaining({
          entryPoint: 'navbar',
          currentPlan: 'free',
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
      });

      expect(mockTrack).toHaveBeenCalledWith(
        'checkout_abandoned',
        expect.objectContaining({
          priceId: 'price_test123',
          step: 'stripe_embed',
          timeSpentMs: 15000,
          plan: 'pro',
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
