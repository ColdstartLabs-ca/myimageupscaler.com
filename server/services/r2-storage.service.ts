/**
 * R2 storage service.
 *
 * Talks to Cloudflare R2 through its S3-compatible API with aws4fetch. The S3
 * credentials come from serverEnv (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`).
 * The account endpoint needs `CLOUDFLARE_ACCOUNT_ID`, and the region is `auto`.
 *
 * Object keys are fully qualified (`inputs/<userId>/<jobId>.<ext>`,
 * `saved/<storage_path>`, `dev/...`). Callers pass relative keys to the builders
 * below so every key stays inside its bucket prefix.
 */

import { AwsClient } from 'aws4fetch';

import { serverEnv } from '@shared/config/env';

import { presignGetUrl, presignPutUrl } from './r2-presign.mjs';

export const R2_PRIVATE_BUCKET = 'miu-private';
export const R2_PUBLIC_BUCKET = 'miu-public';
export const R2_PUBLIC_BASE_URL = 'https://assets.myimageupscaler.com';

export const R2_INPUTS_PREFIX = 'inputs/';
export const R2_SAVED_PREFIX = 'saved/';
export const R2_DEV_PREFIX = 'dev/';

const R2_SERVICE = 's3';
const R2_REGION = 'auto';
const DEFAULT_PUT_EXPIRES_SECONDS = 15 * 60;
const DEFAULT_GET_EXPIRES_SECONDS = 10 * 60;
const CLIENT_RETRIES = 2;
const CLIENT_INIT_RETRY_MS = 100;
const ALLOWED_BUCKETS = new Set<string>([R2_PRIVATE_BUCKET, R2_PUBLIC_BUCKET]);

export interface IPresignPutOptions {
  bucket: string;
  key: string;
  /** Exact body size in bytes. The signature binds it as `content-length`. */
  sizeBytes: number;
  contentType?: string;
  expiresSeconds?: number;
}

function assertBucket(bucket: string): void {
  if (!ALLOWED_BUCKETS.has(bucket)) {
    throw new Error(`Unknown R2 bucket: ${bucket}`);
  }
}

function assertSafeKey(key: string): void {
  const hasControlCharacter = [...key].some(character => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  if (
    key.length === 0 ||
    key.startsWith('/') ||
    key.endsWith('/') ||
    key.includes('..') ||
    key.includes('\\') ||
    hasControlCharacter
  ) {
    throw new Error('Invalid R2 object key');
  }
}

function requireCredentials(): { accessKeyId: string; secretAccessKey: string } {
  const accessKeyId = serverEnv.R2_ACCESS_KEY_ID;
  const secretAccessKey = serverEnv.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('R2 storage is not configured');
  }
  return { accessKeyId, secretAccessKey };
}

function endpoint(): string {
  if (!serverEnv.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('R2 storage is not configured');
  }
  return `https://${serverEnv.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

/** Build the exact S3 object URL for a bucket and key. */
export function objectUrl(bucket: string, key: string): string {
  assertBucket(bucket);
  assertSafeKey(key);
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${endpoint()}/${bucket}/${encodedKey}`;
}

/** Prefix a relative `inputs/<userId>/<jobId>.<ext>` path. */
export function buildInputKey(storagePath: string): string {
  return `${R2_INPUTS_PREFIX}${storagePath}`;
}

/** Prefix a relative `saved/<existing storage_path>` path. */
export function buildSavedKey(storagePath: string): string {
  return `${R2_SAVED_PREFIX}${storagePath}`;
}

/** Build a key for smoke tests and local runs. */
export function buildDevKey(...segments: string[]): string {
  return `${R2_DEV_PREFIX}${segments.join('/')}`;
}

/**
 * Presign a PUT. The signature binds the method, key, expiry, content type, the
 * exact `content-length` and the `If-None-Match: *` precondition. R2 refuses the
 * write with 412 when the object already exists, so a replayed grant cannot
 * overwrite a committed input with different bytes after validation, and a grant
 * cannot declare a smaller size than it uploads.
 */
export async function presignPut({
  bucket,
  key,
  sizeBytes,
  contentType,
  expiresSeconds = DEFAULT_PUT_EXPIRES_SECONDS,
}: IPresignPutOptions): Promise<string> {
  return presignPutUrl({
    ...requireCredentials(),
    url: objectUrl(bucket, key),
    sizeBytes,
    contentType,
    expiresSeconds,
  });
}

/** Presign a GET for a private object. The caller must use the GET method. */
export async function presignGet(
  bucket: string,
  key: string,
  expiresSeconds: number = DEFAULT_GET_EXPIRES_SECONDS
): Promise<string> {
  return presignGetUrl({
    ...requireCredentials(),
    url: objectUrl(bucket, key),
    expiresSeconds,
  });
}

function createClient(): AwsClient {
  return new AwsClient({
    ...requireCredentials(),
    service: R2_SERVICE,
    region: R2_REGION,
    retries: CLIENT_RETRIES,
    initRetryMs: CLIENT_INIT_RETRY_MS,
  });
}

/**
 * Upload an object. Body is streamed by the caller where relevant.
 *
 * The write always sends `If-None-Match: *`, so R2 refuses it with 412 when the
 * key already exists. A filename collision can then never overwrite committed
 * user or blog bytes. There is no option to disable the precondition.
 */
export async function put(
  bucket: string,
  key: string,
  // eslint-disable-next-line no-undef -- BodyInit is a TypeScript DOM type
  body: BodyInit,
  contentType?: string
): Promise<void> {
  const response = await createClient().fetch(objectUrl(bucket, key), {
    method: 'PUT',
    body,
    headers: {
      'if-none-match': '*',
      ...(contentType ? { 'content-type': contentType } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`R2 PUT failed for ${key}: ${response.status}`);
  }
}

/** Delete an object. A missing object is not an error. */
export async function deleteObject(bucket: string, key: string): Promise<void> {
  const response = await createClient().fetch(objectUrl(bucket, key), { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 DELETE failed for ${key}: ${response.status}`);
  }
}

/** Fetch an object. The response body is streamed to the caller. */
export async function get(bucket: string, key: string): Promise<Response> {
  return createClient().fetch(objectUrl(bucket, key), { method: 'GET' });
}

/** Read object metadata without downloading the body. */
export async function head(bucket: string, key: string): Promise<Response> {
  return createClient().fetch(objectUrl(bucket, key), { method: 'HEAD' });
}

const R2_GALLERY_ARCHIVE_PREFIX = 'archive/gallery/';
const COPY_RESPONSE_MAX_BYTES = 8192;
const COPY_FETCH_TIMEOUT_MS = 10_000;
const MAX_ETAG_LENGTH = 130;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export interface IRestoreGalleryArchiveInput {
  imageId: string;
  sha256: string;
  storagePath: string;
  archiveEtag: string;
  sourceEtag: string;
  sizeBytes: number;
}

function assertQuotedEtag(value: string, label: string): void {
  const inner = typeof value === 'string' ? value.slice(1, -1) : '';
  const quoted =
    typeof value === 'string' &&
    value.length >= 2 &&
    value.length <= MAX_ETAG_LENGTH &&
    value.startsWith('"') &&
    value.endsWith('"') &&
    inner.length > 0 &&
    ![...inner].some(character => {
      const code = character.charCodeAt(0);
      return character === '"' || code <= 0x1f || code === 0x7f;
    });
  if (!quoted) {
    throw new Error(`Invalid ${label}`);
  }
}

function assertPositiveSize(sizeBytes: number): void {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error('Invalid sizeBytes');
  }
}

function assertIdentityEncoding(headers: Headers, label: string): void {
  const encoding = headers.get('content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') {
    throw new Error(`${label} has unexpected content encoding`);
  }
}

function assertExactLength(headers: Headers, expected: number, label: string): void {
  const raw = headers.get('content-length');
  const length = raw === null ? Number.NaN : Number(raw);
  if (!Number.isSafeInteger(length) || length !== expected) {
    throw new Error(`${label} size mismatch`);
  }
}

/** Signed R2 fetch with no redirects, no caching and a hard timeout. */
// eslint-disable-next-line no-undef -- RequestInit is a TypeScript DOM type
async function r2Fetch(url: string, init: RequestInit): Promise<Response> {
  return createClient().fetch(url, {
    ...init,
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(COPY_FETCH_TIMEOUT_MS),
  });
}

/** Read the CopyObjectResult XML, capped at 8192 bytes, and return its ETag. */
async function readCopyObjectEtag(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('CopyObject response has no body');
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > COPY_RESPONSE_MAX_BYTES) {
      await reader.cancel();
      throw new Error('CopyObject response body too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const xml = new TextDecoder().decode(bytes);
  if (/<Error[\s>]/.test(xml)) {
    throw new Error('CopyObject returned an error');
  }
  if (!/<CopyObjectResult[\s>]/.test(xml) || !/<\/CopyObjectResult>/.test(xml)) {
    throw new Error('CopyObject result missing');
  }
  const match = /<ETag>([^<]*)<\/ETag>/.exec(xml);
  if (!match) {
    throw new Error('CopyObject result missing ETag');
  }
  const etag = match[1].replace(/&quot;/g, '"');
  assertQuotedEtag(etag, 'copy ETag');
  return etag;
}

/**
 * Restore a gallery image from its immutable private archive without streaming
 * the bytes through the Worker.
 *
 * The archive object is HEAD-verified against the expected ETag and byte count,
 * then copied with CopyObject to the saved key. Three preconditions protect the
 * write: the source archive ETag must still match, the destination must not
 * exist (`cf-copy-destination-if-none-match: *`) and the archive is immutable,
 * so the source and destination checks cannot race. No bytes are downloaded, no
 * checksum is recomputed and the archive object is never deleted. On a 412 the
 * existing target is accepted only when it matches the original saved object.
 */
export async function restoreGalleryArchive(
  input: IRestoreGalleryArchiveInput
): Promise<string> {
  const { imageId, sha256, storagePath, archiveEtag, sourceEtag, sizeBytes } = input;

  if (!UUID_PATTERN.test(imageId)) {
    throw new Error('Invalid imageId');
  }
  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error('Invalid sha256');
  }
  const targetKey = buildSavedKey(storagePath);
  assertSafeKey(targetKey);
  assertQuotedEtag(archiveEtag, 'archiveEtag');
  assertQuotedEtag(sourceEtag, 'sourceEtag');
  assertPositiveSize(sizeBytes);

  const archiveKey = `${R2_GALLERY_ARCHIVE_PREFIX}${imageId}/${sha256}`;
  const archiveUrl = objectUrl(R2_PRIVATE_BUCKET, archiveKey);
  const targetUrl = objectUrl(R2_PRIVATE_BUCKET, targetKey);

  const archiveHead = await r2Fetch(archiveUrl, { method: 'HEAD' });
  if (archiveHead.status !== 200) {
    throw new Error(`Archive HEAD failed: ${archiveHead.status}`);
  }
  assertIdentityEncoding(archiveHead.headers, 'Archive');
  if (archiveHead.headers.get('etag') !== archiveEtag) {
    throw new Error('Archive ETag mismatch');
  }
  assertExactLength(archiveHead.headers, sizeBytes, 'Archive');

  const copySource = `/${R2_PRIVATE_BUCKET}/${archiveKey
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  const copyResponse = await r2Fetch(targetUrl, {
    method: 'PUT',
    headers: {
      'x-amz-copy-source': copySource,
      'x-amz-copy-source-if-match': archiveEtag,
      'cf-copy-destination-if-none-match': '*',
    },
  });

  if (copyResponse.status === 412) {
    const existingHead = await r2Fetch(targetUrl, { method: 'HEAD' });
    if (existingHead.status !== 200) {
      throw new Error(`Existing target HEAD failed: ${existingHead.status}`);
    }
    assertIdentityEncoding(existingHead.headers, 'Existing target');
    if (existingHead.headers.get('etag') !== sourceEtag) {
      throw new Error('Existing target ETag mismatch');
    }
    assertExactLength(existingHead.headers, sizeBytes, 'Existing target');
    return sourceEtag;
  }

  if (copyResponse.status !== 200) {
    throw new Error(`CopyObject failed: ${copyResponse.status}`);
  }

  const copiedEtag = await readCopyObjectEtag(copyResponse);

  const targetHead = await r2Fetch(targetUrl, { method: 'HEAD' });
  if (targetHead.status !== 200) {
    throw new Error(`Target HEAD failed: ${targetHead.status}`);
  }
  assertIdentityEncoding(targetHead.headers, 'Target');
  if (targetHead.headers.get('etag') !== copiedEtag) {
    throw new Error('Target ETag mismatch');
  }
  assertExactLength(targetHead.headers, sizeBytes, 'Target');
  return copiedEtag;
}
