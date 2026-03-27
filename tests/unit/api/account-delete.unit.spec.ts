import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@server/stripe', () => ({
  stripe: {
    subscriptions: {
      list: vi.fn(),
      cancel: vi.fn(),
    },
    customers: {
      del: vi.fn(),
    },
  },
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    auth: {
      admin: {
        deleteUser: vi.fn(),
      },
    },
  },
}));

import { POST } from '../../../app/api/account/delete/route';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;

function buildSelectChain(result: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    delete: vi.fn().mockReturnThis(),
  };
  return chain;
}

function buildDeleteChain(result: unknown = { error: null }) {
  const chain = {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

function makeRequest(userId?: string) {
  const headers: Record<string, string> = {};
  if (userId) headers['X-User-Id'] = userId;
  return new NextRequest('http://localhost/api/account/delete', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should return 401 when not authenticated', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  test('should handle user with no Stripe customer', async () => {
    const userId = 'user-no-stripe';

    mockFrom.mockImplementation((table: string) => {
      const singleResult =
        table === 'profiles'
          ? { data: { stripe_customer_id: null }, error: null }
          : { data: null, error: null };
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(singleResult),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    });

    (supabaseAdmin.auth.admin.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: null,
    });

    const res = await POST(makeRequest(userId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(stripe.subscriptions.list).not.toHaveBeenCalled();
    expect(stripe.customers.del).not.toHaveBeenCalled();
  });

  test('should cancel Stripe subscription before deleting', async () => {
    const userId = 'user-with-stripe';
    const customerId = 'cus_abc123';
    const subId = 'sub_abc123';

    (stripe.subscriptions.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: subId }],
    });
    (stripe.subscriptions.cancel as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (stripe.customers.del as ReturnType<typeof vi.fn>).mockResolvedValue({});

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation(() => ({
            single: vi
              .fn()
              .mockResolvedValue({ data: { stripe_customer_id: customerId }, error: null }),
          })),
          delete: vi.fn().mockReturnThis(),
        };
      }
      return {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    // Handle profiles.delete().eq() separately
    let profileDeleteCalled = false;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation(() => ({
            single: vi
              .fn()
              .mockResolvedValue({ data: { stripe_customer_id: customerId }, error: null }),
          })),
          delete: vi.fn().mockReturnThis(),
        };
      }
      return {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    (supabaseAdmin.auth.admin.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: null,
    });

    // Reimplement: need profiles.delete().eq() to work too
    mockFrom.mockImplementation((table: string) => {
      const eqResult = { error: null };
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(() => ({
          single: vi.fn().mockResolvedValue({
            data: table === 'profiles' ? { stripe_customer_id: customerId } : null,
            error: null,
          }),
          ...eqResult,
        })),
        delete: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const res = await POST(makeRequest(userId));

    expect(stripe.subscriptions.list).toHaveBeenCalledWith({
      customer: customerId,
      status: 'active',
    });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith(subId);
    expect(stripe.customers.del).toHaveBeenCalledWith(customerId);
  });

  test('should delete user data in correct cascade order', async () => {
    const userId = 'user-cascade';
    const callOrder: string[] = [];

    mockFrom.mockImplementation((table: string) => {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(() => ({
          single: vi.fn().mockResolvedValue({ data: { stripe_customer_id: null }, error: null }),
        })),
        delete: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => {
            callOrder.push(table);
            return Promise.resolve({ error: null });
          }),
        })),
      };
    });

    (supabaseAdmin.auth.admin.deleteUser as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('auth.users');
      return Promise.resolve({ error: null });
    });

    await POST(makeRequest(userId));

    // credit_transactions, subscriptions, email_preferences deleted before profiles
    expect(callOrder.indexOf('credit_transactions')).toBeLessThan(callOrder.indexOf('profiles'));
    expect(callOrder.indexOf('subscriptions')).toBeLessThan(callOrder.indexOf('profiles'));
    expect(callOrder.indexOf('email_preferences')).toBeLessThan(callOrder.indexOf('profiles'));
    // profiles deleted before auth user
    expect(callOrder.indexOf('profiles')).toBeLessThan(callOrder.indexOf('auth.users'));
  });
});
