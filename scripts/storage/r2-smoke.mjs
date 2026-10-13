#!/usr/bin/env node
/**
 * R2 smoke test (PRD-SQR-02 AC-1) plus the destination-conditional CopyObject
 * extension.
 *
 * Exercises the real `miu-private` bucket the same way the upload route, the
 * provider read path and an archive copy do:
 *   1. Presign a PUT (method PUT, content-type, exact content-length and
 *      `If-None-Match: *` bound, 15 minute expiry).
 *   2. PUT a small object with `Origin: https://myimageupscaler.com`.
 *   3. PUT a wrong content-type and a wrong declared length; both must return 403
 *      so the signature provably binds those headers.
 *   4. Replay the PUT with different bytes of the same length; the immutable-write
 *      precondition must return HTTP 412 and leave the stored bytes unchanged.
 *   5. A ranged GET must return 206 with the requested bytes.
 *   6. OPTIONS preflight must allow PUT, content-type and if-none-match for each
 *      configured origin.
 *   7. Presign a GET as the provider would, fetch it, and compare the sha256.
 *   8. CopyObject: copy the source to an absent destination with a matching
 *      `x-amz-copy-source-if-match` and `cf-copy-destination-if-none-match: *`;
 *      require 200, a complete non-error `CopyObjectResult` ETag and an exact
 *      full GET. A copy over the existing destination and a copy with a wrong
 *      source ETag must both return 412 and leave the destination absent or
 *      unchanged.
 *
 * Every key lives under a unique `dev/smoke/<UUID>/` prefix, so a run can never
 * touch `inputs/`, `saved/` or `archive/`. The script deletes only this run's
 * unique keys, in a `finally` block.
 *
 * The presigned URLs come from the exact production signing helper
 * (`server/services/r2-presign.mjs`), so a passing smoke proves production
 * signing, not a copy. Credentials are loaded through the reviewed operator
 * `loadR2OperatorConfig` only in the guarded CLI main; importing this module has
 * no side effect and never reads the environment.
 *
 * Run (requires the R2 operator config):
 *   node scripts/storage/r2-smoke.mjs
 */

import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { AwsClient } from 'aws4fetch';

import { presignGetUrl, presignPutUrl } from '../../server/services/r2-presign.mjs';

export const BUCKET = 'miu-private';
const REGION = 'auto';
const SERVICE = 's3';
const PUT_EXPIRES_SECONDS = 15 * 60;
const GET_EXPIRES_SECONDS = 10 * 60;
const ORIGINS = [
  'https://myimageupscaler.com',
  'https://www.myimageupscaler.com',
  'http://localhost:3000',
];

const RUN_PREFIX = 'dev/smoke/';
const RUN_KEY_REGEX =
  /^dev\/smoke\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;
const ETAG_REGEX = /^"[^"]+"$/;
const MAX_COPY_RESULT_BYTES = 4096;
const READBACK_TIMEOUT_MS = 120_000;
const DELETE_OK_STATUSES = new Set([200, 204, 404]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertStrongEtag(etag, label) {
  if (typeof etag !== 'string' || !ETAG_REGEX.test(etag)) {
    throw new Error(`${label} must be a strong quoted ETag, got: ${etag}`);
  }
  return etag;
}

function assertCorsOrigin(response, label, expectedOrigin) {
  const allowOrigin = response.headers.get('access-control-allow-origin');
  assert(
    allowOrigin === expectedOrigin || allowOrigin === '*',
    `${label} must return Access-Control-Allow-Origin, got: ${allowOrigin}`
  );
}

/** Build the object URL and refuse any key outside this run's dev/smoke prefix. */
export function devObjectUrl(endpoint, key) {
  if (typeof key !== 'string' || !RUN_KEY_REGEX.test(key)) {
    throw new Error(`Refusing a non dev/smoke/<uuid>/ key: ${key}`);
  }
  const base = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
  return `${base}/${BUCKET}/${key}`;
}

function timedInit(init) {
  return { redirect: 'error', signal: AbortSignal.timeout(READBACK_TIMEOUT_MS), ...init };
}

/** Read a small response body with a hard cap, so a copy result stays bounded. */
async function readBoundedText(response, maxBytes, label) {
  assert(response.body, `${label}: response has no body`);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error(`${label}: body exceeds ${maxBytes} bytes`);
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** A CopyObject 200 must be a complete, non-error document with a strong ETag. */
async function parseCopyObjectResult(response) {
  const text = await readBoundedText(response, MAX_COPY_RESULT_BYTES, 'CopyObjectResult');
  if (/<Error[\s>]/.test(text)) {
    throw new Error(`CopyObject returned an error document: ${text.slice(0, 200)}`);
  }
  if (!text.includes('</CopyObjectResult>')) throw new Error('CopyObjectResult is incomplete');
  const decoded = text.replaceAll('&quot;', '"').replaceAll('&amp;', '&');
  const match = /<ETag>([^<]*)<\/ETag>/.exec(decoded);
  if (!match) throw new Error('CopyObjectResult is missing an ETag');
  return assertStrongEtag(match[1].trim(), 'CopyObject ETag');
}

/**
 * Drive the full smoke with injected dependencies. `signing` signs every
 * presigned URL; `fetchFn` performs the presigned PUT/GET and the OPTIONS
 * preflight; `client.fetch` performs the authenticated CopyObject, HEAD and
 * DELETE. Returns a concise proof object.
 */
export async function runR2Smoke({ signing, fetchFn = fetch, client } = {}) {
  const { endpoint, accessKeyId, secretAccessKey } = signing ?? {};
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('runR2Smoke requires endpoint, accessKeyId and secretAccessKey');
  }
  const authorizedFetch = typeof client?.fetch === 'function' ? client.fetch.bind(client) : fetchFn;

  const runId = randomUUID();
  const prefix = `${RUN_PREFIX}${runId}/`;
  const keys = {
    source: `${prefix}source.png`,
    dest: `${prefix}dest.png`,
    source2: `${prefix}source2.png`,
    wrong: `${prefix}wrong.png`,
  };
  const runKeys = Object.values(keys);

  const contentType = 'image/png';
  const sourceBody = Buffer.from('r2-smoke-source-' + runId);
  const sourceSha256 = createHash('sha256').update(sourceBody).digest('hex');

  const putUrl = (key, sizeBytes) =>
    presignPutUrl({
      url: devObjectUrl(endpoint, key),
      accessKeyId,
      secretAccessKey,
      contentType,
      sizeBytes,
      expiresSeconds: PUT_EXPIRES_SECONDS,
    });
  const getUrl = key =>
    presignGetUrl({
      url: devObjectUrl(endpoint, key),
      accessKeyId,
      secretAccessKey,
      expiresSeconds: GET_EXPIRES_SECONDS,
    });

  const putObject = async (key, body, sizeBytes = body.byteLength, headerType = contentType) =>
    fetchFn(
      await putUrl(key, sizeBytes),
      timedInit({
        method: 'PUT',
        headers: { 'content-type': headerType, 'if-none-match': '*', Origin: ORIGINS[0] },
        body,
      })
    );

  const copyObject = (destKey, sourceKey, ifMatch) =>
    authorizedFetch(
      devObjectUrl(endpoint, destKey),
      timedInit({
        method: 'PUT',
        headers: {
          'x-amz-copy-source': `/${BUCKET}/${sourceKey}`,
          'x-amz-copy-source-if-match': ifMatch,
          'cf-copy-destination-if-none-match': '*',
        },
      })
    );

  const readObject = async key => {
    const response = await fetchFn(await getUrl(key), timedInit({ method: 'GET' }));
    assert(response.ok, `GET ${key} failed: ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      body,
      sha256: createHash('sha256').update(body).digest('hex'),
      contentType: response.headers.get('content-type'),
    };
  };

  const proof = { runPrefix: prefix, keys, sourceSha256 };
  let failure = null;
  try {
    // 1. Direct immutable PUT of the source.
    const putResponse = await putObject(keys.source, sourceBody);
    assert(putResponse.ok, `PUT failed: ${putResponse.status} ${await putResponse.text()}`);
    assertCorsOrigin(putResponse, 'PUT 200', ORIGINS[0]);
    const sourceEtag = assertStrongEtag(putResponse.headers.get('etag'), 'source PUT');
    console.log(`PUT  ${keys.source} -> ${putResponse.status}`);

    // 2. A correct length but a different content-type must not match the signature.
    const wrongType = await putObject(keys.source, sourceBody, sourceBody.byteLength, 'application/octet-stream');
    assert(wrongType.status === 403, `Wrong content-type PUT must return 403, got ${wrongType.status}`);
    console.log(`PUT  ${keys.source} -> ${wrongType.status} (wrong content-type rejected)`);

    // 3. A signed content-length that differs from the uploaded bytes must fail too.
    const wrongLength = await putObject(keys.source, sourceBody, sourceBody.byteLength + 1);
    assert(wrongLength.status === 403, `Wrong declared-length PUT must return 403, got ${wrongLength.status}`);
    console.log(`PUT  ${keys.source} -> ${wrongLength.status} (wrong declared length rejected)`);

    // 4. A replayed grant with different bytes of the same length must be refused
    // by the signed precondition, so the committed input cannot be replaced.
    const replayBody = Buffer.from(sourceBody);
    replayBody[0] ^= 0xff;
    const replayResponse = await putObject(keys.source, replayBody);
    assert(replayResponse.status === 412, `Second different PUT must return 412, got ${replayResponse.status}`);
    assertCorsOrigin(replayResponse, 'PUT 412', ORIGINS[0]);
    console.log(`PUT2 ${keys.source} -> ${replayResponse.status} (immutable precondition)`);

    // 5. The provider reads a bounded prefix with a Range request.
    const rangeResponse = await fetchFn(
      await getUrl(keys.source),
      timedInit({ method: 'GET', headers: { Range: 'bytes=0-3' } })
    );
    assert(rangeResponse.status === 206, `Range GET must return 206, got ${rangeResponse.status}`);
    const rangeBytes = Buffer.from(await rangeResponse.arrayBuffer());
    assert(
      rangeBytes.equals(sourceBody.subarray(0, 4)),
      `Range GET bytes mismatch: ${rangeBytes.toString('hex')}`
    );
    console.log(`GET  ${keys.source} -> ${rangeResponse.status} (range bytes match)`);

    // 6. OPTIONS preflight must allow PUT, content-type and if-none-match per origin.
    for (const origin of ORIGINS) {
      const corsPreflight = await fetchFn(
        devObjectUrl(endpoint, keys.source),
        timedInit({
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'PUT',
            'Access-Control-Request-Headers': 'content-type,if-none-match',
          },
        })
      );
      const allowedHeaders = (corsPreflight.headers.get('access-control-allow-headers') ?? '').toLowerCase();
      const allowedMethods = (corsPreflight.headers.get('access-control-allow-methods') ?? '').toUpperCase();
      assert(
        corsPreflight.status >= 200 && corsPreflight.status < 300,
        `OPTIONS failed for ${origin}: ${corsPreflight.status}`
      );
      assertCorsOrigin(corsPreflight, `OPTIONS ${origin}`, origin);
      assert(allowedMethods.includes('PUT'), `Preflight for ${origin} must allow PUT, got: ${allowedMethods}`);
      assert(
        allowedHeaders.includes('content-type') && allowedHeaders.includes('if-none-match'),
        `Preflight for ${origin} must allow content-type and if-none-match, got: ${allowedHeaders}`
      );
      console.log(`OPT  ${origin} -> ${corsPreflight.status} (PUT + content-type + if-none-match)`);
    }

    // 7. Full source GET stays byte-identical after the rejected replay.
    const sourceProof = await readObject(keys.source);
    assert(
      sourceProof.sha256 === sourceSha256,
      `sha256 mismatch after replay rejection: ${sourceProof.sha256} != ${sourceSha256}`
    );
    assert(sourceProof.contentType === contentType, `unexpected content-type: ${sourceProof.contentType}`);
    console.log(`GET  ${keys.source} -> ${sourceProof.status} (sha256 unchanged)`);

    // 8a. Copy the source to an absent destination and prove an exact read back.
    const source2Body = Buffer.from('r2-smoke-source2-' + runId);
    const source2Put = await putObject(keys.source2, source2Body);
    assert(source2Put.ok, `source2 PUT failed: ${source2Put.status}`);
    const source2Etag = assertStrongEtag(source2Put.headers.get('etag'), 'source2 PUT');

    const copyResponse = await copyObject(keys.dest, keys.source, sourceEtag);
    assert(copyResponse.status === 200, `CopyObject must return 200, got ${copyResponse.status}`);
    const copyEtag = await parseCopyObjectResult(copyResponse);
    const copied = await readObject(keys.dest);
    assert(copied.body.equals(sourceBody), 'Copied object bytes differ from the source');
    assert(copied.sha256 === sourceSha256, `Copied object sha256 mismatch: ${copied.sha256}`);
    console.log(`COPY ${keys.dest} -> 200 (etag ${copyEtag}, sha256 match)`);

    // 8b. A copy over the existing destination with different source bytes is
    // blocked by the destination precondition and leaves the bytes unchanged.
    const retryResponse = await copyObject(keys.dest, keys.source2, source2Etag);
    assert(retryResponse.status === 412, `Copy over an existing destination must return 412, got ${retryResponse.status}`);
    const unchanged = await readObject(keys.dest);
    assert(
      unchanged.body.equals(sourceBody) && unchanged.sha256 === sourceSha256,
      'Destination changed after a rejected copy'
    );
    console.log(`COPY ${keys.dest} -> ${retryResponse.status} (destination precondition, bytes unchanged)`);

    // 8c. A copy with a wrong source ETag to another absent key must not create it.
    const wrongResponse = await copyObject(keys.wrong, keys.source, '"00000000000000000000000000000000"');
    assert(wrongResponse.status === 412, `Wrong source ETag copy must return 412, got ${wrongResponse.status}`);
    const wrongHead = await authorizedFetch(devObjectUrl(endpoint, keys.wrong), timedInit({ method: 'HEAD' }));
    assert(wrongHead.status === 404, `Wrong source ETag copy must not create the destination, HEAD got ${wrongHead.status}`);
    console.log(`COPY ${keys.wrong} -> 412 (source precondition), HEAD -> 404`);

    Object.assign(proof, {
      sourceEtag,
      copy: { status: copyResponse.status, etag: copyEtag, sha256: copied.sha256 },
      copyOverDestination: { status: retryResponse.status },
      wrongSourceEtag: { copy: wrongResponse.status, head: wrongHead.status },
    });
  } catch (error) {
    failure = error;
  } finally {
    // Delete only this run's unique keys, after any attempt and on any failure.
    for (const key of runKeys) {
      try {
        const deleteResponse = await authorizedFetch(
          devObjectUrl(endpoint, key),
          timedInit({ method: 'DELETE' })
        );
        assert(
          DELETE_OK_STATUSES.has(deleteResponse.status),
          `DELETE failed for ${key}: ${deleteResponse.status}`
        );
      } catch (cleanupError) {
        const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        if (failure) {
          console.error(`CLEANUP FAILED for ${key}: ${message}; object may remain`);
        } else {
          failure = cleanupError;
        }
      }
    }
    if (!failure) proof.deleted = runKeys;
  }

  if (failure) throw failure;
  console.log('OK: R2 smoke passed');
  return proof;
}

/**
 * CLI entry point. Credentials load only here through the reviewed operator
 * config, so importing this module stays side-effect free.
 */
export async function main() {
  const { loadR2OperatorConfig } = await import('./r2-gallery-operator-adapters.mjs');
  const { signing } = loadR2OperatorConfig();
  const client = new AwsClient({
    accessKeyId: signing.accessKeyId,
    secretAccessKey: signing.secretAccessKey,
    service: SERVICE,
    region: REGION,
  });
  return runR2Smoke({ signing, client });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
