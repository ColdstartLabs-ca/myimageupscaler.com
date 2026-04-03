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

vi.mock('@server/analytics', () => ({
  trackServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: { AMPLITUDE_API_KEY: 'test-key' },
}));

import { POST } from '../../../app/api/account/delete/route';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;

function makeRequest(userId?: string) {
  const headers: Record<string, string> = {};
  if (userId) headers['X-User-Id'] = userId;
  return new NextRequest('http://localhost/api/account/delete', {
    method: 'POST',
    headers,
  });
}

/**
 * Build a mock that handles the route's actual Supabase query patterns:
 * - profiles: .select(...).eq('id', userId).single()
 * - subscriptions: .select('status').eq('user_id', userId).maybeSingle()
 * - credit_transactions: .select('amount').eq('user_id', userId) -> returns array
 * - deletes: .delete().eq(column, userId)
 */
function setupMockFrom(opts: { stripeCustomerId?: string | null; createdAt?: string }) {
  const { stripeCustomerId = null, createdAt = '2025-01-01' } = opts;
  const callOrder: string[] = [];

  mockFrom.mockImplementation((table: string) => {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data:
              table === 'profiles'
                ? { stripe_customer_id: stripeCustomerId, created_at: createdAt }
                : null,
            error: null,
          }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
          // credit_transactions returns an array (no single/maybeSingle)
          then: (resolve: (val: unknown) => void) => resolve({ data: [], error: null }),
          [Symbol.toStringTag]: 'Promise',
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockImplementation(() => {
          callOrder.push(table);
          return Promise.resolve({ error: null });
        }),
      }),
    };
  });

  return { callOrder };
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
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data:
                table === 'profiles'
                  ? { stripe_customer_id: null, created_at: '2025-01-01' }
                  : null,
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
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
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data:
                table === 'profiles'
                  ? { stripe_customer_id: customerId, created_at: '2025-01-01' }
                  : null,
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    });

    (supabaseAdmin.auth.admin.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: null,
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
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data:
                table === 'profiles'
                  ? { stripe_customer_id: null, created_at: '2025-01-01' }
                  : null,
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(() => {
            callOrder.push(table);
            return Promise.resolve({ error: null });
          }),
        }),
      };
    });

    (supabaseAdmin.auth.admin.deleteUser as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('auth.users');
      return Promise.resolve({ error: null });
    });

    await POST(makeRequest(userId));

    // The route uses Promise.allSettled for credit_transactions, subscriptions, email_preferences
    // so they run in parallel before profiles. Then profiles before auth.users.
    expect(callOrder).toContain('credit_transactions');
    expect(callOrder).toContain('subscriptions');
    expect(callOrder).toContain('email_preferences');
    expect(callOrder).toContain('profiles');
    expect(callOrder).toContain('auth.users');
    // profiles deleted before auth user
    expect(callOrder.indexOf('profiles')).toBeLessThan(callOrder.indexOf('auth.users'));
  });
});
