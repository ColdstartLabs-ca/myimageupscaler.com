import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@server/supabase/supabaseAdmin', () => {
  const mockSingle = vi.fn();
  const mockEqForSelect = vi.fn(() => ({ single: mockSingle }));
  const mockSelect = vi.fn(() => ({ eq: mockEqForSelect }));
  const mockEqForUpdate = vi.fn(() => Promise.resolve({ error: null }));
  const mockUpdate = vi.fn(() => ({ eq: mockEqForUpdate }));
  const mockRpc = vi.fn(() => Promise.resolve({ error: null }));
  const mockFrom = vi.fn((table: string) => {
    if (table === 'profiles') {
      return { select: mockSelect, update: mockUpdate };
    }
    return {};
  });

  return {
    supabaseAdmin: {
      rpc: mockRpc,
      from: mockFrom,
    },
  };
});

vi.mock('@shared/config/env', () => ({
  serverEnv: { ENV: 'test' },
  clientEnv: { SUPABASE_URL: 'https://example.supabase.co' },
}));

vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { POST } from '../../../app/api/users/setup/route';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { PAYWALLED_COUNTRIES } from '@/lib/anti-freeloader/region-classifier';

function makeRequest(
  options: {
    userId?: string | null;
    body?: Record<string, unknown>;
    country?: string;
    ip?: string;
  } = {}
): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.userId !== undefined && options.userId !== null) {
    headers['X-User-Id'] = options.userId;
  }
  if (options.country) {
    headers['x-test-country'] = options.country;
  }
  if (options.ip) {
    headers['CF-Connecting-IP'] = options.ip;
  }

  return new NextRequest('http://localhost/api/users/setup', {
    method: 'POST',
    headers,
    body: JSON.stringify(options.body ?? {}),
  });
}

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString();
}

function makeProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    region_tier: null,
    subscription_tier: null,
    subscription_credits_balance: 5,
    created_at: minutesAgo(1),
    signup_country: null,
    signup_ip: null,
    ...overrides,
  };
}

describe('POST /api/users/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;
    const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;

    rpcMock.mockResolvedValue({ error: null });

    fromMock.mockImplementation((table: string) => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: makeProfile(),
        error: null,
      });
      const mockEqForSelect = vi.fn(() => ({ single: mockSingle }));
      const mockSelect = vi.fn(() => ({ eq: mockEqForSelect }));
      const mockEqForUpdate = vi.fn(() => Promise.resolve({ error: null }));
      const mockUpdate = vi.fn(() => ({ eq: mockEqForUpdate }));

      if (table === 'profiles') {
        return { select: mockSelect, update: mockUpdate };
      }
      return {};
    });
  });

  afterEach(() => {
    PAYWALLED_COUNTRIES.clear();
  });

  it('returns 401 when no X-User-Id header', async () => {
    const req = makeRequest({ userId: null });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns alreadySetup when region_tier is already set', async () => {
    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        const mockSingle = vi.fn().mockResolvedValue({
          data: makeProfile({
            region_tier: 'standard',
            signup_country: 'US',
            signup_ip: '203.0.113.42',
          }),
          error: null,
        });
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockSingle })) })),
          update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
        };
      }
      return {};
    });

    const res = await POST(makeRequest({ userId: 'user-123' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.alreadySetup).toBe(true);
  });

  it('sets restricted tier and reduces credits for new free users', async () => {
    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;
    const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;
    let capturedPayload: Record<string, unknown> | null = null;

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        const mockSingle = vi.fn().mockResolvedValue({
          data: makeProfile(),
          error: null,
        });
        const mockUpdate = vi.fn((payload: Record<string, unknown>) => {
          capturedPayload = payload;
          return { eq: vi.fn(() => Promise.resolve({ error: null })) };
        });
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockSingle })) })),
          update: mockUpdate,
        };
      }
      return {};
    });

    await POST(makeRequest({ userId: 'user-123', country: 'IN' }));

    expect(capturedPayload?.region_tier).toBe('restricted');
    // subscription_credits_balance must NOT be in the REST update payload —
    // direct updates are blocked by the prevent_credit_update DB trigger.
    expect(capturedPayload?.subscription_credits_balance).toBeUndefined();
    // Credit reduction goes through adjust_regional_credits RPC (logs as 'clawback').
    expect(rpcMock).toHaveBeenCalledWith('adjust_regional_credits', {
      p_user_id: 'user-123',
      p_new_balance: 3, // restricted tier allows 3 free credits
      p_description: 'Regional free credit adjustment',
    });
  });

  it('claws back only the excess free credits if setup runs after some usage', async () => {
    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;
    const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        const mockSingle = vi.fn().mockResolvedValue({
          data: makeProfile({ subscription_credits_balance: 1 }),
          error: null,
        });
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockSingle })) })),
          update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
        };
      }
      return {};
    });

    await POST(makeRequest({ userId: 'user-123', country: 'IN' }));

    // User has 1 credit left; restricted tier would allow 3, but user is already below that.
    // adjustedBalance = max(0, 1 - 2) = 0. RPC sets balance to 0.
    expect(rpcMock).toHaveBeenCalledWith('adjust_regional_credits', {
      p_user_id: 'user-123',
      p_new_balance: 0,
      p_description: 'Regional free credit adjustment',
    });
  });

  it('does not reduce credits for grandfathered users', async () => {
    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;
    let capturedPayload: Record<string, unknown> | null = null;

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        const mockSingle = vi.fn().mockResolvedValue({
          data: makeProfile({ created_at: minutesAgo(60) }),
          error: null,
        });
        const mockUpdate = vi.fn((payload: Record<string, unknown>) => {
          capturedPayload = payload;
          return { eq: vi.fn(() => Promise.resolve({ error: null })) };
        });
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockSingle })) })),
          update: mockUpdate,
        };
      }
      return {};
    });

    await POST(makeRequest({ userId: 'user-123', country: 'IN' }));

    expect(capturedPayload?.region_tier).toBe('restricted');
    expect(capturedPayload?.subscription_credits_balance).toBeUndefined();
  });

  it('sets paywalled users to zero credits', async () => {
    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;
    const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;
    let capturedPayload: Record<string, unknown> | null = null;

    PAYWALLED_COUNTRIES.add('XX');

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        const mockSingle = vi.fn().mockResolvedValue({
          data: makeProfile(),
          error: null,
        });
        const mockUpdate = vi.fn((payload: Record<string, unknown>) => {
          capturedPayload = payload;
          return { eq: vi.fn(() => Promise.resolve({ error: null })) };
        });
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockSingle })) })),
          update: mockUpdate,
        };
      }
      return {};
    });

    await POST(makeRequest({ userId: 'user-123', country: 'XX' }));

    expect(capturedPayload?.region_tier).toBe('paywalled');
    expect(capturedPayload?.subscription_credits_balance).toBeUndefined();
    expect(rpcMock).toHaveBeenCalledWith('adjust_regional_credits', {
      p_user_id: 'user-123',
      p_new_balance: 0, // paywalled tier gets zero free credits
      p_description: 'Regional free credit adjustment',
    });
  });

  it('registers a fingerprint when provided', async () => {
    const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;

    const res = await POST(
      makeRequest({
        userId: 'user-123',
        country: 'US',
        body: { fingerprintHash: 'abc123hash' },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('register_fingerprint', {
      p_user_id: 'user-123',
      p_hash: 'abc123hash',
    });
  });

  it('calls check_signup_ip when IP is provided', async () => {
    const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;

    await POST(
      makeRequest({
        userId: 'user-123',
        country: 'US',
        ip: '203.0.113.42',
      })
    );

    expect(rpcMock).toHaveBeenCalledWith('check_signup_ip', {
      p_user_id: 'user-123',
      p_ip: '203.0.113.42',
    });
  });

  it('returns 500 when the profile update fails', async () => {
    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        const mockSingle = vi.fn().mockResolvedValue({
          data: makeProfile(),
          error: null,
        });
        const mockUpdate = vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: { message: 'DB error' } })),
        }));
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockSingle })) })),
          update: mockUpdate,
        };
      }
      return {};
    });

    const res = await POST(makeRequest({ userId: 'user-123', country: 'US' }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to update profile');
  });
});
