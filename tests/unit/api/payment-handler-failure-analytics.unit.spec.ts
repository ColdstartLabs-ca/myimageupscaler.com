import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Stripe from 'stripe';

vi.mock('@shared/config/env', async importOriginal => {
  const actual = await importOriginal<typeof import('@shared/config/env')>();
  return {
    ...actual,
    serverEnv: {
      ...actual.serverEnv,
      AMPLITUDE_API_KEY: 'amplitude_test_key',
    },
  };
});

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const query: Record<string, ReturnType<typeof vi.fn>> = {};
      query.eq = vi.fn(() => query);
      query.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve);
      return { delete: vi.fn(() => query) };
    }),
    rpc: vi.fn(),
  },
}));

vi.mock('@server/stripe', () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: vi.fn(() => Promise.resolve(true)),
  trackRevenue: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@shared/config/stripe', () => ({
  assertKnownPriceId: vi.fn(),
  getPlanForPriceId: vi.fn(),
  resolvePlanOrPack: vi.fn(),
}));

vi.mock('@shared/config/pricing-regions', () => ({
  getBasePriceIdByPlanKey: vi.fn(),
}));

vi.mock('@server/services/email.service', () => ({
  getEmailService: vi.fn(() => ({
    send: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('@server/services/email-lifecycle.service', () => ({
  getEmailLifecycleService: vi.fn(() => ({
    queueLifecycleEmail: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('@server/services/engagement-discount.service', () => ({
  redeemDiscount: vi.fn(),
}));

vi.mock('@/lib/pricing-bandit', () => ({
  recordBanditConversion: vi.fn(() => Promise.resolve()),
}));

vi.mock('@lib/experiments', () => ({
  recordExperimentReward: vi.fn(() => Promise.resolve()),
}));

import { PaymentHandler } from '../../../app/api/webhooks/stripe/handlers/payment.handler';
import { trackServerEvent } from '@server/analytics';

const trackServerEventMock = vi.mocked(trackServerEvent);

describe('PaymentHandler failure analytics', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('should track checkout_abandoned when checkout session expires', async () => {
    const session = {
      id: 'cs_test_expired',
      object: 'checkout.session',
      created: 100,
      expires_at: 700,
      customer: 'cus_test_123',
      metadata: {
        user_id: 'user_test_123',
        price_id: 'price_pack_123',
        pricing_region: 'latam',
        type: 'pack',
        pack_key: 'medium',
        amplitude_device_id: 'device_test_123',
        amplitude_session_id: '123456',
      },
    } as unknown as Stripe.Checkout.Session;

    await PaymentHandler.handleCheckoutSessionExpired(session);

    expect(trackServerEventMock).toHaveBeenCalledWith(
      'checkout_abandoned',
      expect.objectContaining({
        source: 'stripe_webhook',
        method: 'session_expired',
        step: 'stripe_embed',
        priceId: 'price_pack_123',
        plan: 'free',
        pricingRegion: 'latam',
        selectedType: 'credit_pack',
        selectedKey: 'medium',
        sessionId: 'cs_test_expired',
        stripeCheckoutSessionId: 'cs_test_expired',
        stripeCustomerId: 'cus_test_123',
        checkoutOpened: true,
        timeSpentMs: 600000,
      }),
      expect.objectContaining({
        apiKey: 'amplitude_test_key',
        userId: 'user_test_123',
        deviceId: 'device_test_123',
        sessionId: 123456,
      })
    );
  });

  test('should track payment_failed when payment intent fails', async () => {
    const paymentIntent = {
      id: 'pi_test_failed',
      object: 'payment_intent',
      amount: 1499,
      currency: 'usd',
      customer: 'cus_test_123',
      metadata: {
        user_id: 'user_test_123',
        price_id: 'price_pack_123',
        type: 'pack',
        pack_key: 'medium',
        amplitude_device_id: 'device_test_123',
        amplitude_session_id: '123456',
      },
      last_payment_error: {
        decline_code: 'insufficient_funds',
        code: 'card_declined',
        message: 'Your card has insufficient funds.',
      },
    } as unknown as Stripe.PaymentIntent;

    await PaymentHandler.handlePaymentIntentFailed(paymentIntent);

    expect(trackServerEventMock).toHaveBeenCalledWith(
      'payment_failed',
      expect.objectContaining({
        priceId: 'price_pack_123',
        plan: 'free',
        customerId: 'cus_test_123',
        attemptCount: 1,
        stripePaymentIntentId: 'pi_test_failed',
        stripeCustomerId: 'cus_test_123',
        amount: 1499,
        currency: 'usd',
        purchaseType: 'credit_pack',
        decline_reason: 'insufficient_funds',
        errorType: 'insufficient_funds',
        errorMessage: 'Your card has insufficient funds.',
      }),
      expect.objectContaining({
        apiKey: 'amplitude_test_key',
        userId: 'user_test_123',
        deviceId: 'device_test_123',
        sessionId: 123456,
      })
    );
  });

  test('should not throw when expired session cannot resolve a user', async () => {
    const session = {
      id: 'cs_test_unlinked',
      object: 'checkout.session',
      metadata: {},
    } as unknown as Stripe.Checkout.Session;

    await expect(PaymentHandler.handleCheckoutSessionExpired(session)).resolves.toBeUndefined();

    expect(trackServerEventMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CHECKOUT_SESSION_EXPIRED] Session cs_test_unlinked')
    );
  });
});
