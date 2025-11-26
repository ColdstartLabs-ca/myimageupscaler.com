import { NextRequest, NextResponse } from 'next/server';
import { upscaleSchema } from '@shared/validation/upscale.schema';
import {
  ImageGenerationService,
  InsufficientCreditsError,
  AIGenerationError,
} from '@server/services/image-generation.service';
import { ZodError } from 'zod';
import { createLogger } from '@server/monitoring/logger';
import { trackServerEvent } from '@server/analytics';
import { serverEnv } from '@shared/config/env';

export const runtime = 'edge';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const logger = createLogger(req, 'upscale-api');
  const startTime = Date.now();

  try {
    // 1. Extract authenticated user ID from middleware header
    const userId = req.headers.get('X-User-Id');
    if (!userId) {
      logger.warn('Unauthorized request - no user ID');
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    logger.info('Processing upscale request', { userId });

    // 2. Parse and validate request body
    const body = await req.json();
    const validatedInput = upscaleSchema.parse(body);

    // 3. Process image with credit management
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
        creditsRemaining: result.creditsRemaining,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
    );

    logger.info('Upscale completed', { userId, durationMs });

    // 4. Return successful response
    return NextResponse.json({
      imageData: result.imageData,
      creditsRemaining: result.creditsRemaining,
    });
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      logger.warn('Validation error', { errors: error.errors });
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid request data',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    // Handle insufficient credits
    if (error instanceof InsufficientCreditsError) {
      logger.info('Insufficient credits');
      return NextResponse.json(
        {
          error: 'Payment Required',
          message: 'You have insufficient credits. Please purchase more credits to continue.',
        },
        { status: 402 }
      );
    }

    // Handle AI generation errors
    if (error instanceof AIGenerationError) {
      const status = error.finishReason === 'SAFETY' ? 422 : 500;
      logger.error('AI generation error', {
        message: error.message,
        finishReason: error.finishReason,
      });
      return NextResponse.json(
        {
          error: 'Generation Failed',
          message: error.message,
          finishReason: error.finishReason,
        },
        { status }
      );
    }

    // Handle unexpected errors
    logger.error('Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  } finally {
    await logger.flush();
  }
}
