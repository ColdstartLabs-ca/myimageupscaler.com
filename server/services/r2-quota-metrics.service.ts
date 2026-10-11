import { serverEnv } from '@shared/config/env';

// Cloudflare R2 metrics API (account-level, one aggregate request):
// https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/metrics/methods/list/
const R2_METRICS_ENDPOINT = 'https://api.cloudflare.com/client/v4/accounts';
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/;
const REQUEST_TIMEOUT_MS = 10_000;

const CLASS_KEYS = ['standard', 'infrequentAccess'] as const;
const STATE_KEYS = ['published', 'uploaded'] as const;

function isPayloadSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Measure the account-wide R2 payload bytes with one Cloudflare REST call.
 *
 * The response carries `result.standard` and `result.infrequentAccess`, each
 * with optional `published` and `uploaded` states that hold a `payloadSize`.
 * We sum every present class/state pair. An absent state counts as zero, but an
 * empty result or any present state without a valid non-negative safe integer
 * `payloadSize` returns `null` (UNMEASURED) so a real breach is never masked by
 * a fabricated zero. Missing credentials, a bad account id, a network or HTTP
 * error, or `success: false` also return `null`.
 *
 * One account total covers the shared cache bucket and the new MIU images, so
 * the value is the account payload, not a per-bucket figure. The measurement
 * can lag; the official docs are the source of truth.
 */
export async function measureR2AccountPayloadBytes(): Promise<number | null> {
  const token = serverEnv.CLOUDFLARE_API_TOKEN;
  const accountId = serverEnv.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !ACCOUNT_ID_PATTERN.test(accountId)) return null;

  let response: Response;
  try {
    response = await fetch(`${R2_METRICS_ENDPOINT}/${accountId}/r2/metrics`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
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
  if (!body || typeof body !== 'object') return null;

  const envelope = body as { success?: unknown; result?: unknown };
  if (envelope.success !== true) return null;
  if (!envelope.result || typeof envelope.result !== 'object') return null;

  let total = 0;
  let measuredPairs = 0;
  for (const classKey of CLASS_KEYS) {
    const classValue = (envelope.result as Record<string, unknown>)[classKey];
    if (classValue === undefined || classValue === null) continue;
    if (typeof classValue !== 'object') return null;

    for (const stateKey of STATE_KEYS) {
      const stateValue = (classValue as Record<string, unknown>)[stateKey];
      if (stateValue === undefined) continue;
      if (!stateValue || typeof stateValue !== 'object') return null;

      const size = (stateValue as Record<string, unknown>).payloadSize;
      if (!isPayloadSize(size)) return null;
      total += size;
      measuredPairs += 1;
    }
  }

  if (measuredPairs === 0 || !Number.isSafeInteger(total)) return null;
  return total;
}
