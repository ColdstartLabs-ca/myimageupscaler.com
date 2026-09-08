import {
  BoundedJsonBodyTooLargeError,
  readBoundedJsonBody,
} from '@server/http/read-bounded-json-body';
import { creditManager } from '@server/services/replicate/utils/credit-manager';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import { ErrorCodes, createErrorResponse, type ErrorCode } from '@shared/utils/errors';
import { UUID_V4_PATTERN } from '@shared/validation/uuid';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const OUTPUT_FETCH_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;
const DURABLE_DELIVERY_LEASE_SECONDS = 120;
const DURABLE_DELIVERY_LEASE_MS = DURABLE_DELIVERY_LEASE_SECONDS * 1000;
const DURABLE_DELIVERY_RENEW_INTERVAL_MS = 30_000;
const DURABLE_OUTPUT_SIGNED_URL_SECONDS = 60;
const UPSCALE_INPUT_BUCKET_NAME = 'upscale-inputs';

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
      /^\/storage\/v1\/object\/sign\/upscale-inputs\/[^/]+\/outputs\/(?:[^/]+\/)?[^/]+\.(?:png|jpe?g|webp|heic)$/i.test(
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

function isAllowedDurableOutputPath(userId: string, jobId: string, rawPath: string): boolean {
  const segments = rawPath.split('/');
  if (segments[0] !== userId || segments[1] !== 'outputs') return false;
  if (segments.length === 3)
    return segments[2].replace(/\.(?:png|jpe?g|webp|heic)$/i, '') === jobId;
  if (segments.length !== 4 || segments[2] !== jobId) return false;
  const attemptId = segments[3].replace(/\.(?:png|jpe?g|webp|heic)$/i, '');
  return attemptId !== segments[3] && UUID_V4_PATTERN.test(attemptId);
}

function isAllowedImageMimeType(mimeType: string | null | undefined): boolean {
  return /^(image\/(png|jpeg|jpg|webp|gif|avif|heic))$/i.test(mimeType ?? '');
}

function getErrorProperty(error: unknown, property: 'code' | 'message'): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = (error as Record<string, unknown>)[property];
  return typeof value === 'string' ? value : undefined;
}

function isMissingDurableCapabilityError(error: unknown): boolean {
  const code = getErrorProperty(error, 'code');
  const message = getErrorProperty(error, 'message') ?? '';
  return (
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    code === '42P01' ||
    /(?:could not find|does not exist|not found).*(?:function|relation|table)|schema cache/i.test(
      message
    )
  );
}

function isMissingDurableTableError(error: unknown): boolean {
  const code = getErrorProperty(error, 'code');
  const message = getErrorProperty(error, 'message') ?? '';
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /(?:relation|table).*upscale_executions.*(?:does not exist|not found)|schema cache/i.test(
      message
    )
  );
}

function hashDeliveryToken(deliveryToken: string): string {
  return createHash('sha256').update(deliveryToken).digest('hex');
}

function parseByteCount(value: unknown): number | null {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : NaN;

  return Number.isSafeInteger(numericValue) && numericValue >= 0 ? numericValue : null;
}

class InvalidDurableOutputMetadataError extends Error {}

interface IDurableDeliveryLease {
  userId: string;
  jobId: string;
  deliveryTokenHash: string;
  expiresAtMs: number;
}

interface IDurableDeliverable {
  imageUrl: string;
  storagePath: string;
  mimeType: string;
  expiresAt: string | null;
  declaredSizeBytes: number;
  lease: IDurableDeliveryLease;
}

async function hasDurableExecution(userId: string, jobId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('upscale_executions')
    .select('job_id')
    .eq('job_id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isMissingDurableTableError(error)) return false;
    throw new Error(
      `Failed to inspect durable upscale execution: ${getErrorProperty(error, 'message') ?? 'unknown error'}`
    );
  }

  return data !== null && data !== undefined;
}

async function releaseDurableDeliveryLease(
  lease: Omit<IDurableDeliveryLease, 'expiresAtMs'>
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('release_upscale_delivery_lease', {
    p_user_id: lease.userId,
    p_job_id: lease.jobId,
    p_delivery_token_hash: lease.deliveryTokenHash,
  });

  if (error && !isMissingDurableCapabilityError(error)) {
    console.error(
      'Failed to release durable output delivery lease:',
      getErrorProperty(error, 'message')
    );
  }
}

async function retrieveDurableDeliverable(
  userId: string,
  jobId: string,
  deliveryToken: string
): Promise<IDurableDeliverable | null> {
  const deliveryTokenHash = hashDeliveryToken(deliveryToken);
  const acquireStartedAt = Date.now();
  const { data, error } = await supabaseAdmin.rpc('acquire_upscale_delivery_lease', {
    p_user_id: userId,
    p_job_id: jobId,
    p_delivery_token_hash: deliveryTokenHash,
    p_lease_seconds: DURABLE_DELIVERY_LEASE_SECONDS,
  });
  if (error) {
    throw new Error(
      `Failed to acquire durable output delivery lease: ${getErrorProperty(error, 'message') ?? 'unknown error'}`
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || !('output_storage_path' in row)) return null;

  const durableRow = row as Record<string, unknown>;
  const outputObjectPath = durableRow.output_storage_path;
  const outputMimeType = durableRow.output_mime_type;
  const outputSizeBytes = parseByteCount(durableRow.output_size_bytes);
  const outputExpiresAt =
    typeof durableRow.output_expires_at === 'string' ? durableRow.output_expires_at : null;
  if (
    typeof outputObjectPath !== 'string' ||
    !isAllowedDurableOutputPath(userId, jobId, outputObjectPath) ||
    typeof outputMimeType !== 'string' ||
    !isAllowedImageMimeType(outputMimeType) ||
    outputSizeBytes === null ||
    outputSizeBytes <= 0 ||
    outputSizeBytes > MAX_OUTPUT_BYTES ||
    (outputExpiresAt !== null &&
      (!Number.isFinite(Date.parse(outputExpiresAt)) || Date.parse(outputExpiresAt) <= Date.now()))
  ) {
    await releaseDurableDeliveryLease({
      userId,
      jobId,
      deliveryTokenHash,
    });
    if (outputExpiresAt !== null && Date.parse(outputExpiresAt) <= Date.now()) return null;
    throw new InvalidDurableOutputMetadataError('Stored durable output metadata is invalid');
  }

  const lease: IDurableDeliveryLease = {
    userId,
    jobId,
    deliveryTokenHash,
    expiresAtMs: Math.min(
      acquireStartedAt + DURABLE_DELIVERY_LEASE_MS,
      typeof durableRow.delivery_lease_expires_at === 'string' &&
        Number.isFinite(Date.parse(durableRow.delivery_lease_expires_at))
        ? Date.parse(durableRow.delivery_lease_expires_at)
        : acquireStartedAt + DURABLE_DELIVERY_LEASE_MS
    ),
  };
  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from(UPSCALE_INPUT_BUCKET_NAME)
    .createSignedUrl(outputObjectPath, DURABLE_OUTPUT_SIGNED_URL_SECONDS);
  if (signedError || !signed?.signedUrl || !isAllowedSupabaseOutputSignedUrl(signed.signedUrl)) {
    await releaseDurableDeliveryLease(lease);
    throw new Error('Unable to create a safe durable output read URL');
  }

  return {
    imageUrl: signed.signedUrl,
    storagePath: outputObjectPath,
    mimeType: outputMimeType,
    expiresAt: outputExpiresAt,
    declaredSizeBytes: outputSizeBytes,
    lease,
  };
}

async function acknowledgeDurableDelivery(
  lease: IDurableDeliveryLease,
  deliverable: Pick<IDurableDeliverable, 'storagePath' | 'mimeType'>
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('acknowledge_upscale_execution', {
    p_user_id: lease.userId,
    p_job_id: lease.jobId,
    p_output_storage_path: deliverable.storagePath,
    p_output_mime_type: deliverable.mimeType,
    p_delivery_token_hash: lease.deliveryTokenHash,
  });
  if (error) {
    throw new Error(
      `Failed to acknowledge durable output delivery: ${getErrorProperty(error, 'message') ?? 'unknown error'}`
    );
  }
  return data === true || data === 'true';
}

async function renewDurableDelivery(
  lease: IDurableDeliveryLease
): Promise<'renewed' | 'unavailable' | 'denied'> {
  const { data, error } = await supabaseAdmin.rpc('renew_upscale_delivery_lease', {
    p_user_id: lease.userId,
    p_job_id: lease.jobId,
    p_delivery_token_hash: lease.deliveryTokenHash,
    p_lease_seconds: DURABLE_DELIVERY_LEASE_SECONDS,
  });
  if (error) {
    if (isMissingDurableCapabilityError(error)) return 'unavailable';
    throw new Error(
      `Failed to renew durable output delivery lease: ${getErrorProperty(error, 'message') ?? 'unknown error'}`
    );
  }
  return data === true || data === 'true' ? 'renewed' : 'denied';
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

function outputFetchLifetime(requestSignal: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OUTPUT_FETCH_TIMEOUT_MS);
  const abort = () => controller.abort();
  if (requestSignal.aborted) abort();
  else requestSignal.addEventListener('abort', abort, { once: true });
  return {
    signal: controller.signal,
    headersReceived: () => clearTimeout(timeout),
    dispose: () => {
      clearTimeout(timeout);
      requestSignal.removeEventListener('abort', abort);
    },
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = request.headers.get('X-User-Id') || undefined;
  if (!userId) {
    return jsonError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
  }

  let input: unknown;
  try {
    input = await readBoundedJsonBody(request, 4096);
  } catch (error) {
    return jsonError(
      ErrorCodes.VALIDATION_ERROR,
      'Invalid output capability',
      error instanceof BoundedJsonBodyTooLargeError ? 413 : 400
    );
  }
  const parsed = outputSchema.safeParse(input);
  if (!parsed.success) {
    const { body, status } = createErrorResponse(
      ErrorCodes.VALIDATION_ERROR,
      'Invalid output capability',
      400,
      { validationErrors: parsed.error.errors }
    );
    return NextResponse.json(body, { status, headers: safeHeaders() });
  }

  let durableLease: IDurableDeliveryLease | undefined;
  let durableDeliverableForAck: IDurableDeliverable | undefined;
  let durableDeliveryAcknowledged = false;
  let declaredOutputBytes: number | null = null;
  let deliverable: { imageUrl: string; mimeType: string; expiresAt: string | null } | null;

  let durableExecutionExists = false;
  try {
    durableExecutionExists = await hasDurableExecution(userId, parsed.data.reservationJobId);
  } catch {
    return jsonError(ErrorCodes.AI_UNAVAILABLE, 'Unable to retrieve generated output', 502);
  }

  if (durableExecutionExists) {
    try {
      const durableDeliverable = await retrieveDurableDeliverable(
        userId,
        parsed.data.reservationJobId,
        parsed.data.deliveryToken
      );
      if (!durableDeliverable) {
        return jsonError(ErrorCodes.NOT_FOUND, 'Output capability was not found', 404);
      }
      durableLease = durableDeliverable.lease;
      durableDeliverableForAck = durableDeliverable;
      declaredOutputBytes = durableDeliverable.declaredSizeBytes;
      deliverable = durableDeliverable;
    } catch (error) {
      if (error instanceof InvalidDurableOutputMetadataError) {
        return jsonError(ErrorCodes.VALIDATION_ERROR, 'Stored output metadata is invalid', 422);
      }
      return jsonError(ErrorCodes.AI_UNAVAILABLE, 'Unable to retrieve generated output', 502);
    }
  } else {
    // Keep the legacy reservation capability path unchanged when this job was
    // admitted before the durable execution table was populated.
    deliverable = await creditManager.retrieveDeliverableOutput(
      userId,
      parsed.data.reservationJobId,
      parsed.data.deliveryToken
    );
  }

  if (!deliverable) {
    return jsonError(ErrorCodes.NOT_FOUND, 'Output capability was not found', 404);
  }
  if (
    !isAllowedDeliverableUrl(deliverable.imageUrl) ||
    !isAllowedImageMimeType(deliverable.mimeType)
  ) {
    if (durableLease) await releaseDurableDeliveryLease(durableLease);
    return jsonError(ErrorCodes.VALIDATION_ERROR, 'Stored output metadata is invalid', 422);
  }

  const releaseLeaseBeforeResponse = async (): Promise<void> => {
    if (!durableLease || durableDeliveryAcknowledged) return;
    const lease = durableLease;
    durableLease = undefined;
    await releaseDurableDeliveryLease(lease);
  };

  const lifetime = outputFetchLifetime(request.signal);
  let providerResponse: Response;
  try {
    providerResponse = await fetch(deliverable.imageUrl, {
      redirect: 'manual',
      signal: lifetime.signal,
    });
    lifetime.headersReceived();
  } catch {
    lifetime.dispose();
    await releaseLeaseBeforeResponse();
    return jsonError(ErrorCodes.AI_UNAVAILABLE, 'Unable to retrieve generated output', 502);
  }

  if (!providerResponse.ok || !providerResponse.body) {
    lifetime.dispose();
    await providerResponse.body?.cancel().catch(() => undefined);
    await releaseLeaseBeforeResponse();
    return jsonError(ErrorCodes.AI_UNAVAILABLE, 'Unable to retrieve generated output', 502);
  }

  const providerContentType = providerResponse.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim();
  if (
    providerContentType &&
    (!isAllowedImageMimeType(providerContentType) ||
      (durableLease && providerContentType.toLowerCase() !== deliverable.mimeType))
  ) {
    lifetime.dispose();
    await providerResponse.body.cancel().catch(() => undefined);
    await releaseLeaseBeforeResponse();
    return jsonError(ErrorCodes.AI_UNAVAILABLE, 'Generated output was not an image', 502);
  }

  const rawContentLength = providerResponse.headers.get('content-length');
  const providerContentLength = rawContentLength === null ? null : parseByteCount(rawContentLength);
  if (
    (rawContentLength !== null && providerContentLength === null) ||
    (providerContentLength !== null &&
      (providerContentLength > MAX_OUTPUT_BYTES ||
        (declaredOutputBytes !== null && providerContentLength !== declaredOutputBytes)))
  ) {
    lifetime.dispose();
    await providerResponse.body.cancel().catch(() => undefined);
    await releaseLeaseBeforeResponse();
    return jsonError(
      ErrorCodes.AI_UNAVAILABLE,
      'Generated output exceeds the delivery size limit',
      502
    );
  }

  const contentType =
    deliverable.mimeType || providerResponse.headers.get('content-type') || 'image/png';
  const headers = safeHeaders({
    'Content-Type': contentType,
  });
  if (providerContentLength !== null) {
    headers['Content-Length'] = String(providerContentLength);
  } else if (declaredOutputBytes !== null) {
    headers['Content-Length'] = String(declaredOutputBytes);
  }

  const reader = providerResponse.body.getReader();
  let finished = false;
  let aborted = request.signal.aborted;
  let streamedBytes = 0;
  let pendingChunk: Uint8Array | undefined;
  let readerReleased = false;
  let leaseRenewalUnavailable = false;
  let leaseRenewalInFlight: Promise<void> | null = null;
  let leaseError: Error | null = null;
  let leaseExpiresAt = durableLease?.expiresAtMs ?? 0;
  let nextLeaseRenewalAt = durableLease
    ? Date.now() + DURABLE_DELIVERY_RENEW_INTERVAL_MS
    : Number.POSITIVE_INFINITY;
  let leaseRenewalTimer: ReturnType<typeof setInterval> | undefined;
  let leaseExpiryTimer: ReturnType<typeof setTimeout> | undefined;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const releaseReader = () => {
    if (readerReleased) return;
    readerReleased = true;
    reader.releaseLock();
  };
  const stopLeaseTimers = () => {
    lifetime.dispose();
    if (leaseRenewalTimer) clearInterval(leaseRenewalTimer);
    if (leaseExpiryTimer) clearTimeout(leaseExpiryTimer);
    leaseRenewalTimer = undefined;
    leaseExpiryTimer = undefined;
  };
  const failLease = (error: Error) => {
    if (leaseError || finished) return;
    leaseError = error;
    aborted = true;
    request.signal.removeEventListener('abort', abortReader);
    stopLeaseTimers();
    void reader
      .cancel(error)
      .catch(() => undefined)
      .finally(releaseReader);
    void releaseLeaseBeforeResponse();
    streamController?.error(error);
  };
  const scheduleLeaseExpiry = () => {
    if (!durableLease || finished || leaseError) return;
    if (leaseExpiryTimer) clearTimeout(leaseExpiryTimer);
    const delay = Math.max(1, leaseExpiresAt - Date.now() - 1000);
    leaseExpiryTimer = setTimeout(() => {
      failLease(new Error('Durable output delivery lease expired'));
    }, delay);
  };
  const renewLease = async (force = false): Promise<void> => {
    if (
      !durableLease ||
      finished ||
      aborted ||
      leaseError ||
      leaseRenewalUnavailable ||
      leaseRenewalInFlight
    ) {
      return leaseRenewalInFlight ?? Promise.resolve();
    }
    if (!force && Date.now() < nextLeaseRenewalAt) return;

    const lease = durableLease;
    const renewalStartedAt = Date.now();
    leaseRenewalInFlight = (async () => {
      const result = await renewDurableDelivery(lease);
      if (result === 'unavailable') {
        leaseRenewalUnavailable = true;
        scheduleLeaseExpiry();
        return;
      }
      if (result === 'denied') {
        throw new Error('Durable output delivery lease renewal was denied');
      }
      leaseExpiresAt = renewalStartedAt + DURABLE_DELIVERY_LEASE_MS;
      nextLeaseRenewalAt = renewalStartedAt + DURABLE_DELIVERY_RENEW_INTERVAL_MS;
      scheduleLeaseExpiry();
    })()
      .catch(error => {
        failLease(
          error instanceof Error ? error : new Error('Durable output lease renewal failed')
        );
      })
      .finally(() => {
        leaseRenewalInFlight = null;
      });
    await leaseRenewalInFlight;
  };
  const abortReader = () => {
    failLease(new Error('Output delivery aborted'));
  };
  request.signal.addEventListener('abort', abortReader, { once: true });

  const stream = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        streamController = controller;
        if (aborted) {
          abortReader();
          return;
        }
        if (durableLease) {
          scheduleLeaseExpiry();
          leaseRenewalTimer = setInterval(() => {
            void renewLease(true);
          }, DURABLE_DELIVERY_RENEW_INTERVAL_MS);
        }
      },
      async pull(controller) {
        if (finished) return;
        try {
          await renewLease();
          if (leaseError) {
            finished = true;
            controller.error(leaseError);
            return;
          }
          while (true) {
            const { done, value } = await reader.read();
            if (aborted || leaseError) throw leaseError ?? new Error('Output delivery aborted');
            if (!done) {
              if (!value?.byteLength) continue;
              const nextByteCount = streamedBytes + value.byteLength;
              if (
                nextByteCount > MAX_OUTPUT_BYTES ||
                (declaredOutputBytes !== null && nextByteCount > declaredOutputBytes)
              ) {
                await reader.cancel('output exceeds delivery size limit').catch(() => undefined);
                throw new Error('Generated output exceeds the delivery size limit');
              }
              streamedBytes = nextByteCount;
              if (pendingChunk) {
                controller.enqueue(pendingChunk);
                pendingChunk = value;
                return;
              }
              pendingChunk = value;
              continue;
            }
            if (streamedBytes === 0) throw new Error('Generated output was empty');
            if (declaredOutputBytes !== null && streamedBytes !== declaredOutputBytes)
              throw new Error('Generated output size does not match stored metadata');
            if (providerContentLength !== null && streamedBytes !== providerContentLength)
              throw new Error('Generated output length does not match response metadata');
            break;
          }
          if (leaseError) throw leaseError;
          const acknowledged = durableLease
            ? await acknowledgeDurableDelivery(durableLease, durableDeliverableForAck!)
            : await creditManager.acknowledgeReceipt(userId, parsed.data.reservationJobId, {
                deliveryToken: parsed.data.deliveryToken,
                imageUrl: deliverable.imageUrl,
                mimeType: deliverable.mimeType || contentType,
                expiresAt: deliverable.expiresAt,
              });
          if (!acknowledged) {
            throw new Error('Failed to acknowledge streamed output');
          }
          durableDeliveryAcknowledged = Boolean(durableLease);
          finished = true;
          if (pendingChunk) controller.enqueue(pendingChunk);
          pendingChunk = undefined;
          controller.close();
        } catch (error) {
          if (finished) return;
          await reader.cancel(error).catch(() => undefined);
          pendingChunk = undefined;
          finished = true;
          controller.error(error instanceof Error ? error : new Error('Failed to stream output'));
        } finally {
          if (finished) {
            request.signal.removeEventListener('abort', abortReader);
            stopLeaseTimers();
            await releaseLeaseBeforeResponse();
            releaseReader();
          }
        }
      },
      async cancel(reason) {
        aborted = true;
        finished = true;
        request.signal.removeEventListener('abort', abortReader);
        await reader.cancel(reason).catch(() => undefined);
        stopLeaseTimers();
        await releaseLeaseBeforeResponse();
        releaseReader();
      },
    },
    { highWaterMark: 0 }
  );

  return new NextResponse(stream, { status: 200, headers });
}
