import { upscaleStatusRateLimit } from '@server/rateLimit';
import {
  upscaleJobService,
  UpscaleJobError,
  type IUpscaleJobStatus,
} from '@server/services/upscale-job.service';
import { ErrorCodes, createErrorResponse, type ErrorCode } from '@shared/utils/errors';
import { UUID_V4_PATTERN } from '@shared/validation/uuid';
import { NextRequest, NextResponse } from 'next/server';

const MAX_LIST_LIMIT = 50;

function safeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  };
}

function jsonError(
  code: ErrorCode | string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
  headers: Record<string, string> = {}
): NextResponse {
  const response = createErrorResponse(code, message, status, details);
  return NextResponse.json(response.body, {
    status: response.status,
    headers: safeHeaders(headers),
  });
}

function serviceErrorResponse(error: unknown): NextResponse {
  if (error instanceof UpscaleJobError) {
    const retryAfter =
      error.statusCode === 429 || error.statusCode === 503 ? error.details?.retryAfter : undefined;
    return jsonError(
      error.code,
      error.message,
      error.statusCode,
      error.details,
      typeof retryAfter === 'number' ? { 'Retry-After': String(Math.max(1, retryAfter)) } : {}
    );
  }

  return jsonError(
    ErrorCodes.INTERNAL_ERROR,
    'Unable to read upscale job state. Please try again shortly.',
    503
  );
}

function publicStatus(status: IUpscaleJobStatus): Record<string, unknown> {
  return {
    jobId: status.jobId,
    stage: status.stage,
    status: status.status,
    requestedQualityTier: status.requestedQualityTier,
    resolvedQualityTier: status.resolvedQualityTier,
    modelId: status.modelId,
    scale: status.scale,
    exactCharge: status.exactCharge,
    creditsRemaining: status.creditsRemaining,
    retryable: status.retryable,
    refunded: status.refunded,
    outputAvailable: status.outputAvailable,
    outputMimeType: status.outputMimeType,
    outputSizeBytes: status.outputSizeBytes,
    outputWidth: status.outputWidth,
    outputHeight: status.outputHeight,
    outputExpiresAt: status.outputExpiresAt,
    ...(status.deliveryToken ? { deliveryToken: status.deliveryToken } : {}),
    failureReason: status.failureReason,
    timestamps: status.timestamps,
    statusUrl: status.statusUrl,
  };
}

async function enforceRateLimit(userId: string): Promise<NextResponse | null> {
  const result = await upscaleStatusRateLimit.limit(`status:${userId}`);
  if (result.success) return null;

  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return jsonError(
    ErrorCodes.RATE_LIMITED,
    'Too many job status requests. Please try again later.',
    429,
    { retryAfter },
    {
      'Retry-After': String(retryAfter),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': new Date(result.reset).toISOString(),
    }
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = request.headers.get('X-User-Id')?.trim();
  if (!userId) return jsonError(ErrorCodes.UNAUTHORIZED, 'Authentication required.', 401);

  const searchParams = new URL(request.url).searchParams;
  const jobId = searchParams.get('jobId');
  if (jobId !== null && !UUID_V4_PATTERN.test(jobId)) {
    return jsonError(ErrorCodes.VALIDATION_ERROR, 'The job ID is invalid.', 400);
  }

  try {
    const rateLimitResponse = await enforceRateLimit(userId);
    if (rateLimitResponse) return rateLimitResponse;
    if (jobId) {
      const status = await upscaleJobService.getStatus(userId, jobId);
      if (!status) return jsonError(ErrorCodes.NOT_FOUND, 'Upscale job was not found.', 404);
      return NextResponse.json(
        { success: true, ...publicStatus(status) },
        { status: 200, headers: safeHeaders() }
      );
    }

    const rawLimit = searchParams.get('limit');
    const limit = rawLimit === null ? MAX_LIST_LIMIT : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
      return jsonError(ErrorCodes.VALIDATION_ERROR, 'The job list limit is invalid.', 400);
    }

    const before = searchParams.get('before') ?? searchParams.get('cursor') ?? undefined;
    const result = await upscaleJobService.list(userId, before, limit);
    return NextResponse.json(
      {
        success: true,
        jobs: result.jobs.map(publicStatus),
        nextCursor: result.nextCursor,
      },
      { status: 200, headers: safeHeaders() }
    );
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
