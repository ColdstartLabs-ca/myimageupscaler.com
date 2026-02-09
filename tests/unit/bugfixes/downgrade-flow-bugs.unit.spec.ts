// Import dayjs mock BEFORE any other imports
import './dayjs-mock.setup';

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../../app/api/webhooks/stripe/route';
import { supabaseAdmin } from '../../../server/supabase/supabaseAdmin';
import {
  getPlanByPriceId,
  resolvePlanOrPack,
  assertKnownPriceId,
  calculateBalanceWithExpiration,
} from '../../../shared/config/subscription.utils';

// Mock dependencies
vi.mock('@server/stripe', () => ({
  stripe: {
    webhooks: {
      constructEventAsync: vi.fn(),
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
    subscriptionSchedules: {
      release: vi.fn(),
    },
  },
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
}));

vi.mock('@shared/config/stripe', () => ({
  getPlanForPriceId: vi.fn((priceId: string) => {
    const plans: Record<
      string,
      { name: string; key: string; creditsPerMonth: number; creditsPerCycle?: number }
    > = {
      price_starter_monthly: {
        name: 'Starter',
        key: 'starter',
        creditsPerMonth: 100,
        creditsPerCycle: 100,
      },
      price_hobby_monthly: {
        name: 'Hobby',
        key: 'hobby',
        creditsPerMonth: 200,
        creditsPerCycle: 200,
      },
      price_pro_monthly: {
        name: 'Professional',
        key: 'pro',
        creditsPerMonth: 1000,
        creditsPerCycle: 1000,
      },
      price_business_monthly: {
        name: 'Business',
        key: 'business',
        creditsPerMonth: 5000,
        creditsPerCycle: 5000,
      },
    };
    return plans[priceId] || null;
  }),
  assertKnownPriceId: vi.fn((priceId: string) => {
    const plans: Record<string, object> = {
      price_starter_monthly: {
        type: 'plan',
        key: 'starter',
        name: 'Starter',
        stripePriceId: priceId,
        priceInCents: 499,
        currency: 'usd',
        credits: 100,
        maxRollover: 600,
        creditsPerMonth: 100,
        creditsPerCycle: 100,
      },
      price_business_monthly: {
        type: 'plan',
        key: 'business',
        name: 'Business',
        stripePriceId: priceId,
        priceInCents: 4999,
        currency: 'usd',
        credits: 5000,
        maxRollover: 30000,
        creditsPerMonth: 5000,
        creditsPerCycle: 5000,
      },
    };
    if (!plans[priceId]) throw new Error(`Unknown price ID: ${priceId}`);
    return plans[priceId];
  }),
  resolvePlanOrPack: vi.fn((priceId: string) => {
    const plans: Record<string, object> = {
      price_starter_monthly: {
        type: 'plan',
        name: 'Starter',
        key: 'starter',
        creditsPerCycle: 100,
        maxRollover: 600,
      },
      price_business_monthly: {
        type: 'plan',
        name: 'Business',
        key: 'business',
        creditsPerCycle: 5000,
        maxRollover: 30000,
      },
    };
    return plans[priceId] || null;
  }),
}));

// Helper to create a webhook_events mock that allows events through (for idempotency)
const getWebhookEventsMock = () => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve({ data: null })), // Event doesn't exist, allow through
    })),
  })),
  insert: vi.fn(() => Promise.resolve({ error: null })), // Claim succeeds
  update: vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ error: null })), // Update succeeds
  })),
});

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
    from: vi.fn((table: string) => {
      if (table === 'webhook_events') {
        return getWebhookEventsMock();
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null })),
            single: vi.fn(() => Promise.resolve({ data: null })),
          })),
        })),
        upsert: vi.fn(() => Promise.resolve({ error: null })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
        insert: vi.fn(() => Promise.resolve({ error: null })),
      };
    }),
  },
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    STRIPE_SECRET_KEY: 'sk_test_dummy_key',
    ENV: 'test',
  },
  clientEnv: new Proxy({} as Record<string, string>, {
    get(_, prop) {
      const defaults: Record<string, string> = {
        NEXT_PUBLIC_STRIPE_PRICE_STARTER: 'price_starter_monthly',
        NEXT_PUBLIC_STRIPE_PRICE_HOBBY: 'price_hobby_monthly',
        NEXT_PUBLIC_STRIPE_PRICE_PRO: 'price_pro_monthly',
        NEXT_PUBLIC_STRIPE_PRICE_BUSINESS: 'price_business_monthly',
        NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL: 'price_credits_small',
        NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM: 'price_credits_medium',
        NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LARGE: 'price_credits_large',
      };
      return defaults[prop as string] ?? '';
    },
  }),
  isTest: vi.fn(() => true),
  isDevelopment: vi.fn(() => false),
}));

vi.mock('@shared/config/subscription.utils', () => ({
  getPlanByPriceId: vi.fn(() => null),
  resolvePlanOrPack: vi.fn(),
  assertKnownPriceId: vi.fn(),
  calculateBalanceWithExpiration: vi.fn(
    (params: { currentBalance: number; newCredits: number }) => ({
      newBalance: params.currentBalance + params.newCredits,
      expiredAmount: 0,
    })
  ),
}));

vi.mock('@shared/config/subscription.config', () => ({
  getTrialConfig: vi.fn(() => ({
    enabled: false,
    trialCredits: null,
  })),
  getPlanConfig: vi.fn(() => null),
}));

vi.mock('@server/services/SubscriptionCredits', () => ({
  SubscriptionCreditsService: {
    calculateUpgradeCredits: vi.fn(() => ({
      creditsToAdd: 0,
      isLegitimate: true,
      reason: 'test',
    })),
    getExplanation: vi.fn(() => 'test explanation'),
  },
}));

vi.mock('@server/services/email.service', () => ({
  getEmailService: vi.fn(() => ({
    send: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: vi.fn(),
}));

describe('Bug Fix: Double credit grant when scheduled downgrade completes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('handleSubscriptionScheduleCompleted should NOT directly set subscription_credits_balance', async () => {
    // Arrange: simulate subscription_schedule.completed event
    const scheduleData = {
      id: 'sub_sched_123',
      subscription: 'sub_business_to_starter',
      phases: [
        { items: [{ price: 'price_business_monthly' }] },
        { items: [{ price: 'price_starter_monthly' }] },
      ],
    };

    const event = {
      type: 'subscription_schedule.completed',
      data: { object: scheduleData },
    };

    const request = new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: {
        'stripe-signature': 'test_signature',
        'content-type': 'application/json',
      },
    });

    // Track all supabase update calls to verify no direct credit balance writes
    const updateCalls: Array<{ table: string; data: Record<string, unknown> }> = [];

    const mockUpdateEq = vi.fn(() => Promise.resolve({ error: null }));

    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'webhook_events') {
        return getWebhookEventsMock();
      }
      if (table === 'subscriptions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({
                  data: {
                    id: 'sub_business_to_starter',
                    user_id: 'user_123',
                    scheduled_price_id: 'price_starter_monthly',
                    price_id: 'price_business_monthly',
                  },
                })
              ),
            })),
          })),
          update: (data: Record<string, unknown>) => {
            updateCalls.push({ table: 'subscriptions', data });
            return { eq: mockUpdateEq };
          },
        };
      }
      if (table === 'profiles') {
        return {
          update: (data: Record<string, unknown>) => {
            updateCalls.push({ table: 'profiles', data });
            return { eq: mockUpdateEq };
          },
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null })),
          })),
        })),
      };
    });

    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(200);

    // Verify: NO profile update should contain subscription_credits_balance
    const profileUpdates = updateCalls.filter(c => c.table === 'profiles');
    for (const update of profileUpdates) {
      expect(update.data).not.toHaveProperty('subscription_credits_balance');
    }

    // Verify: subscription_tier IS updated
    const tierUpdate = profileUpdates.find(c => c.data.subscription_tier);
    expect(tierUpdate).toBeDefined();
    expect(tierUpdate!.data.subscription_tier).toBe('starter');

    // Verify: add_subscription_credits RPC is NOT called with actual credits
    // (it was previously called with amount: 0 for logging, now it should not be called at all)
    const rpcCalls = (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mock.calls as Array<
      [string, Record<string, unknown>]
    >;
    const creditAddCalls = rpcCalls.filter(
      ([name, args]) =>
        name === 'add_subscription_credits' && typeof args?.amount === 'number' && args.amount > 0
    );
    expect(creditAddCalls).toHaveLength(0);
  });

  test('invoice.payment_succeeded should be the sole credit allocator after schedule completes', async () => {
    // Arrange: simulate invoice.payment_succeeded that follows a schedule completion
    const invoiceData = {
      id: 'in_after_schedule',
      customer: 'cus_downgraded',
      subscription: 'sub_business_to_starter',
      paid: true,
      status: 'paid',
      lines: {
        data: [
          {
            type: 'subscription',
            price: { id: 'price_starter_monthly' },
          },
        ],
      },
    };

    const event = {
      type: 'invoice.payment_succeeded',
      data: { object: invoiceData },
    };

    const request = new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: {
        'stripe-signature': 'test_signature',
        'content-type': 'application/json',
      },
    });

    // Mock assertKnownPriceId for subscription.utils version
    vi.mocked(assertKnownPriceId).mockImplementation((priceId: string) => {
      if (priceId === 'price_starter_monthly') {
        return {
          type: 'plan',
          key: 'starter',
          name: 'Starter',
          stripePriceId: priceId,
          priceInCents: 499,
          currency: 'usd',
          credits: 100,
          maxRollover: 600,
        };
      }
      throw new Error(`Unknown: ${priceId}`);
    });
    vi.mocked(resolvePlanOrPack).mockImplementation((priceId: string) => {
      if (priceId === 'price_starter_monthly') {
        return { type: 'plan', name: 'Starter', creditsPerCycle: 100, maxRollover: 600 };
      }
      return null;
    });
    vi.mocked(getPlanByPriceId).mockImplementation((priceId: string) => {
      if (priceId === 'price_starter_monthly') {
        return { key: 'starter', name: 'Starter', creditsPerMonth: 100, maxRollover: 600 };
      }
      return null;
    });
    vi.mocked(calculateBalanceWithExpiration).mockReturnValue({
      newBalance: 100,
      expiredAmount: 0,
    });

    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'webhook_events') {
        return getWebhookEventsMock();
      }
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({
                  data: {
                    id: 'user_123',
                    subscription_credits_balance: 0,
                    purchased_credits_balance: 0,
                  },
                })
              ),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null })),
          })),
        })),
      };
    });

    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(200);

    // Verify: add_subscription_credits IS called with the correct (Starter) credit amount
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('add_subscription_credits', {
      target_user_id: 'user_123',
      amount: 100, // Starter tier = 100, NOT 200 (double)
      ref_id: 'invoice_in_after_schedule',
      description: expect.stringContaining('Starter'),
    });

    // Verify: credits are added exactly ONCE
    const allRpcCalls = (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mock.calls as Array<
      [string, Record<string, unknown>]
    >;
    const addCreditCalls = allRpcCalls.filter(([name]) => name === 'add_subscription_credits');
    expect(addCreditCalls).toHaveLength(1);
  });
});

describe('Bug Fix: Orphaned Stripe schedule when user upgrades after scheduling a downgrade', () => {
  /**
   * These tests verify the source code structure rather than running the full
   * API route (which requires extensive Stripe API mocking). The upgrade path
   * must release any existing Stripe subscription schedule before applying the
   * upgrade, to prevent the scheduled downgrade from firing later.
   */

  test('upgrade path releases existing Stripe schedule before updating subscription', () => {
    // Read the actual source to verify the schedule release is present

    const fs = require('fs');
    const routeSource = fs.readFileSync('app/api/subscription/change/route.ts', 'utf-8');

    // Split at the UPGRADE comment - schedule release should be BEFORE subscriptions.update
    const afterUpgradeComment = routeSource.split(
      '// UPGRADE: Release any existing Stripe schedule'
    )[1];
    expect(afterUpgradeComment).toBeDefined();

    // The schedule release should come before the subscription update call
    const releaseIdx = afterUpgradeComment.indexOf('subscriptionSchedules.release');
    const updateIdx = afterUpgradeComment.indexOf('stripe.subscriptions.update');
    expect(releaseIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(releaseIdx).toBeLessThan(updateIdx);
  });

  test('upgrade path handles schedule release failure gracefully', () => {
    const fs = require('fs');
    const routeSource = fs.readFileSync('app/api/subscription/change/route.ts', 'utf-8');

    // The schedule release in the upgrade path should be wrapped in try/catch
    const upgradeSection = routeSource.split('// UPGRADE: Release any existing Stripe schedule')[1];
    expect(upgradeSection).toBeDefined();

    // Should have catch block with warning log before the subscriptions.update call
    const beforeUpdate = upgradeSection.split('stripe.subscriptions.update')[0];
    expect(beforeUpdate).toContain('catch');
    expect(beforeUpdate).toContain('PLAN_CHANGE_UPGRADE_SCHEDULE_RELEASE_FAILED');
  });

  test('both downgrade and upgrade paths release schedules consistently', () => {
    const fs = require('fs');
    const routeSource = fs.readFileSync('app/api/subscription/change/route.ts', 'utf-8');

    // Count occurrences of subscriptionSchedules.release in the route
    const releaseMatches = routeSource.match(/subscriptionSchedules\.release/g);
    // Should appear in BOTH the downgrade path AND the upgrade path
    expect(releaseMatches).not.toBeNull();
    expect(releaseMatches!.length).toBeGreaterThanOrEqual(2);
  });
});
