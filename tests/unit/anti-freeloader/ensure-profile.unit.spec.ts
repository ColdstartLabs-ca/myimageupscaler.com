import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockEq, mockUpdate, mockFrom } = vi.hoisted(() => {
  const mockEq = vi.fn().mockResolvedValue({ error: null });
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
  const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
  return { mockEq, mockUpdate, mockFrom };
});

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: mockFrom },
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: { ENV: 'test' },
}));

import {
  ensureAntiFreeloaderProfile,
  type IAntiFreeloaderProfile,
} from '@server/services/anti-freeloader.service';

function makeReq(country?: string, ip?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (country) headers['x-test-country'] = country;
  if (ip) headers['CF-Connecting-IP'] = ip;
  return new NextRequest('http://localhost/api/upscale', { method: 'POST', headers });
}

function makeProfile(overrides: Partial<IAntiFreeloaderProfile> = {}): IAntiFreeloaderProfile {
  return {
    region_tier: null,
    subscription_tier: null,
    subscription_credits_balance: 0,
    purchased_credits_balance: 0,
    is_flagged_freeloader: false,
    signup_country: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEq.mockResolvedValue({ error: null });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ update: mockUpdate });
});

describe('ensureAntiFreeloaderProfile', () => {
  it('persists only region metadata and never a raw IP or credit balance', async () => {
    await ensureAntiFreeloaderProfile(makeReq('US', '203.0.113.42'), 'uid-1', makeProfile());

    expect(mockUpdate).toHaveBeenCalledWith({ region_tier: 'standard', signup_country: 'US' });
    expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty('signup_ip');
    expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty('subscription_credits_balance');
  });

  it('derives region metadata without writes on a processing path', async () => {
    const result = await ensureAntiFreeloaderProfile(
      makeReq('BR', '203.0.113.42'),
      'uid-2',
      makeProfile(),
      { persist: false }
    );

    expect(result).toMatchObject({ region_tier: 'restricted', signup_country: 'BR' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not rewrite an already classified profile', async () => {
    await ensureAntiFreeloaderProfile(
      makeReq('US'),
      'uid-3',
      makeProfile({ region_tier: 'standard', signup_country: 'US' })
    );

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('throws when profile metadata cannot be persisted', async () => {
    mockEq.mockResolvedValue({ error: { message: 'db error' } });

    await expect(
      ensureAntiFreeloaderProfile(makeReq('US'), 'uid-4', makeProfile())
    ).rejects.toThrow('Failed to update anti-freeloader profile');
  });
});
