/**
 * Direct unit tests for ensureAntiFreeloaderProfile.
 *
 * Proves that subscription_credits_balance NEVER appears in the REST .update()
 * payload and that credit adjustments route through adjust_regional_credits RPC
 * (which sets app.trusted_credit_operation internally to bypass the
 * prevent_credit_update DB trigger).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockEq, mockUpdate, mockFrom, mockRpc } = vi.hoisted(() => {
  const mockEq = vi.fn().mockResolvedValue({ error: null });
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
  const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
  const mockRpc = vi.fn().mockResolvedValue({ error: null });
  return { mockEq, mockUpdate, mockFrom, mockRpc };
});

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: mockFrom, rpc: mockRpc },
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: { ENV: 'test' },
}));

import {
  ensureAntiFreeloaderProfile,
  type IAntiFreeloaderProfile,
} from '@server/services/anti-freeloader.service';
import { PAYWALLED_COUNTRIES } from '@/lib/anti-freeloader/region-classifier';
import { CREDIT_COSTS } from '@shared/config/credits.config';

function makeReq(country?: string, ip?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (country) headers['x-test-country'] = country;
  if (ip) headers['CF-Connecting-IP'] = ip;
  return new NextRequest('http://localhost/api/upscale', { method: 'POST', headers });
}

function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60 * 1000).toISOString();
}

function makeProfile(overrides: Partial<IAntiFreeloaderProfile> = {}): IAntiFreeloaderProfile {
  return {
    region_tier: null,
    subscription_tier: null,
    subscription_credits_balance: CREDIT_COSTS.DEFAULT_FREE_CREDITS,
    purchased_credits_balance: 0,
    is_flagged_freeloader: false,
    signup_country: null,
    signup_ip: null,
    created_at: minutesAgo(1),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  PAYWALLED_COUNTRIES.clear();
  mockEq.mockResolvedValue({ error: null });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ update: mockUpdate });
  mockRpc.mockResolvedValue({ error: null });
});

describe('ensureAntiFreeloaderProfile', () => {
  describe('subscription_credits_balance never in REST payload', () => {
    it('restricted-tier new user: credit goes through adjust_regional_credits RPC', async () => {
      await ensureAntiFreeloaderProfile(makeReq('IN'), 'uid-1', makeProfile());

      const restPayload = mockUpdate.mock.calls[0]?.[0] ?? {};
      expect(restPayload).not.toHaveProperty('subscription_credits_balance');

      expect(mockRpc).toHaveBeenCalledWith('adjust_regional_credits', {
        p_user_id: 'uid-1',
        p_new_balance: expect.any(Number),
        p_description: 'Regional free credit adjustment',
      });
      const newBal = (mockRpc.mock.calls.find(([n]: [string]) => n === 'adjust_regional_credits') ??
        [])[1]?.p_new_balance;
      expect(newBal).toBeGreaterThanOrEqual(0);
      expect(newBal).toBeLessThan(CREDIT_COSTS.DEFAULT_FREE_CREDITS);
    });

    it('paywalled-tier new user: balance set to 0 via RPC', async () => {
      PAYWALLED_COUNTRIES.add('PW');
      await ensureAntiFreeloaderProfile(makeReq('PW'), 'uid-2', makeProfile());

      const restPayload = mockUpdate.mock.calls[0]?.[0] ?? {};
      expect(restPayload).not.toHaveProperty('subscription_credits_balance');
      expect(mockRpc).toHaveBeenCalledWith(
        'adjust_regional_credits',
        expect.objectContaining({ p_new_balance: 0 })
      );
    });

    it('standard-tier (US): no credit RPC call', async () => {
      await ensureAntiFreeloaderProfile(makeReq('US'), 'uid-3', makeProfile());

      const rpcNames = mockRpc.mock.calls.map(([n]: [string]) => n);
      expect(rpcNames).not.toContain('adjust_regional_credits');
    });

    it('grandfathered user (60 min old): no credit RPC call', async () => {
      const profile = makeProfile({ created_at: minutesAgo(60) });
      await ensureAntiFreeloaderProfile(makeReq('IN'), 'uid-4', profile);

      const rpcNames = mockRpc.mock.calls.map(([n]: [string]) => n);
      expect(rpcNames).not.toContain('adjust_regional_credits');
    });

    it('paid subscriber: no credit RPC call', async () => {
      const profile = makeProfile({ subscription_tier: 'pro' });
      await ensureAntiFreeloaderProfile(makeReq('IN'), 'uid-5', profile);

      const rpcNames = mockRpc.mock.calls.map(([n]: [string]) => n);
      expect(rpcNames).not.toContain('adjust_regional_credits');
    });

    it('already classified (region_tier set): no update, no credit RPC', async () => {
      const profile = makeProfile({
        region_tier: 'restricted',
        signup_country: 'IN',
        signup_ip: '1.2.3.4',
      });
      await ensureAntiFreeloaderProfile(makeReq('IN', '1.2.3.4'), 'uid-6', profile);

      expect(mockUpdate).not.toHaveBeenCalled();
      const rpcNames = mockRpc.mock.calls.map(([n]: [string]) => n);
      expect(rpcNames).not.toContain('adjust_regional_credits');
    });

    it('tightens existing restricted users to paywalled when the request country is now paywalled', async () => {
      PAYWALLED_COUNTRIES.add('IN');
      const profile = makeProfile({
        region_tier: 'restricted',
        signup_country: 'IN',
        signup_ip: '1.2.3.4',
        created_at: minutesAgo(60),
      });

      await ensureAntiFreeloaderProfile(makeReq('IN', '1.2.3.4'), 'uid-17', profile);

      expect(mockUpdate).toHaveBeenCalledWith({ region_tier: 'paywalled' });
      expect(mockRpc).toHaveBeenCalledWith(
        'adjust_regional_credits',
        expect.objectContaining({ p_new_balance: 0 })
      );
    });
  });

  describe('returned profile reflects adjusted balance', () => {
    it('restricted tier: returned balance matches RPC target', async () => {
      const result = await ensureAntiFreeloaderProfile(makeReq('IN'), 'uid-7', makeProfile());

      const rpcCall = mockRpc.mock.calls.find(([n]: [string]) => n === 'adjust_regional_credits');
      expect(result?.subscription_credits_balance).toBe(rpcCall?.[1].p_new_balance);
    });

    it('paywalled: returned balance is 0', async () => {
      PAYWALLED_COUNTRIES.add('PW');
      const result = await ensureAntiFreeloaderProfile(makeReq('PW'), 'uid-8', makeProfile());
      expect(result?.subscription_credits_balance).toBe(0);
    });

    it('no adjustment: original balance unchanged in return', async () => {
      const result = await ensureAntiFreeloaderProfile(makeReq('US'), 'uid-9', makeProfile());
      expect(result?.subscription_credits_balance).toBe(CREDIT_COSTS.DEFAULT_FREE_CREDITS);
    });
  });

  describe('read-only mode', () => {
    it('derives restricted-tier balance without persisting writes', async () => {
      const result = await ensureAntiFreeloaderProfile(
        makeReq('IN', '9.8.7.6'),
        'uid-15',
        makeProfile(),
        { persist: false }
      );

      expect(result).toMatchObject({
        region_tier: 'restricted',
        signup_country: 'IN',
        signup_ip: '9.8.7.6',
        subscription_credits_balance: 3,
      });
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('derives paywalled balance without persisting writes', async () => {
      PAYWALLED_COUNTRIES.add('PW');
      const result = await ensureAntiFreeloaderProfile(makeReq('PW'), 'uid-16', makeProfile(), {
        persist: false,
      });

      expect(result).toMatchObject({
        region_tier: 'paywalled',
        signup_country: 'PW',
        subscription_credits_balance: 0,
      });
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('derives a tighter paywalled tier for previously restricted profiles without persisting writes', async () => {
      PAYWALLED_COUNTRIES.add('IN');
      const result = await ensureAntiFreeloaderProfile(
        makeReq('IN', '1.2.3.4'),
        'uid-18',
        makeProfile({
          region_tier: 'restricted',
          signup_country: 'IN',
          signup_ip: '1.2.3.4',
          created_at: minutesAgo(60),
        }),
        { persist: false }
      );

      expect(result).toMatchObject({
        region_tier: 'paywalled',
        signup_country: 'IN',
        subscription_credits_balance: 0,
      });
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('throws on REST update failure', async () => {
      mockEq.mockResolvedValue({ error: { message: 'db error' } });
      await expect(
        ensureAntiFreeloaderProfile(makeReq('US'), 'uid-10', makeProfile())
      ).rejects.toThrow('Failed to update anti-freeloader profile');
    });

    it('throws on credit RPC failure', async () => {
      mockRpc.mockResolvedValue({ error: { message: 'rpc error' } });
      await expect(
        ensureAntiFreeloaderProfile(makeReq('IN'), 'uid-11', makeProfile())
      ).rejects.toThrow('Failed to adjust regional credits');
    });

    it('returns null when profile is null', async () => {
      const result = await ensureAntiFreeloaderProfile(makeReq('IN'), 'uid-12', null);
      expect(result).toBeNull();
    });
  });

  describe('non-credit fields use REST update', () => {
    it('region_tier and signup_country go through REST', async () => {
      await ensureAntiFreeloaderProfile(makeReq('US'), 'uid-13', makeProfile());

      const payload = mockUpdate.mock.calls[0]?.[0] ?? {};
      expect(payload).toMatchObject({ region_tier: 'standard', signup_country: 'US' });
      expect(payload).not.toHaveProperty('subscription_credits_balance');
    });

    it('signup_ip goes through REST and triggers check_signup_ip RPC', async () => {
      await ensureAntiFreeloaderProfile(makeReq('US', '9.8.7.6'), 'uid-14', makeProfile());

      const payload = mockUpdate.mock.calls[0]?.[0] ?? {};
      expect(payload).toHaveProperty('signup_ip', '9.8.7.6');
      expect(mockRpc).toHaveBeenCalledWith('check_signup_ip', {
        p_user_id: 'uid-14',
        p_ip: '9.8.7.6',
      });
    });
  });
});
