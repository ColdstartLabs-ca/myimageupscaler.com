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
import { assertKnownPriceId, getPlanForPriceId, resolvePlanOrPack } from '@shared/config/stripe';
import { getBasePriceIdByPlanKey } from '@shared/config/pricing-regions';

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
        payment_status: 'paid',
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
        payment_status: 'paid',
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
        expect.stringContaining(
          '[CREDIT_PACK] Could not verify credits from price config, using metadata: 200'
        )
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
    await expect(PaymentHandler.handleInvoicePaymentRefunded(invoice)).rejects.toThrow(
      'Profile not found for customer'
    );

    // Assert - Logged retry error
    expect(consoleSpy.error).toHaveBeenCalledWith(
      '[WEBHOOK_RETRY] No profile found for customer cus_test_123',
      expect.any(Object)
    );
  });
});

// ---------------------------------------------------------------------------
// Issue 1 fix: session.invoice null → defer credit allocation, no session_ ref
// ---------------------------------------------------------------------------

const MockedAssertKnownPriceId = assertKnownPriceId as ReturnType<typeof vi.fn>;
const MockedGetPlanForPriceId = getPlanForPriceId as ReturnType<typeof vi.fn>;
const MockedGetBasePriceIdByPlanKey = getBasePriceIdByPlanKey as ReturnType<typeof vi.fn>;
const MockedStripe = stripe as { subscriptions: { retrieve: ReturnType<typeof vi.fn> } };

function makeSubscriptionCheckoutSession(invoiceId: string | null) {
  return {
    id: 'cs_test_123',
    mode: 'subscription' as const,
    customer: 'cus_test_abc' as string | Stripe.Customer,
    customer_email: null,
    customer_details: null,
    payment_intent: null,
    amount_total: 4900,
    currency: 'usd',
    payment_method_types: ['card'],
    metadata: { user_id: 'user_test_abc' },
    invoice: invoiceId,
    subscription: 'sub_real_abc' as string | Stripe.Subscription,
    line_items: { data: [] },
  } as unknown as Stripe.Checkout.Session;
}

describe('PaymentHandler — Issue 1: session.invoice null defers credit allocation', () => {
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

    // Profile lookup succeeds
    MockedSupabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'user_test_abc' }, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    } as never);

    MockedSupabaseAdmin.rpc.mockResolvedValue({ data: null, error: null } as never);

    const mockSub = {
      id: 'sub_real_abc',
      status: 'active',
      cancel_at_period_end: false,
      metadata: { plan_key: 'pro' },
      items: { data: [{ price: { id: 'price_pro' } }] },
      current_period_start: 1700000000,
      current_period_end: 1702592000,
    };
    MockedStripe.subscriptions.retrieve.mockResolvedValue(mockSub as never);

    MockedGetBasePriceIdByPlanKey.mockReturnValue('price_pro');
    MockedGetPlanForPriceId.mockReturnValue({
      key: 'pro',
      name: 'Professional',
      creditsPerMonth: 500,
    });
    MockedAssertKnownPriceId.mockReturnValue({ type: 'plan', key: 'pro' });
    MockedResolvePlanOrPack.mockReturnValue({ type: 'plan', key: 'pro' });
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  test('skips credit allocation and logs a warning when session.invoice is null', async () => {
    const session = makeSubscriptionCheckoutSession(null);

    await PaymentHandler.handleCheckoutSessionCompleted(session);

    // add_subscription_credits must NOT have been called
    expect(MockedSupabaseAdmin.rpc).not.toHaveBeenCalledWith(
      'add_subscription_credits',
      expect.anything()
    );

    // Warn logged with deferral message
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      expect.stringContaining('deferring credit allocation to invoice.payment_succeeded'),
      expect.any(Object)
    );
  });

  test('does NOT use session_ ref_id when session.invoice is null', async () => {
    const session = makeSubscriptionCheckoutSession(null);

    await PaymentHandler.handleCheckoutSessionCompleted(session);

    // Ensure no RPC was called with a session_ ref_id
    const rpCalls = MockedSupabaseAdmin.rpc.mock.calls as Array<[string, Record<string, unknown>]>;
    const creditCall = rpCalls.find(([name]) => name === 'add_subscription_credits');
    expect(creditCall).toBeUndefined();
  });

  test('allocates credits with invoice_ ref_id when session.invoice is present', async () => {
    const session = makeSubscriptionCheckoutSession('in_test_invoice_123');

    // Dedup check: no existing credit
    MockedSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'credit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'user_test_abc' }, error: null }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    });

    let capturedRefId: string | undefined;
    MockedSupabaseAdmin.rpc.mockImplementation((name: string, params: unknown) => {
      if (name === 'add_subscription_credits') {
        capturedRefId = (params as { ref_id: string }).ref_id;
      }
      return Promise.resolve({ data: null, error: null });
    });

    await PaymentHandler.handleCheckoutSessionCompleted(session);

    expect(capturedRefId).toBe('invoice_in_test_invoice_123');
  });
});

// ---------------------------------------------------------------------------
// Issue 3 fix: failed clawback emits console.error with requiresManualReview
// ---------------------------------------------------------------------------

describe('PaymentHandler — Issue 3: failed clawback emits actionable error', () => {
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

  function makeCharge(overrides: Partial<Stripe.Charge> = {}): Stripe.Charge {
    return {
      id: 'ch_test_clawback',
      customer: 'cus_test_cb' as string,
      amount_refunded: 4900,
      invoice: 'in_test_cb',
      payment_intent: 'pi_test_cb' as string | Stripe.PaymentIntent | null,
      ...overrides,
    } as Stripe.Charge;
  }

  function mockProfileFound() {
    MockedSupabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'user_test_cb' }, error: null }),
        }),
      }),
    } as never);
  }

  test('calls console.error with requiresManualReview when clawback cannot correlate', async () => {
    mockProfileFound();
    // All clawback attempts return success: false (no match)
    MockedSupabaseAdmin.rpc.mockResolvedValue({
      data: [{ success: false }],
      error: null,
    } as never);

    await PaymentHandler.handleChargeRefunded(makeCharge());

    expect(consoleSpy.error).toHaveBeenCalledWith(
      expect.stringContaining('manual credit review required'),
      expect.objectContaining({ requiresManualReview: true })
    );
  });

  test('does NOT throw when clawback fails — webhook must still return 200', async () => {
    mockProfileFound();
    MockedSupabaseAdmin.rpc.mockResolvedValue({
      data: [{ success: false }],
      error: null,
    } as never);

    // Should resolve without throwing
    await expect(PaymentHandler.handleChargeRefunded(makeCharge())).resolves.toBeUndefined();
  });

  test('does NOT emit error when clawback succeeds', async () => {
    mockProfileFound();
    MockedSupabaseAdmin.rpc.mockResolvedValue({
      data: [{ success: true, credits_clawed_back: 500 }],
      error: null,
    } as never);

    await PaymentHandler.handleChargeRefunded(makeCharge());

    expect(consoleSpy.error).not.toHaveBeenCalledWith(
      expect.stringContaining('manual credit review required'),
      expect.anything()
    );
  });
});
