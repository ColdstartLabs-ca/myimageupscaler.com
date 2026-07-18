import { isAccountSetupPending, isFreeleaderBlocked } from '@/lib/anti-freeloader/check-freeloader';
import { createLogger } from '@server/monitoring/logger';
import { upscaleRateLimit } from '@server/rateLimit';
import { ensureAntiFreeloaderProfile } from '@server/services/anti-freeloader.service';
import { creditManager } from '@server/services/replicate/utils/credit-manager';
import { InsufficientCreditsError } from '@server/services/image-generation.service';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { isProduction } from '@shared/config/env';
import { getCreditLimitErrorCode } from '@shared/utils/credit-limit';
import { ErrorCodes, createErrorResponse } from '@shared/utils/errors';
import { NextRequest, NextResponse } from 'next/server';

const BG_REMOVAL_CREDIT_COST = 1;

/**
 * POST /api/bg-removal/deduct
 *
 * Deducts 1 credit for client-side background removal.
 * Processing happens in the browser via @imgly/background-removal,
 * but we still charge 1 credit for the operation.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const logger = createLogger(req, 'bg-removal-deduct');
  let effectiveTotalCredits: number | undefined;
  let isPaidUser = false;

  try {
    const userId = req.headers.get('X-User-Id') || undefined;
    if (!userId) {
      const { body, status } = createErrorResponse(
        ErrorCodes.UNAUTHORIZED,
        'Authentication required',
        401
      );
      return NextResponse.json(body, { status });
    }

    // Read the durable grant decision first so a concurrent setup commit cannot
    // pair a stale zero-credit profile with a newly-created decision.
    const { data: grantDecision, error: grantDecisionError } = await supabaseAdmin
      .from('free_credit_grants')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (grantDecisionError) {
      const { body, status } = createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Unable to verify account setup. Please try again shortly.',
        503
      );
      return NextResponse.json(body, { status });
    }

    // Block flagged freeloaders before any credit-consuming work.
    const { data: rawProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(
        'is_flagged_freeloader, subscription_status, subscription_tier, subscription_credits_balance, purchased_credits_balance, region_tier, signup_country, created_at'
      )
      .eq('id', userId)
      .single();

    if (profileError) {
      const { body, status } = createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Unable to verify account setup. Please try again shortly.',
        503
      );
      return NextResponse.json(body, { status });
    }

    const profile = await ensureAntiFreeloaderProfile(req, userId, rawProfile, {
      persist: false,
    });

    if (isAccountSetupPending(profile, Boolean(grantDecision))) {
      const { body, status } = createErrorResponse(
        ErrorCodes.ACCOUNT_SETUP_PENDING,
        'Your account setup is still completing. Please try again shortly.',
        409
      );
      return NextResponse.json(body, { status });
    }

    if (isProduction() && isFreeleaderBlocked(profile)) {
      logger.warn('Blocked flagged freeloader', { userId });
      return NextResponse.json(
        {
          error: {
            code: 'ACCOUNT_RESTRICTED',
            message:
              'Multiple accounts detected on your device. Upgrade to a paid plan to continue.',
          },
        },
        { status: 403 }
      );
    }

    effectiveTotalCredits =
      (profile?.subscription_credits_balance ?? 0) + (profile?.purchased_credits_balance ?? 0);
    isPaidUser =
      profile?.subscription_status === 'active' ||
      profile?.subscription_status === 'trialing' ||
      (profile?.purchased_credits_balance ?? 0) > 0 ||
      (profile?.subscription_tier !== null &&
        profile?.subscription_tier !== undefined &&
        profile.subscription_tier !== 'free');
    if (effectiveTotalCredits < BG_REMOVAL_CREDIT_COST) {
      const errorCode = getCreditLimitErrorCode(
        effectiveTotalCredits,
        BG_REMOVAL_CREDIT_COST,
        !isPaidUser
      );
      const { body, status } = createErrorResponse(
        errorCode,
        errorCode === ErrorCodes.FREE_LIMIT_EXCEEDED
          ? 'You have used all of your free credits. Upgrade to continue.'
          : `You have insufficient credits. Background removal requires ${BG_REMOVAL_CREDIT_COST} credit.`,
        402,
        { required: BG_REMOVAL_CREDIT_COST, available: effectiveTotalCredits }
      );
      return NextResponse.json(body, { status });
    }

    // Rate limit (shares the upscale rate limiter)
    const { success: rateLimitOk } = await upscaleRateLimit.limit(userId);
    if (!rateLimitOk) {
      const { body, status } = createErrorResponse(
        ErrorCodes.RATE_LIMITED,
        'Too many requests. Please wait before trying again.',
        429
      );
      return NextResponse.json(body, { status });
    }

    // Deduct 1 credit
    const { newBalance } = await creditManager.deductCredits(
      userId,
      BG_REMOVAL_CREDIT_COST,
      'bg-removal'
    );

    logger.info('BG removal credit deducted', {
      userId,
      creditsUsed: BG_REMOVAL_CREDIT_COST,
      creditsRemaining: newBalance,
    });

    return NextResponse.json({
      success: true,
      creditsUsed: BG_REMOVAL_CREDIT_COST,
      creditsRemaining: newBalance,
    });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      const availableCredits = error.availableCredits ?? effectiveTotalCredits ?? 1;
      const errorCode = getCreditLimitErrorCode(
        availableCredits,
        BG_REMOVAL_CREDIT_COST,
        !isPaidUser
      );
      const { body, status } = createErrorResponse(
        errorCode,
        errorCode === ErrorCodes.FREE_LIMIT_EXCEEDED
          ? 'You have used all of your free credits. Upgrade to continue.'
          : `You have insufficient credits. Background removal requires ${BG_REMOVAL_CREDIT_COST} credit.`,
        402,
        { required: BG_REMOVAL_CREDIT_COST, available: availableCredits }
      );
      return NextResponse.json(body, { status });
    }

    logger.error('BG removal deduct failed', { error });
    const { body, status } = createErrorResponse(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to process credit deduction',
      500
    );
    return NextResponse.json(body, { status });
  } finally {
    await logger.flush();
  }
}
