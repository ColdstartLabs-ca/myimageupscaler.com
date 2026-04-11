import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { createLogger } from '@server/monitoring/logger';
import {
  ensureAntiFreeloaderProfile,
  type IAntiFreeloaderProfile,
} from '@server/services/anti-freeloader.service';
import { serverEnv } from '@shared/config/env';
import { trackServerEvent } from '@server/analytics';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const setupSchema = z.object({
  fingerprintHash: z.string().optional(),
});

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

  // Load current regional classification and only backfill missing anti-freeloader fields.
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select(
      'region_tier, subscription_tier, subscription_credits_balance, created_at, signup_country, signup_ip'
    )
    .eq('id', userId)
    .single();

  const alreadySetup = Boolean(profile?.region_tier);

  let resolvedProfile: IAntiFreeloaderProfile | null = profile;

  try {
    resolvedProfile = await ensureAntiFreeloaderProfile(req, userId, profile);
  } catch (error) {
    logger.error('Failed to update profile', { userId, error: String(error) });
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
      method: 'email',
      hasEmail: true,
      fingerprintHash: fingerprintHash || undefined,
      pricingRegion: resolvedProfile?.region_tier || undefined,
    },
    { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
  ).catch(err =>
    logger.error('Failed to track account_created event', { userId, error: String(err) })
  );

  await logger.flush();
  return NextResponse.json({ success: true, ...(alreadySetup ? { alreadySetup: true } : {}) });
}
