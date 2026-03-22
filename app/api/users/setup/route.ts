import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { createLogger } from '@server/monitoring/logger';
import { getRegionTier } from '@/lib/anti-freeloader/region-classifier';
import { CREDIT_COSTS } from '@shared/config/credits.config';
import { serverEnv } from '@shared/config/env';
import { trackServerEvent } from '@server/analytics';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const setupSchema = z.object({
  fingerprintHash: z.string().optional(),
});

/** Max age (ms) for a user to be considered "new" for credit adjustment purposes.
 *  Existing users who log in after this feature deploys are grandfathered. */
const NEW_USER_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: NextRequest): Promise<NextResponse> {
  const logger = createLogger(req, 'users-setup');

  // Get userId from middleware header (X-User-Id is set by Next.js middleware after JWT verification)
  const userId = req.headers.get('X-User-Id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bodyParsed = setupSchema.safeParse(await req.json().catch(() => ({})));
  if (!bodyParsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Idempotency guard — skip if region_tier already set
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('region_tier, subscription_tier, created_at')
    .eq('id', userId)
    .single();

  if (profile?.region_tier) {
    return NextResponse.json({ success: true, alreadySetup: true });
  }

  const rawCountry =
    req.headers.get('CF-IPCountry') ||
    req.headers.get('cf-ipcountry') ||
    (serverEnv.ENV === 'test' ? req.headers.get('x-test-country') : null);

  const country = rawCountry || null;
  const tier = country ? getRegionTier(country) : 'standard';
  const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || null;

  // Build update payload
  const updatePayload: Record<string, unknown> = { region_tier: tier };
  if (country) updatePayload.signup_country = country;
  if (ip) updatePayload.signup_ip = ip;

  // Grandfathering: only reduce credits for users created within NEW_USER_MAX_AGE_MS.
  // Existing users who log in after this feature deploys keep their current credits.
  const isNewUser = profile?.created_at
    ? Date.now() - new Date(profile.created_at).getTime() < NEW_USER_MAX_AGE_MS
    : false;

  if (tier === 'restricted' && profile?.subscription_tier === 'free' && isNewUser) {
    updatePayload.subscription_credits_balance = CREDIT_COSTS.RESTRICTED_FREE_CREDITS;
  }

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update(updatePayload)
    .eq('id', userId);

  if (updateError) {
    logger.error('Failed to update profile', { userId, error: updateError.message });
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }

  // Register fingerprint (best-effort — log failures but don't block response)
  const { fingerprintHash } = bodyParsed.data;
  if (fingerprintHash) {
    const { error: rpcError } = await supabaseAdmin.rpc('register_fingerprint', {
      p_user_id: userId,
      p_hash: fingerprintHash,
    });
    if (rpcError) {
      logger.error('Failed to register fingerprint', { userId, error: rpcError.message });
    }
  }

  // Track account creation analytics (fire-and-forget — don't block user setup on analytics failure)
  trackServerEvent(
    'account_created',
    {
      method: 'email', // Default for now - could be extended to track auth provider
      hasEmail: true, // User has completed setup
      fingerprintHash: fingerprintHash || undefined,
      pricingRegion: tier,
    },
    { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
  ).catch(err =>
    logger.error('Failed to track account_created event', { userId, error: String(err) })
  );

  await logger.flush();
  return NextResponse.json({ success: true });
}
