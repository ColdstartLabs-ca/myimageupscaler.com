/**
 * Unit Tests: Invoice Handler Fallback Fixes
 *
 * Tests for invoice payment handler fixes focusing on:
 * 1. Test mode graceful handling of missing profiles
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { InvoiceHandler } from '../../../app/api/webhooks/stripe/handlers/invoice.handler';
import Stripe from 'stripe';

// Mock dependencies
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@server/stripe', () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    ENV: 'test',
    STRIPE_SECRET_KEY: 'sk_test_key',
    AMPLITUDE_API_KEY: 'test_key',
  },
  isTest: vi.fn(() => true),
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: vi.fn(() => Promise.resolve()),
  trackRevenue: vi.fn(() => Promise.resolve()),
}));

vi.mock('@shared/config/subscription.utils', () => ({
  assertKnownPriceId: vi.fn(),
  resolvePlanOrPack: vi.fn(),
  getPlanByPriceId: vi.fn(),
  getPlanByKey: vi.fn(),
  calculateBalanceWithExpiration: vi.fn(),
}));

vi.mock('@shared/config/pricing-regions', () => ({
  getBasePriceIdByPlanKey: vi.fn(),
}));

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { isTest } from '@shared/config/env';
import { trackServerEvent, trackRevenue } from '@server/analytics';
import {
  resolvePlanOrPack,
  getPlanByPriceId,
  calculateBalanceWithExpiration,
  assertKnownPriceId,
} from '@shared/config/subscription.utils';

// Cast mocks
const MockedSupabaseAdmin = supabaseAdmin as {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
};
const MockedIsTest = isTest as ReturnType<typeof vi.fn>;
const MockedResolvePlanOrPack = resolvePlanOrPack as ReturnType<typeof vi.fn>;
const MockedAssertKnownPriceId = assertKnownPriceId as ReturnType<typeof vi.fn>;
const MockedGetPlanByPriceId = getPlanByPriceId as ReturnType<typeof vi.fn>;
const MockedCalculateBalanceWithExpiration = calculateBalanceWithExpiration as ReturnType<
  typeof vi.fn
>;
const MockedTrackServerEvent = trackServerEvent as ReturnType<typeof vi.fn>;
const MockedTrackRevenue = trackRevenue as ReturnType<typeof vi.fn>;

function makeQuery(result: unknown) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['eq', 'in', 'limit', 'order']) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn().mockResolvedValue({ data: result, error: null });
  query.single = vi.fn().mockResolvedValue({ data: result, error: null });
  return query;
}

describe('InvoiceHandler - Test Mode Graceful Handling', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  const mockCustomerId = 'cus_test_123';
  const mockSubscriptionId = 'sub_test_123';
  const mockInvoiceId = 'in_test_123';
  const mockPriceId = 'price_pro_monthly';

  beforeEach(() => {
    vi.clearAllMocks();
    MockedSupabaseAdmin.rpc.mockResolvedValue({ error: null });
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };

    // Default mocks
    MockedIsTest.mockReturnValue(true);
    MockedResolvePlanOrPack.mockReturnValue({
      type: 'plan',
      key: 'pro',
      name: 'Pro',
      creditsPerCycle: 100,
      maxRollover: 600,
    });
    MockedAssertKnownPriceId.mockReturnValue({
      type: 'plan',
      key: 'pro',
      name: 'Pro',
      creditsPerCycle: 100,
      maxRollover: 600,
    });
    MockedGetPlanByPriceId.mockReturnValue({ creditsExpiration: { mode: 'never' } });
    MockedCalculateBalanceWithExpiration.mockReturnValue({
      newBalance: 200,
      expiredAmount: 0,
    });
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  test('should skip processing gracefully when profile not found in test mode', async () => {
    // Arrange - Invoice with no matching profile in test mode
    const invoice = {
      id: mockInvoiceId,
      customer: mockCustomerId as string,
      subscription: mockSubscriptionId as string | Stripe.Subscription,
      billing_reason: 'subscription_cycle' as const,
      amount_paid: 1000,
      currency: 'usd',
      period_end: Math.floor(Date.now() / 1000) + 2592000,
      lines: {
        data: [
          {
            price: { id: mockPriceId },
            type: 'subscription',
            proration: false,
            amount: 1000,
          },
        ],
      },
    } as Stripe.Invoice;

    MockedIsTest.mockReturnValue(true);

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

    // Act - Should NOT throw
    await expect(InvoiceHandler.handleInvoicePaymentSucceeded(invoice)).resolves.toBeUndefined();

    // Assert - Logged test mode warning
    expect(consoleSpy.warn).toHaveBeenCalledTimes(2);
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      '[RETENTION_MEASUREMENT] Failed to record billing event',
      expect.anything()
    );
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      expect.stringContaining('[WEBHOOK_TEST_MODE]'),
      expect.any(Object)
    );
  });

  test('should throw error when profile not found in production mode', async () => {
    // Arrange - Invoice with no matching profile in production
    const invoice = {
      id: mockInvoiceId,
      customer: mockCustomerId as string,
      subscription: mockSubscriptionId as string | Stripe.Subscription,
      billing_reason: 'subscription_cycle' as const,
      amount_paid: 1000,
      currency: 'usd',
      period_end: Math.floor(Date.now() / 1000) + 2592000,
      lines: {
        data: [
          {
            price: { id: mockPriceId },
            type: 'subscription',
            proration: false,
            amount: 1000,
          },
        ],
      },
    } as Stripe.Invoice;

    MockedIsTest.mockReturnValue(false);

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

    // Act & Assert - Should throw to trigger webhook retry
    await expect(InvoiceHandler.handleInvoicePaymentSucceeded(invoice)).rejects.toThrow(
      'Profile not found for customer'
    );

    // Assert - Logged retry error
    expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    expect(consoleSpy.error).toHaveBeenCalledWith(
      expect.stringContaining('[WEBHOOK_RETRY]'),
      expect.any(Object)
    );
  });

  test('should emit one renewal and one revenue event for a paid subscription-cycle invoice', async () => {
    const invoice = {
      id: mockInvoiceId,
      customer: mockCustomerId,
      subscription: mockSubscriptionId,
      billing_reason: 'subscription_cycle',
      paid: true,
      status: 'paid',
      amount_paid: 2900,
      currency: 'usd',
      period_end: 1_735_689_600,
      lines: { data: [{ price: { id: mockPriceId }, type: 'subscription', amount: 2900 }] },
    } as unknown as Stripe.Invoice;

    MockedSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'subscription_retention_events')
        return { select: vi.fn(() => makeQuery(null)) };
      if (table === 'profiles') {
        return {
          select: vi.fn(() =>
            makeQuery({
              id: 'user_123',
              subscription_tier: 'pro',
              subscription_credits_balance: 100,
              purchased_credits_balance: 0,
            })
          ),
        };
      }
      return {};
    });

    await InvoiceHandler.handleInvoicePaymentSucceeded(invoice);

    expect(MockedTrackServerEvent).toHaveBeenCalledWith(
      'subscription_renewed',
      expect.objectContaining({
        invoiceId: mockInvoiceId,
        amountCents: 2900,
        currency: 'usd',
      }),
      expect.objectContaining({ userId: 'user_123' })
    );
    expect(MockedTrackRevenue).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 2900,
        currency: 'usd',
        invoiceId: mockInvoiceId,
        subscriptionId: mockSubscriptionId,
        sourceObjectId: mockInvoiceId,
        lifecycleAction: 'subscription_renewal',
      }),
      expect.objectContaining({ userId: 'user_123' })
    );
    expect(
      MockedTrackServerEvent.mock.calls.filter(call => call[0] === 'subscription_renewed')
    ).toHaveLength(1);
    expect(MockedTrackRevenue).toHaveBeenCalledTimes(1);
  });

  test('should exclude first invoices from renewal while preserving initial revenue telemetry', async () => {
    const invoice = {
      id: mockInvoiceId,
      customer: mockCustomerId,
      subscription: mockSubscriptionId,
      billing_reason: 'subscription_create',
      paid: true,
      status: 'paid',
      amount_paid: 2900,
      currency: 'usd',
      payment_intent: 'pi_initial_123',
      lines: { data: [{ price: { id: mockPriceId }, type: 'subscription', amount: 2900 }] },
    } as unknown as Stripe.Invoice;

    MockedSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'subscription_retention_events')
        return { select: vi.fn(() => makeQuery(null)) };
      if (table === 'credit_transactions') return { select: vi.fn(() => makeQuery(null)) };
      if (table === 'profiles') {
        return {
          select: vi.fn(() =>
            makeQuery({
              id: 'user_123',
              subscription_tier: 'pro',
              subscription_credits_balance: 100,
              purchased_credits_balance: 0,
            })
          ),
        };
      }
      return {};
    });

    await InvoiceHandler.handleInvoicePaymentSucceeded(invoice);

    expect(MockedTrackServerEvent).not.toHaveBeenCalledWith(
      'subscription_renewed',
      expect.anything(),
      expect.anything()
    );
    expect(MockedTrackRevenue).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceObjectId: 'pi_initial_123',
        lifecycleAction: 'purchase_initial',
      }),
      expect.objectContaining({
        sourceObjectId: 'pi_initial_123',
        lifecycleAction: 'purchase_initial',
        deduplicate: true,
      })
    );
  });

  test('should not emit renewal or revenue for zero or unpaid invoices', async () => {
    const baseInvoice = {
      id: mockInvoiceId,
      customer: mockCustomerId,
      subscription: mockSubscriptionId,
      billing_reason: 'subscription_cycle',
      status: 'paid',
      currency: 'usd',
      lines: { data: [{ price: { id: mockPriceId }, type: 'subscription', amount: 0 }] },
    };

    MockedSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'subscription_retention_events')
        return { select: vi.fn(() => makeQuery(null)) };
      if (table === 'profiles') {
        return {
          select: vi.fn(() =>
            makeQuery({
              id: 'user_123',
              subscription_tier: 'pro',
              subscription_credits_balance: 100,
              purchased_credits_balance: 0,
            })
          ),
        };
      }
      return {};
    });

    await InvoiceHandler.handleInvoicePaymentSucceeded({
      ...baseInvoice,
      paid: true,
      amount_paid: 0,
    } as unknown as Stripe.Invoice);
    await InvoiceHandler.handleInvoicePaymentSucceeded({
      ...baseInvoice,
      paid: false,
      status: 'open',
      amount_paid: 2900,
    } as unknown as Stripe.Invoice);

    expect(MockedTrackServerEvent).not.toHaveBeenCalledWith(
      'subscription_renewed',
      expect.anything(),
      expect.anything()
    );
    expect(MockedTrackRevenue).not.toHaveBeenCalled();
  });

  test('should require an invoice ID and currency before emitting renewal telemetry', async () => {
    const baseInvoice = {
      customer: mockCustomerId,
      subscription: mockSubscriptionId,
      billing_reason: 'subscription_cycle',
      paid: true,
      status: 'paid',
      amount_paid: 2900,
      lines: { data: [{ price: { id: mockPriceId }, type: 'subscription', amount: 2900 }] },
    };

    MockedSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'subscription_retention_events')
        return { select: vi.fn(() => makeQuery(null)) };
      if (table === 'profiles') {
        return {
          select: vi.fn(() =>
            makeQuery({
              id: 'user_123',
              subscription_tier: 'pro',
              subscription_credits_balance: 100,
              purchased_credits_balance: 0,
            })
          ),
        };
      }
      return {};
    });

    await InvoiceHandler.handleInvoicePaymentSucceeded({
      ...baseInvoice,
      id: '',
      currency: 'usd',
    } as unknown as Stripe.Invoice);
    await InvoiceHandler.handleInvoicePaymentSucceeded({
      ...baseInvoice,
      id: mockInvoiceId,
      currency: undefined,
    } as unknown as Stripe.Invoice);

    expect(MockedTrackServerEvent).not.toHaveBeenCalledWith(
      'subscription_renewed',
      expect.anything(),
      expect.anything()
    );
    expect(MockedTrackRevenue).not.toHaveBeenCalled();
  });

  test('should preserve billing success when analytics rejects', async () => {
    MockedTrackServerEvent.mockRejectedValue(new Error('Amplitude unavailable'));
    MockedTrackRevenue.mockRejectedValue(new Error('Amplitude unavailable'));

    const invoice = {
      id: mockInvoiceId,
      customer: mockCustomerId,
      subscription: mockSubscriptionId,
      billing_reason: 'subscription_cycle',
      paid: true,
      status: 'paid',
      amount_paid: 2900,
      currency: 'usd',
      lines: { data: [{ price: { id: mockPriceId }, type: 'subscription', amount: 2900 }] },
    } as unknown as Stripe.Invoice;

    MockedSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'subscription_retention_events')
        return { select: vi.fn(() => makeQuery(null)) };
      if (table === 'profiles') {
        return {
          select: vi.fn(() =>
            makeQuery({
              id: 'user_123',
              subscription_tier: 'pro',
              subscription_credits_balance: 100,
              purchased_credits_balance: 0,
            })
          ),
        };
      }
      return {};
    });

    await expect(InvoiceHandler.handleInvoicePaymentSucceeded(invoice)).resolves.toBeUndefined();
    expect(MockedSupabaseAdmin.rpc).toHaveBeenCalledWith(
      'add_subscription_credits',
      expect.objectContaining({ ref_id: `invoice_${mockInvoiceId}` })
    );
  });
});
