import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../../app/api/webhooks/stripe/route';
import { supabaseAdmin } from '../../../server/supabase/supabaseAdmin';
import { stripe } from '../../../server/stripe';
import { getPlanForPriceId } from '@shared/config/stripe';

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
}));

describe('Bug Fix: Billing Credit Renewal on invoice.payment_succeeded', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock plan lookup for different price IDs
    (getPlanForPriceId as any).mockImplementation((priceId: string) => {
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

    // Mock profile lookup
    const mockSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => ({
          data: { id: userId, credits_balance: 50 },
        })),
      })),
    }));

    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: mockSelect };
      }
      return {};
    });

    // Mock successful credit addition
    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('increment_credits_with_log', {
      target_user_id: userId,
      amount: 200, // Hobby tier credits
      transaction_type: 'subscription',
      ref_id: invoiceId,
      description: 'Monthly subscription renewal - Hobby plan - 200 credits',
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

    // Mock profile lookup
    const mockSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => ({
          data: { id: userId, credits_balance: 100 },
        })),
      })),
    }));

    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: mockSelect };
      }
      return {};
    });

    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('increment_credits_with_log', {
      target_user_id: userId,
      amount: 1000, // Pro tier credits
      transaction_type: 'subscription',
      ref_id: invoiceId,
      description: 'Monthly subscription renewal - Professional plan - 1000 credits',
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

    // Mock profile lookup
    const mockSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => ({
          data: { id: userId, credits_balance: 500 },
        })),
      })),
    }));

    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: mockSelect };
      }
      return {};
    });

    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('increment_credits_with_log', {
      target_user_id: userId,
      amount: 5000, // Business tier credits
      transaction_type: 'subscription',
      ref_id: invoiceId,
      description: 'Monthly subscription renewal - Business plan - 5000 credits',
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
    const mockSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => ({
          data: null,
        })),
      })),
    }));

    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'profiles') {
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
