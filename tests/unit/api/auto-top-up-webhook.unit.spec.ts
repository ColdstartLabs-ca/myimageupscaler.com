import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

const { fromMock, rpcMock, sendMock, getUserMock, retrieveMock, trackServerEventMock } = vi.hoisted(
  () => ({
    fromMock: vi.fn(),
    rpcMock: vi.fn(),
    sendMock: vi.fn(),
    getUserMock: vi.fn(),
    retrieveMock: vi.fn(),
    trackServerEventMock: vi.fn(),
  })
);

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: fromMock,
    rpc: rpcMock,
    auth: { admin: { getUserById: getUserMock } },
  },
}));
vi.mock('@server/services/email.service', () => ({ getEmailService: () => ({ send: sendMock }) }));
vi.mock('@server/stripe', () => ({
  stripe: { paymentIntents: { retrieve: retrieveMock }, subscriptions: { retrieve: vi.fn() } },
}));
vi.mock('@server/analytics', () => ({
  trackServerEvent: trackServerEventMock,
  trackRevenue: vi.fn(),
}));
vi.mock('@shared/config/stripe', () => ({
  assertKnownPriceId: vi.fn(),
  getPlanForPriceId: vi.fn(),
  resolvePlanOrPack: vi.fn(),
}));
vi.mock('@shared/config/pricing-regions', () => ({ getBasePriceIdByPlanKey: vi.fn() }));
vi.mock('@server/services/email-lifecycle.service', () => ({
  getEmailLifecycleService: () => ({ queueLifecycleEmail: vi.fn() }),
}));
vi.mock('@server/services/revenue-recovery.service', () => ({
  getRevenueRecoveryService: vi.fn(),
}));
vi.mock('@server/services/engagement-discount.service', () => ({ redeemDiscount: vi.fn() }));
vi.mock('@/lib/pricing-bandit', () => ({ recordBanditConversion: vi.fn() }));
vi.mock('@lib/experiments', () => ({ recordExperimentReward: vi.fn() }));

import { PaymentHandler } from '@app/api/webhooks/stripe/handlers/payment.handler';

function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const method of ['eq', 'select', 'update']) q[method] = vi.fn(() => q);
  q.maybeSingle = vi.fn().mockResolvedValue(result);
  q.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve);
  return q;
}

function autoTopUpIntent(status: Stripe.PaymentIntent.Status = 'succeeded') {
  return {
    id: 'pi_old',
    status,
    amount_received: 1499,
    amount: 1499,
    currency: 'usd',
    customer: 'cus_1',
    metadata: {
      auto_top_up: 'true',
      auto_top_up_attempt_id: 'attempt-old',
      auto_top_up_user_id: 'user-1',
      auto_top_up_pack_key: 'medium',
    },
    last_payment_error: { decline_code: 'insufficient_funds' },
  } as unknown as Stripe.PaymentIntent;
}

describe('auto top-up webhook convergence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: true, error: null });
    sendMock.mockResolvedValue({ success: true });
    getUserMock.mockResolvedValue({ data: { user: { email: 'buyer@example.com' } }, error: null });
    trackServerEventMock.mockResolvedValue(true);
  });

  it('finalizes a delayed success from immutable attempt credits without reading current settings', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table !== 'auto_top_up_attempts')
        throw new Error(`Unexpected current row read: ${table}`);
      return query({
        data: {
          amount_cents: 1499,
          currency: 'usd',
          status: 'payment_pending',
          pack_key: 'medium',
          credits: 200,
        },
        error: null,
      });
    });
    await PaymentHandler.handlePaymentIntentSucceeded(autoTopUpIntent());
    expect(rpcMock).toHaveBeenCalledWith('finalize_auto_top_up_attempt', {
      p_attempt_id: 'attempt-old',
      p_payment_intent_id: 'pi_old',
      p_credits: 200,
    });
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ template: 'payment-success' }));
    expect(trackServerEventMock).toHaveBeenCalledWith(
      'auto_top_up_succeeded',
      expect.objectContaining({ attemptId: 'attempt-old', packKey: 'medium' }),
      expect.objectContaining({ userId: 'user-1' })
    );
  });

  it('activates only the matching paid checkout consent with a reusable payment method', async () => {
    retrieveMock.mockResolvedValue({ payment_method: 'pm_saved' });
    const activationQuery = query({
      data: {
        threshold_credits: 25,
        pack_key: 'medium',
        stripe_price_id: 'price_medium',
        stripe_customer_id: 'cus_1',
      },
      error: null,
    });
    const settingsUpsert = vi.fn().mockResolvedValue({ error: null });
    const consentDelete = query({ data: null, error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === 'auto_top_up_checkout_consents') {
        return {
          select: vi.fn(() => activationQuery),
          delete: vi.fn(() => consentDelete),
        };
      }
      if (table === 'auto_top_up_settings') return { upsert: settingsUpsert };
      throw new Error(`Unexpected table ${table}`);
    });
    const activate = (
      PaymentHandler as unknown as {
        activateAutoTopUpConsent: (
          session: Stripe.Checkout.Session,
          userId: string
        ) => Promise<void>;
      }
    ).activateAutoTopUpConsent;
    await activate.call(
      PaymentHandler,
      {
        id: 'cs_paid',
        payment_status: 'paid',
        payment_intent: 'pi_checkout',
        customer: 'cus_1',
        metadata: { auto_top_up_consent_version: 'consent-v1' },
      } as unknown as Stripe.Checkout.Session,
      'user-1'
    );
    expect(retrieveMock).toHaveBeenCalledWith('pi_checkout');
    expect(settingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        pending_enabled: false,
        stripe_payment_method_id: 'pm_saved',
      }),
      { onConflict: 'user_id' }
    );
    expect(activationQuery.eq).toHaveBeenCalledWith('checkout_session_id', 'cs_paid');
    expect(activationQuery.eq).toHaveBeenCalledWith('consent_version', 'consent-v1');
    expect(trackServerEventMock).toHaveBeenCalledWith(
      'auto_top_up_opted_in',
      { checkoutSessionId: 'cs_paid' },
      expect.objectContaining({ userId: 'user-1' })
    );
  });

  it('does not send a second receipt when the attempt was already finalized', async () => {
    fromMock.mockReturnValue(
      query({
        data: {
          amount_cents: 1499,
          currency: 'usd',
          status: 'succeeded',
          pack_key: 'medium',
          credits: 200,
        },
        error: null,
      })
    );
    await PaymentHandler.handlePaymentIntentSucceeded(autoTopUpIntent());
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('propagates failed-attempt storage errors and never grants credits', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    await expect(
      PaymentHandler.handlePaymentIntentFailed(autoTopUpIntent('requires_payment_method'))
    ).rejects.toThrow('Unable to finalize auto top-up failure');
    expect(rpcMock).not.toHaveBeenCalledWith('finalize_auto_top_up_attempt', expect.anything());
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('marks a decline, releases its lease, and sends a notice without granting credits', async () => {
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve({
        data: name === 'claim_auto_top_up_failure_notification' ? true : 3,
        error: null,
      })
    );
    fromMock.mockReturnValue(query({ data: null, error: null }));
    await PaymentHandler.handlePaymentIntentFailed(autoTopUpIntent('requires_payment_method'));
    expect(rpcMock).not.toHaveBeenCalledWith('finalize_auto_top_up_attempt', expect.anything());
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'auto-top-up-failure',
        data: { paused: true },
      })
    );
    expect(trackServerEventMock).toHaveBeenCalledWith(
      'auto_top_up_declined',
      expect.objectContaining({ attemptId: 'attempt-old', consecutiveFailures: 3 }),
      expect.objectContaining({ userId: 'user-1' })
    );
    expect(trackServerEventMock).not.toHaveBeenCalledWith(
      'payment_failed',
      expect.anything(),
      expect.anything()
    );
  });

  it('does not emit duplicate decline analytics or email after finalization was already claimed', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await PaymentHandler.handlePaymentIntentFailed(autoTopUpIntent('requires_payment_method'));

    expect(sendMock).not.toHaveBeenCalled();
    expect(trackServerEventMock).not.toHaveBeenCalledWith(
      'auto_top_up_declined',
      expect.anything(),
      expect.anything()
    );
    expect(trackServerEventMock).not.toHaveBeenCalledWith(
      'payment_failed',
      expect.anything(),
      expect.anything()
    );
  });

  it('attributes an auto top-up refund to the rollout cohort', async () => {
    retrieveMock.mockResolvedValue({
      id: 'pi_auto_refund',
      metadata: { auto_top_up: 'true', auto_top_up_user_id: 'user-1' },
    });
    fromMock.mockReturnValue(query({ data: { id: 'user-1' }, error: null }));
    rpcMock.mockResolvedValue({ data: [{ success: true }], error: null });

    await PaymentHandler.handleChargeRefunded({
      id: 'ch_refund',
      customer: 'cus_1',
      amount_refunded: 1499,
      currency: 'usd',
      invoice: null,
      payment_intent: 'pi_auto_refund',
    } as unknown as Stripe.Charge);

    expect(trackServerEventMock).toHaveBeenCalledWith(
      'auto_top_up_refunded',
      expect.objectContaining({ refundAmount: 1499, paymentIntentId: 'pi_auto_refund' }),
      expect.objectContaining({ userId: 'user-1' })
    );
  });

  it('attributes a prompted repeat-purchase refund to the rollout cohort', async () => {
    retrieveMock.mockResolvedValue({
      id: 'pi_repeat_refund',
      metadata: { checkout_trigger: 'repeat_purchase_prompt', user_id: 'user-1' },
    });
    fromMock.mockReturnValue(query({ data: { id: 'user-1' }, error: null }));
    rpcMock.mockResolvedValue({ data: [{ success: true }], error: null });

    await PaymentHandler.handleChargeRefunded({
      id: 'ch_repeat_refund',
      customer: 'cus_1',
      amount_refunded: 1499,
      currency: 'usd',
      invoice: null,
      payment_intent: 'pi_repeat_refund',
    } as unknown as Stripe.Charge);

    expect(trackServerEventMock).toHaveBeenCalledWith(
      'repeat_purchase_refunded',
      expect.objectContaining({ paymentIntentId: 'pi_repeat_refund' }),
      expect.objectContaining({ userId: 'user-1' })
    );
  });
});
