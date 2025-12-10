import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../../app/api/webhooks/stripe/route';
import { supabaseAdmin } from '../../../server/supabase/supabaseAdmin';
import { getPlanForPriceId, resolvePlanOrPack, assertKnownPriceId } from '@shared/config/stripe';

// Mock dependencies
vi.mock('@server/stripe', () => ({
  stripe: {
    webhooks: {
      constructEventAsync: vi.fn(),
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
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
    eq: vi.fn().mockResolvedValue({ error: null }), // Update succeeds
  })),
});

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
    from: vi.fn((table: string) => {
      if (table === 'webhook_events') {
        return getWebhookEventsMock();
      }
      // Default mock for other tables
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
}));

vi.mock('@shared/config/stripe', () => ({
  STRIPE_PRICES: {
    HOBBY_MONTHLY: 'price_hobby_monthly',
    PRO_MONTHLY: 'price_pro_monthly',
    BUSINESS_MONTHLY: 'price_business_monthly',
  },
  SUBSCRIPTION_PLANS: {
    HOBBY_MONTHLY: { creditsPerMonth: 200 },
    PRO_MONTHLY: { creditsPerMonth: 1000 },
    BUSINESS_MONTHLY: { creditsPerMonth: 5000 },
  },
  getPlanForPriceId: vi.fn(),
  resolvePlanOrPack: vi.fn(),
  assertKnownPriceId: vi.fn(),
}));

vi.mock('@shared/config/subscription.utils', () => ({
  calculateBalanceWithExpiration: vi.fn((params) => {
    // Return the new balance as current balance + new credits (no expiration)
    const { currentBalance, newCredits } = params;
    return {
      newBalance: currentBalance + newCredits,
      expiredAmount: 0,
    };
  }),
}));

vi.mock('@shared/config/subscription.config', () => ({
  getTrialConfig: vi.fn(() => ({
    enabled: false,
    trialCredits: null,
  })),
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

vi.mock('dayjs', () => ({
  default: vi.fn(() => ({
    unix: vi.fn(() => 1640995200), // Mock timestamp
    toISOString: vi.fn(() => '2022-01-01T00:00:00.000Z'),
    add: vi.fn(() => ({
      unix: vi.fn(() => 1643673600),
    })),
    diff: vi.fn(() => 30),
  })),
}));

describe('Bug Fix: Billing Credit Renewal on invoice.payment_succeeded', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock plan lookup for different price IDs
    vi.mocked(getPlanForPriceId).mockImplementation((priceId: string) => {
      if (priceId === 'price_hobby_monthly') {
        return { key: 'hobby', name: 'Hobby', creditsPerMonth: 200, maxRollover: 1200 };
      }
      if (priceId === 'price_pro_monthly') {
        return { key: 'pro', name: 'Professional', creditsPerMonth: 1000, maxRollover: 6000 };
      }
      if (priceId === 'price_business_monthly') {
        return { key: 'business', name: 'Business', creditsPerMonth: 5000, maxRollover: 30000 };
      }
      return null;
    });

    // Mock resolvePlanOrPack function
    vi.mocked(resolvePlanOrPack).mockImplementation((priceId: string) => {
      if (priceId === 'price_hobby_monthly') {
        return { type: 'plan', name: 'Hobby', creditsPerCycle: 200, maxRollover: 1200 };
      }
      if (priceId === 'price_pro_monthly') {
        return { type: 'plan', name: 'Professional', creditsPerCycle: 1000, maxRollover: 6000 };
      }
      if (priceId === 'price_business_monthly') {
        return { type: 'plan', name: 'Business', creditsPerCycle: 5000, maxRollover: 30000 };
      }
      return null;
    });

    // Mock assertKnownPriceId function
    vi.mocked(assertKnownPriceId).mockImplementation((priceId: string) => {
      if (priceId === 'price_hobby_monthly') {
        return { type: 'plan', name: 'Hobby', creditsPerCycle: 200, maxRollover: 1200 };
      }
      if (priceId === 'price_pro_monthly') {
        return { type: 'plan', name: 'Professional', creditsPerCycle: 1000, maxRollover: 6000 };
      }
      if (priceId === 'price_business_monthly') {
        return { type: 'plan', name: 'Business', creditsPerCycle: 5000, maxRollover: 30000 };
      }
      throw new Error(`Unknown price ID: ${priceId}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('should add credits on subscription renewal (hobby tier)', async () => {
    // Arrange
    const customerId = 'cus_test_hobby';
    const userId = 'user_hobby_123';
    const invoiceId = 'in_test_hobby_renewal';

    const invoiceData = {
      id: invoiceId,
      customer: customerId,
      subscription: 'sub_test_hobby',
      paid: true,
      status: 'paid',
      lines: {
        data: [
          {
            type: 'subscription',
            price: { id: 'price_hobby_monthly' },
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

    // Mock profile lookup - the webhook looks up by stripe_customer_id
    const mockEq = vi.fn(() => ({
      maybeSingle: vi.fn(() => Promise.resolve({
        data: { id: userId, subscription_credits_balance: 50, purchased_credits_balance: 0 },
      })),
      single: vi.fn(() => Promise.resolve({
        data: { id: userId, subscription_credits_balance: 50, purchased_credits_balance: 0 },
      })),
    }));
    const mockSelect = vi.fn(() => ({
      eq: mockEq,
    }));

    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'webhook_events') {
        return getWebhookEventsMock();
      } else if (table === 'profiles') {
        return { select: mockSelect };
      }
      return {};
    });

    // Mock successful RPC calls
    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockImplementation((rpcName: string) => {
      if (rpcName === 'expire_subscription_credits') {
        return Promise.resolve({ data: 0, error: null });
      }
      if (rpcName === 'add_subscription_credits') {
        return Promise.resolve({ error: null });
      }
      return Promise.resolve({ error: null });
    });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('add_subscription_credits', {
      target_user_id: userId,
      amount: 200, // Hobby tier credits
            ref_id: `invoice_${invoiceId}`,
      description: 'Monthly subscription renewal - Hobby plan',
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Added 200 subscription credits')
    );
  });

  test('should add credits on subscription renewal (pro tier)', async () => {
    // Arrange
    const customerId = 'cus_test_pro';
    const userId = 'user_pro_123';
    const invoiceId = 'in_test_pro_renewal';

    const invoiceData = {
      id: invoiceId,
      customer: customerId,
      subscription: 'sub_test_pro',
      paid: true,
      status: 'paid',
      lines: {
        data: [
          {
            type: 'subscription',
            price: { id: 'price_pro_monthly' },
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

    // Mock profile lookup - the webhook looks up by stripe_customer_id
    const mockEq = vi.fn(() => ({
      maybeSingle: vi.fn(() => Promise.resolve({
        data: { id: userId, subscription_credits_balance: 100, purchased_credits_balance: 0 },
      })),
      single: vi.fn(() => Promise.resolve({
        data: { id: userId, subscription_credits_balance: 100, purchased_credits_balance: 0 },
      })),
    }));
    const mockSelect = vi.fn(() => ({
      eq: mockEq,
    }));

    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'webhook_events') {
        return getWebhookEventsMock();
      } else if (table === 'profiles') {
        return { select: mockSelect };
      }
      return {};
    });

    // Mock successful RPC calls
    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockImplementation((rpcName: string) => {
      if (rpcName === 'expire_subscription_credits') {
        return Promise.resolve({ data: 0, error: null });
      }
      if (rpcName === 'add_subscription_credits') {
        return Promise.resolve({ error: null });
      }
      return Promise.resolve({ error: null });
    });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('add_subscription_credits', {
      target_user_id: userId,
      amount: 1000, // Pro tier credits
            ref_id: `invoice_${invoiceId}`,
      description: 'Monthly subscription renewal - Professional plan',
    });
  });

  test('should add credits on subscription renewal (business tier)', async () => {
    // Arrange
    const customerId = 'cus_test_business';
    const userId = 'user_business_123';
    const invoiceId = 'in_test_business_renewal';

    const invoiceData = {
      id: invoiceId,
      customer: customerId,
      subscription: 'sub_test_business',
      paid: true,
      status: 'paid',
      lines: {
        data: [
          {
            type: 'subscription',
            price: { id: 'price_business_monthly' },
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

    // Mock profile lookup - the webhook looks up by stripe_customer_id
    const mockEq = vi.fn(() => ({
      maybeSingle: vi.fn(() => Promise.resolve({
        data: { id: userId, subscription_credits_balance: 500, purchased_credits_balance: 0 },
      })),
      single: vi.fn(() => Promise.resolve({
        data: { id: userId, subscription_credits_balance: 500, purchased_credits_balance: 0 },
      })),
    }));
    const mockSelect = vi.fn(() => ({
      eq: mockEq,
    }));

    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'webhook_events') {
        return getWebhookEventsMock();
      } else if (table === 'profiles') {
        return { select: mockSelect };
      }
      return {};
    });

    // Mock successful RPC calls
    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockImplementation((rpcName: string) => {
      if (rpcName === 'expire_subscription_credits') {
        return Promise.resolve({ data: 0, error: null });
      }
      if (rpcName === 'add_subscription_credits') {
        return Promise.resolve({ error: null });
      }
      return Promise.resolve({ error: null });
    });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('add_subscription_credits', {
      target_user_id: userId,
      amount: 5000, // Business tier credits
            ref_id: `invoice_${invoiceId}`,
      description: 'Monthly subscription renewal - Business plan',
    });
  });

  test('should skip credit addition for non-subscription invoice', async () => {
    // Arrange
    const invoiceData = {
      id: 'in_test_no_sub',
      customer: 'cus_test',
      subscription: null, // No subscription
      paid: true,
      status: 'paid',
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

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(200);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  test('should handle missing profile gracefully', async () => {
    // Arrange
    const invoiceData = {
      id: 'in_test_no_profile',
      customer: 'cus_unknown',
      subscription: 'sub_test',
      paid: true,
      status: 'paid',
      lines: {
        data: [
          {
            type: 'subscription',
            price: { id: 'price_pro_monthly' },
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

    // Mock profile lookup returning null
    const mockEq = vi.fn(() => ({
      maybeSingle: vi.fn(() => Promise.resolve({
        data: null,
      })),
      single: vi.fn(() => Promise.resolve({
        data: null,
      })),
    }));
    const mockSelect = vi.fn(() => ({
      eq: mockEq,
    }));

    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'webhook_events') {
        return getWebhookEventsMock();
      } else if (table === 'profiles') {
        return { select: mockSelect };
      }
      return {};
    });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(200);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
});
