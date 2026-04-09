import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

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

vi.mock('@shared/config/subscription.config', async importOriginal => {
  const actual = await importOriginal<typeof import('@shared/config/subscription.config')>();
  return {
    ...actual,
    getTrialConfig: vi.fn(() => null),
  };
});

import { POST } from '@app/api/checkout/route';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { trackServerEvent } from '@server/analytics';
import { isDiscountValid } from '@server/services/engagement-discount.service';
import { STRIPE_PRICES } from '@shared/config/stripe';

type TCheckoutSessionParams = Parameters<typeof stripe.checkout.sessions.create>[0];

describe('POST /api/checkout price alignment', () => {
  const sessionCreateMock = vi.mocked(stripe.checkout.sessions.create);
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

    discountValidMock.mockResolvedValue({
      valid: true,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
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
    expect(trackServerEventMock).not.toHaveBeenCalledWith(
      'engagement_discount_checkout_started',
      expect.anything(),
      expect.anything()
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
});
