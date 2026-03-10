import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@server/stripe', () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@server/services/SubscriptionCredits', async importOriginal => {
  const actual = await importOriginal<typeof import('@server/services/SubscriptionCredits')>();
  return {
    ...actual,
  };
});

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    STRIPE_SECRET_KEY: 'sk_test_liveish_key',
    ENV: 'development',
  },
}));

vi.mock('@shared/config/pricing-regions', () => ({
  getBasePriceIdByPlanKey: vi.fn(() => null),
}));

vi.mock('@shared/config/stripe', () => ({
  assertKnownPriceId: vi.fn((priceId: string) => ({
    type: 'plan',
    key: priceId === 'price_pro' ? 'pro' : 'hobby',
  })),
  getPlanForPriceId: vi.fn((priceId: string) => {
    if (priceId === 'price_hobby') {
      return {
        key: 'hobby',
        name: 'Hobby',
        creditsPerMonth: 200,
      };
    }

    if (priceId === 'price_pro') {
      return {
        key: 'pro',
        name: 'Professional',
        creditsPerMonth: 1000,
      };
    }

    return null;
  }),
}));

import { POST } from '../../../app/api/subscription/change/route';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { getBasePriceIdByPlanKey } from '@shared/config/pricing-regions';

describe('POST /api/subscription/change', () => {
  const userId = 'user_upgrade_123';
  const currentSubscription = {
    id: 'sub_upgrade_123',
    user_id: userId,
    status: 'active',
    price_id: 'price_hobby',
    current_period_start: '2026-03-10T03:01:42.000Z',
    current_period_end: '2026-04-09T03:01:42.000Z',
    created_at: '2026-03-10T03:01:42.000Z',
    updated_at: '2026-03-10T03:01:42.000Z',
  };
  const profile = {
    stripe_customer_id: 'cus_upgrade_123',
    subscription_tier: 'hobby',
    subscription_credits_balance: 210,
    purchased_credits_balance: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    } as never);

    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      id: currentSubscription.id,
      billing_cycle_anchor: 1773111702,
      schedule: null,
      metadata: {},
      items: {
        data: [
          {
            id: 'si_hobby_123',
            price: {
              id: 'price_hobby',
              recurring: {
                interval: 'month',
                interval_count: 1,
              },
            },
          },
        ],
      },
    } as never);

    vi.mocked(stripe.subscriptions.update).mockResolvedValue({
      id: currentSubscription.id,
      status: 'active',
      current_period_start: 1773111702,
      current_period_end: 1775703702,
    } as never);

    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ error: null } as never);

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    single: vi.fn(() =>
                      Promise.resolve({ data: { ...currentSubscription }, error: null })
                    ),
                  })),
                })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }

      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { ...profile }, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }

      if (table === 'credit_transactions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table in test: ${table}`);
    });
  });

  test('immediately applies Hobby -> Professional credits and persists plan change', async () => {
    const request = new NextRequest('http://localhost/api/subscription/change', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test_token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targetPriceId: 'price_pro',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    expect(stripe.subscriptions.update).toHaveBeenCalledWith(currentSubscription.id, {
      items: [
        {
          id: 'si_hobby_123',
          price: 'price_pro',
        },
      ],
      metadata: {
        plan_key: 'pro',
      },
      proration_behavior: 'always_invoice',
      payment_behavior: 'error_if_incomplete',
    });

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('add_subscription_credits', {
      target_user_id: userId,
      amount: 800,
      ref_id: 'planchg_sub_upgrade_123_price_hobby_price_pro_2026-03-10T03_01_42_000Z',
      description: expect.stringContaining('Professional - 800 credits'),
    });
  });

  test('self-heals a throwaway inline Stripe price ID before upgrading', async () => {
    const badCurrentSubscription = {
      ...currentSubscription,
      price_id: 'price_inline_temp_123',
    };
    const subscriptionUpdateEqSpy = vi.fn(() => Promise.resolve({ error: null }));
    const subscriptionUpdateSpy = vi.fn(() => ({
      eq: subscriptionUpdateEqSpy,
    }));

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    single: vi.fn(() =>
                      Promise.resolve({ data: { ...badCurrentSubscription }, error: null })
                    ),
                  })),
                })),
              })),
            })),
          })),
          update: subscriptionUpdateSpy,
        };
      }

      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { ...profile }, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }

      if (table === 'credit_transactions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table in test: ${table}`);
    });

    const request = new NextRequest('http://localhost/api/subscription/change', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test_token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targetPriceId: 'price_pro',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(subscriptionUpdateSpy).toHaveBeenCalledTimes(2);
    expect(subscriptionUpdateSpy).toHaveBeenNthCalledWith(1, {
      price_id: 'price_hobby',
    });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('add_subscription_credits', {
      target_user_id: userId,
      amount: 800,
      ref_id: 'planchg_sub_upgrade_123_price_hobby_price_pro_2026-03-10T03_01_42_000Z',
      description: expect.stringContaining('Professional - 800 credits'),
    });
  });

  test('rejects immediately when target price ID matches current price ID', async () => {
    // currentSubscription.price_id is 'price_hobby' — same as the target
    const request = new NextRequest('http://localhost/api/subscription/change', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test_token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ targetPriceId: 'price_hobby' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('SAME_PLAN');
    // Stripe should never be called when the plan hasn't changed
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  test('rejects after canonicalization reveals target matches canonical current plan', async () => {
    // Simulate a subscription created with price_data (Stripe auto-generates a throwaway ID).
    // getPlanForPriceId returns null for it, so the route falls back to getBasePriceIdByPlanKey.
    // If the canonical ID matches the target, we must still reject with SAME_PLAN.
    const regionalSubscription = {
      ...currentSubscription,
      price_id: 'price_regional_generated_123',
    };

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    single: vi.fn(() =>
                      Promise.resolve({ data: { ...regionalSubscription }, error: null })
                    ),
                  })),
                })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }

      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { ...profile }, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }

      if (table === 'credit_transactions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table in test: ${table}`);
    });

    // getBasePriceIdByPlanKey('hobby') resolves the throwaway price to the canonical hobby ID
    vi.mocked(getBasePriceIdByPlanKey).mockReturnValueOnce('price_hobby');

    const request = new NextRequest('http://localhost/api/subscription/change', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test_token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ targetPriceId: 'price_hobby' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('SAME_PLAN');
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  test('returns 500 instead of swallowing local subscription update failures', async () => {
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    single: vi.fn(() =>
                      Promise.resolve({ data: { ...currentSubscription }, error: null })
                    ),
                  })),
                })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() =>
              Promise.resolve({
                error: { message: 'db write failed' },
              })
            ),
          })),
        };
      }

      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { ...profile }, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }

      if (table === 'credit_transactions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table in test: ${table}`);
    });

    const request = new NextRequest('http://localhost/api/subscription/change', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test_token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targetPriceId: 'price_pro',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error.code).toBe('STRIPE_ERROR');
    expect(data.error.message).toContain('Failed to update local subscription record');
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
});
