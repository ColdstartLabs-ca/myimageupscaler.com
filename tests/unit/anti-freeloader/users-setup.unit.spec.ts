import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock supabaseAdmin before importing the route.
// vi.mock is hoisted, so factory must not reference top-level let/const variables.
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

// Mock serverEnv — use 'test' so x-test-country header is allowed
vi.mock('@shared/config/env', () => ({
  serverEnv: { ENV: 'test' },
  clientEnv: { SUPABASE_URL: 'https://example.supabase.co' },
}));

// Mock logger
vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Import AFTER mocks are registered
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

/** Returns a created_at timestamp from N minutes ago */
function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString();
}

describe('POST /api/users/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-setup default mock behavior after each clear
    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;
    const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;

    rpcMock.mockResolvedValue({ error: null });

    fromMock.mockImplementation((table: string) => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { region_tier: null, subscription_tier: 'free', created_at: minutesAgo(1) },
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

  it('should return 401 when no X-User-Id header', async () => {
    const req = makeRequest({ userId: null });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('should be idempotent — return alreadySetup: true if region_tier already set', async () => {
    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        const mockSingle = vi.fn().mockResolvedValue({
          data: { region_tier: 'standard', subscription_tier: 'free', created_at: minutesAgo(1) },
          error: null,
        });
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockSingle })) })),
          update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
        };
      }
      return {};
    });

    const req = makeRequest({ userId: 'user-123' });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.alreadySetup).toBe(true);
  });

  it('should set region_tier to standard for US', async () => {
    const req = makeRequest({ userId: 'user-123', country: 'US' });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.alreadySetup).toBeUndefined();
  });

  it('should set region_tier to restricted for PH', async () => {
    const req = makeRequest({ userId: 'user-456', country: 'PH' });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('should set credits to 3 for restricted new free user (PH)', async () => {
    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;
    let capturedPayload: Record<string, unknown> | null = null;

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        const mockSingle = vi.fn().mockResolvedValue({
          // New user (created 1 minute ago) — should get credits reduced
          data: { region_tier: null, subscription_tier: 'free', created_at: minutesAgo(1) },
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

    const req = makeRequest({ userId: 'user-456', country: 'PH' });
    await POST(req);

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload?.region_tier).toBe('restricted');
    expect(capturedPayload?.subscription_credits_balance).toBe(3);
  });

  it('should NOT reduce credits for grandfathered existing user (PH)', async () => {
    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;
    let capturedPayload: Record<string, unknown> | null = null;

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        const mockSingle = vi.fn().mockResolvedValue({
          // Existing user (created 1 hour ago) — should be grandfathered
          data: { region_tier: null, subscription_tier: 'free', created_at: minutesAgo(60) },
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

    const req = makeRequest({ userId: 'old-user-789', country: 'PH' });
    await POST(req);

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload?.region_tier).toBe('restricted');
    // Credits should NOT be reduced — user is grandfathered
    expect(capturedPayload?.subscription_credits_balance).toBeUndefined();
  });

  it('should not adjust credits for standard region user (US)', async () => {
    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;
    let capturedPayload: Record<string, unknown> | null = null;

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        const mockSingle = vi.fn().mockResolvedValue({
          data: { region_tier: null, subscription_tier: 'free', created_at: minutesAgo(1) },
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

    const req = makeRequest({ userId: 'user-789', country: 'US' });
    await POST(req);

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload?.region_tier).toBe('standard');
    expect(capturedPayload?.subscription_credits_balance).toBeUndefined();
  });

  it('should register fingerprint when fingerprintHash is provided', async () => {
    const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;
    rpcMock.mockResolvedValue({ error: null });

    const req = makeRequest({
      userId: 'user-123',
      country: 'US',
      body: { fingerprintHash: 'abc123hash' },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('register_fingerprint', {
      p_user_id: 'user-123',
      p_hash: 'abc123hash',
    });
  });

  it('should succeed even when fingerprintHash is absent', async () => {
    const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;

    const req = makeRequest({ userId: 'user-123', country: 'US', body: {} });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('should return 500 when profile update fails', async () => {
    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        const mockSingle = vi.fn().mockResolvedValue({
          data: { region_tier: null, subscription_tier: 'free', created_at: minutesAgo(1) },
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

    const req = makeRequest({ userId: 'user-123', country: 'US' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to update profile');
  });

  describe('IP check RPC', () => {
    it('should call check_signup_ip RPC when IP is provided', async () => {
      const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;
      rpcMock.mockResolvedValue({ error: null });

      const req = makeRequest({
        userId: 'user-123',
        country: 'US',
        ip: '203.0.113.42',
        body: { fingerprintHash: 'abc123hash' },
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(rpcMock).toHaveBeenCalledWith('check_signup_ip', {
        p_user_id: 'user-123',
        p_ip: '203.0.113.42',
      });
    });

    it('should not call check_signup_ip when IP is missing', async () => {
      const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;

      const req = makeRequest({ userId: 'user-123', country: 'US', body: {} });
      await POST(req);

      // Should not have called with 'check_signup_ip'
      const calls = rpcMock.mock.calls;
      const ipCheckCalls = calls.filter(call => call[0] === 'check_signup_ip');
      expect(ipCheckCalls.length).toBe(0);
    });

    it('should log error but not fail when check_signup_ip RPC fails', async () => {
      const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;
      rpcMock.mockResolvedValue({ error: { message: 'RPC failed' } });

      const req = makeRequest({
        userId: 'user-123',
        country: 'US',
        ip: '203.0.113.42',
      });
      const res = await POST(req);
      const body = await res.json();

      // Should still succeed (best-effort)
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe('Paywalled tier handling', () => {
    afterEach(() => {
      // Clean up any countries added to paywall set
      PAYWALLED_COUNTRIES.clear();
    });

    it('should set credits to 0 for paywalled new free user', async () => {
      const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;
      let capturedPayload: Record<string, unknown> | null = null;

      fromMock.mockImplementation((table: string) => {
        if (table === 'profiles') {
          const mockSingle = vi.fn().mockResolvedValue({
            data: { region_tier: null, subscription_tier: 'free', created_at: minutesAgo(1) },
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

      // Add a test country to the paywall set
      PAYWALLED_COUNTRIES.add('XX');

      const req = makeRequest({ userId: 'user-999', country: 'XX' });
      await POST(req);

      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload?.region_tier).toBe('paywalled');
      expect(capturedPayload?.subscription_credits_balance).toBe(0);
    });

    it('should NOT reduce credits for grandfathered paywalled user', async () => {
      const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>;
      let capturedPayload: Record<string, unknown> | null = null;

      fromMock.mockImplementation((table: string) => {
        if (table === 'profiles') {
          const mockSingle = vi.fn().mockResolvedValue({
            // Existing user (created 1 hour ago) — should be grandfathered
            data: { region_tier: null, subscription_tier: 'free', created_at: minutesAgo(60) },
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

      // Add a test country to the paywall set
      PAYWALLED_COUNTRIES.add('XX');

      const req = makeRequest({ userId: 'old-paywalled-user', country: 'XX' });
      await POST(req);

      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload?.region_tier).toBe('paywalled');
      // Credits should NOT be set — user is grandfathered
      expect(capturedPayload?.subscription_credits_balance).toBeUndefined();
    });
  });
});
