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
import { trackServerEvent } from '@server/analytics';
import {
  resolvePlanOrPack,
  getPlanByPriceId,
  calculateBalanceWithExpiration,
} from '@shared/config/subscription.utils';

// Cast mocks
const MockedSupabaseAdmin = supabaseAdmin as {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
};
const MockedIsTest = isTest as ReturnType<typeof vi.fn>;
const MockedResolvePlanOrPack = resolvePlanOrPack as ReturnType<typeof vi.fn>;

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
    await expect(
      InvoiceHandler.handleInvoicePaymentSucceeded(invoice)
    ).resolves.toBeUndefined();

    // Assert - Logged test mode warning
    expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
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
    await expect(
      InvoiceHandler.handleInvoicePaymentSucceeded(invoice)
    ).rejects.toThrow('Profile not found for customer');

    // Assert - Logged retry error
    expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    expect(consoleSpy.error).toHaveBeenCalledWith(
      expect.stringContaining('[WEBHOOK_RETRY]'),
      expect.any(Object)
    );
  });
});
