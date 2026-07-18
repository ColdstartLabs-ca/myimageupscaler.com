import { getFreeCreditsForTier, type RegionTier } from '@/lib/anti-freeloader/region-classifier';
import { getRequestIp } from '@server/services/anti-freeloader.service';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { NextRequest } from 'next/server';

export interface IFreeCreditGrantResult {
  grantedCredits: number;
  existingGrant: boolean;
  matchedAccountCount: number;
  newTotalBalance: number;
}

interface IFreeCreditGrantRow {
  granted_credits: number;
  existing_grant: boolean;
  matched_account_count: number;
  new_total_balance: number;
}

export interface IFreeCreditGrantIdentity {
  ip: string;
  userAgent: string;
}

/**
 * Raw request identity is passed only to the service-role RPC, which hashes it
 * with its private database salt and never persists the raw values.
 */
export function getFreeCreditGrantIdentity(req: NextRequest): IFreeCreditGrantIdentity {
  const ip = getRequestIp(req);
  if (!ip) {
    throw new Error('Unable to determine signup IP for free credit grant');
  }

  return { ip, userAgent: req.headers.get('user-agent')?.trim().toLowerCase() ?? '' };
}

export async function claimFreeCreditGrant(
  req: NextRequest,
  userId: string,
  tier: RegionTier
): Promise<IFreeCreditGrantResult> {
  const identity = getFreeCreditGrantIdentity(req);
  const { data, error } = await supabaseAdmin.rpc('claim_free_credit_grant', {
    p_user_id: userId,
    p_ip: identity.ip,
    p_user_agent: identity.userAgent,
    p_requested_credits: getFreeCreditsForTier(tier),
  });

  if (error) {
    throw new Error(`Failed to claim free credit grant: ${error.message}`);
  }

  const grant = data?.[0] as IFreeCreditGrantRow | undefined;
  if (!grant) {
    throw new Error('Free credit grant did not return a result');
  }

  return {
    grantedCredits: grant.granted_credits,
    existingGrant: grant.existing_grant,
    matchedAccountCount: grant.matched_account_count,
    newTotalBalance: grant.new_total_balance,
  };
}
