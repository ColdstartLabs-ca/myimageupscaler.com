import { creditManager } from '@server/services/replicate/utils/credit-manager';
import { serverEnv } from '@shared/config/env';
import { ErrorCodes, createErrorResponse, type ErrorCode } from '@shared/utils/errors';
import { UUID_V4_PATTERN } from '@shared/validation/uuid';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const OUTPUT_FETCH_TIMEOUT_MS = 120_000;

const outputSchema = z.object({
  reservationJobId: z.string().regex(UUID_V4_PATTERN, 'Reservation job ID must be a UUIDv4'),
  deliveryToken: z.string().min(32).max(200),
});

function isAllowedReplicateDeliveryUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === 'replicate.delivery' || url.hostname.endsWith('.replicate.delivery'))
    );
  } catch {
    return false;
  }
}

function isAllowedSupabaseOutputSignedUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const configured = new URL(serverEnv.SUPABASE_URL);
    return (
      url.protocol === 'https:' &&
      configured.protocol === 'https:' &&
      url.hostname === configured.hostname &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname.startsWith('/storage/v1/object/sign/upscale-inputs/') &&
      /^\/storage\/v1\/object\/sign\/upscale-inputs\/[^/]+\/outputs\/[^/]+\.(?:png|jpe?g|webp|heic)$/i.test(
        url.pathname
      )
    );
  } catch {
    return false;
  }
}

function isAllowedDeliverableUrl(rawUrl: string): boolean {
  return isAllowedReplicateDeliveryUrl(rawUrl) || isAllowedSupabaseOutputSignedUrl(rawUrl);
}

function isAllowedImageMimeType(mimeType: string | null | undefined): boolean {
  return /^(image\/(png|jpeg|jpg|webp|gif|avif))$/i.test(mimeType ?? '');
}

function jsonError(code: ErrorCode, message: string, statusCode: number): NextResponse {
  const { body, status } = createErrorResponse(code, message, statusCode);
  return NextResponse.json(body, {
    status,
    headers: safeHeaders(),
  });
}

function safeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  };
}

function buildAbortSignal(requestSignal: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OUTPUT_FETCH_TIMEOUT_MS);
  const abort = () => controller.abort();
  requestSignal.addEventListener('abort', abort, { once: true });
  controller.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timeout);
      requestSignal.removeEventListener('abort', abort);
    },
    { once: true }
  );
  return controller.signal;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = request.headers.get('X-User-Id') || undefined;
  if (!userId) {
    return jsonError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
  }

  const parsed = outputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const { body, status } = createErrorResponse(
      ErrorCodes.VALIDATION_ERROR,
      'Invalid output capability',
      400,
      { validationErrors: parsed.error.errors }
    );
    return NextResponse.json(body, { status, headers: safeHeaders() });
  }

  const deliverable = await creditManager.retrieveDeliverableOutput(
    userId,
    parsed.data.reservationJobId,
    parsed.data.deliveryToken
  );
  if (!deliverable) {
    return jsonError(ErrorCodes.NOT_FOUND, 'Output capability was not found', 404);
  }
  if (
    !isAllowedDeliverableUrl(deliverable.imageUrl) ||
    !isAllowedImageMimeType(deliverable.mimeType)
  ) {
    return jsonError(ErrorCodes.VALIDATION_ERROR, 'Stored output metadata is invalid', 422);
  }

  let providerResponse: Response;
  try {
    providerResponse = await fetch(deliverable.imageUrl, {
      redirect: 'manual',
      signal: buildAbortSignal(request.signal),
    });
  } catch {
    return jsonError(ErrorCodes.AI_UNAVAILABLE, 'Unable to retrieve generated output', 502);
  }

  if (!providerResponse.ok || !providerResponse.body) {
    return jsonError(ErrorCodes.AI_UNAVAILABLE, 'Unable to retrieve generated output', 502);
  }

  const providerContentType = providerResponse.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim();
  if (providerContentType && !isAllowedImageMimeType(providerContentType)) {
    return jsonError(ErrorCodes.AI_UNAVAILABLE, 'Generated output was not an image', 502);
  }

  const contentType =
    deliverable.mimeType || providerResponse.headers.get('content-type') || 'image/png';
  const headers = safeHeaders({
    'Content-Type': contentType,
  });
  const contentLength = providerResponse.headers.get('content-length');
  if (contentLength) {
    headers['Content-Length'] = contentLength;
  }

  const reader = providerResponse.body.getReader();
  let finished = false;
  let aborted = request.signal.aborted;
  let streamedBytes = 0;
  let readerReleased = false;
  const releaseReader = () => {
    if (readerReleased) return;
    readerReleased = true;
    reader.releaseLock();
  };
  const abortReader = () => {
    aborted = true;
    void reader.cancel('request aborted').catch(() => undefined);
  };
  request.signal.addEventListener('abort', abortReader, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) return;
      try {
        const { done, value } = await reader.read();
        if (aborted) {
          finished = true;
          controller.error(new Error('Output delivery aborted'));
          return;
        }
        if (!done) {
          if (value) {
            streamedBytes += value.byteLength;
            controller.enqueue(value);
          }
          return;
        }

        finished = true;
        if (streamedBytes === 0) {
          controller.error(new Error('Generated output was empty'));
          return;
        }
        const acknowledged = await creditManager.acknowledgeReceipt(
          userId,
          parsed.data.reservationJobId,
          {
            deliveryToken: parsed.data.deliveryToken,
            imageUrl: deliverable.imageUrl,
            mimeType: deliverable.mimeType || contentType,
            expiresAt: deliverable.expiresAt,
          }
        );
        if (!acknowledged) {
          controller.error(new Error('Failed to acknowledge streamed output'));
          return;
        }
        controller.close();
      } catch (error) {
        if (finished) return;
        finished = true;
        controller.error(error instanceof Error ? error : new Error('Failed to stream output'));
      } finally {
        if (finished) {
          request.signal.removeEventListener('abort', abortReader);
          releaseReader();
        }
      }
    },
    async cancel(reason) {
      aborted = true;
      finished = true;
      request.signal.removeEventListener('abort', abortReader);
      await reader.cancel(reason).catch(() => undefined);
      releaseReader();
    },
  });

  return new NextResponse(stream, { status: 200, headers });
}
