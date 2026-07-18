import { getRegionTier } from '@/lib/anti-freeloader/region-classifier';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import { NextRequest } from 'next/server';

export interface IAntiFreeloaderProfile {
  subscription_status?: string | null;
  subscription_tier?: string | null;
  subscription_credits_balance?: number | null;
  purchased_credits_balance?: number | null;
  is_flagged_freeloader?: boolean | null;
  region_tier?: string | null;
  signup_country?: string | null;
}

export interface IEnsureAntiFreeloaderProfileOptions {
  /**
   * When false, derive anti-freeloader fields in-memory without writing to the DB.
   * Use this on hot request paths like uploads so quota enforcement doesn't depend
   * on profile bookkeeping succeeding in the same request.
   */
  persist?: boolean;
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
  const updates: Partial<IAntiFreeloaderProfile> = {};

  if (!profile.signup_country && country) {
    updates.signup_country = country;
  }

  if (!profile.region_tier && country) {
    updates.region_tier = getRegionTier(country);
  }

  if (shouldPersist && Object.keys(updates).length > 0) {
    const { error } = await supabaseAdmin.from('profiles').update(updates).eq('id', userId);

    if (error) {
      throw new Error(`Failed to update anti-freeloader profile: ${error.message}`);
    }
  }

  return { ...profile, ...updates };
}
