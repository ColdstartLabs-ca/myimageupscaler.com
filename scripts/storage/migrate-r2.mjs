#!/usr/bin/env node
/**
 * PRD-SQR-02 Phase 3 prepared tooling: immutable copy from the verified PRD-SQR-01
 * backup to Cloudflare R2, plus a streaming read-back SHA256 gate.
 *
 * This module PREPARES the migration. It is a library (`runMigrationCopy`) plus a
 * guarded operator CLI. It never deletes a Supabase object, never rewrites a DB
 * row and never reads a secret at import. The `copy` subcommand requires
 * `--confirm` and a Supabase-source frozen plan before it reads a credential.
 *
 * Safety contract (docs/PRDs/supabase-quota-recovery/README.md):
 *   - The frozen manifest and its receipt come from `loadBackupIdentity`.
 *   - Every planned object keeps the exact source sha256 and byte count.
 *   - Local proof (`verifyFrozenArtifacts`) and remote laptop proof
 *     (`verifyRemoteBatch`) run per batch of 50 or fewer BEFORE any PUT.
 *   - The frozen plan binds the whole raw manifest sha256 and the fixed mapping.
 *   - Every PUT signs `If-None-Match: *` + content-length + content-type through
 *     the exact production helper `server/services/r2-presign.mjs`.
 *   - An existing target (412) is accepted only when the read-back bytes and
 *     sha256 equal the manifest. A mismatch stops the run and never overwrites.
 *   - A resume re-reads and re-hashes every completed R2 key. A checkpoint is
 *     never trusted on its own.
 *   - The receipt is published only after all read-backs pass and the object
 *     count and byte total are exact.
 *
 * Usage (all read-only except the local plan file and the immutable R2 copy):
 *   plan --manifest <backup-run-dir>
 *   copy --manifest <backup-run-dir> --confirm
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import {
  SHA256_REGEX,
  assertSafeRegularFile,
  isSafeObjectPath,
  loadBackupIdentity,
  verifyFrozenArtifacts,
  verifyRemoteBatch,
} from './backup-verification.mjs';
import { writeAtomicJson, chunk } from './backup-and-purge.mjs';
import { presignGetUrl, presignPutUrl } from '../../server/services/r2-presign.mjs';

// =============================================================================
// Configuration
// =============================================================================

export const SAVED_BUCKET = 'saved-images';
export const BLOG_BUCKET = 'blog-images';
export const INPUT_BUCKET = 'upscale-inputs';
export const PRIVATE_BUCKET = 'miu-private';
export const PUBLIC_BUCKET = 'miu-public';

export const MIGRATION_BATCH_SIZE = 50;
export const DEFAULT_EXPIRES_SECONDS = 15 * 60;
export const READBACK_TIMEOUT_MS = 120_000;

// The signing endpoint must be an HTTPS Cloudflare R2 account endpoint, never an
// arbitrary host that could receive a signed request.
const R2_ENDPOINT_HOST_REGEX = /^[0-9a-f]{32}\.r2\.cloudflarestorage\.com$/;

export const PLAN_FILE = 'r2-migration-plan.json';
export const PLAN_DIGEST_FILE = 'r2-migration-plan.digest';
export const CHECKPOINT_FILE = 'r2-migration-checkpoint.json';
export const RECEIPT_FILE = 'r2-migration-receipt.json';

// Fixed source -> target mapping. No invented blog prefix: blog paths keep their
// exact backup path inside the public bucket.
const BUCKET_MAP = Object.freeze({
  [SAVED_BUCKET]: { targetBucket: PRIVATE_BUCKET, prefix: 'saved/' },
  [INPUT_BUCKET]: { targetBucket: PRIVATE_BUCKET, prefix: 'inputs/' },
  [BLOG_BUCKET]: { targetBucket: PUBLIC_BUCKET, prefix: '' },
});

// Strict known extension table. No application/octet-stream fallback.
export const MIME_BY_EXTENSION = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
});

// Declared MIME metadata is accepted only when it is one of the known image
// types in the extension table. Anything else fails closed before any PUT.
const KNOWN_IMAGE_MIMES = new Set(Object.values(MIME_BY_EXTENSION));

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function required(value, label) {
  if (!value) throw new Error(`missing required ${label}`);
  return value;
}

// =============================================================================
// Pure planning helpers
// =============================================================================

/** Resolve MIME from manifest metadata, else the strict extension table. */
export function resolveContentType(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const declared =
    row.content_type ??
    row.mime_type ??
    metadata.mimetype ??
    metadata['content-type'] ??
    metadata.contentType;
  if (typeof declared === 'string' && declared.trim().length > 0) {
    const value = declared.trim();
    if (value === 'application/octet-stream') {
      throw new Error(`Refusing octet-stream content type for ${row.bucket}/${row.path}`);
    }
    if (!KNOWN_IMAGE_MIMES.has(value)) {
      throw new Error(`Unsupported content type for ${row.bucket}/${row.path}: ${value}`);
    }
    return value;
  }
  const extension = path.extname(row.path).slice(1).toLowerCase();
  const mime = MIME_BY_EXTENSION[extension];
  if (!mime) {
    throw new Error(`Unknown content type extension for ${row.bucket}/${row.path}`);
  }
  return mime;
}

/** Map one manifest row to its fixed target. Fails on unsafe path or bucket. */
export function mapManifestRow(row) {
  if (!row || typeof row !== 'object') throw new Error('Manifest row must be an object');
  if (!isSafeObjectPath(row.path)) throw new Error(`Unsafe object path: ${row.path}`);
  const mapping = BUCKET_MAP[row.bucket];
  if (!mapping) throw new Error(`Unknown source bucket: ${row.bucket}`);
  if (!SHA256_REGEX.test(row.sha256)) {
    throw new Error(`Invalid SHA256 for ${row.bucket}/${row.path}`);
  }
  if (!Number.isSafeInteger(row.bytes) || row.bytes <= 0) {
    throw new Error(`Invalid byte count for ${row.bucket}/${row.path}`);
  }
  return Object.freeze({
    sourceBucket: row.bucket,
    sourcePath: row.path,
    sha256: row.sha256,
    bytes: row.bytes,
    targetBucket: mapping.targetBucket,
    targetKey: `${mapping.prefix}${row.path}`,
    contentType: resolveContentType(row),
  });
}

/**
 * Build the frozen plan: the whole raw manifest sha256 plus the exact fixed
 * mapping. Duplicate target keys are refused.
 */
export function buildMigrationPlan(identity) {
  if (!identity || !Array.isArray(identity.manifest)) {
    throw new Error('buildMigrationPlan requires a backup identity');
  }
  if (!SHA256_REGEX.test(identity.manifestSha256)) {
    throw new Error('Backup identity manifestSha256 is invalid');
  }
  const seen = new Set();
  const mapping = identity.manifest.map(row => {
    const entry = mapManifestRow(row);
    const dedupeKey = `${entry.targetBucket}::${entry.targetKey}`;
    if (seen.has(dedupeKey)) throw new Error(`Duplicate target mapping: ${dedupeKey}`);
    seen.add(dedupeKey);
    return entry;
  });
  return Object.freeze({
    manifest_sha256: identity.manifestSha256,
    manifest_object_count: identity.objectCount,
    manifest_total_bytes: identity.totalBytes,
    mapping: Object.freeze(mapping),
  });
}

/** Canonical sha256 of the frozen plan, binding the manifest sha and mapping. */
export function migrationPlanSha256(plan) {
  return sha256Text(JSON.stringify(plan));
}

function assertPlanBinding(identity, plan) {
  if (plan.manifest_sha256 !== identity.manifestSha256) {
    throw new Error('Migration plan is bound to a different manifest');
  }
  if (plan.manifest_object_count !== identity.objectCount) {
    throw new Error('Migration plan object count does not match the manifest');
  }
  if (plan.manifest_total_bytes !== identity.totalBytes) {
    throw new Error('Migration plan byte total does not match the manifest');
  }
  const expected = buildMigrationPlan(identity);
  if (JSON.stringify(expected.mapping) !== JSON.stringify(plan.mapping)) {
    throw new Error('Migration plan mapping does not match the fixed manifest mapping');
  }
}

/** Write the frozen plan and its digest. `wx` never overwrites an existing plan. */
export async function writeFrozenMigrationPlan(backupDir, plan) {
  const text = JSON.stringify(plan);
  const digest = sha256Text(text);
  const planPath = path.join(backupDir, PLAN_FILE);
  const digestPath = path.join(backupDir, PLAN_DIGEST_FILE);
  await fs.writeFile(planPath, text, { flag: 'wx', mode: 0o400 });
  await fs.writeFile(digestPath, `${digest}\n`, { flag: 'wx', mode: 0o400 });
  return { planPath, digestPath, digest };
}

/**
 * Load and re-validate a frozen plan against a freshly loaded backup identity.
 * A missing receipt, a mismatched manifest or a tampered plan all fail closed.
 */
export async function loadFrozenMigrationPlan({ backupRunDir, planPath, planDigestPath } = {}) {
  const identity = await loadBackupIdentity(required(backupRunDir, '--manifest <backup-run-dir>'));
  const resolvedPlan = planPath ?? path.join(identity.runDir, PLAN_FILE);
  const resolvedDigest = planDigestPath ?? path.join(identity.runDir, PLAN_DIGEST_FILE);
  await assertSafeRegularFile(identity.runDir, resolvedPlan);
  await assertSafeRegularFile(identity.runDir, resolvedDigest);

  const rawPlan = await fs.readFile(resolvedPlan, 'utf8');
  const rawDigest = (await fs.readFile(resolvedDigest, 'utf8')).trim();
  if (!SHA256_REGEX.test(rawDigest)) throw new Error('Migration plan digest is not a 64-hex SHA256');
  if (rawDigest !== sha256Text(rawPlan)) {
    throw new Error('Migration plan digest does not bind the raw plan file');
  }

  let plan;
  try {
    plan = JSON.parse(rawPlan);
  } catch (error) {
    throw new Error(`Invalid migration plan JSON: ${error.message}`);
  }
  if (JSON.stringify(plan) !== rawPlan) {
    throw new Error('Migration plan file is not canonical JSON');
  }
  assertPlanBinding(identity, plan);

  return Object.freeze({
    identity,
    plan: Object.freeze({ ...plan, mapping: Object.freeze(plan.mapping.map(entry => Object.freeze({ ...entry }))) }),
    planSha256: rawDigest,
  });
}

// =============================================================================
// Copy library
// =============================================================================

/**
 * Build the exact object URL. The logical target key stays raw in the plan;
 * each path segment is percent-encoded here so a key segment cannot leak into
 * the query string or fragment of the signed request.
 */
export function objectUrl(endpoint, bucket, key) {
  const base = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
  const encodedKey = String(key)
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
  return `${base}/${encodeURIComponent(bucket)}/${encodedKey}`;
}

/** Reject any signing endpoint that is not an HTTPS R2 account endpoint. */
function assertR2Endpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('Signing endpoint is not a valid URL');
  }
  if (url.protocol !== 'https:') throw new Error('Signing endpoint must use HTTPS');
  if (url.username || url.password) throw new Error('Signing endpoint must not include credentials');
  if (url.search) throw new Error('Signing endpoint must not include a query string');
  if (url.hash) throw new Error('Signing endpoint must not include a fragment');
  if (url.pathname !== '/') throw new Error('Signing endpoint must not include a path');
  if (!R2_ENDPOINT_HOST_REGEX.test(url.hostname)) {
    throw new Error(`Signing endpoint must be a Cloudflare R2 account endpoint: ${url.hostname}`);
  }
  return endpoint;
}

function signingConfig(signing) {
  if (!signing || typeof signing !== 'object') {
    throw new Error('runMigrationCopy requires a signing configuration');
  }
  const { endpoint, accessKeyId, secretAccessKey } = signing;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Signing configuration requires endpoint, accessKeyId and secretAccessKey');
  }
  return {
    endpoint: assertR2Endpoint(endpoint),
    accessKeyId,
    secretAccessKey,
    expiresSeconds: signing.expiresSeconds ?? DEFAULT_EXPIRES_SECONDS,
  };
}

/** Stream-hash an R2 object with bounded memory. HTTP errors and bad counts stop. */
export async function readbackVerify({ presignGet, signing, fetchFn, targetBucket, targetKey, expectedSha256, expectedBytes }) {
  const url = await presignGet({
    url: objectUrl(signing.endpoint, targetBucket, targetKey),
    accessKeyId: signing.accessKeyId,
    secretAccessKey: signing.secretAccessKey,
    expiresSeconds: signing.expiresSeconds,
  });
  const response = await fetchFn(url, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(READBACK_TIMEOUT_MS),
  });
  if (!response || !response.ok || !response.body) {
    throw new Error(`Read-back failed for ${targetBucket}/${targetKey}: HTTP ${response?.status ?? 'no-response'}`);
  }
  const hash = createHash('sha256');
  let bytes = 0;
  const stream = Readable.fromWeb(response.body);
  try {
    for await (const part of stream) {
      bytes += part.length;
      if (bytes > expectedBytes) {
        throw new Error(`Read-back overrun for ${targetBucket}/${targetKey}: expected ${expectedBytes} bytes`);
      }
      hash.update(part);
    }
  } catch (error) {
    stream.destroy();
    throw error;
  }
  const sha256 = hash.digest('hex');
  if (bytes !== expectedBytes) {
    throw new Error(`Read-back byte count mismatch for ${targetBucket}/${targetKey}: ${bytes} != ${expectedBytes}`);
  }
  if (sha256 !== expectedSha256) {
    throw new Error(`Read-back sha256 mismatch for ${targetBucket}/${targetKey}: ${sha256} != ${expectedSha256}`);
  }
  return { sha256, bytes };
}

async function readCheckpoint(checkpointPath) {
  try {
    return JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Invalid checkpoint: ${error.message}`);
  }
}

/**
 * Assert a checkpoint/receipt path stays inside the run dir and that no existing
 * path segment is a symlink. The final file may be absent, so a fresh write is
 * allowed; every existing parent must be a real directory.
 */
async function assertSafeWritePath(rootResolved, targetPath) {
  const target = path.resolve(targetPath);
  const rel = path.relative(rootResolved, target);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes the backup run directory: ${targetPath}`);
  }
  const segments = rel.split(path.sep);
  let cursor = rootResolved;
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]);
    let stats;
    try {
      stats = await fs.lstat(cursor);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`Symlink escape: ${segments.slice(0, index + 1).join('/')}`);
    }
    const isLast = index === segments.length - 1;
    if (isLast) {
      if (!stats.isFile()) throw new Error(`Not a regular file: ${segments.join('/')}`);
    } else if (!stats.isDirectory()) {
      throw new Error(`Non-directory parent: ${segments.slice(0, index + 1).join('/')}`);
    }
  }
}

/**
 * Preserve any existing receipt under a content-addressed, non-overwriting
 * `.previous/<raw-sha256>.json`, then remove the live receipt so a run never
 * trusts a receipt it did not prove in this run. Old proof is never lost.
 */
async function preserveExistingReceipt(rootResolved, receiptPath) {
  await assertSafeWritePath(rootResolved, receiptPath);
  let stats;
  try {
    stats = await fs.lstat(receiptPath);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const raw = await fs.readFile(receiptPath, 'utf8');
  const previousDir = path.join(path.dirname(receiptPath), '.previous');
  try {
    const previousStats = await fs.lstat(previousDir);
    if (previousStats.isSymbolicLink()) throw new Error('Symlink escape: .previous');
    if (!previousStats.isDirectory()) throw new Error('Not a directory: .previous');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.mkdir(previousDir, { recursive: true, mode: 0o700 });
  }
  const previousPath = path.join(previousDir, `${sha256Text(raw)}.json`);
  let previousEntry = null;
  try {
    previousEntry = await fs.lstat(previousPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previousEntry) {
    if (previousEntry.isSymbolicLink()) throw new Error('Symlink escape: .previous entry');
    if (!previousEntry.isFile()) throw new Error('Not a regular file: .previous entry');
  } else {
    await fs.writeFile(previousPath, raw, { flag: 'wx', mode: 0o400 });
  }
  await fs.rm(receiptPath, { force: true });
}

/** A checkpoint entry may only restate plan-field values; its bytes are untrusted. */
function assertCheckpointEntry(entry, planEntry) {
  const pairs = [
    ['target_bucket', planEntry.targetBucket],
    ['target_key', planEntry.targetKey],
    ['source_bucket', planEntry.sourceBucket],
    ['source_path', planEntry.sourcePath],
    ['sha256', planEntry.sha256],
  ];
  for (const [field, expected] of pairs) {
    if (entry[field] !== expected) {
      throw new Error(`Checkpoint entry ${planEntry.targetBucket}/${planEntry.targetKey} has a wrong ${field}`);
    }
  }
}

/** Bind the caller's identity to the freshly loaded, verified backup run. */
function assertIdentityBindings(passed, fresh) {
  for (const field of ['manifestSha256', 'checksumListSha256', 'objectCount', 'totalBytes', 'runBasename']) {
    if (passed?.[field] !== fresh[field]) {
      throw new Error(`Backup identity ${field} does not match the verified backup run`);
    }
  }
  if (JSON.stringify(passed?.receipt) !== JSON.stringify(fresh.receipt)) {
    throw new Error('Backup identity receipt does not match the verified backup run');
  }
}

/**
 * Immutable, sequential, resumable copy to R2. Every dependency is injectable so
 * a test is hermetic: no real network, no real credentials, no production write.
 */
export async function runMigrationCopy({
  identity,
  plan,
  runDir,
  signing,
  presignPut = presignPutUrl,
  presignGet = presignGetUrl,
  fetchFn = fetch,
  runner,
  checkpointPath,
  receiptPath,
  batchSize = MIGRATION_BATCH_SIZE,
  log = () => {},
} = {}) {
  if (!identity || !Array.isArray(identity.manifest)) {
    throw new Error('runMigrationCopy requires a backup identity');
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MIGRATION_BATCH_SIZE) {
    throw new Error(`Batch size must be an integer from 1 to ${MIGRATION_BATCH_SIZE}`);
  }
  if (typeof fetchFn !== 'function') throw new Error('runMigrationCopy requires a fetch function');
  if (typeof presignPut !== 'function') throw new Error('runMigrationCopy requires a presignPut function');
  if (typeof presignGet !== 'function') throw new Error('runMigrationCopy requires a presignGet function');
  if (typeof runner !== 'function') throw new Error('runMigrationCopy requires a remote proof runner');

  const identityRunDir = required(identity.runDir, 'backup identity runDir');
  const resolvedRunDir = path.resolve(identityRunDir);
  if (runDir != null && path.resolve(runDir) !== resolvedRunDir) {
    throw new Error('runDir override must equal the verified backup identity runDir');
  }

  // Fresh-load the real backup identity from the run dir and bind the caller's
  // identity to it. A synthetic identity with no fresh receipt fails here.
  const freshIdentity = await loadBackupIdentity(resolvedRunDir);
  assertIdentityBindings(identity, freshIdentity);

  const resolvedPlan = plan ?? buildMigrationPlan(freshIdentity);
  assertPlanBinding(freshIdentity, resolvedPlan);
  const planSha256 = migrationPlanSha256(resolvedPlan);

  const resolvedSigning = signingConfig(signing);
  const resolvedCheckpointPath = path.resolve(checkpointPath ?? path.join(resolvedRunDir, CHECKPOINT_FILE));
  const resolvedReceiptPath = path.resolve(receiptPath ?? path.join(resolvedRunDir, RECEIPT_FILE));
  await assertSafeWritePath(resolvedRunDir, resolvedCheckpointPath);
  await assertSafeWritePath(resolvedRunDir, resolvedReceiptPath);

  // Preserve and invalidate any existing receipt before proof starts.
  await preserveExistingReceipt(resolvedRunDir, resolvedReceiptPath);

  const planByTarget = new Map(resolvedPlan.mapping.map(entry => [`${entry.targetBucket}::${entry.targetKey}`, entry]));

  const checkpoint = (await readCheckpoint(resolvedCheckpointPath)) ?? {
    manifest_sha256: freshIdentity.manifestSha256,
    plan_sha256: planSha256,
    verified: {},
  };
  if (
    checkpoint.manifest_sha256 !== freshIdentity.manifestSha256 ||
    checkpoint.plan_sha256 !== planSha256
  ) {
    throw new Error('Checkpoint is bound to a different manifest or plan');
  }
  if (!checkpoint.verified || typeof checkpoint.verified !== 'object') checkpoint.verified = {};
  for (const [key, entry] of Object.entries(checkpoint.verified)) {
    const planEntry = planByTarget.get(key);
    if (!planEntry) throw new Error(`Checkpoint contains an unknown target: ${key}`);
    assertCheckpointEntry(entry, planEntry);
  }

  const writeCheckpoint = async () => {
    await assertSafeWritePath(resolvedRunDir, resolvedCheckpointPath);
    return writeAtomicJson(resolvedCheckpointPath, {
      manifest_sha256: freshIdentity.manifestSha256,
      plan_sha256: planSha256,
      verified: checkpoint.verified,
    });
  };

  let completedBytes = 0;

  for (const batch of chunk(resolvedPlan.mapping, batchSize)) {
    const sourceRows = batch.map(entry => ({
      bucket: entry.sourceBucket,
      path: entry.sourcePath,
      sha256: entry.sha256,
      bytes: entry.bytes,
    }));

    // Mandatory proof BEFORE any PUT: local sha256 + bytes, and the remote laptop.
    await verifyFrozenArtifacts({ runDir: resolvedRunDir, rows: sourceRows });
    await verifyRemoteBatch({ identity: freshIdentity, rows: sourceRows, runner });

    for (const entry of batch) {
      const targetId = `${entry.targetBucket}::${entry.targetKey}`;

      // Resume: re-hash the completed R2 key and replace the untrusted checkpoint
      // entry with the canonical read-back proof. Never trust the checkpoint alone.
      if (checkpoint.verified[targetId]) {
        const readback = await readbackVerify({
          presignGet, signing: resolvedSigning, fetchFn,
          targetBucket: entry.targetBucket, targetKey: entry.targetKey,
          expectedSha256: entry.sha256, expectedBytes: entry.bytes,
        });
        checkpoint.verified[targetId] = {
          target_bucket: entry.targetBucket,
          target_key: entry.targetKey,
          source_bucket: entry.sourceBucket,
          source_path: entry.sourcePath,
          sha256: readback.sha256,
          bytes: readback.bytes,
        };
        completedBytes += readback.bytes;
        await writeCheckpoint();
        log(`skip ${targetId} (verified read-back)`);
        continue;
      }

      const localPath = path.join(resolvedRunDir, entry.sourceBucket, entry.sourcePath);
      await assertSafeRegularFile(resolvedRunDir, localPath);

      const putUrl = await presignPut({
        url: objectUrl(resolvedSigning.endpoint, entry.targetBucket, entry.targetKey),
        accessKeyId: resolvedSigning.accessKeyId,
        secretAccessKey: resolvedSigning.secretAccessKey,
        contentType: entry.contentType,
        sizeBytes: entry.bytes,
        expiresSeconds: resolvedSigning.expiresSeconds,
      });

      let putResponse;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const upload = createReadStream(localPath);
        try {
          putResponse = await fetchFn(putUrl, {
            method: 'PUT',
            headers: {
              'content-type': entry.contentType,
              'content-length': String(entry.bytes),
              'if-none-match': '*',
            },
            body: upload,
            duplex: 'half',
            redirect: 'error',
            signal: AbortSignal.timeout(READBACK_TIMEOUT_MS),
          });
        } finally {
          upload.destroy();
        }
        if (![500, 502, 503, 504].includes(putResponse.status) || attempt === 3) break;
        await putResponse.body?.cancel();
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }

      if (putResponse.status !== 412 && !putResponse.ok) {
        throw new Error(`PUT failed for ${targetId}: HTTP ${putResponse.status}`);
      }

      const readback = await readbackVerify({
        presignGet, signing: resolvedSigning, fetchFn,
        targetBucket: entry.targetBucket, targetKey: entry.targetKey,
        expectedSha256: entry.sha256, expectedBytes: entry.bytes,
      });

      checkpoint.verified[targetId] = {
        target_bucket: entry.targetBucket,
        target_key: entry.targetKey,
        source_bucket: entry.sourceBucket,
        source_path: entry.sourcePath,
        sha256: readback.sha256,
        bytes: readback.bytes,
      };
      completedBytes += readback.bytes;
      await writeCheckpoint();
      log(`${putResponse.status === 412 ? 'kept' : 'copied'} ${targetId}`);
    }
  }

  const entries = Object.values(checkpoint.verified);
  if (entries.length !== resolvedPlan.mapping.length || completedBytes !== resolvedPlan.manifest_total_bytes) {
    throw new Error(
      `Migration incomplete: ${entries.length}/${resolvedPlan.mapping.length} objects, ${completedBytes}/${resolvedPlan.manifest_total_bytes} bytes`
    );
  }

  const receipt = {
    run_id: freshIdentity.runBasename,
    manifest_sha256: freshIdentity.manifestSha256,
    plan_sha256: planSha256,
    object_count: entries.length,
    total_bytes: completedBytes,
    objects: resolvedPlan.mapping.map(entry => {
      const verified = checkpoint.verified[`${entry.targetBucket}::${entry.targetKey}`];
      return {
        source_bucket: entry.sourceBucket,
        source_path: entry.sourcePath,
        target_bucket: entry.targetBucket,
        target_key: entry.targetKey,
        sha256: verified.sha256,
        bytes: verified.bytes,
      };
    }),
    completed_at: new Date().toISOString(),
  };
  await assertSafeWritePath(resolvedRunDir, resolvedReceiptPath);
  await writeAtomicJson(resolvedReceiptPath, receipt);
  return Object.freeze({ receipt: Object.freeze(receipt), checkpointPath: resolvedCheckpointPath, receiptPath: resolvedReceiptPath });
}

// =============================================================================
// CLI: plan is read-only; copy is the guarded operator migration
// =============================================================================

/** Real process runner: fixed argv array, bounded timeout, no shell. */
export function defaultRunner(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    input: options.input,
    stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit'],
    timeout: options.timeoutMs ?? READBACK_TIMEOUT_MS,
  });
}

const MIGRATE_VALUE_FLAGS = { '--manifest': 'manifest' };

/** Strict flag parser: no unknown flag, no duplicate flag, no missing value. */
export function parseMigrateFlags(args = []) {
  const options = { confirm: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--confirm') {
      if (seen.has('confirm')) throw new Error('Duplicate flag: --confirm');
      seen.add('confirm');
      options.confirm = true;
      continue;
    }
    const key = MIGRATE_VALUE_FLAGS[arg];
    if (!key) throw new Error(`Unknown flag: ${arg}`);
    if (seen.has(key)) throw new Error(`Duplicate flag: ${arg}`);
    seen.add(key);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    index += 1;
    options[key] = value;
  }
  return options;
}

/**
 * Copy command with injected dependencies. The confirm guard runs before the
 * plan loader or any process, the frozen plan is reloaded and re-bound, and the
 * source store must be Supabase. The copy engine owns proof-before-PUT ordering.
 */
export async function runMigrateCopyCommand({
  manifest,
  confirm,
  planPath,
  planDigestPath,
  config,
  runner,
  loadPlan = loadFrozenMigrationPlan,
  copy = runMigrationCopy,
  log = () => {},
} = {}) {
  if (confirm !== true) {
    throw new Error('copy requires --confirm before any credential or process work');
  }
  const backupRunDir = required(manifest, '--manifest <backup-run-dir>');
  if (!config || typeof config !== 'object' || typeof config.signing !== 'object') {
    throw new Error('copy requires an operator config with signing');
  }
  if (typeof runner !== 'function') throw new Error('copy requires a process runner');

  const loaded = await loadPlan({ backupRunDir, planPath, planDigestPath });
  if (loaded.identity.sourceStore !== 'supabase') {
    throw new Error(`copy requires a Supabase source backup: ${loaded.identity.sourceStore}`);
  }

  const result = await copy({
    identity: loaded.identity,
    plan: loaded.plan,
    runDir: loaded.identity.runDir,
    signing: config.signing,
    runner,
  });
  log(`[storage] migrated ${result.receipt.object_count} object(s)`);
  return result;
}

async function cmdPlan(args) {
  const backupDir = required(args.manifest, '--manifest <backup-run-dir>');
  const identity = await loadBackupIdentity(backupDir);
  const plan = buildMigrationPlan(identity);
  const { planPath, digest } = await writeFrozenMigrationPlan(identity.runDir, plan);
  process.stdout.write(
    `migrate-r2 plan: ${plan.mapping.length} mappings, digest: ${digest} -> ${planPath}\n`
  );
}

async function cmdCopy(args, deps) {
  if (args.confirm !== true) {
    throw new Error('copy requires --confirm before reading credentials');
  }
  if (!args.manifest) throw new Error('missing required --manifest <backup-run-dir>');
  const config = deps.config ?? (await loadDefaultMigrateDeps()).config;
  const runner = deps.runner ?? defaultRunner;
  return runMigrateCopyCommand({
    manifest: args.manifest,
    confirm: true,
    config,
    runner,
    loadPlan: deps.loadPlan,
    copy: deps.copy,
    log: deps.log ?? (line => process.stdout.write(`${line}\n`)),
  });
}

/** Read the operator secret only inside the guarded copy command. */
async function loadDefaultMigrateDeps() {
  const { loadR2OperatorConfig } = await import(
    /* @vite-ignore */ './r2-gallery-operator-adapters.mjs'
  );
  return { config: loadR2OperatorConfig() };
}

function usage() {
  process.stdout.write(
    [
      'Usage: node scripts/storage/migrate-r2.mjs <command> [options]',
      '  plan --manifest <backup-run-dir>',
      '  copy --manifest <backup-run-dir> --confirm',
    ].join('\n') + '\n'
  );
}

export async function runMigrateCli(argv, deps = {}) {
  const [command, ...rest] = argv;
  const args = parseMigrateFlags(rest);
  switch (command) {
    case 'plan':
      return cmdPlan(args);
    case 'copy':
      return cmdCopy(args, deps);
    default:
      usage();
      process.exitCode = 1;
  }
}

async function main() {
  await runMigrateCli(process.argv.slice(2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`[migrate-r2] error: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
