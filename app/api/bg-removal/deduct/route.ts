import { createLogger } from '@server/monitoring/logger';
import { upscaleRateLimit } from '@server/rateLimit';
import { creditManager } from '@server/services/replicate/utils/credit-manager';
import { InsufficientCreditsError } from '@server/services/image-generation.service';
import { serverEnv } from '@shared/config/env';
import { trackServerEvent } from '@server/analytics';
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

    // Track event
    await trackServerEvent(
      'image_upscaled',
      {
        qualityTier: 'bg-removal',
        mode: 'bg-removal',
        creditsUsed: BG_REMOVAL_CREDIT_COST,
        creditsRemaining: newBalance,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
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
      const { body, status } = createErrorResponse(
        ErrorCodes.INSUFFICIENT_CREDITS,
        `You have insufficient credits. Background removal requires ${BG_REMOVAL_CREDIT_COST} credit.`,
        402,
        { required: BG_REMOVAL_CREDIT_COST }
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
