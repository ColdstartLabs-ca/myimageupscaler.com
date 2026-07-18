import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  deductCredits: vi.fn(),
  ensureProfile: vi.fn(),
  from: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({ error: vi.fn(), flush: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@server/rateLimit', () => ({ upscaleRateLimit: { limit: mocks.rateLimit } }));
vi.mock('@server/services/anti-freeloader.service', () => ({
  ensureAntiFreeloaderProfile: mocks.ensureProfile,
}));
vi.mock('@server/services/replicate/utils/credit-manager', () => ({
  creditManager: { deductCredits: mocks.deductCredits },
}));
vi.mock('@server/services/image-generation.service', () => ({
  InsufficientCreditsError: class InsufficientCreditsError extends Error {
    availableCredits?: number;

    constructor(message: string, availableCredits?: number) {
      super(message);
      this.availableCredits = availableCredits;
    }
  },
}));
vi.mock('@server/supabase/supabaseAdmin', () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock('@shared/config/env', () => ({ isProduction: () => false }));
vi.mock('@/lib/anti-freeloader/check-freeloader', () => ({ isFreeleaderBlocked: () => false }));

import { POST } from '@/app/api/bg-removal/deduct/route';
import { InsufficientCreditsError } from '@server/services/image-generation.service';

function request(): NextRequest {
  return new NextRequest('http://localhost/api/bg-removal/deduct', {
    method: 'POST',
    headers: { 'X-User-Id': 'user-1', 'CF-Connecting-IP': '203.0.113.42' },
  });
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    subscription_status: null,
    subscription_tier: null,
    subscription_credits_balance: 0,
    purchased_credits_balance: 0,
    is_flagged_freeloader: false,
    region_tier: 'standard',
    signup_country: 'CA',
    created_at: '2026-07-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('POST /api/bg-removal/deduct free limit errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: profile(), error: null }) }),
      }),
    }));
    mocks.ensureProfile.mockImplementation((_req, _userId, rawProfile) => rawProfile);
  });

  it('returns the typed free limit error at zero credits', async () => {
    const response = await POST(request());

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'FREE_LIMIT_EXCEEDED', details: { required: 1, available: 0 } },
    });
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });

  it('keeps the normal insufficient-credit error for a paid user at zero credits', async () => {
    const paidZeroProfile = profile({ subscription_status: 'active', subscription_tier: 'hobby' });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: paidZeroProfile, error: null }) }),
      }),
    }));

    const response = await POST(request());

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INSUFFICIENT_CREDITS', details: { required: 1, available: 0 } },
    });
  });

  it('keeps the normal insufficient-credit error after a paid plan ends', async () => {
    const formerPaidProfile = profile({
      subscription_status: 'canceled',
      subscription_tier: 'hobby',
    });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: formerPaidProfile, error: null }) }),
      }),
    }));

    const response = await POST(request());

    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INSUFFICIENT_CREDITS' },
    });
  });

  it('uses the atomic deduction balance when a concurrent request drains the final credit', async () => {
    const oneCreditProfile = profile({ subscription_credits_balance: 1 });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: oneCreditProfile, error: null }) }),
      }),
    }));
    mocks.deductCredits.mockRejectedValue(
      new InsufficientCreditsError('Insufficient credits. Required: 1, Available: 0', 0)
    );

    const response = await POST(request());

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'FREE_LIMIT_EXCEEDED', details: { required: 1, available: 0 } },
    });
  });
});
