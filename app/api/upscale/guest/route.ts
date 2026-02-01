/**
 * Guest Upscale API Route
 *
 * Dedicated endpoint for anonymous image upscaling with multi-layer rate limiting.
 * See docs/PRDs/guest-upscaler-pseo.md for full specification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@server/monitoring/logger';
import { processGuestImage } from '@server/services/guest-processor';
import { checkGuestLimits, incrementGuestUsage } from '@server/services/guest-rate-limiter';
import { trackServerEvent } from '@server/analytics';
import { serverEnv } from '@shared/config/env';
import { GUEST_LIMITS } from '@shared/config/guest-limits.config';
import { ErrorCodes, createErrorResponse } from '@shared/utils/errors';

const guestUpscaleSchema = z.object({
  imageData: z.string().min(100),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  visitorId: z.string().min(10).max(100),
});

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const logger = createLogger(req, 'guest-upscale-api');
  const clientIp = getClientIp(req);

  try {
    const body = await req.json();
    const validated = guestUpscaleSchema.parse(body);

    // Validate file size (2MB max for guests)
    const base64Data = validated.imageData.split(',')[1] || validated.imageData;
    const fileSizeBytes = (base64Data.length * 3) / 4;
    if (fileSizeBytes > GUEST_LIMITS.MAX_FILE_SIZE_MB * 1024 * 1024) {
      return NextResponse.json(
        createErrorResponse(
          ErrorCodes.FILE_TOO_LARGE,
          `File too large. Guest limit is ${GUEST_LIMITS.MAX_FILE_SIZE_MB}MB. Sign up for 64MB.`,
          400,
          { upgradeUrl: '/?signup=1' }
        ).body,
        { status: 400 }
      );
    }

    // ========================================
    // MULTI-LAYER SERVER-SIDE RATE LIMITING
    // ========================================
    const limitCheck = await checkGuestLimits(clientIp, validated.visitorId);

    if (!limitCheck.allowed) {
      const statusCode = limitCheck.errorCode === 'BOT_DETECTED' ? 403 : 429;

      logger.warn('Guest rate limited', {
        ip: clientIp.slice(0, 8) + '***', // Partial IP for privacy
        fingerprint: validated.visitorId.slice(0, 8) + '***',
        reason: limitCheck.errorCode,
      });

      void trackServerEvent(
        'guest_limit_reached',
        {
          reason: limitCheck.errorCode,
          visitorId: validated.visitorId,
        },
        { apiKey: serverEnv.AMPLITUDE_API_KEY }
      );

      return NextResponse.json(
        createErrorResponse(
          statusCode === 403 ? ErrorCodes.FORBIDDEN : ErrorCodes.RATE_LIMITED,
          limitCheck.reason!,
          statusCode,
          { upgradeUrl: '/?signup=1' }
        ).body,
        { status: statusCode }
      );
    }

    logger.info('Processing guest upscale', {
      fingerprint: validated.visitorId.slice(0, 8) + '***',
    });

    // Process with real-esrgan only
    const startTime = Date.now();

    const result = await processGuestImage({
      imageData: validated.imageData,
      mimeType: validated.mimeType,
      scale: GUEST_LIMITS.SCALE,
      modelId: GUEST_LIMITS.MODEL,
    });

    const processingTimeMs = Date.now() - startTime;

    // Increment counters AFTER successful processing
    await incrementGuestUsage(clientIp, validated.visitorId);

    // Track for funnel analysis
    void trackServerEvent(
      'guest_upscale_completed',
      {
        visitorId: validated.visitorId,
        fileSize: fileSizeBytes,
        processingTimeMs,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY }
    );

    return NextResponse.json({
      success: true,
      imageUrl: result.imageUrl,
      expiresAt: result.expiresAt,
      mimeType: result.mimeType,
      processing: {
        modelUsed: GUEST_LIMITS.MODEL,
        scale: GUEST_LIMITS.SCALE,
        processingTimeMs,
      },
      upgrade: {
        message: 'Want 4x or 8x upscaling? Sign up free!',
        ctaUrl: '/?signup=1',
        features: ['Up to 8x upscaling', '64MB file limit', 'Batch processing', 'No daily limits'],
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid request', 400).body,
        { status: 400 }
      );
    }

    logger.error('Guest upscale failed', { error });
    return NextResponse.json(
      createErrorResponse(ErrorCodes.PROCESSING_FAILED, 'Processing failed. Please try again.', 500)
        .body,
      { status: 500 }
    );
  } finally {
    await logger.flush();
  }
}
