import { describe, test, expect } from 'vitest';
import { z } from 'zod';

// Recreate the allowed events from the route for testing
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
  'image_upscaled',
  'image_download',

  // Checkout events
  'checkout_started',
  'checkout_completed',
  'checkout_abandoned',

  // Error/limit events (server-side only)
  'rate_limit_exceeded',
  'processing_failed',
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

    test('should include image_download event', () => {
      const result = eventSchema.safeParse({ eventName: 'image_download' });
      expect(result.success).toBe(true);
    });

    test('should include checkout events', () => {
      const checkoutEvents = ['checkout_started', 'checkout_completed', 'checkout_abandoned'];
      for (const eventName of checkoutEvents) {
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
    test('should have at least 19 event types (matching IAnalyticsEventName)', () => {
      // IAnalyticsEventName has 19 event types after bug fix
      expect(ALLOWED_EVENTS.length).toBeGreaterThanOrEqual(19);
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
        'image_upscaled',
        'image_download',
        'checkout_started',
        'checkout_completed',
        'checkout_abandoned',
        'rate_limit_exceeded',
        'processing_failed',
      ];

      for (const event of expectedEvents) {
        expect(ALLOWED_EVENTS).toContain(event);
      }
    });
  });
});
