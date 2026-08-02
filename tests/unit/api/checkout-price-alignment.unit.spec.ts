import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import Stripe from 'stripe';

const persistCheckoutIntentContextMock = vi.hoisted(() => vi.fn());
const validateExperimentCheckoutAttributionMock = vi.hoisted(() => vi.fn());
const autoTopUpUpsertMock = vi.hoisted(() => vi.fn());
const autoTopUpConsentUpsertMock = vi.hoisted(() => vi.fn());
const autoTopUpConsentUpdateMock = vi.hoisted(() => vi.fn());
const autoTopUpConsentDeleteMock = vi.hoisted(() => vi.fn());
const autoTopUpUpdateMaybeSingleMock = vi.hoisted(() => vi.fn());
const autoTopUpUpdateMock = vi.hoisted(() => vi.fn());
const revenueFeatureEligibleMock = vi.hoisted(() => vi.fn());

vi.mock('@shared/config/env', async importOriginal => {
  const actual = await importOriginal<typeof import('@shared/config/env')>();
  return {
    ...actual,
    clientEnv: {
      ...actual.clientEnv,
      BASE_URL: 'http://localhost:3000',
    },
    serverEnv: {
      ...actual.serverEnv,
      ENV: 'production',
      STRIPE_SECRET_KEY: 'sk_live_test_123',
      AMPLITUDE_API_KEY: 'amplitude_test_key',
    },
  };
});

vi.mock('@server/stripe', () => ({
  stripe: {
    customers: {
      create: vi.fn(),
    },
    prices: {
      retrieve: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn(),
        expire: vi.fn(),
      },
    },
  },
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: vi.fn(),
}));

vi.mock('@server/services/engagement-discount.service', () => ({
  isDiscountValid: vi.fn(),
  calculateStackedDiscount: vi.fn(
    (basePriceCents: number, regionalDiscountPercent: number, engagementDiscountPercent: number) =>
      Math.round(
        basePriceCents * (1 - regionalDiscountPercent / 100) * (1 - engagementDiscountPercent / 100)
      )
  ),
}));

vi.mock('@server/services/checkout-rescue-offer.service', () => ({
  verifyCheckoutRescueOffer: vi.fn(() => ({ valid: false })),
}));

vi.mock('@server/services/revenue-recovery.service', () => ({
  getRevenueRecoveryService: vi.fn(() => ({
    persistCheckoutIntentContext: persistCheckoutIntentContextMock,
  })),
}));

vi.mock('@server/services/revenue-feature-rollout.service', () => ({
  isRevenueFeatureEligible: revenueFeatureEligibleMock,
}));

vi.mock('@lib/experiments', () => ({
  validateExperimentCheckoutAttribution: validateExperimentCheckoutAttributionMock,
}));

vi.mock('@shared/config/subscription.config', async importOriginal => {
  const actual = await importOriginal<typeof import('@shared/config/subscription.config')>();
  return {
    ...actual,
    getTrialConfig: vi.fn(() => null),
  };
});

import { POST } from '@app/api/checkout/route';
import { GET as GETAutoTopUp, PUT as PUTAutoTopUp } from '@app/api/auto-top-up/settings/route';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { trackServerEvent } from '@server/analytics';
import { isDiscountValid } from '@server/services/engagement-discount.service';
import { STRIPE_PRICES } from '@shared/config/stripe';

type TCheckoutSessionParams = Parameters<typeof stripe.checkout.sessions.create>[0];
const autoTopUpMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260711093626_auto_top_up_settings.sql'),
  'utf8'
);

describe('POST /api/checkout price alignment', () => {
  const sessionCreateMock = vi.mocked(stripe.checkout.sessions.create);
  const sessionExpireMock = vi.mocked(stripe.checkout.sessions.expire);
  const priceRetrieveMock = vi.mocked(stripe.prices.retrieve);
  const getUserMock = vi.mocked(supabaseAdmin.auth.getUser);
  const fromMock = vi.mocked(supabaseAdmin.from);
  const discountValidMock = vi.mocked(isDiscountValid);
  const trackServerEventMock = vi.mocked(trackServerEvent);

  function createRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest('https://example.com/api/checkout', {
      method: 'POST',
      headers: {
        authorization: 'Bearer jwt_token_checkout_alignment',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  function getCreatedSessionParams(): TCheckoutSessionParams {
    expect(sessionCreateMock).toHaveBeenCalledTimes(1);
    return sessionCreateMock.mock.calls[0][0] as TCheckoutSessionParams;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    validateExperimentCheckoutAttributionMock.mockResolvedValue({
      valid: true,
      attribution: {
        experimentKey: 'purchase_modal_default_selection',
        contextKey: 'global',
        armId: 10,
        armKey: 'compact_credit_picker',
        assignmentKey: 'session:abc',
      },
    });

    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user_checkout_alignment',
          email: 'pricing@example.com',
        },
      },
      error: null,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { stripe_customer_id: 'cus_existing_123' },
                error: null,
              }),
            })),
          })),
        } as never;
      }
      if (table === 'auto_top_up_settings') {
        const updateQuery: Record<string, ReturnType<typeof vi.fn>> = {};
        updateQuery.eq = vi.fn(() => updateQuery);
        updateQuery.select = vi.fn(() => updateQuery);
        updateQuery.maybeSingle = autoTopUpUpdateMaybeSingleMock;
        return {
          upsert: autoTopUpUpsertMock,
          update: autoTopUpUpdateMock.mockImplementation(() => updateQuery),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: autoTopUpUpdateMaybeSingleMock })),
          })),
        } as never;
      }
      if (table === 'auto_top_up_checkout_consents') {
        const query: Record<string, ReturnType<typeof vi.fn>> = {};
        query.eq = vi.fn(() => query);
        query.select = vi.fn(() => query);
        query.maybeSingle = autoTopUpUpdateMaybeSingleMock;
        query.then = (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(resolve);
        return {
          upsert: autoTopUpConsentUpsertMock,
          update: autoTopUpConsentUpdateMock.mockImplementation(() => query),
          delete: autoTopUpConsentDeleteMock.mockImplementation(() => query),
        } as never;
      }
      if (table === 'auto_top_up_attempts') {
        const query: Record<string, ReturnType<typeof vi.fn>> = {};
        for (const method of ['eq', 'in', 'order', 'limit', 'select', 'update']) {
          query[method] = vi.fn(() => query);
        }
        query.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        return query as never;
      }
      if (table === 'credit_transactions') {
        const query: Record<string, ReturnType<typeof vi.fn>> = {};
        for (const method of ['select', 'eq', 'like', 'order', 'limit']) {
          query[method] = vi.fn(() => query);
        }
        query.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        return query as never;
      }

      throw new Error(`Unexpected supabase table in test: ${table}`);
    });

    priceRetrieveMock.mockResolvedValue({
      id: STRIPE_PRICES.MEDIUM_CREDITS,
      type: 'one_time',
      unit_amount: 1499,
      product: 'prod_medium_pack',
    } as never);

    sessionCreateMock.mockResolvedValue({
      id: 'cs_test_alignment',
      url: 'https://checkout.stripe.com/c/pay/cs_test_alignment',
      client_secret: 'cs_test_alignment_secret',
    } as never);
    sessionExpireMock.mockResolvedValue({ id: 'cs_test_alignment', status: 'expired' } as never);

    discountValidMock.mockResolvedValue({
      valid: true,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    persistCheckoutIntentContextMock.mockResolvedValue(true);
    autoTopUpUpsertMock.mockResolvedValue({ error: null });
    autoTopUpConsentUpsertMock.mockResolvedValue({ error: null });
    autoTopUpConsentUpdateMock.mockImplementation(() => {
      const query: Record<string, ReturnType<typeof vi.fn>> = {};
      query.eq = vi.fn(() => query);
      query.select = vi.fn(() => query);
      query.maybeSingle = autoTopUpUpdateMaybeSingleMock;
      return query;
    });
    autoTopUpConsentDeleteMock.mockImplementation(() => {
      const query: Record<string, ReturnType<typeof vi.fn>> = {};
      query.eq = vi.fn(() => query);
      query.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(resolve);
      return query;
    });
    autoTopUpUpdateMaybeSingleMock.mockResolvedValue({
      data: { enabled: false, pending_enabled: false },
      error: null,
    });
    revenueFeatureEligibleMock.mockResolvedValue(true);
  });

  test('does not silently apply engagement discount without explicit trigger', async () => {
    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
      })
    );

    expect(response.status).toBe(200);

    const sessionParams = getCreatedSessionParams();
    expect(sessionParams.line_items).toEqual([
      { price: STRIPE_PRICES.MEDIUM_CREDITS, quantity: 1 },
    ]);
    expect(sessionParams.metadata?.engagement_discount_applied).toBeUndefined();
    expect(sessionParams.metadata?.engagement_discount_percent).toBeUndefined();
    expect(sessionParams.payment_intent_data?.setup_future_usage).toBeUndefined();
    expect(autoTopUpUpsertMock).not.toHaveBeenCalled();
    expect(trackServerEventMock).not.toHaveBeenCalledWith(
      'engagement_discount_checkout_started',
      expect.anything(),
      expect.anything()
    );
  });

  test('persists explicit Small/Medium auto top-up consent and retains payment method', async () => {
    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
        autoTopUp: { enabled: true, thresholdCredits: 25 },
      })
    );
    expect(response.status).toBe(200);
    expect(getCreatedSessionParams().payment_intent_data?.setup_future_usage).toBe('off_session');
    expect(autoTopUpConsentUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user_checkout_alignment',
        threshold_credits: 25,
        pack_key: 'medium',
        consent_version: expect.any(String),
        checkout_session_id: null,
      }),
      { onConflict: 'consent_version', ignoreDuplicates: true }
    );
    expect(autoTopUpConsentUpdateMock).toHaveBeenCalledWith({
      checkout_session_id: 'cs_test_alignment',
      stripe_customer_id: 'cus_existing_123',
    });
    expect(autoTopUpUpsertMock).not.toHaveBeenCalled();
    expect(autoTopUpUpdateMock).not.toHaveBeenCalled();
    expect(getCreatedSessionParams().metadata).toMatchObject({
      auto_top_up_consent_version: expect.any(String),
      auto_top_up_threshold: '25',
      auto_top_up_pack_key: 'medium',
    });
  });

  test('expires checkout when the versioned consent cannot be attached', async () => {
    autoTopUpUpdateMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
        autoTopUp: { enabled: true, thresholdCredits: 25 },
      })
    );
    expect(response.status).toBe(409);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_test_alignment');
  });

  test('attaches stale-customer recovery to the fresh Stripe customer', async () => {
    sessionCreateMock
      .mockRejectedValueOnce(
        new Stripe.errors.StripeInvalidRequestError({
          type: 'invalid_request_error',
          message: 'No such customer',
          code: 'resource_missing',
          param: 'customer',
        })
      )
      .mockResolvedValueOnce({
        id: 'cs_test_alignment',
        url: 'https://checkout.stripe.com/c/pay/cs_test_alignment',
      } as never);
    vi.mocked(stripe.customers.create).mockResolvedValue({ id: 'cus_fresh_456' } as never);

    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
        autoTopUp: { enabled: true, thresholdCredits: 25 },
      })
    );
    expect(response.status).toBe(200);
    expect(autoTopUpConsentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_customer_id: 'cus_fresh_456' })
    );
  });

  test('clears pending consent when stale-customer retry also fails', async () => {
    sessionCreateMock
      .mockRejectedValueOnce(
        new Stripe.errors.StripeInvalidRequestError({
          type: 'invalid_request_error',
          message: 'No such customer',
          code: 'resource_missing',
          param: 'customer',
        })
      )
      .mockRejectedValueOnce(new Error('Stripe unavailable'));
    vi.mocked(stripe.customers.create).mockResolvedValue({ id: 'cus_fresh_456' } as never);
    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
        autoTopUp: { enabled: true, thresholdCredits: 25 },
      })
    );
    expect(response.status).toBe(500);
    expect(autoTopUpUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pending_enabled: false,
        failure_reason: 'checkout_session_retry_failed',
      })
    );
  });

  test('surfaces and records an orphan when checkout expiration fails', async () => {
    autoTopUpUpdateMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    sessionExpireMock.mockRejectedValueOnce(new Error('Stripe unavailable'));
    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
        autoTopUp: { enabled: true, thresholdCredits: 25 },
      })
    );
    expect(response.status).toBe(503);
    expect(autoTopUpUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pending_enabled: false,
        failure_reason: 'orphaned_session_expiration_failed',
        checkout_session_id: 'cs_test_alignment',
      })
    );
  });

  test('rejects auto top-up for an unsupported pack', async () => {
    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.LARGE_CREDITS,
        autoTopUp: { enabled: true, thresholdCredits: 25 },
      })
    );
    expect(response.status).toBe(400);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  test('rejects auto top-up outside the server-side rollout', async () => {
    revenueFeatureEligibleMock.mockResolvedValueOnce(false);

    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
        autoTopUp: { enabled: true, thresholdCredits: 25 },
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'AUTO_TOP_UP_NOT_ELIGIBLE' },
    });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  test('does not honor test authentication headers outside the test environment', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid token' },
    } as never);
    const response = await POST(
      new NextRequest('https://example.com/api/checkout', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test_token_victim',
          'x-test-env': 'true',
          'x-playwright-test': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ priceId: STRIPE_PRICES.MEDIUM_CREDITS }),
      })
    );
    expect(response.status).toBe(401);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  test('disables active and pending auto top-up immediately for the authenticated user', async () => {
    const response = await PUTAutoTopUp(
      new NextRequest('https://example.com/api/auto-top-up/settings', {
        method: 'PUT',
        headers: { authorization: 'Bearer jwt_token_checkout_alignment' },
        body: JSON.stringify({ enabled: false }),
      })
    );
    expect(response.status).toBe(200);
    expect(autoTopUpUpdateMaybeSingleMock).toHaveBeenCalledOnce();
    expect(trackServerEventMock).toHaveBeenCalledWith(
      'auto_top_up_disabled',
      { cancelledAttempt: false },
      { apiKey: 'amplitude_test_key', userId: 'user_checkout_alignment' }
    );
  });

  test('settings reads are authenticated and user-scoped', async () => {
    const unauthorized = await GETAutoTopUp(
      new NextRequest('https://example.com/api/auto-top-up/settings')
    );
    expect(unauthorized.status).toBe(401);

    const authorized = await GETAutoTopUp(
      new NextRequest('https://example.com/api/auto-top-up/settings', {
        headers: { authorization: 'Bearer jwt_token_checkout_alignment' },
      })
    );
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toMatchObject({
      autoTopUpEligible: true,
      repeatPurchaseEligible: true,
    });
    expect(autoTopUpMigration).toContain('USING (auth.uid() = user_id)');
    expect(autoTopUpMigration).not.toMatch(
      /CREATE POLICY "Users[^\n]+"[\s\S]+FOR (INSERT|UPDATE|DELETE)/
    );
  });

  test('applies engagement discount only when checkout was opened from the banner flow', async () => {
    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
        metadata: {
          checkout_trigger: 'engagement_discount_banner',
        },
      })
    );

    expect(response.status).toBe(200);

    const sessionParams = getCreatedSessionParams();
    expect(sessionParams.line_items).toEqual([
      {
        price_data: {
          currency: 'usd',
          product: 'prod_medium_pack',
          unit_amount: 1199,
        },
        quantity: 1,
      },
    ]);
    expect(sessionParams.metadata?.engagement_discount_applied).toBe('true');
    expect(sessionParams.metadata?.engagement_discount_percent).toBe('20');
    expect(trackServerEventMock).toHaveBeenCalledWith(
      'engagement_discount_checkout_started',
      expect.objectContaining({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
        targetPackKey: 'medium',
      }),
      expect.objectContaining({ userId: 'user_checkout_alignment' })
    );
  });

  test('preserves experiment metadata', async () => {
    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
        metadata: {
          funnel_schema_version: '1',
          funnel_attempt_id: 'fa_checkout_alignment_123',
          entry_surface: 'insufficient_credits',
          checkout_trigger: 'insufficient_credits',
          checkout_attribution_chain: 'insufficient_credits,purchase_modal',
          exp_key: 'purchase_modal_default_selection',
          exp_ctx: 'global',
          exp_arm_id: '10',
          exp_arm_key: 'compact_credit_picker',
          exp_assign_key: 'session:abc',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(validateExperimentCheckoutAttributionMock).toHaveBeenCalledWith({
      experimentKey: 'purchase_modal_default_selection',
      contextKey: 'global',
      armId: 10,
      armKey: 'compact_credit_picker',
      assignmentKey: 'session:abc',
    });

    const sessionParams = getCreatedSessionParams();
    expect(sessionParams.metadata).toEqual(
      expect.objectContaining({
        exp_key: 'purchase_modal_default_selection',
        exp_ctx: 'global',
        exp_arm_id: '10',
        exp_arm_key: 'compact_credit_picker',
        exp_assign_key: 'session:abc',
      })
    );
    expect(trackServerEventMock).toHaveBeenCalledWith(
      'checkout_started',
      expect.objectContaining({
        funnelAttemptId: 'fa_checkout_alignment_123',
        entrySurface: 'insufficient_credits',
        trigger: 'insufficient_credits',
        attributionChain: ['insufficient_credits', 'purchase_modal'],
        experimentKey: 'purchase_modal_default_selection',
        experimentContextKey: 'global',
        experimentArmId: 10,
        experimentArmKey: 'compact_credit_picker',
        experimentAssignmentKey: 'session:abc',
      }),
      expect.objectContaining({ userId: 'user_checkout_alignment' })
    );
  });

  test('reuses one Stripe idempotency key for the same funnel attempt', async () => {
    const body = {
      priceId: STRIPE_PRICES.MEDIUM_CREDITS,
      offerToken: 'offer_stable',
      metadata: {
        funnel_schema_version: '1',
        funnel_attempt_id: 'fa_idempotent_checkout_123',
        entry_surface: 'purchase_modal',
        checkout_trigger: 'purchase_modal',
        exp_key: 'purchase_modal_default_selection',
        exp_ctx: 'global',
        exp_arm_id: '10',
        exp_arm_key: 'compact_credit_picker',
        exp_assign_key: 'session:stable',
      },
    };

    expect((await POST(createRequest(body))).status).toBe(200);
    expect((await POST(createRequest(body))).status).toBe(200);

    expect(sessionCreateMock).toHaveBeenCalledTimes(2);
    const firstOptions = sessionCreateMock.mock.calls[0][1] as { idempotencyKey: string };
    const secondOptions = sessionCreateMock.mock.calls[1][1] as { idempotencyKey: string };
    expect(firstOptions.idempotencyKey).toBe(secondOptions.idempotencyKey);
    expect(firstOptions.idempotencyKey).toMatch(/^miu_checkout_[a-f0-9]{64}$/);
  });

  test('uses a new Stripe idempotency key when checkout metadata changes', async () => {
    const baseBody = {
      priceId: STRIPE_PRICES.MEDIUM_CREDITS,
      metadata: {
        funnel_schema_version: '1',
        funnel_attempt_id: 'fa_idempotent_checkout_456',
        entry_surface: 'purchase_modal',
        checkout_trigger: 'purchase_modal',
      },
    };

    expect(
      (
        await POST(
          createRequest({
            ...baseBody,
            metadata: { ...baseBody.metadata, checkout_authenticated: 'false' },
          })
        )
      ).status
    ).toBe(200);
    expect(
      (
        await POST(
          createRequest({
            ...baseBody,
            metadata: { ...baseBody.metadata, checkout_authenticated: 'true' },
          })
        )
      ).status
    ).toBe(200);

    const idempotencyKeys = sessionCreateMock.mock.calls.map(
      call => (call[1] as { idempotencyKey: string }).idempotencyKey
    );
    expect(idempotencyKeys).toHaveLength(2);
    expect(new Set(idempotencyKeys).size).toBe(2);
  });

  test('uses a new Stripe idempotency key when auto-top-up changes', async () => {
    const baseBody = {
      priceId: STRIPE_PRICES.MEDIUM_CREDITS,
      metadata: {
        funnel_schema_version: '1',
        funnel_attempt_id: 'fa_idempotent_checkout_auto_top_up',
        entry_surface: 'purchase_modal',
        checkout_trigger: 'purchase_modal',
      },
    };

    expect(
      (
        await POST(
          createRequest({ ...baseBody, autoTopUp: { enabled: true, thresholdCredits: 25 } })
        )
      ).status
    ).toBe(200);
    expect(
      (
        await POST(
          createRequest({ ...baseBody, autoTopUp: { enabled: true, thresholdCredits: 30 } })
        )
      ).status
    ).toBe(200);

    const idempotencyKeys = sessionCreateMock.mock.calls.map(
      call => (call[1] as { idempotencyKey: string }).idempotencyKey
    );
    expect(idempotencyKeys).toHaveLength(2);
    expect(new Set(idempotencyKeys).size).toBe(2);
  });

  test('fails open when experiment attribution is incomplete', async () => {
    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
        metadata: {
          exp_key: 'purchase_modal_default_selection',
          exp_arm_id: '10',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(getCreatedSessionParams().metadata).not.toHaveProperty('exp_key');
  });

  test('fails open when funnel attribution is incomplete', async () => {
    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
        metadata: {
          funnel_schema_version: '1',
          checkout_trigger: 'purchase_modal',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(getCreatedSessionParams().metadata).not.toHaveProperty('funnel_schema_version');
    expect(getCreatedSessionParams().metadata).not.toHaveProperty('checkout_trigger');
  });

  test('fails open when experiment validation storage is unavailable', async () => {
    validateExperimentCheckoutAttributionMock.mockResolvedValueOnce({
      valid: false,
      reason: 'storage_error',
    });

    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
        metadata: {
          exp_key: 'purchase_modal_default_selection',
          exp_ctx: 'global',
          exp_arm_id: '10',
          exp_arm_key: 'compact_credit_picker',
          exp_assign_key: 'session:abc',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(getCreatedSessionParams().metadata).not.toHaveProperty('exp_key');
  });

  test('should copy checkout attribution metadata to payment_intent_data for payment sessions', async () => {
    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
        metadata: {
          amplitude_device_id: 'device_test_123',
          amplitude_session_id: '123456',
          checkout_trigger: 'batch_limit_quick_buy',
          exp_key: 'purchase_modal_default_selection',
          exp_ctx: 'global',
          exp_arm_id: '10',
          exp_arm_key: 'compact_credit_picker',
          exp_assign_key: 'session:abc',
        },
      })
    );

    expect(response.status).toBe(200);

    const sessionParams = getCreatedSessionParams();
    expect(sessionParams.mode).toBe('payment');
    expect(sessionParams.payment_intent_data?.metadata).toEqual(
      expect.objectContaining({
        user_id: 'user_checkout_alignment',
        price_id: STRIPE_PRICES.MEDIUM_CREDITS,
        pricing_region: 'standard',
        type: 'pack',
        pack_key: 'medium',
        amplitude_device_id: 'device_test_123',
        amplitude_session_id: '123456',
        checkout_trigger: 'batch_limit_quick_buy',
        exp_key: 'purchase_modal_default_selection',
        exp_ctx: 'global',
        exp_arm_id: '10',
        exp_arm_key: 'compact_credit_picker',
        exp_assign_key: 'session:abc',
      })
    );
  });

  test('should persist recovery intent context after creating checkout session', async () => {
    const response = await POST(
      createRequest({
        priceId: STRIPE_PRICES.MEDIUM_CREDITS,
      })
    );

    expect(response.status).toBe(200);
    expect(persistCheckoutIntentContextMock).toHaveBeenCalledWith({
      userId: 'user_checkout_alignment',
      priceId: STRIPE_PRICES.MEDIUM_CREDITS,
      purchaseType: 'credit_pack',
      selectedKey: 'medium',
      pricingRegion: 'standard',
      stripeCheckoutSessionId: 'cs_test_alignment',
    });
  });
});
