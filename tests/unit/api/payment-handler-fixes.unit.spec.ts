/**
 * Unit Tests: Payment Handler Fixes (MEDIUM-5, MEDIUM-14)
 *
 * Tests for payment handler fixes focusing on:
 * 1. MEDIUM-14: Verify credits from price config, not session metadata
 * 2. Proper error throwing for missing profiles in refund handlers
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaymentHandler } from '../../../app/api/webhooks/stripe/handlers/payment.handler';
import Stripe from 'stripe';

// Mock dependencies
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@server/stripe/config', () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: vi.fn(),
  trackRevenue: vi.fn(),
}));

vi.mock('@shared/config/stripe', () => ({
  assertKnownPriceId: vi.fn(),
  getPlanForPriceId: vi.fn(),
  resolvePlanOrPack: vi.fn(),
  getBasePriceIdByPlanKey: vi.fn(),
}));

vi.mock('@shared/config/pricing-regions', () => ({
  getBasePriceIdByPlanKey: vi.fn(),
}));

vi.mock('@server/services/email.service', () => ({
  getEmailService: vi.fn(() => ({
    send: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@server/services/engagement-discount.service', () => ({
  redeemDiscount: vi.fn(),
}));

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { stripe } from '@server/stripe/config';
import {
  resolvePlanOrPack,
} from '@shared/config/stripe';

// Cast mocks
const MockedSupabaseAdmin = supabaseAdmin as {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
};
const MockedResolvePlanOrPack = resolvePlanOrPack as ReturnType<typeof vi.fn>;

describe('PaymentHandler - MEDIUM-14: Verify credits from price config', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  const mockCustomerId = 'cus_test_123';
  const mockUserId = 'user_test_123';
  const mockSessionId = 'cs_test_123';

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };

    // Default mock for price resolution
    MockedResolvePlanOrPack.mockReturnValue({
      type: 'pack',
      key: 'standard_100',
      credits: 100,
    });

    MockedSupabaseAdmin.rpc.mockResolvedValue({
      data: null,
      error: null,
    } as never);
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  describe('MEDIUM-14: Credit pack price verification', () => {
    test('should verify credits from price config for credit pack purchase', async () => {
      // Arrange - Credit pack purchase
      const session = {
        id: mockSessionId,
        mode: 'payment' as const,
        customer: mockCustomerId as string | Stripe.Customer,
        payment_intent: 'pi_test_123' as string | Stripe.PaymentIntent,
        amount_total: 2000,
        currency: 'usd',
        payment_method_types: ['card'],
        metadata: {
          user_id: mockUserId,
          pack_key: 'standard_100',
          credits: '100', // Metadata value (should NOT be trusted)
        },
        line_items: {
          data: [
            {
              price: {
                id: 'price_pack_100',
              },
            },
          ],
        },
      } as Stripe.Checkout.Session;

      // Price config returns 100 credits (authoritative)
      MockedResolvePlanOrPack.mockReturnValue({
        type: 'pack',
        key: 'standard_100',
        credits: 100,
      });

      MockedSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: mockUserId },
              error: null,
            }),
          }),
        }),
      } as never);

      let capturedAmount: number | undefined;
      MockedSupabaseAdmin.rpc.mockImplementation((name: string, params: unknown) => {
        if (name === 'add_purchased_credits') {
          capturedAmount = (params as { amount: number }).amount;
        }
        return Promise.resolve({ data: null, error: null });
      });

      // Act
      await PaymentHandler.handleCheckoutSessionCompleted(session);

      // Assert - Used verified credits from price config (100), not metadata
      expect(capturedAmount).toBe(100);

      // Assert - Resolved from price config
      expect(MockedResolvePlanOrPack).toHaveBeenCalledWith('price_pack_100');

      // Assert - Logged verification
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('[CREDIT_PACK] Verified credits from price config: 100')
      );
    });

    test('should fall back to metadata when price ID not found in config', async () => {
      // Arrange - Credit pack with unknown price ID
      const session = {
        id: mockSessionId,
        mode: 'payment' as const,
        customer: mockCustomerId as string | Stripe.Customer,
        payment_intent: 'pi_test_123' as string | Stripe.PaymentIntent,
        amount_total: 2000,
        currency: 'usd',
        payment_method_types: ['card'],
        metadata: {
          user_id: mockUserId,
          pack_key: 'unknown_pack',
          credits: '200',
        },
        line_items: {
          data: [
            {
              price: {
                id: 'price_unknown',
              },
            },
          ],
        },
      } as Stripe.Checkout.Session;

      // Price not found in config
      MockedResolvePlanOrPack.mockReturnValue(null);

      MockedSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: mockUserId },
              error: null,
            }),
          }),
        }),
      } as never);

      let capturedAmount: number | undefined;
      MockedSupabaseAdmin.rpc.mockImplementation((name: string, params: unknown) => {
        if (name === 'add_purchased_credits') {
          capturedAmount = (params as { amount: number }).amount;
        }
        return Promise.resolve({ data: null, error: null });
      });

      // Act
      await PaymentHandler.handleCheckoutSessionCompleted(session);

      // Assert - Fell back to metadata value
      expect(capturedAmount).toBe(200);

      // Assert - Logged warning about fallback
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('[CREDIT_PACK] Could not verify credits from price config, using metadata: 200')
      );
    });
  });
});

describe('PaymentHandler - Profile not found errors', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  const mockCustomerId = 'cus_test_123';

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

  test('handleChargeRefunded should throw error when profile not found', async () => {
    // Arrange
    const charge = {
      id: 'ch_test_123',
      customer: mockCustomerId as string,
      amount_refunded: 1000,
      invoice: 'in_test_123',
      payment_intent: 'pi_test_123' as string | Stripe.PaymentIntent | null,
    } as Stripe.Charge;

    // Mock profile not found
    MockedSupabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      }),
    } as never);

    // Act & Assert - Should throw error to enable Stripe retry
    await expect(PaymentHandler.handleChargeRefunded(charge)).rejects.toThrow(
      'Profile not found for customer'
    );

    // Assert - Logged retry error
    expect(consoleSpy.error).toHaveBeenCalledWith(
      '[WEBHOOK_RETRY] No profile found for customer cus_test_123',
      expect.any(Object)
    );
  });

  test('handleInvoicePaymentRefunded should throw error when profile not found', async () => {
    // Arrange
    const invoice = {
      id: 'in_test_123',
      customer: mockCustomerId as string,
    } as Stripe.Invoice;

    // Mock profile not found
    MockedSupabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      }),
    } as never);

    // Act & Assert - Should throw error to enable Stripe retry
    await expect(
      PaymentHandler.handleInvoicePaymentRefunded(invoice)
    ).rejects.toThrow('Profile not found for customer');

    // Assert - Logged retry error
    expect(consoleSpy.error).toHaveBeenCalledWith(
      '[WEBHOOK_RETRY] No profile found for customer cus_test_123',
      expect.any(Object)
    );
  });
});
