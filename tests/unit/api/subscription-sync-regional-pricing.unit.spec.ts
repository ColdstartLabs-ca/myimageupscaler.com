/**
 * Unit Tests: syncSubscriptionFromStripe — regional pricing fallback
 *
 * Verifies Issue 2 fix: the reconcile cron uses syncSubscriptionFromStripe which
 * previously threw "Unknown price ID" for regional/price_data subscriptions whose
 * throwaway Stripe price IDs aren't in the config. Now it falls back to
 * subscription.metadata.plan_key → getBasePriceIdByPlanKey → getPlanForPriceId.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncSubscriptionFromStripe } from '../../../server/services/subscription-sync.service';
import type Stripe from 'stripe';

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@server/stripe/config', () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
}));

vi.mock('@shared/config/stripe', () => ({
  getPlanForPriceId: vi.fn(),
}));

vi.mock('@shared/config/pricing-regions', () => ({
  getBasePriceIdByPlanKey: vi.fn(),
}));

vi.mock('@server/services/stripe-webhook-event-processor', () => ({
  processStripeWebhookEvent: vi.fn(),
}));

vi.mock('dayjs', () => {
  const isoStub = '2024-01-01T00:00:00.000Z';
  const chainable = { toISOString: () => isoStub };
  const dayjs = Object.assign(
    vi.fn(() => chainable),
    {
      unix: vi.fn(() => chainable),
    }
  );
  return { default: dayjs };
});

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { getPlanForPriceId } from '@shared/config/stripe';
import { getBasePriceIdByPlanKey } from '@shared/config/pricing-regions';

const MockedGetPlanForPriceId = getPlanForPriceId as ReturnType<typeof vi.fn>;
const MockedGetBasePriceIdByPlanKey = getBasePriceIdByPlanKey as ReturnType<typeof vi.fn>;
const MockedSupabaseAdmin = supabaseAdmin as { from: ReturnType<typeof vi.fn> };

const THROWAWAY_PRICE_ID = 'price_1QxABCThrowaway999'; // Stripe-generated for price_data
const BASE_PRICE_ID = 'price_pro_monthly';

const mockPlan = {
  key: 'pro',
  name: 'Professional',
  creditsPerMonth: 500,
  stripePriceId: BASE_PRICE_ID,
};

function makeSubscription(
  priceId: string,
  planKey?: string
): Stripe.Subscription & { current_period_start: number; current_period_end: number } {
  return {
    id: 'sub_test_123',
    status: 'active',
    cancel_at_period_end: false,
    customer: 'cus_test_123',
    metadata: planKey ? { plan_key: planKey } : {},
    items: {
      data: [{ price: { id: priceId } }],
    },
    current_period_start: 1700000000,
    current_period_end: 1702592000,
    canceled_at: null,
  } as unknown as Stripe.Subscription & {
    current_period_start: number;
    current_period_end: number;
  };
}

describe('syncSubscriptionFromStripe — regional pricing fallback', () => {
  let consoleSpy: { log: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };

    // Default: supabase upsert/update succeed
    MockedSupabaseAdmin.from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    } as never);
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  test('syncs normally when raw price ID resolves directly', async () => {
    MockedGetPlanForPriceId.mockReturnValue(mockPlan);

    await syncSubscriptionFromStripe('user_123', makeSubscription(BASE_PRICE_ID));

    expect(MockedGetPlanForPriceId).toHaveBeenCalledWith(BASE_PRICE_ID);
    expect(MockedGetBasePriceIdByPlanKey).not.toHaveBeenCalled();
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('Professional'));
  });

  test('falls back to plan_key metadata when raw price ID is a throwaway Stripe ID', async () => {
    // First call (throwaway ID) → null; second call (base ID) → plan
    MockedGetPlanForPriceId.mockReturnValueOnce(null).mockReturnValueOnce(mockPlan);
    MockedGetBasePriceIdByPlanKey.mockReturnValue(BASE_PRICE_ID);

    await syncSubscriptionFromStripe('user_123', makeSubscription(THROWAWAY_PRICE_ID, 'pro'));

    expect(MockedGetBasePriceIdByPlanKey).toHaveBeenCalledWith('pro');
    expect(MockedGetPlanForPriceId).toHaveBeenCalledWith(BASE_PRICE_ID);
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('Professional'));
  });

  test('stores resolved base price ID (not throwaway) in the subscriptions upsert', async () => {
    MockedGetPlanForPriceId.mockReturnValueOnce(null).mockReturnValueOnce(mockPlan);
    MockedGetBasePriceIdByPlanKey.mockReturnValue(BASE_PRICE_ID);

    let capturedUpsert: Record<string, unknown> | undefined;
    MockedSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        return {
          upsert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            capturedUpsert = data;
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    });

    await syncSubscriptionFromStripe('user_123', makeSubscription(THROWAWAY_PRICE_ID, 'pro'));

    expect(capturedUpsert?.price_id).toBe(BASE_PRICE_ID);
    expect(capturedUpsert?.price_id).not.toBe(THROWAWAY_PRICE_ID);
  });

  test('throws when raw price ID unknown and no plan_key metadata present', async () => {
    MockedGetPlanForPriceId.mockReturnValue(null);

    await expect(
      syncSubscriptionFromStripe('user_123', makeSubscription(THROWAWAY_PRICE_ID))
    ).rejects.toThrow(`Unknown price ID: ${THROWAWAY_PRICE_ID}`);

    expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('Unknown price ID'));
  });

  test('throws when plan_key present but getBasePriceIdByPlanKey returns null', async () => {
    MockedGetPlanForPriceId.mockReturnValue(null);
    MockedGetBasePriceIdByPlanKey.mockReturnValue(null);

    await expect(
      syncSubscriptionFromStripe('user_123', makeSubscription(THROWAWAY_PRICE_ID, 'unknown_plan'))
    ).rejects.toThrow(`Unknown price ID: ${THROWAWAY_PRICE_ID}`);
  });

  test('throws when plan_key resolves a base price ID but that ID is still unknown', async () => {
    MockedGetPlanForPriceId.mockReturnValue(null); // both calls return null
    MockedGetBasePriceIdByPlanKey.mockReturnValue(BASE_PRICE_ID);

    await expect(
      syncSubscriptionFromStripe('user_123', makeSubscription(THROWAWAY_PRICE_ID, 'pro'))
    ).rejects.toThrow(`Unknown price ID: ${THROWAWAY_PRICE_ID}`);
  });
});
