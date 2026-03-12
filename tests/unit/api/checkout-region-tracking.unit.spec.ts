/**
 * Checkout Region Tracking Tests
 *
 * Tests that pricingRegion is correctly included in checkout events:
 * - checkout_started (checkout/route.ts)
 * - checkout_completed (webhooks/stripe/handlers/payment.handler.ts)
 * - checkout_abandoned (pricing/PricingPageClient.tsx - client-side)
 *
 * PRD: docs/PRDs/geo-pricing-tracking-fix.md (Phase 6)
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaymentHandler } from '../../../app/api/webhooks/stripe/handlers/payment.handler';
import Stripe from 'stripe';

// Mock dependencies
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
    rpc: vi.fn(() =>
      Promise.resolve({
        data: null,
        error: null,
      })
    ),
  },
}));

vi.mock('@server/stripe', () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(() =>
        Promise.resolve({
          id: 'sub_test_123',
          status: 'active',
          items: {
            data: [
              {
                price: {
                  id: 'price_test_123',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
          metadata: { plan_key: 'hobby' },
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        })
      ),
    },
    prices: {
      retrieve: vi.fn(() =>
        Promise.resolve({
          id: 'price_test_123',
          type: 'recurring',
          product: 'prod_test',
          unit_amount: 900,
        })
      ),
    },
  },
}));

vi.mock('@shared/config/stripe', () => ({
  assertKnownPriceId: vi.fn(() => ({
    type: 'plan',
    key: 'hobby',
    name: 'Hobby',
    stripePriceId: 'price_test_123',
    priceInCents: 900,
    currency: 'usd',
    credits: 200,
    maxRollover: 1200,
    creditsPerMonth: 200,
    creditsPerCycle: 200,
  })),
  resolvePlanOrPack: vi.fn(() => ({
    type: 'plan',
    key: 'hobby',
    name: 'Hobby',
    stripePriceId: 'price_test_123',
    priceInCents: 900,
    currency: 'usd',
    creditsPerCycle: 200,
    maxRollover: 1200,
  })),
  getPlanForPriceId: vi.fn(() => ({
    key: 'hobby',
    name: 'Hobby',
    stripePriceId: 'price_test_123',
    priceInCents: 900,
    currency: 'usd',
    creditsPerMonth: 200,
    creditsPerCycle: 200,
    maxRollover: 1200,
  })),
}));

vi.mock('@shared/config/pricing-regions', () => ({
  getBasePriceIdByPlanKey: vi.fn(() => 'price_test_123'),
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: vi.fn(() => Promise.resolve(true)),
  trackRevenue: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@server/services/email.service', () => ({
  getEmailService: vi.fn(() => ({
    send: vi.fn(() => Promise.resolve()),
  })),
}));

import { trackServerEvent } from '@server/analytics';

// Helper to create a mock checkout session
function createMockSession(
  overrides: Partial<Stripe.Checkout.Session> = {}
): Stripe.Checkout.Session {
  return {
    id: 'cs_test_123',
    object: 'checkout.session',
    mode: 'subscription',
    metadata: {
      user_id: 'user_test_123',
      pricing_region: 'south_asia',
      discount_percent: '65',
      plan_key: 'hobby',
    },
    amount_total: 315, // $3.15 (65% off $9)
    currency: 'usd',
    customer_email: 'test@example.com',
    customer_details: {
      email: 'test@example.com',
      name: 'Test User',
    },
    payment_method_types: ['card'],
    subscription: 'sub_test_123',
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

describe('Checkout Region Tracking', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  describe('checkout_completed event (PaymentHandler.handleCheckoutSessionCompleted)', () => {
    test('includes pricingRegion from session metadata', async () => {
      const session = createMockSession({
        metadata: {
          user_id: 'user_test_123',
          pricing_region: 'south_asia',
          discount_percent: '65',
          plan_key: 'hobby',
        },
      });

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(trackServerEvent).toHaveBeenCalledWith(
        'checkout_completed',
        expect.objectContaining({
          pricingRegion: 'south_asia',
          discountPercent: 65,
        }),
        expect.any(Object)
      );
    });

    test('defaults to "standard" region when metadata is missing', async () => {
      const session = createMockSession({
        metadata: {
          user_id: 'user_test_123',
          plan_key: 'hobby',
          // No pricing_region or discount_percent
        },
      });

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(trackServerEvent).toHaveBeenCalledWith(
        'checkout_completed',
        expect.objectContaining({
          pricingRegion: 'standard',
          discountPercent: 0,
        }),
        expect.any(Object)
      );
    });

    test('tracks latam region with 50% discount', async () => {
      const session = createMockSession({
        metadata: {
          user_id: 'user_test_123',
          pricing_region: 'latam',
          discount_percent: '50',
          plan_key: 'pro',
        },
        amount_total: 450, // $4.50 (50% off $9)
      });

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(trackServerEvent).toHaveBeenCalledWith(
        'checkout_completed',
        expect.objectContaining({
          pricingRegion: 'latam',
          discountPercent: 50,
        }),
        expect.any(Object)
      );
    });

    test('tracks southeast_asia region with 60% discount', async () => {
      const session = createMockSession({
        metadata: {
          user_id: 'user_test_123',
          pricing_region: 'southeast_asia',
          discount_percent: '60',
          plan_key: 'hobby',
        },
        amount_total: 360, // $3.60 (60% off $9)
      });

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(trackServerEvent).toHaveBeenCalledWith(
        'checkout_completed',
        expect.objectContaining({
          pricingRegion: 'southeast_asia',
          discountPercent: 60,
        }),
        expect.any(Object)
      );
    });

    test('tracks eastern_europe region with 40% discount', async () => {
      const session = createMockSession({
        metadata: {
          user_id: 'user_test_123',
          pricing_region: 'eastern_europe',
          discount_percent: '40',
          plan_key: 'hobby',
        },
        amount_total: 540, // $5.40 (40% off $9)
      });

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(trackServerEvent).toHaveBeenCalledWith(
        'checkout_completed',
        expect.objectContaining({
          pricingRegion: 'eastern_europe',
          discountPercent: 40,
        }),
        expect.any(Object)
      );
    });

    test('tracks africa region with 65% discount', async () => {
      const session = createMockSession({
        metadata: {
          user_id: 'user_test_123',
          pricing_region: 'africa',
          discount_percent: '65',
          plan_key: 'hobby',
        },
        amount_total: 315, // $3.15 (65% off $9)
      });

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(trackServerEvent).toHaveBeenCalledWith(
        'checkout_completed',
        expect.objectContaining({
          pricingRegion: 'africa',
          discountPercent: 65,
        }),
        expect.any(Object)
      );
    });

    test('includes pricingRegion for credit pack purchases', async () => {
      const session = createMockSession({
        mode: 'payment',
        metadata: {
          user_id: 'user_test_123',
          pricing_region: 'south_asia',
          discount_percent: '65',
          pack_key: 'credits_100',
          credits: '100',
        },
        subscription: null,
        payment_intent: 'pi_test_123',
      });

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(trackServerEvent).toHaveBeenCalledWith(
        'checkout_completed',
        expect.objectContaining({
          pricingRegion: 'south_asia',
          discountPercent: 65,
          purchaseType: 'credit_pack',
        }),
        expect.any(Object)
      );
    });
  });
});
