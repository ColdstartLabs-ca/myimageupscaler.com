import {
  getFreeCreditsForTier,
  getRegionTier,
  type RegionTier,
} from '@/lib/anti-freeloader/region-classifier';
import { isFreeTierProfile } from '@/lib/anti-freeloader/check-freeloader';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import { CREDIT_COSTS } from '@shared/config/credits.config';
import { NextRequest } from 'next/server';

export const NEW_USER_MAX_AGE_MS = 10 * 60 * 1000;

export interface IAntiFreeloaderProfile {
  subscription_status?: string | null;
  subscription_tier?: string | null;
  subscription_credits_balance?: number | null;
  purchased_credits_balance?: number | null;
  is_flagged_freeloader?: boolean | null;
  region_tier?: string | null;
  signup_country?: string | null;
  signup_ip?: string | null;
  created_at?: string | null;
}

export interface IEnsureAntiFreeloaderProfileOptions {
  /**
   * When false, derive anti-freeloader fields in-memory without writing to the DB.
   * Use this on hot request paths like uploads so quota enforcement doesn't depend
   * on profile bookkeeping succeeding in the same request.
   */
  persist?: boolean;
}

const REGION_TIER_STRICTNESS: Record<RegionTier, number> = {
  standard: 0,
  restricted: 1,
  paywalled: 2,
};

function normalizeStoredRegionTier(value: string | null | undefined): RegionTier | null {
  if (value === 'standard' || value === 'restricted' || value === 'paywalled') {
    return value;
  }
  return null;
}

export function getRequestCountry(req: NextRequest): string | null {
  return (
    req.headers.get('CF-IPCountry') ||
    req.headers.get('cf-ipcountry') ||
    (serverEnv.ENV !== 'production' ? req.headers.get('x-test-country') : null)
  );
}

export function getRequestIp(req: NextRequest): string | null {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    req.headers.get('CF-Connecting-IP') ||
    req.headers.get('cf-connecting-ip') ||
    forwardedFor ||
    null
  );
}

export function isNewlyCreatedProfile(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() < NEW_USER_MAX_AGE_MS;
}

export function getAdjustedRegionalFreeCredits(
  currentBalance: number | null | undefined,
  tier: RegionTier
): number | undefined {
  const allowedCredits = getFreeCreditsForTier(tier);
  const reduction = Math.max(0, CREDIT_COSTS.DEFAULT_FREE_CREDITS - allowedCredits);

  if (reduction === 0) {
    return undefined;
  }

  const safeCurrentBalance = currentBalance ?? CREDIT_COSTS.DEFAULT_FREE_CREDITS;
  return Math.max(0, safeCurrentBalance - reduction);
}

export async function ensureAntiFreeloaderProfile(
  req: NextRequest,
  userId: string,
  profile: IAntiFreeloaderProfile | null,
  options: IEnsureAntiFreeloaderProfileOptions = {}
): Promise<IAntiFreeloaderProfile | null> {
  if (!profile) {
    return null;
  }

  const shouldPersist = options.persist ?? true;
  const country = getRequestCountry(req);
  const ip = getRequestIp(req);
  const updates: Partial<IAntiFreeloaderProfile> = {};
  let shouldCheckSignupIp = false;
  let targetCreditBalance: number | undefined;
  const requestTier = country ? getRegionTier(country) : null;
  const storedRegionTier = normalizeStoredRegionTier(profile.region_tier);
  const effectiveRegionTier =
    requestTier === null
      ? storedRegionTier
      : storedRegionTier === null ||
          REGION_TIER_STRICTNESS[requestTier] > REGION_TIER_STRICTNESS[storedRegionTier]
        ? requestTier
        : storedRegionTier;
  const shouldTightenRegionTier =
    effectiveRegionTier !== null && effectiveRegionTier !== storedRegionTier;

  if (!profile.signup_country && country) {
    updates.signup_country = country;
  }

  if (shouldTightenRegionTier && effectiveRegionTier) {
    updates.region_tier = effectiveRegionTier;
  }

  if (effectiveRegionTier && isFreeTierProfile(profile.subscription_tier)) {
    const currentBalance =
      profile.subscription_credits_balance ?? CREDIT_COSTS.DEFAULT_FREE_CREDITS;
    const adjustedBalance = getAdjustedRegionalFreeCredits(
      profile.subscription_credits_balance,
      effectiveRegionTier
    );
    const shouldApplyCreditReduction =
      adjustedBalance !== undefined &&
      adjustedBalance !== currentBalance &&
      (effectiveRegionTier === 'paywalled' ||
        ((storedRegionTier === null || shouldTightenRegionTier) &&
          isNewlyCreatedProfile(profile.created_at)));

    if (shouldApplyCreditReduction) {
      targetCreditBalance = adjustedBalance;
    }
  }

  if (!profile.signup_ip && ip) {
    updates.signup_ip = ip;
    shouldCheckSignupIp = true;
  }

  if (shouldPersist && Object.keys(updates).length > 0) {
    const { error } = await supabaseAdmin.from('profiles').update(updates).eq('id', userId);

    if (error) {
      throw new Error(`Failed to update anti-freeloader profile: ${error.message}`);
    }
  }

  // Credit balance must be adjusted via RPC — direct REST updates to subscription_credits_balance
  // are blocked by the prevent_credit_update trigger (which requires app.trusted_credit_operation
  // to be set, and that flag is only settable from within PL/pgSQL functions, not REST API calls).
  if (shouldPersist && targetCreditBalance !== undefined) {
    const { error } = await supabaseAdmin.rpc('adjust_regional_credits', {
      p_user_id: userId,
      p_new_balance: targetCreditBalance,
      p_description: 'Regional free credit adjustment',
    });

    if (error) {
      throw new Error(`Failed to adjust regional credits: ${error.message}`);
    }
  }

  if (shouldPersist && shouldCheckSignupIp && ip) {
    await supabaseAdmin.rpc('check_signup_ip', {
      p_user_id: userId,
      p_ip: ip,
    });
  }

  return {
    ...profile,
    ...updates,
    ...(targetCreditBalance !== undefined
      ? { subscription_credits_balance: targetCreditBalance }
      : {}),
  };
}
