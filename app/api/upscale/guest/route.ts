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
import { ReplicateError } from '@server/services/replicate.service';
import { trackServerEvent } from '@server/analytics';
import { serverEnv } from '@shared/config/env';
import { GUEST_LIMITS } from '@shared/config/guest-limits.config';
import { ErrorCodes, createErrorResponse, serializeError } from '@shared/utils/errors';
import {
  decodeImageDimensions,
  getMaxPixelsForModel,
  validateImageDimensions,
} from '@shared/validation/upscale.schema';
import { getRegionTier } from '@/lib/anti-freeloader/region-classifier';

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
  let visitorId: string | undefined;
  let inputDimensions: { width: number; height: number } | null = null;

  const logFailure = (
    failureReason: string,
    details: Record<string, unknown> = {},
    level: 'warn' | 'error' = 'warn'
  ): void => {
    const payload = {
      failureReason,
      visitorId: visitorId ? `${visitorId.slice(0, 8)}***` : undefined,
      clientIpPrefix: clientIp !== 'unknown' ? `${clientIp.slice(0, 8)}***` : 'unknown',
      inputWidth: inputDimensions?.width,
      inputHeight: inputDimensions?.height,
      ...details,
    };

    if (level === 'error') {
      logger.error('Guest upscale failed', payload);
      return;
    }

    logger.warn('Guest upscale rejected', payload);
  };

  // Country paywall — block before any processing
  const country =
    req.headers.get('CF-IPCountry') ||
    req.headers.get('cf-ipcountry') ||
    (serverEnv.ENV !== 'production' ? req.headers.get('x-test-country') : null);

  if (country) {
    const regionTier = getRegionTier(country);
    if (regionTier === 'paywalled') {
      logger.info('Guest blocked by country paywall', {
        failureReason: 'guest_country_paywall',
        country,
      });
      void trackServerEvent(
        'paywall_shown',
        { country, context: 'guest_api' },
        { apiKey: serverEnv.AMPLITUDE_API_KEY }
      );
      return NextResponse.json(
        createErrorResponse(
          ErrorCodes.FORBIDDEN,
          'Free image processing is not available in your region. Sign up for a subscription to get started.',
          403,
          { upgradeUrl: '/pricing' }
        ).body,
        { status: 403 }
      );
    }
  }

  try {
    const body = await req.json();
    const validated = guestUpscaleSchema.parse(body);
    visitorId = validated.visitorId;

    // Validate file size (2MB max for guests)
    const base64Data = validated.imageData.split(',')[1] || validated.imageData;
    const fileSizeBytes = (base64Data.length * 3) / 4;
    if (fileSizeBytes > GUEST_LIMITS.MAX_FILE_SIZE_MB * 1024 * 1024) {
      logFailure('guest_file_too_large', {
        fileSizeBytes,
        maxFileSizeBytes: GUEST_LIMITS.MAX_FILE_SIZE_MB * 1024 * 1024,
      });
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

    inputDimensions = decodeImageDimensions(validated.imageData);
    if (!inputDimensions) {
      logFailure('guest_dimensions_unreadable', {
        mimeType: validated.mimeType,
      });
      return NextResponse.json(
        createErrorResponse(
          ErrorCodes.VALIDATION_ERROR,
          'Could not read image dimensions. Please try a valid JPG, PNG, or WEBP image.',
          400
        ).body,
        { status: 400 }
      );
    }

    const dimensionValidation = validateImageDimensions(inputDimensions.width, inputDimensions.height);
    if (!dimensionValidation.valid) {
      logFailure('guest_invalid_dimensions', {
        width: inputDimensions.width,
        height: inputDimensions.height,
        validationError: dimensionValidation.error,
      });
      return NextResponse.json(
        createErrorResponse(
          ErrorCodes.INVALID_DIMENSIONS,
          dimensionValidation.error || 'Image dimensions out of range.',
          400,
          {
            width: inputDimensions.width,
            height: inputDimensions.height,
          }
        ).body,
        { status: 400 }
      );
    }

    const pixels = inputDimensions.width * inputDimensions.height;
    const maxPixels = getMaxPixelsForModel(GUEST_LIMITS.MODEL);
    if (pixels > maxPixels) {
      logFailure('guest_image_too_large', {
        width: inputDimensions.width,
        height: inputDimensions.height,
        pixels,
        maxPixels,
        modelId: GUEST_LIMITS.MODEL,
      });
      return NextResponse.json(
        createErrorResponse(
          ErrorCodes.IMAGE_TOO_LARGE,
          `Image dimensions (${inputDimensions.width}x${inputDimensions.height}) exceed the guest processing limit. Please resize the image and try again.`,
          422,
          {
            width: inputDimensions.width,
            height: inputDimensions.height,
            pixels,
            maxPixels,
          }
        ).body,
        { status: 422 }
      );
    }

    // ========================================
    // MULTI-LAYER SERVER-SIDE RATE LIMITING
    // ========================================
    const limitCheck = await checkGuestLimits(clientIp, validated.visitorId);

    if (!limitCheck.allowed) {
      const statusCode = limitCheck.errorCode === 'BOT_DETECTED' ? 403 : 429;

      logFailure(
        statusCode === 403 ? 'guest_bot_detected' : 'guest_rate_limited',
        {
          ip: clientIp.slice(0, 8) + '***', // Partial IP for privacy
          fingerprint: validated.visitorId.slice(0, 8) + '***',
          reason: limitCheck.errorCode,
        }
      );

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
      inputWidth: inputDimensions.width,
      inputHeight: inputDimensions.height,
      modelId: GUEST_LIMITS.MODEL,
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
      logFailure('guest_validation_error', { errors: error.errors });
      return NextResponse.json(
        createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid request', 400).body,
        { status: 400 }
      );
    }

    if (error instanceof ReplicateError) {
      const statusCode =
        error.code === 'RATE_LIMITED'
          ? 429
          : error.code === 'SAFETY' || error.code === 'IMAGE_TOO_LARGE' || error.code === 'INVALID_INPUT'
            ? error.code === 'INVALID_INPUT'
              ? 400
              : 422
            : 503;
      const errorCode =
        error.code === 'RATE_LIMITED'
          ? ErrorCodes.RATE_LIMITED
          : error.code === 'IMAGE_TOO_LARGE'
            ? ErrorCodes.IMAGE_TOO_LARGE
            : error.code === 'SAFETY'
              ? ErrorCodes.INVALID_REQUEST
              : error.code === 'INVALID_INPUT'
                ? ErrorCodes.VALIDATION_ERROR
                : ErrorCodes.AI_UNAVAILABLE;

      logFailure(
        `guest_replicate_${String(error.code).toLowerCase()}`,
        {
          replicateCode: error.code,
          message: error.message,
          ...(error.code === 'AUTHENTICATION_FAILED'
            ? {
                action:
                  'Verify REPLICATE_API_TOKEN and any Cloudflare/Workers egress allowlist in Replicate.',
              }
            : {}),
        },
        'error'
      );

      return NextResponse.json(
        createErrorResponse(errorCode, error.message, statusCode, {
          replicateCode: error.code,
        }).body,
        { status: statusCode }
      );
    }

    logFailure(
      'guest_unexpected_error',
      {
        error: serializeError(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'error'
    );
    return NextResponse.json(
      createErrorResponse(ErrorCodes.PROCESSING_FAILED, 'Processing failed. Please try again.', 500)
        .body,
      { status: 500 }
    );
  } finally {
    await logger.flush();
  }
}
