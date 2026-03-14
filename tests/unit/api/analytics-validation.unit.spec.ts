/**
 * Analytics API Validation Tests
 *
 * Tests that pricingRegion is validated on pricing-related events.
 * PRD: docs/PRDs/geo-pricing-tracking-fix.md (Phase 4)
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../../app/api/analytics/event/route';

// Create mock logger instance
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  flush: vi.fn(() => Promise.resolve()),
};

// Mock dependencies
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    },
  },
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    ENV: 'test',
    AMPLITUDE_API_KEY: 'test_key',
  },
  clientEnv: {
    BASE_URL: 'http://localhost:3000',
  },
}));

vi.mock('@server/monitoring/logger', () => ({
  createLogger: vi.fn(() => mockLogger),
}));

// Helper to create mock request
function createMockRequest(body: Record<string, unknown>): NextRequest {
  return {
    json: () => Promise.resolve(body),
    headers: {
      get: vi.fn((key: string) => {
        if (key === 'content-length') return '100';
        if (key === 'user-agent') return 'test-agent';
        return null;
      }),
    },
  } as unknown as NextRequest;
}

describe('Analytics API - Pricing Region Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pricing events requiring region', () => {
    const pricingEvents = [
      'pricing_page_viewed',
      'upgrade_prompt_shown',
      'upgrade_prompt_clicked',
      'upgrade_prompt_dismissed',
      'checkout_started',
      'checkout_completed',
      'checkout_abandoned',
    ];

    test.each(pricingEvents)('accepts %s event with pricingRegion', async eventName => {
      const request = createMockRequest({
        eventName,
        properties: {
          pricingRegion: 'south_asia',
          discountPercent: 65,
        },
        sessionId: 'test-session',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test.each(pricingEvents)(
      'accepts %s event without pricingRegion (sets default)',
      async eventName => {
        const request = createMockRequest({
          eventName,
          properties: {
            // No pricingRegion
            discountPercent: 0,
          },
          sessionId: 'test-session',
        });

        const response = await POST(request);
        const data = await response.json();

        // Event should still be accepted
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);

        // Warning should be logged
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('pricingRegion missing'),
          expect.objectContaining({
            eventName,
          })
        );
      }
    );

    test.each(pricingEvents)(
      'logs warning when pricingRegion is missing for %s',
      async eventName => {
        const request = createMockRequest({
          eventName,
          properties: {},
          sessionId: 'test-session',
        });

        await POST(request);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('pricingRegion missing on pricing event'),
          expect.objectContaining({
            eventName,
            sessionId: 'test-session',
          })
        );
      }
    );
  });

  describe('non-pricing events', () => {
    const nonPricingEvents = ['page_view', 'image_uploaded', 'signup_started', 'login'];

    test.each(nonPricingEvents)(
      'does not warn about pricingRegion for %s event',
      async eventName => {
        const request = createMockRequest({
          eventName,
          properties: {}, // No pricingRegion
          sessionId: 'test-session',
        });

        const response = await POST(request);

        expect(response.status).toBe(200);
        // Should NOT warn about missing pricingRegion
        expect(mockLogger.warn).not.toHaveBeenCalledWith(
          expect.stringContaining('pricingRegion missing'),
          expect.any(Object)
        );
      }
    );
  });

  describe('valid pricing regions', () => {
    const validRegions = [
      'standard',
      'south_asia',
      'southeast_asia',
      'latam',
      'eastern_europe',
      'africa',
    ];

    test.each(validRegions)('accepts %s as valid pricingRegion', async region => {
      const request = createMockRequest({
        eventName: 'pricing_page_viewed',
        properties: {
          pricingRegion: region,
        },
        sessionId: 'test-session',
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // Should NOT warn for valid regions
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('pricingRegion missing'),
        expect.any(Object)
      );
    });
  });
});
