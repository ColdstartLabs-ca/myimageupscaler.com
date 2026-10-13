/**
 * Pure R2/S3 query-string signing with aws4fetch.
 *
 * This module holds the signing options with no environment or bucket
 * knowledge, so the server service and the smoke script sign the exact same
 * way. `server/services/r2-storage.service.ts` adds credentials, bucket
 * validation and key builders, then delegates here.
 *
 * A PUT always signs the `If-None-Match: *` precondition and the exact body
 * `content-length` (`allHeaders: true`), so a replayed grant cannot replace a
 * committed object and cannot declare a smaller size than it uploads. A GET or
 * HEAD signs only the host, but each binds its own HTTP method. All bind the
 * expiry through `X-Amz-Expires`.
 */

import { AwsV4Signer } from 'aws4fetch';

const R2_SERVICE = 's3';
const R2_REGION = 'auto';

function assertSizeBytes(sizeBytes) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error('A presigned PUT requires a positive integer sizeBytes');
  }
  return sizeBytes;
}

async function presign(
  method,
  { url, accessKeyId, secretAccessKey, contentType, sizeBytes, expiresSeconds }
) {
  const target = new URL(url);
  target.searchParams.set('X-Amz-Expires', String(expiresSeconds));
  const headers =
    method === 'PUT'
      ? {
          'if-none-match': '*',
          'content-length': String(assertSizeBytes(sizeBytes)),
          ...(contentType ? { 'content-type': contentType } : {}),
        }
      : undefined;

  const signer = new AwsV4Signer({
    accessKeyId,
    secretAccessKey,
    method,
    url: target.toString(),
    signQuery: true,
    service: R2_SERVICE,
    region: R2_REGION,
    ...(headers ? { headers, allHeaders: true } : {}),
  });

  return (await signer.sign()).url.toString();
}

/** Presign a PUT bound to the method, content type, size, expiry and If-None-Match:*. */
export function presignPutUrl(options) {
  return presign('PUT', options);
}

/** Presign a GET bound to the method and expiry. */
export function presignGetUrl(options) {
  return presign('GET', options);
}

/** Presign a HEAD bound to the method and expiry. */
export function presignHeadUrl(options) {
  return presign('HEAD', options);
}
