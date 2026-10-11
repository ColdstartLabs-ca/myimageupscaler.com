#!/usr/bin/env node
/**
 * SQR-04 concrete operator adapters: the real R2 + Supabase implementations of
 * the callbacks the verified `runGalleryBackupRegistration` engine and the R2
 * gallery backup flow require.
 *
 * NO PRODUCTION SIDE EFFECTS AT IMPORT. Credentials load only through
 * `loadR2OperatorConfig()`, and every network/DB/process effect stays injected,
 * so a hermetic test can prove the safety contract without a real secret. The
 * engine owns the ordering and fail-closed rules; these adapters only carry them
 * out. No DELETE, no original-object write, no cleanup exists here.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  SHA256_REGEX,
  isSafeObjectPath,
  assertSafeRegularFile,
  assertSafeRunBasename,
} from './backup-verification.mjs';
import { objectUrl, readbackVerify, resolveContentType } from './migrate-r2.mjs';
import { streamDownloadToFile } from './backup-and-purge.mjs';
import { presignGetUrl, presignHeadUrl, presignPutUrl } from '../../server/services/r2-presign.mjs';

export const GCLOUD_PROJECT = 'myimageupscaler-auth';
export const GCLOUD_SECRET_API = 'myimageupscaler-api-prod';
export const PROJECT_REF = 'xqysaylskffsfwunczbd';
export const PRIVATE_BUCKET = 'miu-private';
export const GALLERY_BUCKET = 'saved-images';
export const SAVED_PREFIX = 'saved/';
export const ARCHIVE_PREFIX = 'archive/gallery/';
export const PROOF_PREFIX = 'gallery-proofs/';
export const DEFAULT_EXPIRES_SECONDS = 15 * 60;
export const READBACK_TIMEOUT_MS = 120_000;
export const HEAD_CONCURRENCY = 4;
export const DEFAULT_LAPTOP = 'joao@192.168.1.126';

const ACCOUNT_ID_REGEX = /^[0-9a-f]{32}$/;
const REGION_REGEX = /^[a-z0-9-]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ETAG_REGEX = /^"[^"]+"$/;
const MAX_ETAG_LENGTH = 130;
const CONTROL_CHAR_REGEX = /[\u0000-\u001f\u007f]/;
const ARCHIVE_KEY_REGEX = /^archive\/gallery\/([0-9a-f-]{36})\/([0-9a-f]{64})$/i;
const PROOF_FILE_REGEX = /^gallery-proofs\/[0-9a-f-]{36}-[0-9a-f]{64}\.json$/i;

function fail(message) {
  throw new Error(message);
}

function chunk(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

/** A proof ETag must be a strong quoted, short, control-free token. */
export function assertStrongEtag(etag, label = 'ETag') {
  if (typeof etag !== 'string' || !ETAG_REGEX.test(etag)) {
    fail(`${label} must be a strong quoted ETag`);
  }
  if (etag.length > MAX_ETAG_LENGTH) fail(`${label} exceeds ${MAX_ETAG_LENGTH} characters`);
  if (CONTROL_CHAR_REGEX.test(etag)) fail(`${label} contains control characters`);
  return etag;
}

function assertIdentityEncoding(headers) {
  const encoding = headers.get('content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') {
    fail('Response has unexpected content encoding');
  }
}

function assertExactLength(headers, expected, label) {
  const raw = headers.get('content-length');
  const length = raw === null ? Number.NaN : Number(raw);
  if (!Number.isSafeInteger(length) || length !== expected) fail(`${label} size mismatch`);
}

// =============================================================================
// Configuration (GCloud Secret Manager, read-only, values never printed)
// =============================================================================

export function parseDotenv(text) {
  const map = new Map();
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    map.set(trimmed.slice(0, index), trimmed.slice(index + 1));
  }
  return map;
}

function requiredValue(map, key) {
  const value = map.get(key);
  if (typeof value !== 'string' || value.length === 0) fail(`Missing required secret: ${key}`);
  return value;
}

/**
 * Read the single API secret (project `myimageupscaler-auth`) and derive the R2
 * signing config and the pooler DB config. The public project ref is fixed, so
 * no client secret is read. Never log or return the raw secret text.
 */
export function loadR2OperatorConfig({ exec = execFileSync } = {}) {
  const raw = exec(
    'gcloud',
    ['secrets', 'versions', 'access', 'latest', `--secret=${GCLOUD_SECRET_API}`, `--project=${GCLOUD_PROJECT}`],
    { encoding: 'utf8' }
  );
  const map = parseDotenv(raw);
  const accountId = requiredValue(map, 'CLOUDFLARE_ACCOUNT_ID');
  if (!ACCOUNT_ID_REGEX.test(accountId)) {
    fail('CLOUDFLARE_ACCOUNT_ID must be 32 lowercase hex characters');
  }
  const region = requiredValue(map, 'SUPABASE_DB_REGION');
  if (!REGION_REGEX.test(region)) {
    fail('SUPABASE_DB_REGION must use lowercase letters, digits or hyphens');
  }
  const accessKeyId = requiredValue(map, 'R2_ACCESS_KEY_ID');
  const secretAccessKey = requiredValue(map, 'R2_SECRET_ACCESS_KEY');
  const dbPassword = requiredValue(map, 'SUPABASE_DB_PASSWORD');
  return Object.freeze({
    signing: Object.freeze({
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      accessKeyId,
      secretAccessKey,
    }),
    dbConfig: Object.freeze({
      dbHost: `aws-0-${region}.pooler.supabase.com`,
      dbUser: `postgres.${PROJECT_REF}`,
      dbPassword,
    }),
  });
}

// =============================================================================
// Concrete adapters
// =============================================================================

const INSERT_PROOF_SQL = `
  INSERT INTO public.gallery_expiry_backups (
    image_id, user_id, storage_path, saved_row, sha256, size_bytes, source_etag,
    archive_key, archive_etag, backup_run_id, manifest_sha256,
    local_verified_at, remote_verified_at
  ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  ON CONFLICT (image_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    storage_path = EXCLUDED.storage_path,
    saved_row = EXCLUDED.saved_row,
    sha256 = EXCLUDED.sha256,
    size_bytes = EXCLUDED.size_bytes,
    source_etag = EXCLUDED.source_etag,
    archive_key = EXCLUDED.archive_key,
    archive_etag = EXCLUDED.archive_etag,
    backup_run_id = EXCLUDED.backup_run_id,
    manifest_sha256 = EXCLUDED.manifest_sha256,
    local_verified_at = EXCLUDED.local_verified_at,
    remote_verified_at = EXCLUDED.remote_verified_at
  WHERE public.gallery_expiry_backups.state = 'ready'
  RETURNING image_id
`;

export function createR2GalleryAdapters({
  db,
  signing,
  runDir,
  runner,
  fetchFn = fetch,
  laptop = DEFAULT_LAPTOP,
} = {}) {
  if (!db || typeof db.query !== 'function') fail('createR2GalleryAdapters requires a db client');
  if (!signing || typeof signing.endpoint !== 'string') fail('createR2GalleryAdapters requires a signing configuration');
  if (typeof fetchFn !== 'function') fail('createR2GalleryAdapters requires a fetch function');
  if (typeof runner !== 'function') fail('createR2GalleryAdapters requires a process runner');
  const { endpoint, accessKeyId, secretAccessKey } = signing;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    fail('Signing configuration requires endpoint, accessKeyId and secretAccessKey');
  }
  const resolvedRunDir = runDir ? path.resolve(runDir) : null;
  const runBasename = resolvedRunDir ? assertSafeRunBasename(path.basename(resolvedRunDir)) : null;
  const versionByPath = new Map();
  let lastEtag = null;

  // Wrap the injected fetch so every read-back GET captures the real ETag and
  // rejects a non-200, an encoded body or a weak/empty ETag before any proof.
  const captureFetch = async (url, init = {}) => {
    const response = await fetchFn(url, init);
    if ((init.method ?? 'GET') === 'GET') {
      if (response.status !== 200) fail(`GET failed: HTTP ${response.status}`);
      assertIdentityEncoding(response.headers);
      lastEtag = assertStrongEtag(response.headers.get('etag'), 'GET');
    }
    return response;
  };

  const getObjectProof = async (key, sha256, bytes) => {
    const readback = await readbackVerify({
      presignGet: presignGetUrl,
      signing,
      fetchFn: captureFetch,
      targetBucket: PRIVATE_BUCKET,
      targetKey: key,
      expectedSha256: sha256,
      expectedBytes: bytes,
    });
    return { sha256: readback.sha256, bytes: readback.bytes, etag: lastEtag };
  };

  async function headObject(objectPath, expectedBytes) {
    const url = await presignHeadUrl({
      url: objectUrl(endpoint, PRIVATE_BUCKET, `${SAVED_PREFIX}${objectPath}`),
      accessKeyId,
      secretAccessKey,
      expiresSeconds: DEFAULT_EXPIRES_SECONDS,
    });
    const response = await fetchFn(url, {
      method: 'HEAD',
      redirect: 'error',
      signal: AbortSignal.timeout(READBACK_TIMEOUT_MS),
    });
    if (response.status !== 200) fail(`HEAD failed for ${objectPath}: HTTP ${response.status}`);
    assertIdentityEncoding(response.headers);
    assertExactLength(response.headers, expectedBytes, `HEAD ${objectPath}`);
    const etag = assertStrongEtag(response.headers.get('etag'), 'HEAD');
    const rawLastModified = response.headers.get('last-modified');
    const parsed = rawLastModified === null ? Number.NaN : Date.parse(rawLastModified);
    if (!Number.isFinite(parsed)) fail(`HEAD LastModified invalid for ${objectPath}`);
    return { etag, lastModified: new Date(parsed).toISOString() };
  }

  /** Full inventory of the R2-backed gallery with a bounded HEAD proof per row. */
  async function listObjects(bucket) {
    if (bucket !== GALLERY_BUCKET) fail(`Unknown bucket: ${bucket}`);
    const { rows } = await db.query(
      `SELECT to_jsonb(si) AS row FROM public.saved_images AS si WHERE si.storage_backend = 'r2' ORDER BY si.id`
    );
    const objects = [];
    for (const batch of chunk(rows, HEAD_CONCURRENCY)) {
      const listed = await Promise.all(
        batch.map(async ({ row }) => {
          if (!row || typeof row !== 'object') fail('Saved row is not an object');
          if (!isSafeObjectPath(row.storage_path)) fail(`Unsafe object path: ${row.storage_path}`);
          if (!UUID_REGEX.test(row.id)) fail(`Saved row id is not a UUID: ${row.id}`);
          if (!Number.isSafeInteger(row.file_size_bytes) || row.file_size_bytes <= 0) {
            fail(`Saved row size is not a positive safe integer: ${row.storage_path}`);
          }
          const head = await headObject(row.storage_path, row.file_size_bytes);
          versionByPath.set(row.storage_path, head.etag);
          return {
            path: row.storage_path,
            id: row.id,
            version: head.etag,
            bytes: row.file_size_bytes,
            created_at: row.created_at,
            updated_at: head.lastModified,
          };
        })
      );
      objects.push(...listed);
    }
    return objects;
  }

  /**
   * Stream one source object to disk through the reviewed `streamDownloadToFile`
   * writer (unique `wx` temp, rename only on exact bytes). An If-Match guard and a
   * positive byte bound are required, and the response must carry an exact
   * content-length and an ETag equal to the listed conditional version, so a
   * changed, encoded or short source fails closed.
   */
  async function downloadObject({ bucket, path: objectPath, targetPath, expectedBytes, ifMatch } = {}) {
    if (bucket !== GALLERY_BUCKET) fail(`Unknown bucket: ${bucket}`);
    if (!isSafeObjectPath(objectPath)) fail(`Unsafe object path: ${objectPath}`);
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) {
      fail(`Download requires a positive expected length for ${objectPath}`);
    }
    const conditional = ifMatch ?? versionByPath.get(objectPath);
    if (!conditional) fail(`Download requires a listed conditional version for ${objectPath}`);
    const ifMatchEtag = assertStrongEtag(conditional, 'If-Match');
    const url = await presignGetUrl({
      url: objectUrl(endpoint, PRIVATE_BUCKET, `${SAVED_PREFIX}${objectPath}`),
      accessKeyId,
      secretAccessKey,
      expiresSeconds: DEFAULT_EXPIRES_SECONDS,
    });
    const guardedFetch = async (requestUrl, init = {}) => {
      const response = await fetchFn(requestUrl, {
        ...init,
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(READBACK_TIMEOUT_MS),
      });
      if (response.status === 412) fail(`Download source changed: ${objectPath}`);
      if (response.status !== 200 || !response.body) {
        fail(`Download failed for ${objectPath}: HTTP ${response.status}`);
      }
      assertIdentityEncoding(response.headers);
      assertExactLength(response.headers, expectedBytes, `Download ${objectPath}`);
      const etag = assertStrongEtag(response.headers.get('etag'), 'Download');
      if (etag !== ifMatchEtag) fail(`Download ETag mismatch for ${objectPath}`);
      return response;
    };
    return streamDownloadToFile({
      url,
      headers: { 'if-match': ifMatchEtag },
      targetPath,
      expectedBytes,
      fetchFn: guardedFetch,
    });
  }

  /** Load the one native saved_images row for a path. No Date coercion. */
  async function loadSavedRow(objectPath) {
    if (!isSafeObjectPath(objectPath)) fail(`Unsafe object path: ${objectPath}`);
    const { rows } = await db.query(
      `SELECT to_jsonb(si) AS row FROM public.saved_images AS si
        WHERE si.storage_path = $1 AND si.storage_backend = 'r2'`,
      [objectPath]
    );
    if (!Array.isArray(rows) || rows.length !== 1) {
      fail(`Expected exactly one R2 saved row for ${objectPath}`);
    }
    return rows[0].row;
  }

  /** Full authenticated GET of the live source, returning hash, bytes and ETag. */
  async function verifySource({ key, sha256, bytes } = {}) {
    if (typeof key !== 'string' || !key.startsWith(SAVED_PREFIX)) fail('verifySource key must start with saved/');
    const objectPath = key.slice(SAVED_PREFIX.length);
    if (!isSafeObjectPath(objectPath) || !UUID_REGEX.test(objectPath.split('/')[0])) {
      fail(`Unsafe source key: ${key}`);
    }
    if (!SHA256_REGEX.test(String(sha256))) fail('verifySource requires a 64-hex sha256');
    if (!Number.isSafeInteger(bytes) || bytes <= 0) fail('verifySource requires a positive byte count');
    return getObjectProof(key, sha256, bytes);
  }

  /**
   * Conditionally PUT the immutable archive copy (If-None-Match:*) with an
   * explicit content-length and a signed content-type, then prove a full GET. A
   * 412 is accepted only when the existing object passes `verifyExisting`.
   */
  async function archiveAndVerify({ archiveKey, localPath, sha256, bytes, verifyExisting } = {}) {
    const match = ARCHIVE_KEY_REGEX.exec(String(archiveKey ?? ''));
    if (!match) fail(`Unsafe archive key: ${archiveKey}`);
    if (!SHA256_REGEX.test(String(sha256))) fail('archiveAndVerify requires a 64-hex sha256');
    if (match[2].toLowerCase() !== sha256) fail('Archive key sha256 does not match the source sha256');
    if (!Number.isSafeInteger(bytes) || bytes <= 0) fail('archiveAndVerify requires a positive byte count');
    if (typeof verifyExisting !== 'function') fail('archiveAndVerify requires a verifyExisting callback');
    if (!resolvedRunDir) fail('archiveAndVerify requires a runDir');
    await assertSafeRegularFile(resolvedRunDir, path.resolve(localPath));

    const contentType = resolveContentType({ path: localPath });
    const url = await presignPutUrl({
      url: objectUrl(endpoint, PRIVATE_BUCKET, archiveKey),
      accessKeyId,
      secretAccessKey,
      contentType,
      sizeBytes: bytes,
      expiresSeconds: DEFAULT_EXPIRES_SECONDS,
    });
    const putResponse = await fetchFn(url, {
      method: 'PUT',
      headers: {
        'content-type': contentType,
        'content-length': String(bytes),
        'if-none-match': '*',
      },
      body: Readable.toWeb(createReadStream(localPath)),
      duplex: 'half',
      redirect: 'error',
      signal: AbortSignal.timeout(READBACK_TIMEOUT_MS),
    });

    if (putResponse.status === 412) {
      const existing = await getObjectProof(archiveKey, sha256, bytes);
      if (!(await verifyExisting(existing))) {
        fail(`Existing archive does not match the verified source: ${archiveKey}`);
      }
      return existing;
    }
    if (!putResponse.ok) fail(`Archive PUT failed for ${archiveKey}: HTTP ${putResponse.status}`);
    return getObjectProof(archiveKey, sha256, bytes);
  }

  /**
   * Persist the canonical snapshot metadata to the local run dir (wx, 0400) and
   * to the laptop, then require both raw SHA256 proofs to match. No pixel hash is
   * used in the filename, so a re-registration keeps the row's own version.
   */
  async function persistSnapshotProof(snapshot = {}) {
    const { rawJson, sha256 } = snapshot;
    const relative = snapshot.filename;
    if (typeof rawJson !== 'string') fail('persistSnapshotProof requires rawJson');
    if (!SHA256_REGEX.test(String(sha256))) fail('persistSnapshotProof requires a 64-hex sha256');
    if (createHash('sha256').update(rawJson).digest('hex') !== sha256) {
      fail('Snapshot rawJson sha256 mismatch');
    }
    if (typeof relative !== 'string' || !PROOF_FILE_REGEX.test(relative)) {
      fail(`Unsafe snapshot filename: ${relative}`);
    }
    if (!relative.includes(sha256)) fail('Snapshot filename must include the metadata sha256');
    if (!resolvedRunDir) fail('persistSnapshotProof requires a runDir');

    const localPath = path.join(resolvedRunDir, relative);
    const parent = path.dirname(localPath);
    // Reuse the existing verifier: it rejects any symlink or non-directory
    // ancestor. A brand-new proof file is allowed, so only its own absence is OK.
    try {
      await assertSafeRegularFile(resolvedRunDir, localPath);
    } catch (error) {
      if (error.code !== 'ENOENT' && !/^Missing expected file: /.test(String(error.message))) throw error;
    }
    await fs.mkdir(parent, { recursive: true, mode: 0o700 });

    let localSha256;
    try {
      await fs.writeFile(localPath, rawJson, { flag: 'wx', mode: 0o400 });
      localSha256 = createHash('sha256').update(rawJson).digest('hex');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if ((await fs.lstat(localPath)).isSymbolicLink()) {
        fail(`Snapshot file is a symlink: ${relative}`);
      }
      const existing = await fs.readFile(localPath, 'utf8');
      if (existing !== rawJson) fail(`Snapshot file exists with different bytes: ${relative}`);
      localSha256 = createHash('sha256').update(existing).digest('hex');
    }
    if (localSha256 !== sha256) fail('Snapshot local sha256 mismatch');

    const basename = path.basename(relative);
    const remoteDir = `~/backups/miu-storage/${runBasename}/${path.dirname(relative)}`;
    await runner('ssh', [laptop, `mkdir -p ${remoteDir}`]);
    await runner('rsync', ['-a', '--', localPath, `${laptop}:${remoteDir}/`]);
    const check = await runner('ssh', [laptop, `cd ${remoteDir} && sha256sum -c -`], {
      input: `${sha256}  ${basename}\n`,
    });
    const text = String(check ?? '');
    if (/FAILED/.test(text) || !text.includes(`${basename}: OK`)) {
      fail('Snapshot remote sha256 verification failed');
    }
    return { localSha256, remoteSha256: sha256 };
  }

  /**
   * Record the proof. A conflict may only refresh a still-`ready` row; a row that
   * is `deleting` or `completed` is never overwritten, and zero affected rows is
   * a stop. No delete, profile or credit write exists in this adapter.
   */
  async function insertProof(proof = {}) {
    const result = await db.query(INSERT_PROOF_SQL, [
      proof.image_id,
      proof.user_id,
      proof.storage_path,
      JSON.stringify(proof.saved_row),
      proof.sha256,
      proof.size_bytes,
      proof.source_etag,
      proof.archive_key,
      proof.archive_etag,
      proof.backup_run_id,
      proof.manifest_sha256,
      proof.local_verified_at,
      proof.remote_verified_at,
    ]);
    if (!result || result.rowCount !== 1) {
      fail(`Proof insert affected ${result?.rowCount ?? 0} rows for ${proof.image_id}`);
    }
    return Object.freeze({ image_id: proof.image_id });
  }

  return Object.freeze({
    listObjects,
    downloadObject,
    loadSavedRow,
    verifySource,
    archiveAndVerify,
    persistSnapshotProof,
    insertProof,
  });
}
