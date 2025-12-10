import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../../app/api/webhooks/stripe/route';
import { supabaseAdmin } from '../../../server/supabase/supabaseAdmin';
import { stripe } from '../../../server/stripe';
import { getPlanForPriceId } from '@shared/config/stripe';
import { getPlanConfig, getTrialConfig } from '@shared/config/subscription.config';
import {
  getPlanByPriceId,
  calculateBalanceWithExpiration,
} from '@shared/config/subscription.utils';

// Mock webhook secret that can be changed per test
let mockWebhookSecret = 'whsec_test_secret';

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
  get STRIPE_WEBHOOK_SECRET() {
    return mockWebhookSecret;
  },
}));

vi.mock('@shared/config/stripe', () => ({
  getPlanForPriceId: vi.fn(),
  assertKnownPriceId: vi.fn((priceId: string) => ({
    type: 'plan',
    key: 'hobby',
    name: 'Hobby',
    stripePriceId: priceId,
    priceInCents: 1900,
    currency: 'usd',
    credits: 200,
    maxRollover: 1200,
    creditsPerMonth: 200,
    creditsPerCycle: 200,
  })),
  resolvePriceId: vi.fn((priceId: string) => ({
    type: 'plan',
    key: 'hobby',
    name: 'Hobby',
    stripePriceId: priceId,
    priceInCents: 1900,
    currency: 'usd',
    credits: 200,
    maxRollover: 1200,
    creditsPerMonth: 200,
    creditsPerCycle: 200,
  })),
  resolvePlanOrPack: vi.fn((priceId: string) => ({
    type: 'plan',
    key: 'hobby',
    name: 'Hobby',
    stripePriceId: priceId,
    priceInCents: 1900,
    currency: 'usd',
    credits: 200,
    maxRollover: 1200,
    creditsPerMonth: 200,
    creditsPerCycle: 200,
  })),
}));

vi.mock('@shared/config/subscription.config', () => ({
  getPlanConfig: vi.fn(),
  getTrialConfig: vi.fn(),
}));

vi.mock('@shared/config/subscription.utils', () => ({
  getPlanByPriceId: vi.fn(),
  calculateBalanceWithExpiration: vi.fn(),
}));

vi.mock('@server/services/SubscriptionCredits', () => ({
  SubscriptionCreditsService: {
    calculateUpgradeCredits: vi.fn(() => ({
      creditsToAdd: 100,
      reason: 'Upgrade eligible',
      isLegitimate: true,
    })),
    getExplanation: vi.fn(() => 'Mock explanation'),
  },
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
      // Handle webhook_events for idempotency check
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

// Use a factory function to allow test-specific overrides
let mockEnv = {
  STRIPE_SECRET_KEY: 'sk_test_dummy_key',
  ENV: 'test',
};

vi.mock('@shared/config/env', () => ({
  serverEnv: new Proxy({} as Record<string, string>, {
    get(_, prop) {
      return mockEnv[prop as keyof typeof mockEnv];
    },
  }),
}));

describe('Stripe Webhook Handler', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock env and webhook secret to test defaults
    mockEnv = {
      STRIPE_SECRET_KEY: 'sk_test_dummy_key',
      ENV: 'test',
    };
    mockWebhookSecret = 'whsec_test_secret';
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  describe('Signature validation', () => {
    test('should reject requests without stripe-signature header', async () => {
      // Arrange
      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify({ type: 'test' }),
        headers: {
          'content-type': 'application/json',
        },
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('stripe-signature');
    });

    test('should accept valid request in test mode', async () => {
      // Arrange
      const event = {
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_123' } },
      };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Mock the RPC call for credit addition
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ error: null } as never);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.received).toBe(true);
    });

    test('should handle invalid JSON in test mode', async () => {
      // Arrange
      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: 'invalid json',
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid webhook body');
    });

    test('should verify signature in production mode', async () => {
      // Arrange - set env to production
      mockEnv.STRIPE_SECRET_KEY = 'sk_live_real_key';
      mockEnv.ENV = 'production';
      mockWebhookSecret = 'whsec_prod_real_secret';

      const event = {
        type: 'test.event',
        data: { object: { id: 'evt_test_123' } },
      };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'valid_signature',
          'content-type': 'application/json',
        },
      });

      // Mock successful signature verification
      vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue(event as never);

      // Act
      const response = await POST(request);

      // Assert
      expect(stripe.webhooks.constructEventAsync).toHaveBeenCalledWith(
        JSON.stringify(event),
        'valid_signature',
        'whsec_prod_real_secret'
      );
      expect(response.status).toBe(200);
    });

    test('should reject invalid signature in production mode', async () => {
      // Arrange - set env to production
      mockEnv.STRIPE_SECRET_KEY = 'sk_live_real_key';
      mockEnv.ENV = 'production';
      mockWebhookSecret = 'whsec_prod_real_secret';

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify({ type: 'test' }),
        headers: {
          'stripe-signature': 'invalid_signature',
          'content-type': 'application/json',
        },
      });

      // Mock failed signature verification
      vi.mocked(stripe.webhooks.constructEventAsync).mockRejectedValue(
        new Error('Invalid signature')
      );

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('signature verification failed');
    });
  });

  describe('checkout.session.completed handler', () => {
    const sessionWithCredits = {
      id: 'cs_test_credits_123',
      mode: 'payment' as const,
      metadata: {
        user_id: 'user_123',
        credits_amount: '100',
      },
      payment_status: 'paid',
      status: 'complete',
    };

    const sessionWithSubscription = {
      id: 'cs_test_sub_123',
      mode: 'subscription' as const,
      metadata: {
        user_id: 'user_456',
      },
      subscription: 'sub_test_456',
      payment_status: 'paid',
      status: 'complete',
    };

    test('should ignore one-time payment sessions (subscription-only mode)', async () => {
      // Arrange - one-time payments are no longer supported
      const event = {
        type: 'checkout.session.completed',
        data: { object: sessionWithCredits },
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
      // Should not add any credits for one-time payments
      expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
    });

    test('should handle subscription credit addition failure gracefully', async () => {
      // Arrange
      const mockPlan = {
        key: 'hobby',
        name: 'Hobby',
        creditsPerMonth: 200,
        maxRollover: 1200,
      };

      // Mock successful plan lookup
      vi.mocked(getPlanForPriceId).mockReturnValue(mockPlan);

      // Mock Stripe subscription retrieval
      vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
        items: {
          data: [
            {
              price: {
                id: 'price_test_hobby',
              },
            },
          ],
        },
      } as never);

      const event = {
        type: 'checkout.session.completed',
        data: { object: sessionWithSubscription },
      };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Mock failed credit addition
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        error: { message: 'Database error' },
      } as never);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200); // Still returns 200 as webhook was processed
      expect(consoleSpy.error).toHaveBeenCalledWith('Error adding test subscription credits:', {
        message: 'Database error',
      });
    });

    test('should skip zero credit amounts', async () => {
      // Arrange
      const sessionWithZeroCredits = {
        ...sessionWithCredits,
        metadata: {
          ...sessionWithCredits.metadata,
          credits_amount: '0',
        },
      };

      const event = {
        type: 'checkout.session.completed',
        data: { object: sessionWithZeroCredits },
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

    test('should handle subscription mode by adding initial credits', async () => {
      // Arrange
      const mockPlan = {
        key: 'pro',
        name: 'Professional',
        creditsPerMonth: 1000,
        maxRollover: 6000,
      };

      // Mock successful plan lookup for the default PRO_MONTHLY price ID
      vi.mocked(getPlanForPriceId).mockReturnValue(mockPlan);

      const event = {
        type: 'checkout.session.completed',
        data: { object: sessionWithSubscription },
      };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Mock successful credit addition
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ error: null } as never);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(getPlanForPriceId).toHaveBeenCalledWith('price_1SZmVzALMLhQocpfPyRX2W8D');
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('add_subscription_credits', {
        target_user_id: 'user_456',
        amount: 1000,
        ref_id: 'cs_test_sub_123',
        description: 'Test subscription credits - Professional plan - 1000 credits',
      });
    });

    test('should handle missing user_id in metadata', async () => {
      // Arrange
      const sessionWithoutUserId = {
        ...sessionWithCredits,
        metadata: {
          credits_amount: '100',
        },
      };

      const event = {
        type: 'checkout.session.completed',
        data: { object: sessionWithoutUserId },
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
      expect(consoleSpy.error).toHaveBeenCalledWith('No user_id in session metadata');
    });
  });

  describe('subscription event handlers', () => {
    const subscriptionData = {
      id: 'sub_test_123',
      customer: 'cus_test_123',
      status: 'active',
      items: {
        data: [
          {
            price: { id: 'price_pro_monthly' },
          },
        ],
      },
      current_period_start: 1640995200, // 2022-01-01
      current_period_end: 1643587200, // 2022-02-01
      cancel_at_period_end: false,
      canceled_at: null,
    };

    test('should handle customer.subscription.created', async () => {
      // Arrange
      const mockPlan = {
        key: 'business',
        name: 'Business',
        creditsPerMonth: 5000,
        maxRollover: 30000,
      };

      // Mock successful plan lookup
      vi.mocked(getPlanForPriceId).mockReturnValue(mockPlan);
      vi.mocked(getPlanConfig).mockReturnValue({ key: 'business', name: 'Business' });
      vi.mocked(getTrialConfig).mockReturnValue({
        enabled: false,
        trialCredits: null,
      });

      const event = {
        type: 'customer.subscription.created',
        data: { object: subscriptionData },
      };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Mock successful profile lookup and updates
      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => ({
            data: {
              id: 'user_123',
              subscription_status: 'trialing',
              subscription_credits_balance: 100,
              purchased_credits_balance: 0,
            },
          })),
          single: vi.fn(() => ({
            data: {
              id: 'user_123',
              subscription_status: 'trialing',
              subscription_credits_balance: 100,
              purchased_credits_balance: 0,
            },
          })),
        })),
      }));

      const mockUpsert = vi.fn(() => ({ error: null }));
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      }));

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'webhook_events') {
          return getWebhookEventsMock();
        } else if (table === 'profiles') {
          return { select: mockSelect, update: mockUpdate };
        } else if (table === 'subscriptions') {
          return {
            upsert: mockUpsert,
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => ({ data: null })),
              })),
            })),
          };
        }
        return {};
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(mockSelect).toHaveBeenCalledWith('id, subscription_status, subscription_credits_balance, purchased_credits_balance');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'sub_test_123',
          user_id: 'user_123',
          status: 'active',
          price_id: 'price_pro_monthly',
          cancel_at_period_end: false,
          canceled_at: null,
        })
      );
    });

    test('should handle customer.subscription.deleted', async () => {
      // Arrange
      const event = {
        type: 'customer.subscription.deleted',
        data: { object: subscriptionData },
      };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Mock successful profile lookup and updates
      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => ({
            data: { id: 'user_123' },
          })),
          single: vi.fn(() => ({
            data: { id: 'user_123' },
          })),
        })),
      }));

      const mockSubUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      }));

      const mockProfileUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      }));

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'webhook_events') {
          return getWebhookEventsMock();
        } else if (table === 'profiles') {
          return { select: mockSelect, update: mockProfileUpdate };
        } else if (table === 'subscriptions') {
          return { update: mockSubUpdate };
        }
        return {};
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(mockSubUpdate).toHaveBeenCalledWith({
        status: 'canceled',
        canceled_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
      expect(mockProfileUpdate).toHaveBeenCalledWith({
        subscription_status: 'canceled',
      });
    });

    test('should handle missing profile for subscription events', async () => {
      // Arrange
      const event = {
        type: 'customer.subscription.created',
        data: { object: subscriptionData },
      };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Mock failed profile lookup
      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => ({
            data: null,
          })),
          single: vi.fn(() => ({
            data: null,
          })),
        })),
      }));

      // Add necessary mocks for functions used in subscription handlers
      vi.mocked(getTrialConfig).mockReturnValue({ enabled: false, trialCredits: null });
      vi.mocked(getPlanForPriceId).mockReturnValue({
        type: 'plan',
        key: 'pro',
        name: 'Professional',
        creditsPerMonth: 1000,
        creditsPerCycle: 1000,
        maxRollover: 6000,
      });

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'webhook_events') {
          return getWebhookEventsMock();
        }
        return { select: mockSelect };
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(consoleSpy.error).toHaveBeenCalledWith('No profile found for customer cus_test_123');
    });

    test('should handle subscription update errors gracefully', async () => {
      // Arrange
      // Mock successful plan lookup to get past that validation
      vi.mocked(getPlanConfig).mockReturnValue({ key: 'pro', name: 'Professional' });
      vi.mocked(getTrialConfig).mockReturnValue({ enabled: false, trialCredits: null });
      vi.mocked(getPlanForPriceId).mockReturnValue({
        type: 'plan',
        key: 'pro',
        name: 'Professional',
        creditsPerMonth: 1000,
        creditsPerCycle: 1000,
        maxRollover: 6000,
      });

      const event = {
        type: 'customer.subscription.created',
        data: { object: subscriptionData },
      };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Mock successful profile lookup but failed update
      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => ({
            data: {
              id: 'user_123',
              subscription_status: 'active',
              subscription_credits_balance: 500,
              purchased_credits_balance: 0,
            },
          })),
          single: vi.fn(() => ({
            data: {
              id: 'user_123',
              subscription_status: 'active',
              subscription_credits_balance: 500,
              purchased_credits_balance: 0,
            },
          })),
        })),
      }));

      const mockUpsert = vi.fn(() => ({ error: { message: 'Database error' } }));
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      }));

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'webhook_events') {
          return getWebhookEventsMock();
        } else if (table === 'profiles') {
          return { select: mockSelect, update: mockUpdate };
        } else if (table === 'subscriptions') {
          return {
            upsert: mockUpsert,
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => ({ data: null })),
              })),
            })),
          };
        }
        return {};
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(consoleSpy.error).toHaveBeenCalledWith('Error upserting subscription:', {
        message: 'Database error',
      });
    });
  });

  describe('invoice event handlers', () => {
    test('should handle invoice.payment_succeeded and add credits in test mode', async () => {
      // Arrange
      const mockPlan = {
        key: 'pro',
        name: 'Professional',
        creditsPerMonth: 1000,
        maxRollover: 6000,
      };

      // Mock successful plan lookup - import resolvePlanOrPack
      const { resolvePlanOrPack } = await import('@shared/config/stripe');
      vi.mocked(getPlanForPriceId).mockReturnValue(mockPlan);
      vi.mocked(getPlanConfig).mockReturnValue({ key: 'pro', name: 'Professional' });
      vi.mocked(getTrialConfig).mockReturnValue({ enabled: false, trialCredits: null });
      vi.mocked(getPlanByPriceId).mockReturnValue({ creditsExpiration: { mode: 'never' } });
      vi.mocked(calculateBalanceWithExpiration).mockReturnValue({
        newBalance: 1100,
        expiredAmount: 0,
      });
      vi.mocked(resolvePlanOrPack).mockReturnValue({
        type: 'plan',
        key: 'pro',
        name: 'Professional',
        creditsPerCycle: 1000,
        maxRollover: 6000,
      });

      const customerId = 'cus_test_renewal';
      const userId = 'user_renewal_123';

      const invoiceData = {
        id: 'in_test_123',
        customer: customerId,
        subscription: 'sub_test_123',
        paid: true,
        status: 'paid',
        lines: {
          data: [
            {
              price: { id: 'price_test_pro_monthly' },
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

      // Mock profile lookup
      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => ({
            data: {
              id: userId,
              subscription_credits_balance: 100,
              purchased_credits_balance: 0,
              subscription_status: 'active',
            },
          })),
          single: vi.fn(() => ({
            data: {
              id: userId,
              subscription_credits_balance: 100,
              purchased_credits_balance: 0,
              subscription_status: 'active',
            },
          })),
        })),
      }));

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'webhook_events') {
          return getWebhookEventsMock();
        } else if (table === 'profiles') {
          return { select: mockSelect };
        }
        return {};
      });

      // Mock successful credit addition
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ error: null } as never);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      // Now we add credits on subscription renewal (this was the bug fix!)
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('add_subscription_credits', {
        target_user_id: userId,
        amount: 1000, // Professional tier credits
        ref_id: 'invoice_in_test_123',
        description: 'Monthly subscription renewal - Professional plan',
      });
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('Added'));
      expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    });

    test('should handle invoice.payment_failed', async () => {
      // Arrange
      const invoiceData = {
        id: 'in_test_failed_123',
        customer: 'cus_test_123',
        paid: false,
        status: 'open',
      };

      const event = {
        type: 'invoice.payment_failed',
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

      // Mock successful profile lookup and update
      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => ({
            data: { id: 'user_123' },
          })),
          single: vi.fn(() => ({
            data: { id: 'user_123' },
          })),
        })),
      }));

      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      }));

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'webhook_events') {
          return getWebhookEventsMock();
        }
        return { select: mockSelect, update: mockUpdate };
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith({
        subscription_status: 'past_due',
      });
      expect(consoleSpy.log).toHaveBeenCalledWith('Marked user user_123 subscription as past_due');
    });

    test('should handle invoice.payment_failed with missing customer', async () => {
      // Arrange
      const invoiceData = {
        id: 'in_test_failed_123',
        customer: 'cus_missing_123',
        paid: false,
        status: 'open',
      };

      const event = {
        type: 'invoice.payment_failed',
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

      // Mock failed profile lookup
      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => ({
            data: null,
          })),
          single: vi.fn(() => ({
            data: null,
          })),
        })),
      }));

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'webhook_events') {
          return getWebhookEventsMock();
        }
        return { select: mockSelect };
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'No profile found for customer cus_missing_123'
      );
    });

    test('should skip invoice.payment_succeeded without subscription', async () => {
      // Arrange
      const invoiceData = {
        id: 'in_test_no_sub_123',
        customer: 'cus_test_123',
        subscription: null,
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
      expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    });
  });

  describe('unhandled events', () => {
    test('should log unhandled event types', async () => {
      // Arrange
      const event = {
        type: 'account.updated',
        data: { object: { id: 'acct_test_123' } },
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
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        'UNHANDLED WEBHOOK TYPE: account.updated - this may require code update'
      );
    });
  });

  describe('error handling', () => {
    test('should handle general errors in webhook processing', async () => {
      // Arrange
      // Create a request that will cause an error during processing
      const event = {
        type: 'checkout.session.completed',
        data: { object: null }, // This should cause an error
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
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBeTruthy();
    });
  });
});
