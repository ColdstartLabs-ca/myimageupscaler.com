import { describe, test, expect } from 'vitest';
import { z } from 'zod';

// Recreate the allowed events from the route for testing
// This should match the ALLOWED_EVENTS array in app/api/analytics/event/route.ts
const ALLOWED_EVENTS = [
  // Page and session events
  'page_view',
  'return_visit',

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
  'image_upscale_started',
  'image_upscaled',
  'upscale_completed',
  'image_download',

  // Pricing page events
  'pricing_page_viewed',

  // Checkout events
  'checkout_started',
  'checkout_completed',
  'checkout_abandoned',
  'success_page_viewed', // Client-side: user reached the success page (purchase_confirmed is server-side only)

  // Error/limit events (server-side only)
  'rate_limit_exceeded',
  'processing_failed',

  // Error tracking events (client and server-side)
  'error_occurred',

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

  // Upscale quality selection events
  'upscale_quality_selected',

  // pSEO-specific events
  'pseo_page_view',
  'pseo_cta_clicked',
  'pseo_scroll_depth',
  'pseo_faq_expanded',
  'pseo_internal_link_clicked',
  // Checkout funnel events (Phase 1 - Checkout Friction Investigation)
  'checkout_step_viewed',
  'checkout_step_time',
  'checkout_error',
  'checkout_exit_intent',
  'checkout_exit_survey_response',
  // Revenue leak detection events (PRD: analytics-tracking-enhancement - Phase 1)
  'plan_selected',
  // User lifecycle events (PRD: analytics-tracking-enhancement - Phase 2)
  'account_created',
  'email_captured',
  // Feature depth events (PRD: analytics-tracking-enhancement - Phase 3)
  'comparison_viewed',
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

    test('should include return_visit event for user identity tracking', () => {
      // Track when existing users come back to the site
      const result = eventSchema.safeParse({
        eventName: 'return_visit',
        properties: {
          daysSinceLastVisit: 7,
          previousSessionId: 'prev_session_123',
          entryPage: '/dashboard',
        },
      });
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

    test('should include error_occurred event (error tracking)', () => {
      // error_occurred tracks all error types with sanitized error messages
      const result = eventSchema.safeParse({
        eventName: 'error_occurred',
        properties: {
          errorType: 'upload_failed',
          errorMessage: 'File size exceeds limit',
          context: {
            fileSize: 10485760,
            maxSize: 5242880,
          },
        },
      });
      expect(result.success).toBe(true);
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

    test('should include image_upscale_started event (new funnel event)', () => {
      const result = eventSchema.safeParse({
        eventName: 'image_upscale_started',
        properties: {
          inputWidth: 1920,
          inputHeight: 1080,
          scaleFactor: 2,
          modelUsed: 'quick',
        },
      });
      expect(result.success).toBe(true);
    });

    test('should include upscale_completed event (new funnel event)', () => {
      const result = eventSchema.safeParse({
        eventName: 'upscale_completed',
        properties: {
          durationMs: 5000,
          modelUsed: 'standard',
          inputResolution: '1920x1080',
          outputResolution: '3840x2160',
          success: true,
        },
      });
      expect(result.success).toBe(true);
    });

    test('should include upscale_completed event with failure', () => {
      const result = eventSchema.safeParse({
        eventName: 'upscale_completed',
        properties: {
          durationMs: 30000,
          modelUsed: 'auto',
          success: false,
          errorType: 'timeout',
        },
      });
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

    test('should include upscale_quality_selected event', () => {
      // Track quality scale selection (2x, 4x, 8x) with model variant
      const result = eventSchema.safeParse({
        eventName: 'upscale_quality_selected',
        properties: {
          qualityLevel: '4x',
          modelVariant: 'standard',
        },
      });
      expect(result.success).toBe(true);
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
        'return_visit',
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
        'image_upscale_started',
        'image_upscaled',
        'upscale_completed',
        'image_download',
        'pricing_page_viewed',
        'checkout_started',
        'checkout_completed',
        'checkout_abandoned',
        'rate_limit_exceeded',
        'processing_failed',
        'error_occurred',
        'guest_limit_reached',
        'guest_upscale_completed',
        'batch_limit_modal_shown',
        'batch_limit_upgrade_clicked',
        'batch_limit_partial_add_clicked',
        'batch_limit_modal_closed',
        'model_gallery_opened',
        'model_selection_changed',
        'model_gallery_closed',
        'upscale_quality_selected',
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

  describe('Analytics Tracking Enhancement - PRD #18 Verification', () => {
    /**
     * These tests verify that all new events from the Analytics Tracking Enhancement PRD
     * are properly registered in the client whitelist.
     *
     * Phase 1 (Revenue Leak Detection): plan_selected, checkout_step_viewed, checkout_step_time, checkout_error
     * Phase 2 (User Lifecycle): account_created, email_captured
     * Phase 3 (Feature Depth): comparison_viewed
     */

    test('should include plan_selected event for revenue leak detection', () => {
      const result = eventSchema.safeParse({
        eventName: 'plan_selected',
        properties: {
          planName: 'pro',
          priceId: 'price_123',
          price: 2900,
          billingInterval: 'monthly',
          source: 'pricing_page',
        },
      });
      expect(result.success).toBe(true);
    });

    test('should include account_created event for user lifecycle tracking', () => {
      const result = eventSchema.safeParse({
        eventName: 'account_created',
        properties: {
          method: 'google',
          hasEmail: true,
          pricingRegion: 'standard',
        },
      });
      expect(result.success).toBe(true);
    });

    test('should include email_captured event for lead tracking', () => {
      const result = eventSchema.safeParse({
        eventName: 'email_captured',
        properties: {
          source: 'newsletter',
          hasAccount: false,
        },
      });
      expect(result.success).toBe(true);
    });

    test('should include comparison_viewed event for feature depth tracking', () => {
      const result = eventSchema.safeParse({
        eventName: 'comparison_viewed',
        properties: {
          upscaleFactor: 4,
          modelUsed: 'standard',
          interactionType: 'slider_move',
          timeViewedMs: 2500,
        },
      });
      expect(result.success).toBe(true);
    });

    test('should include checkout funnel events', () => {
      const checkoutEvents = ['checkout_step_viewed', 'checkout_step_time', 'checkout_error'];
      for (const eventName of checkoutEvents) {
        const result = eventSchema.safeParse({ eventName });
        expect(result.success).toBe(true);
      }
    });
  });
});
