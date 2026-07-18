import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { createLogger } from '@server/monitoring/logger';
import {
  ensureAntiFreeloaderProfile,
  type IAntiFreeloaderProfile,
} from '@server/services/anti-freeloader.service';
import { claimFreeCreditGrant } from '@server/services/free-credit-grant.service';
import { serverEnv } from '@shared/config/env';
import { trackServerEvent } from '@server/analytics';
import { isFreeTierProfile } from '@/lib/anti-freeloader/check-freeloader';
import { getFreeCreditsForTier, type RegionTier } from '@/lib/anti-freeloader/region-classifier';
import { NextRequest, NextResponse } from 'next/server';

function isRegionTier(value: string | null | undefined): value is RegionTier {
  return value === 'standard' || value === 'restricted' || value === 'paywalled';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const logger = createLogger(req, 'users-setup');

  // Get userId from middleware header (X-User-Id is set by Next.js middleware after JWT verification)
  const userId = req.headers.get('X-User-Id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Load current regional classification and credit state before granting.
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select(
      'region_tier, subscription_tier, subscription_status, subscription_credits_balance, purchased_credits_balance, signup_country'
    )
    .eq('id', userId)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const alreadySetup = Boolean(profile?.region_tier);

  let resolvedProfile: IAntiFreeloaderProfile | null = profile;

  try {
    resolvedProfile = await ensureAntiFreeloaderProfile(req, userId, profile);
  } catch (error) {
    logger.error('Failed to update profile', { userId, error: String(error) });
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }

  let grant;
  const isUnsubscribedFreeProfile =
    isFreeTierProfile(profile.subscription_tier) &&
    profile.subscription_status !== 'active' &&
    profile.subscription_status !== 'trialing';

  if (isUnsubscribedFreeProfile && !isRegionTier(resolvedProfile?.region_tier)) {
    await logger.flush();
    return NextResponse.json(
      { success: false, setupStatus: 'pending', retryable: true },
      { status: 202 }
    );
  }

  if (isUnsubscribedFreeProfile && isRegionTier(resolvedProfile?.region_tier)) {
    try {
      grant = await claimFreeCreditGrant(req, userId, resolvedProfile.region_tier);
    } catch (error) {
      logger.error('Failed to claim free credits', { userId, error: String(error) });
      return NextResponse.json({ error: 'Failed to grant free credits' }, { status: 500 });
    }

    const requestedCredits = getFreeCreditsForTier(resolvedProfile.region_tier);
    if (!grant.existingGrant && grant.grantedCredits < requestedCredits) {
      trackServerEvent(
        'free_credits_reduced',
        {
          requestedCredits,
          grantedCredits: grant.grantedCredits,
          matchedAccountCount: grant.matchedAccountCount,
          reason: grant.matchedAccountCount > 0 ? 'shared_identity' : 'region_tier',
        },
        { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
      ).catch(err =>
        logger.error('Failed to track free_credits_reduced event', { userId, error: String(err) })
      );
    }
  }

  if (!alreadySetup && !grant?.existingGrant) {
    // Fire-and-forget: analytics must never block account setup.
    trackServerEvent(
      'account_created',
      {
        method: 'email',
        hasEmail: true,
        pricingRegion: resolvedProfile?.region_tier || undefined,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
    ).catch(err =>
      logger.error('Failed to track account_created event', { userId, error: String(err) })
    );
  }

  await logger.flush();
  return NextResponse.json({
    success: true,
    setupStatus: 'complete',
    ...(alreadySetup || grant?.existingGrant ? { alreadySetup: true } : {}),
  });
}
