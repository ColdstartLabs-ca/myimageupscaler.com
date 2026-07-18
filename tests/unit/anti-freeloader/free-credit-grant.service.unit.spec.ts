import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { rpc: vi.fn() },
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: { ENV: 'test' },
}));

import {
  claimFreeCreditGrant,
  getFreeCreditGrantIdentity,
} from '@server/services/free-credit-grant.service';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

function makeRequest(ip = '203.0.113.42', userAgent = 'test browser'): NextRequest {
  return new NextRequest('http://localhost/api/users/setup', {
    headers: {
      'CF-Connecting-IP': ip,
      'user-agent': userAgent,
    },
  });
}

describe('free credit grants', () => {
  it('passes the request identity only to the service-role hashing RPC', () => {
    expect(getFreeCreditGrantIdentity(makeRequest())).toEqual({
      ip: '203.0.113.42',
      userAgent: 'test browser',
    });
  });

  it('calls the idempotent grant RPC with the region allowance', async () => {
    const rpc = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValue({
      data: [
        {
          granted_credits: 3,
          existing_grant: false,
          matched_account_count: 1,
          new_total_balance: 3,
        },
      ],
      error: null,
    });

    const result = await claimFreeCreditGrant(
      makeRequest(),
      '00000000-0000-4000-8000-000000000001',
      5
    );

    expect(rpc).toHaveBeenCalledWith(
      'claim_free_credit_grant',
      expect.objectContaining({
        p_user_id: '00000000-0000-4000-8000-000000000001',
        p_requested_credits: 5,
        p_ip: '203.0.113.42',
        p_user_agent: 'test browser',
      })
    );
    expect(result).toMatchObject({
      grantedCredits: 3,
      existingGrant: false,
      matchedAccountCount: 1,
      newTotalBalance: 3,
    });
  });
});
