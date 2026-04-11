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
  profile: IAntiFreeloaderProfile | null
): Promise<IAntiFreeloaderProfile | null> {
  if (!profile) {
    return null;
  }

  const country = getRequestCountry(req);
  const ip = getRequestIp(req);
  const updates: Partial<IAntiFreeloaderProfile> = {};
  let shouldCheckSignupIp = false;

  if (!profile.signup_country && country) {
    updates.signup_country = country;
  }

  if (!profile.region_tier && country) {
    const tier = getRegionTier(country);
    updates.region_tier = tier;

    if (isFreeTierProfile(profile.subscription_tier) && isNewlyCreatedProfile(profile.created_at)) {
      const adjustedBalance = getAdjustedRegionalFreeCredits(
        profile.subscription_credits_balance,
        tier
      );

      if (
        adjustedBalance !== undefined &&
        adjustedBalance !==
          (profile.subscription_credits_balance ?? CREDIT_COSTS.DEFAULT_FREE_CREDITS)
      ) {
        updates.subscription_credits_balance = adjustedBalance;
      }
    }
  }

  if (!profile.signup_ip && ip) {
    updates.signup_ip = ip;
    shouldCheckSignupIp = true;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabaseAdmin.from('profiles').update(updates).eq('id', userId);

    if (error) {
      throw new Error(`Failed to update anti-freeloader profile: ${error.message}`);
    }
  }

  if (shouldCheckSignupIp && ip) {
    await supabaseAdmin.rpc('check_signup_ip', {
      p_user_id: userId,
      p_ip: ip,
    });
  }

  return {
    ...profile,
    ...updates,
  };
}
