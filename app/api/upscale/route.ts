import { NextRequest, NextResponse } from 'next/server';
import { upscaleSchema, validateImageSizeForTier } from '@shared/validation/upscale.schema';
import {
  ImageGenerationService,
  InsufficientCreditsError,
  AIGenerationError,
  calculateCreditCost,
} from '@server/services/image-generation.service';
import { ZodError } from 'zod';
import { createLogger } from '@server/monitoring/logger';
import { trackServerEvent } from '@server/analytics';
import { serverEnv } from '@shared/config/env';
import { ErrorCodes, createErrorResponse } from '@shared/utils/errors';
import { upscaleRateLimit } from '@server/rateLimit';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

export const runtime = 'edge';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const logger = createLogger(req, 'upscale-api');
  const startTime = Date.now();
  let creditCost = 1; // Default, will be updated after validation

  try {
    // 1. Extract authenticated user ID from middleware header
    const userId = req.headers.get('X-User-Id');
    if (!userId) {
      logger.warn('Unauthorized request - no user ID');
      const { body, status } = createErrorResponse(
        ErrorCodes.UNAUTHORIZED,
        'Authentication required',
        401
      );
      return NextResponse.json(body, { status });
    }

    // 2. Apply stricter rate limit for image processing (5 req/min)
    const { success: rateLimitOk, remaining, reset } = await upscaleRateLimit.limit(userId);
    if (!rateLimitOk) {
      logger.warn('Upscale rate limit exceeded', { userId });
      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      const { body, status } = createErrorResponse(
        ErrorCodes.RATE_LIMITED,
        'Too many image processing requests. Please wait before trying again.',
        429,
        { retryAfter }
      );
      return NextResponse.json(body, {
        status,
        headers: {
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': new Date(reset).toISOString(),
          'Retry-After': retryAfter.toString(),
        },
      });
    }

    logger.info('Processing upscale request', { userId });

    // 3. Parse and validate request body
    const body = await req.json();
    const validatedInput = upscaleSchema.parse(body);

    // 4. Get user's subscription status to determine size limit
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('subscription_status')
      .eq('id', userId)
      .single();

    const isPaidUser = profile?.subscription_status === 'active';

    // 5. Validate image size based on user tier (BEFORE charging credits)
    const sizeValidation = validateImageSizeForTier(validatedInput.imageData, isPaidUser);
    if (!sizeValidation.valid) {
      logger.warn('Image size validation failed', {
        userId,
        isPaidUser,
        error: sizeValidation.error,
      });
      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        sizeValidation.error || 'Image size validation failed',
        400
      );
      return NextResponse.json(errorBody, { status });
    }

    // Calculate credit cost based on the configuration
    creditCost = calculateCreditCost(validatedInput.config);

    // 6. Process image with credit management
    const service = new ImageGenerationService();
    const result = await service.processImage(userId, validatedInput);

    const durationMs = Date.now() - startTime;

    // Track successful upscale event
    await trackServerEvent(
      'image_upscaled',
      {
        scaleFactor: validatedInput.config.scale,
        mode: validatedInput.config.mode,
        durationMs,
        creditsUsed: creditCost,
        creditsRemaining: result.creditsRemaining,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
    );

    logger.info('Upscale completed', { userId, durationMs, creditsUsed: creditCost });

    // 4. Return successful response
    return NextResponse.json({
      imageData: result.imageData,
      creditsRemaining: result.creditsRemaining,
    });
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      logger.warn('Validation error', { errors: error.errors });
      const { body, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid request data',
        400,
        { validationErrors: error.errors }
      );
      return NextResponse.json(body, { status });
    }

    // Handle insufficient credits
    if (error instanceof InsufficientCreditsError) {
      logger.info('Insufficient credits', { required: creditCost });
      const { body, status } = createErrorResponse(
        ErrorCodes.INSUFFICIENT_CREDITS,
        `You have insufficient credits. This operation requires ${creditCost} credit${creditCost > 1 ? 's' : ''}.`,
        402,
        { required: creditCost }
      );
      return NextResponse.json(body, { status });
    }

    // Handle AI generation errors
    if (error instanceof AIGenerationError) {
      const statusCode = error.finishReason === 'SAFETY' ? 422 : 500;
      const errorCode =
        error.finishReason === 'SAFETY'
          ? ErrorCodes.INVALID_REQUEST
          : ErrorCodes.PROCESSING_FAILED;
      logger.error('AI generation error', {
        message: error.message,
        finishReason: error.finishReason,
      });
      const { body, status } = createErrorResponse(errorCode, error.message, statusCode, {
        finishReason: error.finishReason,
      });
      return NextResponse.json(body, { status });
    }

    // Handle unexpected errors
    logger.error('Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    const { body, status } = createErrorResponse(
      ErrorCodes.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'An unexpected error occurred',
      500
    );
    return NextResponse.json(body, { status });
  } finally {
    await logger.flush();
  }
}
