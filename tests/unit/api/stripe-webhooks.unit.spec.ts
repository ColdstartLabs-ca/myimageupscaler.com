import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../../app/api/webhooks/stripe/route';
import { supabaseAdmin } from '../../../server/supabase/supabaseAdmin';
import { stripe } from '../../../server/stripe';
import { getPlanForPriceId } from '@shared/config/stripe';
import Stripe from 'stripe';

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
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      upsert: vi.fn(),
      update: vi.fn(() => ({
        eq: vi.fn(),
      })),
      insert: vi.fn(),
    })),
  },
}));

// Use a factory function to allow test-specific overrides
let mockEnv = {
  STRIPE_SECRET_KEY: 'sk_test_dummy_key',
  ENV: 'test',
};

vi.mock('@shared/config/env', () => ({
  serverEnv: new Proxy({} as any, {
    get(_, prop) {
      return mockEnv[prop as keyof typeof mockEnv];
    },
  }),
}));

describe('Stripe Webhook Handler', () => {
  let mockRequest: any;
  let consoleSpy: any;

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
      (supabaseAdmin.rpc as any).mockResolvedValue({ error: null });

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
      (stripe.webhooks.constructEventAsync as any).mockResolvedValue(event);

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
      (stripe.webhooks.constructEventAsync as any).mockRejectedValue(
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
      (getPlanForPriceId as any).mockReturnValue(mockPlan);

      // Mock Stripe subscription retrieval
      (stripe.subscriptions.retrieve as any).mockResolvedValue({
        items: {
          data: [{
            price: {
              id: 'price_test_hobby',
            },
          }],
        },
      });

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
      (supabaseAdmin.rpc as any).mockResolvedValue({
        error: { message: 'Database error' },
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200); // Still returns 200 as webhook was processed
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'Error adding test subscription credits:',
        { message: 'Database error' }
      );
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
      (getPlanForPriceId as any).mockReturnValue(mockPlan);

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
      (supabaseAdmin.rpc as any).mockResolvedValue({ error: null });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(getPlanForPriceId).toHaveBeenCalledWith('price_1SZmVzALMLhQocpfPyRX2W8D');
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('increment_credits_with_log', {
        target_user_id: 'user_456',
        amount: 1000,
        transaction_type: 'subscription',
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
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'No user_id in session metadata'
      );
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
      (getPlanForPriceId as any).mockReturnValue(mockPlan);

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
          single: vi.fn(() => ({
            data: { id: 'user_123' },
          })),
        })),
      }));

      const mockUpsert = vi.fn(() => ({ error: null }));
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      }));

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return { select: mockSelect, update: mockUpdate };
        } else if (table === 'subscriptions') {
          return { upsert: mockUpsert };
        }
        return {};
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(mockSelect).toHaveBeenCalledWith('id');
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

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'profiles') {
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
          single: vi.fn(() => ({
            data: null,
          })),
        })),
      }));

      (supabaseAdmin.from as any).mockReturnValue({
        select: mockSelect,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'No profile found for customer cus_test_123'
      );
    });

    test('should handle subscription update errors gracefully', async () => {
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

      // Mock successful profile lookup but failed update
      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: { id: 'user_123' },
          })),
        })),
      }));

      const mockUpsert = vi.fn(() => ({ error: { message: 'Database error' } }));
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      }));

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return { select: mockSelect, update: mockUpdate };
        } else if (table === 'subscriptions') {
          return { upsert: mockUpsert };
        }
        return {};
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'Error upserting subscription:',
        { message: 'Database error' }
      );
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

      // Mock successful plan lookup
      (getPlanForPriceId as any).mockReturnValue(mockPlan);

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
          single: vi.fn(() => ({
            data: { id: userId, credits_balance: 100 },
          })),
        })),
      }));

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return { select: mockSelect };
        }
        return {};
      });

      // Mock successful credit addition
      (supabaseAdmin.rpc as any).mockResolvedValue({ error: null });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      // Now we add credits on subscription renewal (this was the bug fix!)
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('increment_credits_with_log', {
        target_user_id: userId,
        amount: expect.any(Number), // Credits based on price tier
        transaction_type: 'subscription',
        ref_id: 'in_test_123',
        description: expect.stringContaining('Monthly subscription renewal'),
      });
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Added')
      );
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
          single: vi.fn(() => ({
            data: { id: 'user_123' },
          })),
        })),
      }));

      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      }));

      (supabaseAdmin.from as any).mockReturnValue({
        select: mockSelect,
        update: mockUpdate,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith({
        subscription_status: 'past_due',
      });
      expect(consoleSpy.log).toHaveBeenCalledWith(
        'Marked user user_123 subscription as past_due'
      );
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
          single: vi.fn(() => ({
            data: null,
          })),
        })),
      }));

      (supabaseAdmin.from as any).mockReturnValue({
        select: mockSelect,
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
      expect(consoleSpy.log).toHaveBeenCalledWith('Unhandled event type: account.updated');
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