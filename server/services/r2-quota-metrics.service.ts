import { serverEnv } from '@shared/config/env';
import { R2_PRIVATE_BUCKET, R2_PUBLIC_BUCKET } from '@server/services/r2-storage.service';

// Cloudflare R2 per-bucket usage API:
// https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/usage/
const R2_ACCOUNTS_ENDPOINT = 'https://api.cloudflare.com/client/v4/accounts';
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/;
const SIZE_PATTERN = /^\d+$/;
const REQUEST_TIMEOUT_MS = 10_000;
const MIU_BUCKETS = [R2_PRIVATE_BUCKET, R2_PUBLIC_BUCKET] as const;

function parseSize(value: unknown): number | null {
  if (typeof value !== 'string' || !SIZE_PATTERN.test(value)) return null;
  const size = Number(value);
  return Number.isSafeInteger(size) ? size : null;
}

async function measureBucketPayloadBytes(accountId: string, token: string, bucket: string) {
  let response: Response;
  try {
    response = await fetch(`${R2_ACCOUNTS_ENDPOINT}/${accountId}/r2/buckets/${bucket}/usage`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      // workerd rejects redirect: 'error'; a manual redirect is not ok and returns null.
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  const envelope = body as { success?: unknown; result?: Record<string, unknown> } | null;
  if (envelope?.success !== true || !envelope.result || typeof envelope.result !== 'object') {
    return null;
  }

  const standard = parseSize(envelope.result.payloadSize);
  const infrequent =
    envelope.result.infrequentAccessPayloadSize === undefined
      ? 0
      : parseSize(envelope.result.infrequentAccessPayloadSize);
  if (standard === null || infrequent === null) return null;
  return standard + infrequent;
}

/**
 * Measure the payload bytes of the MIU file buckets (miu-private + miu-public).
 *
 * The account-wide R2 total also holds the OpenNext cache bucket (about 101 GB,
 * already paid), so it cannot be compared with the 10 GB MIU budget. Any failed
 * request or invalid size returns `null` (UNMEASURED), never a fabricated zero.
 */
export async function measureR2AccountPayloadBytes(): Promise<number | null> {
  const token = serverEnv.CLOUDFLARE_API_TOKEN;
  const accountId = serverEnv.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !ACCOUNT_ID_PATTERN.test(accountId)) return null;

  const sizes = await Promise.all(
    MIU_BUCKETS.map(bucket => measureBucketPayloadBytes(accountId, token, bucket))
  );
  if (sizes.some(size => size === null)) return null;
  const total = (sizes as number[]).reduce((sum, size) => sum + size, 0);
  return Number.isSafeInteger(total) ? total : null;
}
