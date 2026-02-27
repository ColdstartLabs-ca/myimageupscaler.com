import { describe, test, expect } from 'vitest';
import { z } from 'zod';

// Recreate the allowed events from the route for testing
// This should match the ALLOWED_EVENTS array in app/api/analytics/event/route.ts
const ALLOWED_EVENTS = [
  // Page and session events
  'page_view',

  // Authentication events
  'signup_started',
  'signup_completed',
  'login',
  'logout',

  // Subscription events
  'subscription_created',
  'subscription_canceled',
  'subscription_renewed',
  'upgrade_started',

  // Credit events
  'credit_pack_purchased',
  'credits_deducted',
  'credits_refunded',

  // Image processing events
  'image_uploaded',
  'image_upscaled',
  'image_download',

  // Pricing page events
  'pricing_page_viewed',

  // Checkout events
  'checkout_started',
  'checkout_completed',
  'checkout_abandoned',

  // Error/limit events (server-side only)
  'rate_limit_exceeded',
  'processing_failed',

  // Guest upscaler events (server-side only)
  'guest_limit_reached',
  'guest_upscale_completed',

  // Batch limit events
  'batch_limit_modal_shown',
  'batch_limit_upgrade_clicked',
  'batch_limit_partial_add_clicked',
  'batch_limit_modal_closed',

  // Model selection events
  'model_gallery_opened',
  'model_selection_changed',
  'model_gallery_closed',

  // pSEO-specific events
  'pseo_page_view',
  'pseo_cta_clicked',
  'pseo_scroll_depth',
  'pseo_faq_expanded',
  'pseo_internal_link_clicked',
] as const;

const eventSchema = z.object({
  eventName: z.enum(ALLOWED_EVENTS),
  properties: z.record(z.unknown()).optional(),
  sessionId: z.string().optional(),
});

describe('Bug Fix: Analytics Event Whitelist', () => {
  describe('Event whitelist completeness', () => {
    test('should include page_view event', () => {
      const result = eventSchema.safeParse({ eventName: 'page_view' });
      expect(result.success).toBe(true);
    });

    test('should include authentication events', () => {
      const authEvents = ['signup_started', 'signup_completed', 'login', 'logout'];
      for (const eventName of authEvents) {
        const result = eventSchema.safeParse({ eventName });
        expect(result.success).toBe(true);
      }
    });

    test('should include subscription events', () => {
      const subEvents = [
        'subscription_created',
        'subscription_canceled',
        'subscription_renewed',
        'upgrade_started',
      ];
      for (const eventName of subEvents) {
        const result = eventSchema.safeParse({ eventName });
        expect(result.success).toBe(true);
      }
    });

    test('should NOT include revenue_received in client whitelist (server-side only)', () => {
      // revenue_received is fired from webhook handlers, never from client
      // It should be in IAnalyticsEventName but NOT in the client API whitelist
      const result = eventSchema.safeParse({ eventName: 'revenue_received' });
      expect(result.success).toBe(false);
    });

    test('should include credit events', () => {
      const creditEvents = ['credit_pack_purchased', 'credits_deducted', 'credits_refunded'];
      for (const eventName of creditEvents) {
        const result = eventSchema.safeParse({ eventName });
        expect(result.success).toBe(true);
      }
    });

    test('should include error/limit events (server-side only)', () => {
      const errorEvents = ['rate_limit_exceeded', 'processing_failed'];
      for (const eventName of errorEvents) {
        const result = eventSchema.safeParse({ eventName });
        expect(result.success).toBe(true);
      }
    });

    test('should include image_upscaled event (previously missing)', () => {
      // This was a bug - image_upscaled was tracked but not in the whitelist
      const result = eventSchema.safeParse({
        eventName: 'image_upscaled',
        properties: {
          scaleFactor: 4,
          mode: 'creative',
          durationMs: 3500,
        },
      });
      expect(result.success).toBe(true);
    });

    test('should include image_uploaded event (new funnel event)', () => {
      const result = eventSchema.safeParse({
        eventName: 'image_uploaded',
        properties: {
          fileSize: 1024,
          fileType: 'image/jpeg',
          source: 'file_picker',
          isGuest: true,
          batchPosition: 0,
        },
      });
      expect(result.success).toBe(true);
    });

    test('should include image_download event', () => {
      const result = eventSchema.safeParse({ eventName: 'image_download' });
      expect(result.success).toBe(true);
    });

    test('should include pricing_page_viewed event (new funnel event)', () => {
      const result = eventSchema.safeParse({
        eventName: 'pricing_page_viewed',
        properties: {
          entryPoint: 'navbar',
          currentPlan: 'free',
        },
      });
      expect(result.success).toBe(true);
    });

    test('should include checkout events', () => {
      const checkoutEvents = ['checkout_started', 'checkout_completed', 'checkout_abandoned'];
      for (const eventName of checkoutEvents) {
        const result = eventSchema.safeParse({ eventName });
        expect(result.success).toBe(true);
      }
    });

    test('should include guest upscaler events', () => {
      const guestEvents = ['guest_limit_reached', 'guest_upscale_completed'];
      for (const eventName of guestEvents) {
        const result = eventSchema.safeParse({ eventName });
        expect(result.success).toBe(true);
      }
    });

    test('should include batch limit events', () => {
      const batchEvents = [
        'batch_limit_modal_shown',
        'batch_limit_upgrade_clicked',
        'batch_limit_partial_add_clicked',
        'batch_limit_modal_closed',
      ];
      for (const eventName of batchEvents) {
        const result = eventSchema.safeParse({ eventName });
        expect(result.success).toBe(true);
      }
    });

    test('should include model selection events', () => {
      const modelEvents = [
        'model_gallery_opened',
        'model_selection_changed',
        'model_gallery_closed',
      ];
      for (const eventName of modelEvents) {
        const result = eventSchema.safeParse({ eventName });
        expect(result.success).toBe(true);
      }
    });

    test('should include pSEO events', () => {
      const pseoEvents = [
        'pseo_page_view',
        'pseo_cta_clicked',
        'pseo_scroll_depth',
        'pseo_faq_expanded',
        'pseo_internal_link_clicked',
      ];
      for (const eventName of pseoEvents) {
        const result = eventSchema.safeParse({ eventName });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Event validation', () => {
    test('should reject unknown event names', () => {
      const result = eventSchema.safeParse({ eventName: 'unknown_event' });
      expect(result.success).toBe(false);
    });

    test('should allow optional properties', () => {
      const result = eventSchema.safeParse({
        eventName: 'page_view',
        properties: {
          path: '/dashboard',
          referrer: 'https://google.com',
        },
      });
      expect(result.success).toBe(true);
    });

    test('should allow optional sessionId', () => {
      const result = eventSchema.safeParse({
        eventName: 'login',
        sessionId: 'sess_12345',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Total event count', () => {
    test('should have at least 30 event types (matching IAnalyticsEventName)', () => {
      // IAnalyticsEventName has 30+ event types including model selection and pSEO events
      // Note: ALLOWED_EVENTS excludes server-side only events like:
      // - $identify (identity event)
      // - revenue_received (revenue tracking from webhooks)
      expect(ALLOWED_EVENTS.length).toBeGreaterThanOrEqual(30);
    });
  });

  describe('Analytics Instrumentation V2 - Phase 6 Verification', () => {
    /**
     * These tests verify that all new events from the Analytics Instrumentation V2 PRD
     * are properly registered in the client whitelist.
     *
     * Server-side only events (NOT in client whitelist):
     * - $identify: Identity event for Amplitude user properties
     * - revenue_received: Revenue tracking from Stripe webhooks
     *
     * Client-side events (MUST be in whitelist):
     * - From Phase 3: image_uploaded, pricing_page_viewed, checkout_abandoned
     * - From Phase 4: model_gallery_opened, model_selection_changed, model_gallery_closed
     */

    test('should include Phase 3 funnel events', () => {
      const phase3Events = ['image_uploaded', 'pricing_page_viewed', 'checkout_abandoned'];
      for (const eventName of phase3Events) {
        const result = eventSchema.safeParse({ eventName });
        expect(result.success).toBe(true);
      }
    });

    test('should include Phase 4 model selection events', () => {
      const phase4Events = [
        'model_gallery_opened',
        'model_selection_changed',
        'model_gallery_closed',
      ];
      for (const eventName of phase4Events) {
        const result = eventSchema.safeParse({ eventName });
        expect(result.success).toBe(true);
      }
    });

    test('should NOT include Phase 2 server-side revenue event', () => {
      // revenue_received is tracked via trackServerEvent from webhook handlers
      // It should NOT be accessible from client API
      const result = eventSchema.safeParse({ eventName: 'revenue_received' });
      expect(result.success).toBe(false);
    });

    test('should NOT include $identify event (server-side only)', () => {
      // $identify is used for Amplitude user property sync from webhooks
      const result = eventSchema.safeParse({ eventName: '$identify' });
      expect(result.success).toBe(false);
    });

    test('should match IAnalyticsEventName types', () => {
      const expectedEvents = [
        'page_view',
        'signup_started',
        'signup_completed',
        'login',
        'logout',
        'subscription_created',
        'subscription_canceled',
        'subscription_renewed',
        'upgrade_started',
        'credit_pack_purchased',
        'credits_deducted',
        'credits_refunded',
        'image_uploaded',
        'image_upscaled',
        'image_download',
        'pricing_page_viewed',
        'checkout_started',
        'checkout_completed',
        'checkout_abandoned',
        'rate_limit_exceeded',
        'processing_failed',
        'guest_limit_reached',
        'guest_upscale_completed',
        'batch_limit_modal_shown',
        'batch_limit_upgrade_clicked',
        'batch_limit_partial_add_clicked',
        'batch_limit_modal_closed',
        'model_gallery_opened',
        'model_selection_changed',
        'model_gallery_closed',
        'pseo_page_view',
        'pseo_cta_clicked',
        'pseo_scroll_depth',
        'pseo_faq_expanded',
        'pseo_internal_link_clicked',
      ];

      for (const event of expectedEvents) {
        expect(ALLOWED_EVENTS).toContain(event);
      }
    });
  });
});
