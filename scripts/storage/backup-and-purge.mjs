#!/usr/bin/env node
/**
 * PRD-SQR-01 operator script: full Storage backup, stale-input purge, inactive
 * free-gallery purge, and integrity verification.
 *
 * Safety contract (docs/PRDs/supabase-quota-recovery/README.md §Customer-data safety):
 *   1. Local backup first, verified with sha256 before any delete.
 *   2. Deletes come from a frozen manifest only. No prefix or bucket-wide delete.
 *   3. Batches of 50 or fewer. A failed batch stops the run.
 *   4. A DB row is deleted only after Storage confirms its object is absent.
 *   5. Eligibility or hash errors fail closed.
 *
 * This file prepares destructive code. It never deletes without `--confirm`.
 * Credentials are read at runtime from GCloud Secret Manager and are never printed.
 *
 * Usage (see `--help`):
 *   backup --bucket <name|all>
 *   plan-purge --manifest <backup-run-dir>
 *   purge --manifest <purge-manifest.jsonl> --confirm
 *   plan-expire --manifest <backup-run-dir>
 *   expire --manifest <expire-rows.jsonl> --confirm
 *   verify-integrity
 *   delta --manifest <backup-run-dir>
 *   delete-source --manifest <backup-run-dir> --confirm   (needs the live ACL fence)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants, createReadStream, mkdirSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import {
  assertSafeRegularFile,
  compareSourceETag,
  createETagHasher,
  loadBackupIdentity,
  loadFrozenPlan,
  loadSourceObjectProof,
  normalizeSourceStore,
  parseSourceETag,
  verifyFrozenArtifacts,
  verifyRemoteBatch,
} from './backup-verification.mjs';
import { isNativeFenced, readFenceMatrix } from './storage-acl-fence.mjs';

// =============================================================================
// Configuration
// =============================================================================

export const PURGE_BATCH_SIZE = 50;
export const MIN_INPUT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_FREE_DISK_BYTES = 15 * 1024 * 1024 * 1024;
export const DOWNLOAD_CONCURRENCY = 4;

export const INPUT_BUCKET = 'upscale-inputs';
export const GALLERY_BUCKET = 'saved-images';
export const BLOG_BUCKET = 'blog-images';
export const ALL_BUCKETS = [INPUT_BUCKET, GALLERY_BUCKET, BLOG_BUCKET];
export const SAFE_OBJECT_PATH_REGEX = /^[a-zA-Z0-9_\-\.\/]+$/;

const GCLOUD_PROJECT = 'myimageupscaler-auth';
const GCLOUD_SECRET_API = 'myimageupscaler-api-prod';
const GCLOUD_SECRET_CLIENT = 'myimageupscaler-client-prod';
const LAPTOP = 'joao@192.168.1.126';
const BACKUP_ROOT = path.join(os.homedir(), 'backups', 'miu-storage');
const QUOTA_RESTRICTED_EXIT = 3;

// Candidate query copied from docs/reports/supabase-cleanup-audit-2026-10-10.readonly.sql:16-38.
// One row per object with the reference booleans that make deletion unsafe.
export const INPUT_CANDIDATE_SQL = `
  SELECT o.name AS path,
         coalesce((o.metadata->>'size')::bigint, 0) AS bytes,
         to_jsonb(o)->>'created_at' AS created_at,
         to_jsonb(o)->>'updated_at' AS updated_at,
         EXISTS (SELECT 1 FROM public.saved_images s WHERE s.storage_path = o.name) AS gallery_reference,
         EXISTS (SELECT 1 FROM public.processing_credit_reservations r
                 WHERE r.input_storage_path = o.name
                   AND coalesce(r.status, '') NOT IN ('completed', 'refunded')) AS nonterminal_reservation_reference,
         EXISTS (SELECT 1 FROM public.processing_jobs j
                 WHERE (j.input_image_path = o.name OR j.input_image_path LIKE '%/upscale-inputs/' || o.name || '%')
                   AND coalesce(j.status, '') NOT IN ('completed', 'failed', 'cancelled')) AS nonterminal_job_reference,
         EXISTS (SELECT 1 FROM public.processing_credit_reservations r
                 WHERE r.output_url LIKE '%/upscale-inputs/' || o.name || '%') AS reservation_output_reference,
         EXISTS (SELECT 1 FROM public.processing_jobs j
                 WHERE j.output_image_path = o.name
                    OR j.output_image_path LIKE '%/upscale-inputs/' || o.name || '%') AS job_output_reference
  FROM storage.objects o
  WHERE o.bucket_id = 'upscale-inputs'
    AND o.created_at < now() - interval '7 days'
    AND o.updated_at < now() - interval '7 days'
    AND o.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp|heic)$'
`;


export const INPUT_RECHECK_SQL = `
  SELECT o.name AS path,
         to_jsonb(o)->>'created_at' AS created_at,
         to_jsonb(o)->>'updated_at' AS updated_at,
         coalesce((o.metadata->>'size')::bigint, 0) AS bytes,
         EXISTS (SELECT 1 FROM public.saved_images s WHERE s.storage_path = o.name) AS gallery_reference,
         EXISTS (SELECT 1 FROM public.processing_credit_reservations r
                 WHERE r.input_storage_path = o.name
                   AND coalesce(r.status, '') NOT IN ('completed', 'refunded')) AS nonterminal_reservation_reference,
         EXISTS (SELECT 1 FROM public.processing_jobs j
                 WHERE (j.input_image_path = o.name OR j.input_image_path LIKE '%/upscale-inputs/' || o.name || '%')
                   AND coalesce(j.status, '') NOT IN ('completed', 'failed', 'cancelled')) AS nonterminal_job_reference,
         EXISTS (SELECT 1 FROM public.processing_credit_reservations r
                 WHERE r.output_url LIKE '%/upscale-inputs/' || o.name || '%') AS reservation_output_reference,
         EXISTS (SELECT 1 FROM public.processing_jobs j
                 WHERE j.output_image_path = o.name
                    OR j.output_image_path LIKE '%/upscale-inputs/' || o.name || '%') AS job_output_reference
  FROM storage.objects o
  WHERE o.bucket_id = $1 AND o.name = ANY($2::text[])
`;

// Expiry needs delivered-warning proof: only a warning sent for the user's
// current anchor at least seven days ago makes an inactive free gallery deletable.
const GALLERY_WARNING_GATE_SQL = `
    AND EXISTS (
          SELECT 1 FROM public.gallery_expiry_notices warning
          WHERE warning.user_id = s.user_id
            AND warning.activity_anchor = public.gallery_expiry_activity_anchor(s.user_id)
            AND warning.warning_sent_at <= now() - interval '7 days'
        )
`;

export const INACTIVE_GALLERY_SQL = `
  SELECT to_jsonb(s) AS snapshot, o.metadata AS object_metadata
  FROM public.saved_images s
  JOIN storage.objects o ON o.bucket_id = 'saved-images' AND o.name = s.storage_path
  JOIN auth.users u ON u.id = s.user_id
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE (
          u.last_sign_in_at < now() - interval '30 days'
          OR (u.last_sign_in_at IS NULL AND u.created_at < now() - interval '30 days')
        )
    AND s.created_at < now() - interval '30 days'
    AND NOT EXISTS (
          SELECT 1 FROM public.saved_images recentimage
          WHERE recentimage.user_id = s.user_id
            AND recentimage.created_at >= now() - interval '30 days'
        )
    AND NOT EXISTS (
          SELECT 1 FROM auth.sessions sess
          WHERE sess.user_id = s.user_id
            AND (
                  sess.refreshed_at AT TIME ZONE 'UTC' >= now() - interval '30 days'
                  OR sess.created_at >= now() - interval '30 days'
                  OR sess.updated_at >= now() - interval '30 days'
                )
        )
    AND NOT EXISTS (
          SELECT 1 FROM public.processing_credit_reservations res
          WHERE res.user_id = s.user_id
            AND res.created_at >= now() - interval '30 days'
        )
    AND (p.subscription_tier IS NULL OR p.subscription_tier = 'free')
    AND coalesce(p.subscription_status, '') NOT IN ('active', 'trialing')
    AND NOT EXISTS (
          SELECT 1 FROM public.subscriptions sub
          WHERE sub.user_id = s.user_id AND sub.status IN ('active', 'trialing')
        )
    AND coalesce(p.purchased_credits_balance, 0) = 0
    AND NOT EXISTS (
          SELECT 1 FROM public.credit_transactions ct
          WHERE ct.user_id = s.user_id AND ct.amount > 0
            AND ct.type IN ('purchase', 'subscription')
        )
${GALLERY_WARNING_GATE_SQL}`;

export const GALLERY_RECHECK_SQL = `
  SELECT s.id, s.user_id, s.storage_path
  FROM public.saved_images s
  JOIN auth.users u ON u.id = s.user_id
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.id = ANY($1::uuid[])
    AND (
          u.last_sign_in_at < now() - interval '30 days'
          OR (u.last_sign_in_at IS NULL AND u.created_at < now() - interval '30 days')
        )
    AND s.created_at < now() - interval '30 days'
    AND NOT EXISTS (
          SELECT 1 FROM public.saved_images recentimage
          WHERE recentimage.user_id = s.user_id
            AND recentimage.created_at >= now() - interval '30 days'
        )
    AND NOT EXISTS (
          SELECT 1 FROM auth.sessions sess
          WHERE sess.user_id = s.user_id
            AND (
                  sess.refreshed_at AT TIME ZONE 'UTC' >= now() - interval '30 days'
                  OR sess.created_at >= now() - interval '30 days'
                  OR sess.updated_at >= now() - interval '30 days'
                )
        )
    AND NOT EXISTS (
          SELECT 1 FROM public.processing_credit_reservations res
          WHERE res.user_id = s.user_id
            AND res.created_at >= now() - interval '30 days'
        )
    AND (p.subscription_tier IS NULL OR p.subscription_tier = 'free')
    AND coalesce(p.subscription_status, '') NOT IN ('active', 'trialing')
    AND NOT EXISTS (
          SELECT 1 FROM public.subscriptions sub
          WHERE sub.user_id = s.user_id AND sub.status IN ('active', 'trialing')
        )
    AND coalesce(p.purchased_credits_balance, 0) = 0
    AND NOT EXISTS (
          SELECT 1 FROM public.credit_transactions ct
          WHERE ct.user_id = s.user_id AND ct.amount > 0
            AND ct.type IN ('purchase', 'subscription')
        )
    AND (
          SELECT count(*) FROM public.saved_images s2
          WHERE s2.storage_path = s.storage_path
        ) = 1
${GALLERY_WARNING_GATE_SQL}`;
// =============================================================================
// Pure helpers (unit-tested)
// =============================================================================

export function chunk(items, size = PURGE_BATCH_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** A candidate is deletable only when every reference flag is false and it is old. */
export function isInputCandidateEligible(row, now = Date.now()) {
  if (
    row.gallery_reference ||
    row.nonterminal_reservation_reference ||
    row.nonterminal_job_reference ||
    row.reservation_output_reference ||
    row.job_output_reference
  ) {
    return false;
  }
  const olderThanCutoff = value => value != null && new Date(value).getTime() < now - MIN_INPUT_AGE_MS;
  return olderThanCutoff(row.created_at) && olderThanCutoff(row.updated_at);
}

/**
 * Exact microsecond identity for one explicit ISO timestamp STRING with a
 * timezone (Z or +/-HH:mm) and at most 6 fractional digits. A Date object, a
 * value without a timezone, or more than 6 fractional digits has already lost
 * or cannot prove precision and returns null (fail closed).
 */
const EXACT_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/;

export function exactTimestampMicros(value) {
  if (typeof value !== 'string') return null;
  const match = EXACT_TIMESTAMP_RE.exec(value);
  if (!match) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  // Date.parse keeps integer milliseconds; the 4th-6th fractional digits are the
  // PostgreSQL microseconds that a JS Date would have truncated.
  const fraction = match[1] ?? '';
  return BigInt(ms) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3));
}

/** Both values must be exact, non-null microsecond instants and equal. */
export function sameExactTimestamp(left, right) {
  const a = exactTimestampMicros(left);
  const b = exactTimestampMicros(right);
  return a !== null && b !== null && a === b;
}

/**
 * plan-purge selection: eligible candidates that also exist in the verified
 * backup manifest. `verifiedByPath` maps path -> { bytes, sha256 }.
 */
export function makeObjectKey(bucket, objectPath) {
  return `${bucket}::${objectPath}`;
}

export function validateObjectPath(objectPath) {
  if (!objectPath || typeof objectPath !== 'string') return false;
  if (objectPath.startsWith('/') || objectPath.endsWith('/')) return false;
  if (objectPath.includes('..')) return false;
  const segments = objectPath.split('/');
  for (const seg of segments) {
    if (seg === '.' || seg === '..' || seg.length === 0) return false;
  }
  return SAFE_OBJECT_PATH_REGEX.test(objectPath);
}

export function selectPurgePaths(rows, { now = Date.now(), verifiedByPath, verifiedByKey } = {}) {
  const verified = verifiedByKey instanceof Map
    ? verifiedByKey
    : verifiedByPath instanceof Map
      ? verifiedByPath
      : new Map(Object.entries(verifiedByKey ?? verifiedByPath ?? {}));
  return rows
    .filter(row => isInputCandidateEligible(row, now))
    .filter(row => {
      const key = makeObjectKey(INPUT_BUCKET, row.path);
      return verified.has(key) || verified.has(row.path);
    })
    .map(row => {
      const key = makeObjectKey(INPUT_BUCKET, row.path);
      const entry = (verified.get(key) ?? verified.get(row.path)) ?? {};
      return {
        bucket: INPUT_BUCKET,
        path: row.path,
        bytes: Number(row.bytes ?? entry.bytes) || 0,
        sha256: entry.sha256 ?? null,
      };
    });
}



















/**
 * Supabase purge and expiry operate on Storage objects. They must refuse a
 * backup whose objects came from R2, so an R2 manifest cannot authorize a
 * Supabase delete. A legacy identity with no source store is Supabase.
 */
export function requireSupabaseSourceStore(identity) {
  if (!identity || normalizeSourceStore(identity.sourceStore) !== 'supabase') {
    throw new Error('This operation requires a Supabase-source backup');
  }
  return identity;
}

export function parseManifestJsonl(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

export function computeManifestDigest(manifestRows) {
  const canonical = (manifestRows ?? [])
    .map(r => `${r.bucket}::${r.path}::${r.bytes}::${r.sha256}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

export async function verifyArtifactHash(backupRunDir, bucket, objectPath, expectedSha256, expectedBytes) {
  if (!validateObjectPath(objectPath)) {
    throw new Error(`Security violation: invalid object path ${objectPath}`);
  }
  const fullPath = path.resolve(backupRunDir, bucket, objectPath);
  const expectedPrefix = path.resolve(backupRunDir, bucket);
  if (!fullPath.startsWith(expectedPrefix + path.sep)) {
    throw new Error(`Path traversal escape detected: ${objectPath}`);
  }
  const stats = await fs.lstat(fullPath);
  if (stats.isSymbolicLink()) {
    throw new Error(`Symlink escape detected: ${objectPath}`);
  }
  if (expectedBytes != null && stats.size !== Number(expectedBytes)) {
    throw new Error(`Byte size mismatch for ${bucket}/${objectPath}: expected ${expectedBytes}, got ${stats.size}`);
  }
  const actualSha256 = await sha256File(fullPath);
  if (expectedSha256 && actualSha256 !== expectedSha256) {
    throw new Error(`SHA256 mismatch for ${bucket}/${objectPath}: expected ${expectedSha256}, got ${actualSha256}`);
  }
  return { actualSha256, size: stats.size };
}

export function validateManifestEntries(entries, expectedBucket) {
  const seenKeys = new Set();
  for (const entry of entries ?? []) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Manifest entry must be an object');
    }
    if (expectedBucket && entry.bucket !== expectedBucket) {
      throw new Error(`Bucket mismatch: expected ${expectedBucket}, got ${entry.bucket}`);
    }
    if (!ALL_BUCKETS.includes(entry.bucket)) {
      throw new Error(`Unknown bucket in entry: ${entry.bucket}`);
    }
    if (!validateObjectPath(entry.path)) {
      throw new Error(`Invalid object path: ${entry.path}`);
    }
    if (!entry.sha256 || typeof entry.sha256 !== 'string' || entry.sha256.length !== 64) {
      throw new Error(`Missing or invalid SHA256 in manifest entry for ${entry.path}`);
    }
    if (entry.bytes == null || typeof entry.bytes !== 'number' || entry.bytes < 0) {
      throw new Error(`Invalid byte size in manifest entry for ${entry.path}`);
    }
    const key = makeObjectKey(entry.bucket, entry.path);
    if (seenKeys.has(key)) {
      throw new Error(`Duplicate manifest entry detected: ${key}`);
    }
    seenKeys.add(key);
  }
}

export function readCheckpoint(checkpointPath) {
  try {
    const raw = readFileSync(checkpointPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Read JSON only from a real, non-symlink regular file. A missing file is null. */
async function readRegularJson(filePath) {
  let stats;
  try {
    stats = await fs.lstat(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (stats.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${path.basename(filePath)}`);
  if (!stats.isFile()) throw new Error(`Not a regular file: ${path.basename(filePath)}`);
  const raw = await fs.readFile(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path.basename(filePath)}: ${error.message}`);
  }
  // An existing file that is null, an array, or a scalar is corruption, not an
  // absent run: a silent null would let a failed resume overwrite the old proof.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid JSON object in ${path.basename(filePath)}`);
  }
  return parsed;
}

/** Buckets already proven by an existing regular manifest.jsonl. Absent file is null. */
async function readManifestBuckets(runDir) {
  const manifestPath = path.join(runDir, 'manifest.jsonl');
  let stats;
  try {
    stats = await fs.lstat(manifestPath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (stats.isSymbolicLink()) throw new Error('Manifest is a symlink');
  if (!stats.isFile()) throw new Error('Manifest is not a regular file');
  const rows = parseManifestJsonl(await fs.readFile(manifestPath, 'utf8'));
  return new Set(rows.map(row => row?.bucket).filter(bucket => typeof bucket === 'string'));
}

/** Bucket names already proven by a checkpoint's downloaded keys. */
function checkpointBucketNames(checkpoint) {
  const names = new Set();
  for (const key of Object.keys(checkpoint?.downloaded ?? {})) {
    const [bucket] = key.split('::');
    if (bucket) names.add(bucket);
  }
  return names;
}

/**
 * Refuse a resume that would invalidate an existing proof: a different or
 * unknown source store, a differing explicit bucket set, or a requested set
 * that drops a bucket a legacy checkpoint already proved. Widening a legacy
 * inferred set is allowed; a legacy empty checkpoint allows any set.
 */
function assertResumeScope({ checkpoint, receipt, sourceStore, buckets, manifestBuckets = null }) {
  const hasCheckpoint = !!checkpoint && typeof checkpoint === 'object';
  const hasReceipt = !!receipt && typeof receipt === 'object';
  if (!hasCheckpoint && !hasReceipt) return;
  // A receipt's source_store is authoritative for a legacy checkpoint with none.
  const checkpointStore = hasCheckpoint && checkpoint.source_store != null
    ? normalizeSourceStore(checkpoint.source_store) : null;
  // A legacy receipt with no source_store is Supabase. Normalizing it always
  // stops an R2 checkpoint from overriding an old Supabase proof.
  const receiptStore = hasReceipt ? normalizeSourceStore(receipt.source_store) : null;
  if (checkpointStore && receiptStore && checkpointStore !== receiptStore) {
    throw new Error('Refusing resume: checkpoint and receipt disagree on source_store');
  }
  const storedStore = checkpointStore ?? receiptStore ?? 'supabase';
  if (storedStore !== sourceStore) {
    throw new Error(`Refusing resume: source_store ${storedStore} != requested ${sourceStore}`);
  }
  const explicit = Array.isArray(checkpoint?.buckets) ? checkpoint.buckets
    : Array.isArray(receipt?.buckets) ? receipt.buckets : null;
  const requested = new Set(buckets);
  const manifested = manifestBuckets instanceof Set ? manifestBuckets : new Set(manifestBuckets ?? []);
  const omittedFromManifest = [...manifested].filter(bucket => !requested.has(bucket));
  if (explicit) {
    const stored = new Set(explicit);
    if (stored.size !== requested.size || [...stored].some(bucket => !requested.has(bucket))) {
      throw new Error('Refusing resume: bucket scope differs from the recorded run');
    }
    if (omittedFromManifest.length) {
      throw new Error(`Refusing resume: requested buckets omit ${omittedFromManifest.join(', ')}`);
    }
    return;
  }
  // No explicit bucket set: infer the proven scope from the checkpoint's
  // downloaded keys unioned with the existing manifest's buckets, so a
  // checkpoint subset can never forget a bucket the manifest already proves.
  const proven = new Set();
  if (hasCheckpoint) for (const bucket of checkpointBucketNames(checkpoint)) proven.add(bucket);
  for (const bucket of manifested) proven.add(bucket);
  if (proven.size === 0) {
    // A legacy receipt with no checkpoint and no readable manifest cannot prove
    // its bucket scope; refusing keeps the old proof instead of discarding it.
    if (hasReceipt && manifestBuckets == null) {
      throw new Error('Refusing resume: cannot prove the recorded bucket scope');
    }
    return;
  }
  const missing = [...proven].filter(bucket => !requested.has(bucket));
  if (missing.length) {
    throw new Error(`Refusing resume: requested buckets omit ${missing.join(', ')}`);
  }
}

let atomicTmpCounter = 0;

function nextAtomicTmp(targetPath) {
  atomicTmpCounter += 1;
  return `${targetPath}.tmp.${process.pid}.${Date.now()}.${atomicTmpCounter}`;
}

/** Atomic raw-text write. Manifests and checksum lists must not be JSON-quoted. */
export async function writeAtomicRawText(targetPath, text, { mode = 0o600 } = {}) {
  const tmp = nextAtomicTmp(targetPath);
  await fs.writeFile(tmp, text, { encoding: 'utf8', mode });
  await fs.rename(tmp, targetPath);
}

export async function writeAtomicJson(targetPath, data, { mode = 0o600 } = {}) {
  await writeAtomicRawText(targetPath, JSON.stringify(data, null, 2), { mode });
}

/** Backward-compatible JSON checkpoint write used by the purge/expire paths. */
export async function writeAtomicCheckpoint(checkpointPath, data) {
  await writeAtomicJson(checkpointPath, data);
}

export function isValidSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function isSafeByteCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function sha256OfText(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Stream-hash a file. An `etagHasher` adds the source eTag digest in the same pass. */
async function streamHashFile(filePath, etagHasher = null) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
    if (etagHasher) etagHasher.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: hash.digest('hex'), bytes, etag: etagHasher ? etagHasher.digest() : null };
}

/** Canonical identity of one listed object: full identity, not only a count. */
export function objectFingerprint(object, bucket = '') {
  return [
    bucket || object.bucket || '',
    object.path,
    object.id ?? '',
    object.version ?? '',
    object.created_at ?? '',
    object.updated_at ?? '',
    Number(object.bytes) || 0,
  ].join('\u0000');
}

/** Stable inventory fingerprint over a whole listing. */
export function inventoryFingerprint(objects, bucket = '') {
  return (objects ?? []).map(object => objectFingerprint(object, bucket)).sort().join('\n');
}

/** A listing must never repeat a path; a duplicate is a malformed page. */
function assertNoDuplicatePaths(objects, bucket) {
  const seen = new Set();
  for (const object of objects ?? []) {
    if (seen.has(object.path)) {
      throw new Error(`Duplicate object path in ${bucket} listing: ${object.path}`);
    }
    seen.add(object.path);
  }
}

/**
 * The starting inventory is the freeze point. Every object seen in the first
 * listing must still appear in the second with identical identity; additive
 * arrivals are allowed. A removal or a changed object is unstable.
 */
function assertInitialInventoryStable(first, second, bucket) {
  assertNoDuplicatePaths(first, bucket);
  assertNoDuplicatePaths(second, bucket);
  const secondByPath = new Map((second ?? []).map(object => [object.path, object]));
  for (const object of first ?? []) {
    const live = secondByPath.get(object.path);
    if (!live || objectFingerprint(live, bucket) !== objectFingerprint(object, bucket)) {
      throw new InventoryUnstableError(`Unstable object listing for ${bucket}`);
    }
  }
}

/**
 * Every frozen object must survive the run unchanged. Objects that arrived after
 * the freeze are additive: they are returned as pending deltas and are never
 * part of the verified snapshot.
 */
function assertFrozenInventoryStable(final, frozen, bucket) {
  assertNoDuplicatePaths(final, bucket);
  const finalByPath = new Map((final ?? []).map(object => [object.path, object]));
  for (const object of frozen ?? []) {
    const live = finalByPath.get(object.path);
    if (!live || objectFingerprint(live, bucket) !== objectFingerprint(object, bucket)) {
      throw new InventoryUnstableError(`Inventory changed during backup: ${bucket}`);
    }
  }
  const frozenPaths = new Set((frozen ?? []).map(object => object.path));
  return (final ?? []).filter(object => !frozenPaths.has(object.path));
}

/** Canonical, sorted raw JSONL for the unbacked pending delta, plus its count. */
export function buildPendingDelta(objectsByBucket) {
  const rows = [];
  for (const [bucket, objects] of objectsByBucket) {
    for (const object of objects ?? []) {
      rows.push({
        bucket,
        path: object.path,
        id: object.id ?? null,
        version: object.version ?? null,
        bytes: Number(object.bytes) || 0,
        created_at: object.created_at ?? null,
        updated_at: object.updated_at ?? null,
      });
    }
  }
  rows.sort((a, b) => (a.bucket + '::' + a.path < b.bucket + '::' + b.path ? -1 : 1));
  return {
    content: rows.length ? rows.map(row => JSON.stringify(row)).join('\n') + '\n' : '',
    count: rows.length,
  };
}

/**
 * Invalidate a prior valid receipt before a new verification can fail. The old
 * bytes are kept content-addressed, so no backup data is lost.
 */
async function preservePriorReceipt(runDir, log = () => {}) {
  const receiptPath = path.join(runDir, 'backup-verification.json');
  let raw;
  try {
    const stats = await fs.lstat(receiptPath);
    if (stats.isSymbolicLink()) throw new Error('Prior receipt is a symlink');
    if (!stats.isFile()) throw new Error('Prior receipt is not a regular file');
    raw = await fs.readFile(receiptPath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const digest = createHash('sha256').update(raw).digest('hex');
  const retainedRel = `.superseded/backup-verification.json.${digest}`;
  const supersededDir = path.join(runDir, '.superseded');
  const retainedPath = path.join(supersededDir, `backup-verification.json.${digest}`);
  // Create only the direct directory, then reject a symlink or non-directory
  // before any copy, so a planted `.superseded` symlink cannot redirect writes.
  try {
    await fs.mkdir(supersededDir, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const dirStats = await fs.lstat(supersededDir);
  if (dirStats.isSymbolicLink() || !dirStats.isDirectory()) {
    throw new Error('Superseded directory is a symlink or non-directory');
  }
  let alreadyExists = true;
  try {
    const stats = await fs.lstat(retainedPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error('Retained receipt is not a regular file');
    }
  } catch (error) {
    if (error.code === 'ENOENT') alreadyExists = false;
    else throw error;
  }
  if (alreadyExists) {
    // The retained bytes must equal the raw receipt; a mismatch fails closed
    // and leaves the original receipt in place.
    const existing = await fs.readFile(retainedPath);
    if (createHash('sha256').update(existing).digest('hex') !== digest) {
      throw new Error('Retained receipt mismatch');
    }
  } else {
    await fs.copyFile(receiptPath, retainedPath, fsConstants.COPYFILE_EXCL);
  }
  await fs.unlink(receiptPath);
  log(`preserved prior receipt: ${retainedRel}`);
  return retainedRel;
}

/**
 * Resolve an artifact path inside the backup root and reject traversal and any
 * parent symlink that would escape the root before a directory or file is made.
 */
export async function assertSafeArtifactPath(backupRoot, bucket, objectPath) {
  if (!ALL_BUCKETS.includes(bucket)) {
    throw new Error(`Unknown bucket: ${bucket}`);
  }
  if (!validateObjectPath(objectPath)) {
    throw new Error(`Security violation: invalid object path ${objectPath}`);
  }
  const root = path.resolve(backupRoot);
  const full = path.resolve(root, bucket, objectPath);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`Path traversal escape detected: ${bucket}/${objectPath}`);
  }
  const parents = path.relative(root, path.dirname(full)).split(path.sep).filter(Boolean);
  let cursor = root;
  for (const segment of parents) {
    cursor = path.join(cursor, segment);
    let stats;
    try {
      stats = await fs.lstat(cursor);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`Symlink escape detected: ${bucket}/${objectPath}`);
    }
    if (!stats.isDirectory()) {
      throw new Error(`Non-directory parent escape detected: ${bucket}/${objectPath}`);
    }
  }
  return full;
}

/**
 * Stream one Storage object to disk over authenticated HTTP. Writes a private
 * temp file, hashes while streaming, and renames only after the byte count is
 * exact and, when `expectedETag` is given, the streamed digest equals that
 * source eTag: the content MD5 of a single-part object, or the multipart eTag of
 * the Supabase 5 MiB layout. A CDN can serve stale bytes of the same length, so
 * the byte count alone does not bind the bytes to the source. An unsupported
 * eTag fails before any fetch; `undefined` keeps the If-Match contract of the R2
 * caller. A failed stream or check leaves the unverified temp file and never
 * creates the artifact.
 */
export async function streamDownloadToFile({
  url, headers, targetPath, expectedBytes, expectedETag, fetchFn = fetch,
}) {
  const expected = expectedETag === undefined
    ? undefined
    : parseSourceETag(expectedETag, expectedBytes == null ? undefined : Number(expectedBytes));
  if (expected === null) {
    throw new Error(`Unsupported source eTag for ${targetPath}: ${JSON.stringify(expectedETag)}`);
  }
  const response = await fetchFn(url, { headers });
  if (!response || !response.ok || !response.body) {
    throw new Error(`download failed: HTTP ${response?.status ?? 'no-response'}`);
  }
  const tmp = `${targetPath}.part.${process.pid}.${Date.now()}.${(atomicTmpCounter += 1)}`;
  const hash = createHash('sha256');
  const etagHasher = createETagHasher();
  let bytes = 0;
  const hashing = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      etagHasher.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  const file = await fs.open(tmp, 'wx', 0o600);
  const sink = file.createWriteStream();
  await pipeline(Readable.fromWeb(response.body), hashing, sink);
  if (expectedBytes != null && bytes !== Number(expectedBytes)) {
    throw new Error(`Byte size mismatch for ${targetPath}: expected ${expectedBytes}, got ${bytes}`);
  }
  const digest = etagHasher.digest();
  if (expected !== undefined) {
    const check = compareSourceETag(expected, digest);
    if (!check.ok) {
      throw new Error(`Source eTag mismatch for ${targetPath}: expected ${check.expected}, got ${check.actual}`);
    }
  }
  await fs.rename(tmp, targetPath);
  return { sha256: hash.digest('hex'), md5: digest.md5, bytes };
}

/**
 * Preserve the bytes already on disk before a redownload replaces them. The
 * artifact is streamed and copied to a content-addressed, non-overwriting
 * location under `<runDir>/<bucket>/.superseded/`, and the checkpoint journals
 * its path/hash/bytes atomically before the caller overwrites the artifact.
 * A symlink or non-regular artifact fails closed.
 */
async function preserveExistingArtifact({ runDir, bucket, objectPath, checkpoint, persistCheckpoint, log }) {
  const targetPath = path.join(runDir, bucket, objectPath);
  let stats;
  try {
    stats = await fs.lstat(targetPath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`Symlink escape detected: ${bucket}/${objectPath}`);
  }
  if (!stats.isFile()) {
    throw new Error(`Non-regular artifact cannot be preserved: ${bucket}/${objectPath}`);
  }
  const existing = await streamHashFile(targetPath);
  const retainedRel = `${bucket}/.superseded/${objectPath}.${existing.sha256}`;
  const retainedPath = await assertSafeArtifactPath(runDir, bucket, `.superseded/${objectPath}.${existing.sha256}`);
  const plainRel = `${bucket}/${objectPath}`;
  // The live path is about to change; a prior orphan journal for it is stale.
  delete checkpoint.retained[plainRel];
  if (checkpoint.retained[retainedRel]) {
    const retainedStat = await fs.lstat(retainedPath);
    if (!retainedStat.isFile() || retainedStat.isSymbolicLink()) throw new Error('Retained artifact is a symlink or non-regular file');
    const current = await streamHashFile(retainedPath).catch(() => null);
    if (!current || current.sha256 !== existing.sha256) {
      throw new Error(`Retained version mismatch: ${retainedRel}`);
    }
  } else {
    await fs.mkdir(path.dirname(retainedPath), { recursive: true, mode: 0o700 });
    let alreadyExists = true;
    try {
      const retainedStat = await fs.lstat(retainedPath);
      if (!retainedStat.isFile() || retainedStat.isSymbolicLink()) throw new Error('Retained artifact is a symlink or non-regular file');
    } catch (error) {
      if (error.code === 'ENOENT') alreadyExists = false;
      else throw error;
    }
    if (alreadyExists) {
      const current = await streamHashFile(retainedPath);
      if (current.sha256 !== existing.sha256) {
        throw new Error(`Retained version mismatch: ${retainedRel}`);
      }
    } else {
      await fs.copyFile(targetPath, retainedPath, fsConstants.COPYFILE_EXCL);
    }
    checkpoint.retained[retainedRel] = {
      path: retainedRel,
      sha256: existing.sha256,
      bytes: existing.bytes,
    };
    log(`retained superseded artifact: ${retainedRel} (${existing.bytes} bytes)`);
  }
  await persistCheckpoint();
  return retainedRel;
}

/** Raised only when a bucket listing is unstable or changed; safe to retry. */
class InventoryUnstableError extends Error {}

/**
 * Backup orchestrator. Injectable listing/download/runner keep the destructive
 * and network behavior out of tests while the real functions run in production.
 *
 * `inventoryRetries` bounds recursive retries when a bucket listing is unstable
 * at the start or changes at the end. It defaults to 0, so the library path
 * stays fail-closed; the CLI passes a small positive budget.
 */
export async function runBackup(options = {}) {
  // Validate the source store before any directory or artifact write.
  const sourceStore = normalizeSourceStore(options.sourceStore);
  const retriesLeft =
    Number.isSafeInteger(options.inventoryRetries) && options.inventoryRetries > 0
      ? options.inventoryRetries
      : 0;
  return runBackupPass({ ...options, sourceStore }, retriesLeft);
}

async function runBackupPass(options = {}, retriesLeft = 0) {
  const {
    outputRoot = BACKUP_ROOT,
    runId: runIdValue = runId(),
    resumeDir,
    buckets = ALL_BUCKETS,
    listObjects,
    downloadObject,
    dbRefs = new Set(),
    runCommand,
    laptop = LAPTOP,
    log = () => {},
    sourceStore = 'supabase',
  } = options;

  if (typeof listObjects !== 'function') throw new Error('runBackup requires listObjects');
  if (typeof downloadObject !== 'function') throw new Error('runBackup requires downloadObject');
  if (typeof runCommand !== 'function') throw new Error('runBackup requires runCommand');

  const root = path.resolve(outputRoot);
  let runDir;
  if (resumeDir) {
    runDir = path.resolve(resumeDir);
    if (path.dirname(runDir) !== root) {
      throw new Error(`Resume directory must be a direct child of ${root}: ${runDir}`);
    }
  } else {
    runDir = path.join(root, runIdValue);
  }
  if (path.dirname(runDir) !== root) throw new Error('Backup run directory must be a direct child of the backup root');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  // The parent root is trusted config; the run directory itself must be a real
  // directory so no receipt or checkpoint write follows a planted symlink.
  const runDirStats = await fs.lstat(runDir);
  if (runDirStats.isSymbolicLink() || !runDirStats.isDirectory()) {
    throw new Error('Backup run directory must be a regular directory');
  }

  try {
    return await runBackupBody({
      runDir, buckets, listObjects, downloadObject, dbRefs, runCommand, laptop, log, sourceStore,
    });
  } catch (error) {
    if (error instanceof InventoryUnstableError && retriesLeft > 0) {
      log(`inventory unstable, retrying (${retriesLeft} left): ${error.message}`);
      return runBackupPass({ ...options, resumeDir: runDir }, retriesLeft - 1);
    }
    throw error;
  }
}

async function runBackupBody({
  runDir, buckets, listObjects, downloadObject, dbRefs, runCommand, laptop, log, sourceStore = 'supabase',
}) {
  // Bind the run to its source store and bucket scope BEFORE any receipt or
  // manifest mutation, so a resume can never destroy an existing proof by
  // switching stores or narrowing the backed bucket set.
  const checkpointFile = path.join(runDir, 'backup-checkpoint.json');
  const priorCheckpoint = await readRegularJson(checkpointFile);
  const priorReceipt = await readRegularJson(path.join(runDir, 'backup-verification.json'));
  const manifestBuckets = priorCheckpoint || priorReceipt ? await readManifestBuckets(runDir) : null;
  assertResumeScope({
    checkpoint: priorCheckpoint, receipt: priorReceipt, sourceStore, buckets, manifestBuckets,
  });

  // A prior receipt must not appear valid after a failed re-verification.
  await preservePriorReceipt(runDir, log);

  const checkpoint = priorCheckpoint ?? { downloaded: {} };
  if (!checkpoint.downloaded || typeof checkpoint.downloaded !== 'object') {
    checkpoint.downloaded = {};
  }
  if (!checkpoint.retained || typeof checkpoint.retained !== 'object') {
    checkpoint.retained = {};
  }

  // Serialize checkpoint writes so a concurrent batch cannot drop a journaled
  // retained entry; stringify at write time so each write sees all mutations.
  let checkpointWriteChain = Promise.resolve();
  const persistCheckpoint = () => {
    const next = checkpointWriteChain.then(() => writeAtomicJson(checkpointFile, checkpoint));
    checkpointWriteChain = next.catch(() => {});
    return next;
  };

  // Record this run's store and scope before the first download, so a later
  // resume can verify them; legacy checkpoints are backfilled here.
  checkpoint.source_store = checkpoint.source_store ?? sourceStore;
  checkpoint.buckets = Array.isArray(checkpoint.buckets) ? checkpoint.buckets : [...buckets];
  await persistCheckpoint();

  const manifest = [];
  const frozenByBucket = new Map();
  let expectedCount = 0;
  let expectedBytes = 0;
  let completedObjects = 0;
  let completedBytes = 0;
  let nextProgressAt = 50;

  for (const bucket of buckets) {
    const first = await listObjects(bucket);
    const second = await listObjects(bucket);
    // Additive arrivals are allowed; a removal or mutation of a starting object
    // is unstable. The second listing is the frozen snapshot for this run.
    assertInitialInventoryStable(first, second, bucket);
    const objects = second ?? [];
    frozenByBucket.set(bucket, objects);
    log(`${bucket}: ${objects.length} objects`);
    expectedCount += objects.length;
    for (const object of objects) expectedBytes += Number(object.bytes) || 0;

    // Bounded concurrency: at most DOWNLOAD_CONCURRENCY downloads in flight.
    // A batch is awaited with allSettled so every in-flight task finishes before
    // one serialized checkpoint write; a failure then stops all further batches.
    for (const batch of chunk(objects, DOWNLOAD_CONCURRENCY)) {
      const settled = await Promise.allSettled(
        batch.map(async object => {
          const key = makeObjectKey(bucket, object.path);
          const targetPath = await assertSafeArtifactPath(runDir, bucket, object.path);
          await fs.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });

          let sha256;
          let bytes;
          // A Supabase listing carries the source content eTag. Reuse then needs
          // the cached bytes to match it, not only a checkpoint SHA that a stale
          // CDN read could have produced. R2 listings bind downloads with If-Match.
          const expectedETag = object.etag === undefined
            ? undefined
            : parseSourceETag(object.etag, Number(object.bytes) || 0);
          const entry = checkpoint.downloaded[key];
          const sameSource =
            entry &&
            isValidSha256(entry.sha256) &&
            isSafeByteCount(entry.bytes) &&
            entry.created_at === (object.created_at ?? null) &&
            entry.updated_at === (object.updated_at ?? null) &&
            Number(entry.bytes) === (Number(object.bytes) || 0) &&
            (entry.version ?? null) === (object.id ?? null) &&
            (entry.source_version ?? null) === (object.version ?? null);
          if (sameSource && expectedETag !== null) {
            try {
              const hashed = await streamHashFile(
                targetPath,
                expectedETag === undefined ? null : createETagHasher()
              );
              if (
                hashed.sha256 === entry.sha256 &&
                hashed.bytes === entry.bytes &&
                (expectedETag === undefined || compareSourceETag(expectedETag, hashed.etag).ok)
              ) {
                sha256 = hashed.sha256;
                bytes = hashed.bytes;
              }
            } catch {
              // Missing or unreadable artifact: re-download below.
            }
          }

          let downloadedEntry = null;
          if (!sha256) {
            // Preserve any bytes already on disk before the downloader replaces them.
            await preserveExistingArtifact({
              runDir, bucket, objectPath: object.path, checkpoint, persistCheckpoint, log,
            });
            const result = await downloadObject({
              bucket,
              path: object.path,
              targetPath,
              expectedBytes: Number(object.bytes) || 0,
              expectedETag: object.etag,
            });
            sha256 = result.sha256;
            bytes = result.bytes;
            downloadedEntry = {
              sha256,
              bytes,
              created_at: object.created_at ?? null,
              updated_at: object.updated_at ?? null,
              version: object.id ?? null,
              source_version: object.version ?? null,
              source_etag: object.etag ?? null,
            };
          }

          return {
            key,
            downloadedEntry,
            row: {
              bucket,
              path: object.path,
              bytes,
              sha256,
              created_at: object.created_at ?? null,
              updated_at: object.updated_at ?? null,
              db_reference: dbRefs.has(key),
            },
          };
        })
      );

      let firstError;
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          const { key, downloadedEntry, row } = outcome.value;
          if (downloadedEntry) checkpoint.downloaded[key] = downloadedEntry;
          manifest.push(row);
          completedObjects += 1;
          completedBytes += row.bytes;
        } else if (!firstError) {
          firstError = outcome.reason;
        }
      }

      // One atomic checkpoint per settled batch. Sequential batches mean no
      // concurrent checkpoint overwrites, even when a task in the batch failed.
      await persistCheckpoint();
      if (completedObjects >= nextProgressAt) {
        log(`progress: ${bucket} ${completedObjects} objects, ${completedBytes} bytes`);
        nextProgressAt += 50;
      }
      if (firstError) throw firstError;
    }
  }

  // Every frozen object must still exist, byte-for-byte and identity-for-identity.
  // Objects that arrived after the freeze are unbacked pending deltas.
  const pendingByBucket = new Map();
  for (const bucket of buckets) {
    const final = await listObjects(bucket);
    pendingByBucket.set(bucket, assertFrozenInventoryStable(final, frozenByBucket.get(bucket) ?? [], bucket));
  }

  if (manifest.length !== expectedCount) {
    throw new Error(`Manifest count mismatch: ${manifest.length} != ${expectedCount}`);
  }
  const manifestBytes = manifest.reduce((sum, row) => sum + row.bytes, 0);
  if (manifestBytes !== expectedBytes) {
    throw new Error(`Manifest byte mismatch: ${manifestBytes} != ${expectedBytes}`);
  }

  // Prior-checkpoint artifacts that vanished from the live inventory must stay
  // on disk and be covered by the retained checksum proof.
  const liveKeys = new Set(manifest.map(row => makeObjectKey(row.bucket, row.path)));
  for (const bucket of buckets) {
    for (const key of Object.keys(checkpoint.downloaded)) {
      if (!key.startsWith(`${bucket}::`) || liveKeys.has(key)) continue;
      const objectPath = key.slice(bucket.length + 2);
      const artifactPath = await assertSafeArtifactPath(runDir, bucket, objectPath);
      let stats;
      try {
        stats = await fs.lstat(artifactPath);
      } catch {
        throw new Error(`Retained artifact is missing: ${bucket}/${objectPath}`);
      }
      if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('Retained artifact is a symlink or non-regular file');
      const retainedRel = `${bucket}/${objectPath}`;
      const hashed = await streamHashFile(artifactPath);
      const expected = checkpoint.downloaded[key];
      if (hashed.sha256 !== expected.sha256 || hashed.bytes !== expected.bytes) {
        throw new Error(`Retained artifact mismatch: ${retainedRel}`);
      }
      if (checkpoint.retained[retainedRel]) continue;
      checkpoint.retained[retainedRel] = {
        path: retainedRel,
        sha256: hashed.sha256,
        bytes: hashed.bytes,
        orphaned: true,
      };
      log(`retained orphaned artifact: ${retainedRel} (${hashed.bytes} bytes)`);
    }
  }
  await persistCheckpoint();

  const manifestContent = manifest.map(row => JSON.stringify(row)).join('\n') + '\n';
  const sha256Content = manifest.map(row => `${row.sha256}  ${row.bucket}/${row.path}`).join('\n') + '\n';
  await writeAtomicRawText(path.join(runDir, 'manifest.jsonl'), manifestContent);
  await writeAtomicRawText(path.join(runDir, 'manifest.sha256'), sha256Content);

  // Unbacked arrivals after the freeze are recorded explicitly so an operator
  // cannot mistake them for part of the verified snapshot.
  const pendingDelta = buildPendingDelta(pendingByBucket);
  await writeAtomicRawText(path.join(runDir, 'pending-delta.jsonl'), pendingDelta.content);
  const pendingDeltaSha256 = sha256OfText(pendingDelta.content);

  const retainedEntries = Object.values(checkpoint.retained);
  for (const entry of retainedEntries) {
    if (typeof entry.path !== 'string') throw new Error('Unsafe retained artifact path');
    const [bucket, ...segments] = entry.path.split('/');
    if (!ALL_BUCKETS.includes(bucket) || !validateObjectPath(segments.join('/'))) {
      throw new Error('Unsafe retained artifact path');
    }
    const file = await assertSafeArtifactPath(runDir, bucket, segments.join('/'));
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Retained artifact is a symlink or non-regular file');
    const actual = await streamHashFile(file);
    if (actual.sha256 !== entry.sha256 || actual.bytes !== entry.bytes) throw new Error('Retained artifact mismatch');
  }
  const retainedContent = retainedEntries.length
    ? retainedEntries.map(entry => `${entry.sha256}  ${entry.path}`).join('\n') + '\n'
    : null;
  if (retainedContent) {
    await writeAtomicRawText(path.join(runDir, 'retained.sha256'), retainedContent);
  }

  // Local integrity gates before any second copy.
  await runCommand('sha256sum', ['-c', 'manifest.sha256'], { cwd: runDir, timeoutMs: 15 * 60_000 });
  if (retainedContent) {
    await runCommand('sha256sum', ['-c', 'retained.sha256'], { cwd: runDir, timeoutMs: 15 * 60_000 });
  }
  log(`manifest verified locally: ${manifest.length} objects, ${manifestBytes} bytes`);

  // Second copy to the Debian laptop, then verify both sides.
  const remoteBase = `~/backups/miu-storage/${path.basename(runDir)}`;
  await runCommand('ssh', [laptop, `mkdir -p ${remoteBase}/`]);
  await runCommand('rsync', ['-a', '--checksum', `${runDir}/`, `${laptop}:${remoteBase}/`], { timeoutMs: 30 * 60_000 });
  await runCommand('ssh', [laptop, `cd ${remoteBase} && sha256sum -c -`], { input: sha256Content, timeoutMs: 15 * 60_000 });
  if (retainedContent) {
    await runCommand('ssh', [laptop, `cd ${remoteBase} && sha256sum -c -`], { input: retainedContent, timeoutMs: 15 * 60_000 });
  }

  const localManifestDigest = sha256OfText(manifestContent);
  const remoteOutput = await runCommand('ssh', [laptop, `sha256sum ${remoteBase}/manifest.jsonl`]);
  const remoteManifestDigest = String(remoteOutput ?? '').trim().split(/\s+/)[0];
  if (remoteManifestDigest !== localManifestDigest) {
    throw new Error(`Remote manifest digest mismatch: local=${localManifestDigest} remote=${remoteManifestDigest}`);
  }

  // Prove the pending-delta file mirrored byte-for-byte, so the reported delta
  // count can never disagree with the copy on the laptop.
  const remotePendingOutput = await runCommand('ssh', [laptop, `sha256sum ${remoteBase}/pending-delta.jsonl`]);
  const remotePendingDigest = String(remotePendingOutput ?? '').trim().split(/\s+/)[0];
  if (remotePendingDigest !== pendingDeltaSha256) {
    throw new Error(`Remote pending-delta digest mismatch: local=${pendingDeltaSha256} remote=${remotePendingDigest}`);
  }

  const receipt = {
    run_id: path.basename(runDir),
    object_count: manifest.length,
    total_bytes: manifestBytes,
    manifest_sha256: localManifestDigest,
    checksum_list_sha256: sha256OfText(sha256Content),
    source_store: sourceStore,
    buckets: [...buckets],
    source_inventory_scope: 'frozen-starting-inventory',
    pending_delta_count: pendingDelta.count,
    pending_delta_sha256: pendingDeltaSha256,
    remote: `${laptop}:${remoteBase}/`,
    verified_at: new Date().toISOString(),
  };
  if (retainedContent) {
    receipt.retained_count = retainedEntries.length;
    receipt.retained_sha256 = sha256OfText(retainedContent);
  }
  const receiptFile = path.join(runDir, 'backup-verification.json');
  await writeAtomicJson(receiptFile, receipt);
  // The receipt is written after the object mirror, so the rsync above never
  // included it. Copy ONLY the receipt, then prove the laptop bytes against a
  // checksum generated from the LOCAL raw bytes over stdin. The prior receipt
  // is already preserved by preservePriorReceipt under .superseded/ and mirrored
  // by the rsync. Success requires the laptop receipt bytes to match too.
  const receiptBytes = await fs.readFile(receiptFile);
  const receiptChecksum = `${createHash('sha256').update(receiptBytes).digest('hex')}  backup-verification.json\n`;
  try {
    await runCommand('rsync', ['-a', '--checksum', receiptFile, `${laptop}:${remoteBase}/backup-verification.json`], { timeoutMs: 15 * 60_000 });
    await runCommand('ssh', [laptop, `cd ${remoteBase} && sha256sum -c -`], { input: receiptChecksum, timeoutMs: 15 * 60_000 });
  } catch (error) {
    // A receipt proves both copies only when the laptop bytes match. Drop the
    // local receipt so a failed upload cannot leave a valid-looking proof; the
    // prior receipt stays in .superseded/ and a resume retries the upload.
    await fs.rm(receiptFile, { force: true });
    throw error;
  }
  log(`laptop copy verified: ${laptop}:${remoteBase}/`);
  return { runDir, manifest, receipt };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Bounded, fail-closed purge over a frozen manifest.
 * Drops any path that became referenced, stops at the first failed batch, and
 * confirms absence after remove. Never deletes a path outside `manifest`.
 */
function requireExecutionProof(plan, kind, withLockedBatch, runner, batchSize) {
  if (!plan || plan.kind !== kind || !plan.identity || !Object.isFrozen(plan.rows)) {
    throw new Error('A verified frozen backup plan is required');
  }
  if (typeof withLockedBatch !== 'function' || typeof runner !== 'function') {
    throw new Error('Database locking and remote backup verification are required');
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > PURGE_BATCH_SIZE) {
    throw new Error('Batch size must be an integer from 1 to 50');
  }
}

async function executionCheckpoint(plan, kind, suppliedPath) {
  const file = suppliedPath ?? path.join(plan.identity.runDir, `${kind}-checkpoint.json`);
  if (path.dirname(path.resolve(file)) !== plan.identity.runDir) {
    throw new Error('Checkpoint must stay inside the verified backup directory');
  }
  let state;
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid checkpoint file');
    state = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { file, state: {} };
    throw error;
  }
  if (state.plan_sha256 !== plan.planSha256 || state.manifest_sha256 !== plan.identity.manifestSha256) {
    throw new Error('Checkpoint belongs to a different frozen plan or backup');
  }
  const known = new Set(plan.rows.map(row =>
    kind === 'purge' ? row.path : kind === 'source-delete' ? makeObjectKey(row.bucket, row.path) : row.id));
  const completed = kind === 'expire' ? state.deletedRows : state.deleted;
  if (!Array.isArray(completed) || completed.some(value => !known.has(value))) {
    throw new Error('Checkpoint contains unknown completed entries');
  }
  return { file, state };
}

async function saveExecutionCheckpoint(file, plan, result) {
  await writeAtomicJson(file, {
    ...result,
    plan_sha256: plan.planSha256,
    manifest_sha256: plan.identity.manifestSha256,
  });
}

async function verifyDeletionBatch(plan, rows, runner) {
  await verifyFrozenArtifacts({ runDir: plan.identity.runDir, rows });
  await verifyRemoteBatch({ identity: plan.identity, rows, runner });
}

function sameObjectVersion(live, frozen) {
  return Number(live.bytes) === frozen.bytes &&
    sameExactTimestamp(live.created_at, frozen.object_created_at) &&
    sameExactTimestamp(live.updated_at, frozen.object_updated_at);
}

export async function runPurge({
  plan, confirm, removeObjects, listExisting, checkStillEligible, withLockedBatch,
  runner, checkpointPath, batchSize = PURGE_BATCH_SIZE, writeResult = async () => {},
} = {}) {
  let result = { status: 'ok', deleted: [], dropped: [], alreadyAbsent: [], stillPresent: [], batches: 0 };
  if (!confirm) {
    result.status = 'refused';
    result.reason = 'confirm-not-set';
    await writeResult(result);
    return result;
  }
  let checkpoint;
  try {
    requireExecutionProof(plan, 'purge', withLockedBatch, runner, batchSize);
    checkpoint = await executionCheckpoint(plan, 'purge', checkpointPath);
    result = { ...result, ...checkpoint.state, status: 'ok' };
    delete result.error;
    const processed = new Set(result.deleted);
    for (const batch of chunk(plan.rows.filter(row => !processed.has(row.path)), batchSize)) {
      await verifyDeletionBatch(plan, batch, runner);
      result.batches += 1;
      const outcome = await withLockedBatch(async () => {
        const paths = batch.map(row => row.path);
        const existing = new Set(await listExisting(INPUT_BUCKET, paths));
        for (const row of batch) {
          if (!existing.has(row.path)) {
            result.deleted.push(row.path);
            result.alreadyAbsent.push(row.path);
          }
        }
        const liveRows = await checkStillEligible(INPUT_BUCKET, paths.filter(value => existing.has(value)));
        const liveByPath = new Map(liveRows.map(row => [row.path, row]));
        const referenceFlags = ['gallery_reference', 'nonterminal_reservation_reference',
          'nonterminal_job_reference', 'reservation_output_reference', 'job_output_reference'];
        const eligible = batch.filter(row => {
          if (!existing.has(row.path)) return false;
          const live = liveByPath.get(row.path);
          const allowed = live && referenceFlags.every(flag => live[flag] === false) &&
            isInputCandidateEligible(live) && sameObjectVersion(live, row);
          if (!allowed) result.dropped.push(row.path);
          return allowed;
        });
        if (!eligible.length) return { status: 'ok' };
        const targets = eligible.map(row => row.path);
        let removeError;
        try { await removeObjects(INPUT_BUCKET, targets); }
        catch (error) { removeError = error; }
        const present = new Set(await listExisting(INPUT_BUCKET, targets));
        for (const target of targets) {
          if (!present.has(target)) result.deleted.push(target);
          else result.stillPresent.push(target);
        }
        if (removeError || present.size) {
          return { status: 'error', error: removeError ? errorMessage(removeError) : 'Objects remain after remove' };
        }
        return { status: 'ok' };
      });
      await saveExecutionCheckpoint(checkpoint.file, plan, result);
      if (outcome?.status !== 'ok') throw new Error(outcome?.error ?? 'Locked batch did not confirm success');
    }
  } catch (error) {
    result.status = checkpoint ? 'error' : 'refused';
    result.error = errorMessage(error);
  }
  await writeResult(result);
  return result;
}

// =============================================================================
// Source delete: all three buckets, frozen manifest only, behind the live ACL fence
// =============================================================================

export const R2_RECEIPT_FILE = 'r2-migration-receipt.json';
const R2_PUBLIC_BASE = 'https://assets.myimageupscaler.com';

// Reference flag per bucket, read inside the locked batch. A saved row still on the
// supabase backend, or a blog row/post that still points at the source, keeps the object.
export const SOURCE_RECHECK_SQL = Object.freeze({
  [GALLERY_BUCKET]: `
    SELECT n.path,
           EXISTS (SELECT 1 FROM public.saved_images s
                   WHERE s.storage_path = n.path AND s.storage_backend IS DISTINCT FROM 'r2') AS source_reference
    FROM unnest($1::text[]) AS n(path)`,
  [BLOG_BUCKET]: `
    SELECT n.path,
           (EXISTS (SELECT 1 FROM public.blog_images b
                    WHERE b.storage_path = n.path AND b.url IS DISTINCT FROM $2::text || '/' || n.path)
            OR EXISTS (SELECT 1 FROM public.blog_posts p
                       WHERE strpos(coalesce(p.content, ''), 'blog-images/' || n.path) > 0
                          OR strpos(coalesce(p.featured_image_url, ''), 'blog-images/' || n.path) > 0)) AS source_reference
    FROM unnest($1::text[]) AS n(path)`,
});

export function isSourceDeleteEligible(bucket, live) {
  if (bucket === INPUT_BUCKET) return isInputCandidateEligible(live);
  if (bucket === GALLERY_BUCKET || bucket === BLOG_BUCKET) return live.source_reference === false;
  return false;
}

/**
 * Every manifest object whose immutable R2 copy was read back with the same
 * sha256 and byte count. Any difference between the receipt and the manifest
 * fails the whole plan; there is no partial or bucket-wide fallback.
 */
export async function loadSourceDeletePlan({ backupRunDir } = {}) {
  const identity = requireSupabaseSourceStore(await loadBackupIdentity(backupRunDir));
  const receiptPath = path.join(identity.runDir, R2_RECEIPT_FILE);
  await assertSafeRegularFile(identity.runDir, receiptPath);
  const raw = await fs.readFile(receiptPath, 'utf8');
  const receipt = JSON.parse(raw);
  if (receipt.manifest_sha256 !== identity.manifestSha256 || receipt.object_count !== identity.objectCount ||
      receipt.total_bytes !== identity.totalBytes || !Array.isArray(receipt.objects) ||
      receipt.objects.length !== identity.manifest.length) {
    throw new Error('R2 copy receipt does not bind this backup manifest');
  }
  const copied = new Map(receipt.objects.map(object => [makeObjectKey(object.source_bucket, object.source_path), object]));
  if (copied.size !== receipt.objects.length) throw new Error('R2 copy receipt repeats an object');
  const rows = identity.manifest.map(row => {
    const key = makeObjectKey(row.bucket, row.path);
    const object = copied.get(key);
    if (!ALL_BUCKETS.includes(row.bucket)) throw new Error(`Unsupported bucket in the backup manifest: ${row.bucket}`);
    if (!object || object.sha256 !== row.sha256 || object.bytes !== row.bytes) {
      throw new Error(`R2 copy receipt does not match the backup for ${key}`);
    }
    return Object.freeze({ bucket: row.bucket, path: row.path, bytes: row.bytes, sha256: row.sha256 });
  });
  return Object.freeze({ kind: 'source-delete', identity, planSha256: sha256OfText(raw), rows: Object.freeze(rows) });
}

/**
 * Bounded, fail-closed native delete of the planned objects, one bucket at a
 * time in batches of at most 50. Every batch starts by re-reading the live ACL
 * fence inside the locked database batch; the injected `removeObjects` rechecks
 * the exact native version and eTag right before each delete. The first failed
 * batch stops the run.
 */
export async function runSourceDelete({
  plan, confirm, checkFence, removeObjects, listExisting, checkStillEligible, withLockedBatch,
  runner, checkpointPath, batchSize = PURGE_BATCH_SIZE, writeResult = async () => {},
} = {}) {
  let result = { status: 'ok', deleted: [], dropped: [], alreadyAbsent: [], stillPresent: [], batches: 0 };
  if (!confirm) {
    result.status = 'refused';
    result.reason = 'confirm-not-set';
    await writeResult(result);
    return result;
  }
  let checkpoint;
  try {
    requireExecutionProof(plan, 'source-delete', withLockedBatch, runner, batchSize);
    if (typeof checkFence !== 'function') throw new Error('A live fence check is required');
    checkpoint = await executionCheckpoint(plan, 'source-delete', checkpointPath);
    result = { ...result, ...checkpoint.state, status: 'ok', stillPresent: [] };
    delete result.error;
    const processed = new Set(result.deleted);
    const keyOf = row => makeObjectKey(row.bucket, row.path);
    const pending = plan.rows.filter(row => !processed.has(keyOf(row)));
    for (const bucket of ALL_BUCKETS) {
      for (const batch of chunk(pending.filter(row => row.bucket === bucket), batchSize)) {
        await verifyDeletionBatch(plan, batch, runner);
        result.batches += 1;
        const outcome = await withLockedBatch(async () => {
          if ((await checkFence()) !== true) return { status: 'error', error: 'Native source fence is not held' };
          const paths = batch.map(row => row.path);
          const existing = new Set(await listExisting(bucket, paths));
          for (const row of batch) {
            if (!existing.has(row.path)) {
              result.deleted.push(keyOf(row));
              result.alreadyAbsent.push(keyOf(row));
            }
          }
          const liveRows = await checkStillEligible(bucket, paths.filter(value => existing.has(value)));
          const liveByPath = new Map(liveRows.map(row => [row.path, row]));
          const eligible = batch.filter(row => {
            if (!existing.has(row.path)) return false;
            const live = liveByPath.get(row.path);
            const allowed = live && isSourceDeleteEligible(bucket, live);
            if (!allowed) result.dropped.push(keyOf(row));
            return allowed;
          });
          if (!eligible.length) return { status: 'ok' };
          const targets = eligible.map(row => row.path);
          let removeError;
          try { await removeObjects(bucket, targets); }
          catch (error) { removeError = error; }
          const present = new Set(await listExisting(bucket, targets));
          for (const row of eligible) {
            if (!present.has(row.path)) result.deleted.push(keyOf(row));
            else result.stillPresent.push(keyOf(row));
          }
          if (removeError || present.size) {
            return { status: 'error', error: removeError ? errorMessage(removeError) : 'Objects remain after remove' };
          }
          return { status: 'ok' };
        });
        await saveExecutionCheckpoint(checkpoint.file, plan, result);
        if (outcome?.status !== 'ok') throw new Error(outcome?.error ?? 'Locked batch did not confirm success');
      }
    }
  } catch (error) {
    result.status = checkpoint ? 'error' : 'refused';
    result.error = errorMessage(error);
  }
  await writeResult(result);
  return result;
}

/**
 * Compare the live native rows with the frozen source proof. `added` objects
 * need their own backup and R2 copy. `changed` objects cannot be copied again
 * (R2 copies are immutable) and need an operator decision.
 */
export function classifySourceDelta({ proofObjects, liveRows }) {
  const added = [];
  const changed = [];
  const seen = new Set();
  for (const row of liveRows) {
    const key = makeObjectKey(row.bucket_id, row.name);
    seen.add(key);
    const source = proofObjects.get(key);
    if (!source) added.push(key);
    else if (!sameNativeIdentity(row, source)) changed.push(key);
  }
  const gone = [...proofObjects.keys()].filter(key => !seen.has(key));
  return { added: added.sort(), changed: changed.sort(), gone: gone.sort() };
}

const SAVED_IMAGE_FIELDS = ['id', 'user_id', 'original_filename', 'file_size_bytes', 'width',
  'height', 'model_used', 'processing_mode', 'created_at'];

function sameGalleryRow(live, frozen) {
  return live && live.storage_path === frozen.path &&
    SAVED_IMAGE_FIELDS.every(field => live[field] === frozen[field]);
}

export async function runExpire({
  plan, confirm, removeObjects, listExisting, loadCurrentRows, deleteRows, restoreObjects,
  withLockedBatch, runner, checkpointPath, batchSize = PURGE_BATCH_SIZE, writeResult = async () => {},
} = {}) {
  let result = { status: 'ok', deletedObjects: [], deletedRows: [], skipped: [], restored: [], batches: 0 };
  if (!confirm) {
    result.status = 'refused';
    result.reason = 'confirm-not-set';
    await writeResult(result);
    return result;
  }
  let checkpoint;
  try {
    requireExecutionProof(plan, 'expire', withLockedBatch, runner, batchSize);
    if (typeof restoreObjects !== 'function' || typeof loadCurrentRows !== 'function') {
      throw new Error('Fresh gallery rows and backup restoration are required');
    }
    checkpoint = await executionCheckpoint(plan, 'expire', checkpointPath);
    result = { ...result, ...checkpoint.state, status: 'ok' };
    delete result.error;
    const processed = new Set(result.deletedRows);
    for (const batch of chunk(plan.rows.filter(row => !processed.has(row.id)), batchSize)) {
      await verifyDeletionBatch(plan, batch, runner);
      result.batches += 1;
      let touched = [];
      let outcome;
      try {
        outcome = await withLockedBatch(async () => {
          const current = new Map((await loadCurrentRows(batch.map(row => row.id))).map(row => [row.id, row]));
          const present = new Set(await listExisting(GALLERY_BUCKET, batch.map(row => row.path)));
          const eligible = [];
          for (const row of batch) {
            const live = current.get(row.id);
            const versionMatches = !present.has(row.path) || sameObjectVersion({
              bytes: live?.object_bytes, created_at: live?.object_created_at, updated_at: live?.object_updated_at,
            }, row);
            if (live?.eligible === true && sameGalleryRow(live, row) && versionMatches) {
              eligible.push(row);
            } else {
              result.skipped.push(row.id);
              if (live && live.storage_path === row.path && !present.has(row.path)) {
                await restoreObjects([row]);
                if (!(await listExisting(GALLERY_BUCKET, [row.path])).includes(row.path)) {
                  throw new Error('Backup restoration did not restore the protected gallery object');
                }
                result.restored.push(row.path);
              }
            }
          }
          if (!eligible.length) return { status: 'ok', deletedIds: [], rows: [] };
          touched = eligible;
          const targets = eligible.map(row => row.path);
          const toRemove = targets.filter(value => present.has(value));
          if (toRemove.length) await removeObjects(GALLERY_BUCKET, toRemove);
          const remaining = await listExisting(GALLERY_BUCKET, targets);
          if (remaining.length) throw new Error('Objects remain after remove');
          const deletedIds = await deleteRows(eligible);
          const returned = new Set(deletedIds);
          if (returned.size !== eligible.length || eligible.some(row => !returned.has(row.id))) {
            throw new Error('Guarded row deletion did not match the frozen batch');
          }
          return { status: 'ok', deletedIds, rows: eligible };
        });
        if (outcome?.status !== 'ok') throw new Error(outcome?.error ?? 'Locked batch did not confirm success');
      } catch (error) {
        // The transaction has rolled back; restore files before reporting a failed batch.
        if (touched.length) {
          const present = new Set(await listExisting(GALLERY_BUCKET, touched.map(row => row.path)));
          const missing = touched.filter(row => !present.has(row.path));
          if (missing.length) {
            await verifyFrozenArtifacts({ runDir: plan.identity.runDir, rows: missing });
            await restoreObjects(missing);
            const restoredPaths = new Set(await listExisting(GALLERY_BUCKET, missing.map(row => row.path)));
            if (missing.some(row => !restoredPaths.has(row.path))) {
              throw new Error(`Backup restoration did not restore every removed object: ${errorMessage(error)}`);
            }
            result.restored.push(...missing.map(row => row.path));
          }
        }
        throw error;
      }
      result.deletedRows.push(...outcome.deletedIds);
      result.deletedObjects.push(...outcome.rows.map(row => row.path));
      await saveExecutionCheckpoint(checkpoint.file, plan, result);
    }
  } catch (error) {
    result.status = checkpoint ? 'error' : 'refused';
    result.error = errorMessage(error);
  }
  await writeResult(result);
  return result;
}

// =============================================================================
// Runtime plumbing (not exercised by unit tests)
// =============================================================================

function runId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function sha256File(filePath) {
  return (await streamHashFile(filePath)).sha256;
}

async function defaultRunCommand(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    input: options.input,
    stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit'],
    timeout: options.timeoutMs ?? 120_000,
  });
}

/**
 * The Supabase Storage CDN can serve stale bytes even for a no-cache request,
 * so every download must match the listed eTag. A missing eTag fails closed.
 */
export function makeServiceRoleDownload({ supabaseUrl, serviceRoleKey, fetchFn = fetch }) {
  return ({ bucket, path: objectPath, targetPath, expectedBytes, expectedETag }) =>
    streamDownloadToFile({
      url: `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`,
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      targetPath,
      expectedBytes,
      expectedETag: expectedETag ?? null,
      fetchFn,
    });
}

function log(message) {
  process.stdout.write(`[storage] ${message}\n`);
}

function loadSecret(secretName) {
  const content = execFileSync(
    'gcloud',
    ['secrets', 'versions', 'access', 'latest', `--secret=${secretName}`, `--project=${GCLOUD_PROJECT}`],
    { encoding: 'utf8' }
  );
  const map = new Map();
  for (const line of content.split('\n')) {
    const index = line.indexOf('=');
    if (index > 0) map.set(line.slice(0, index), line.slice(index + 1));
  }
  return map;
}

function loadConfig() {
  const api = loadSecret(GCLOUD_SECRET_API);
  const client = loadSecret(GCLOUD_SECRET_CLIENT);
  const supabaseUrl = client.get('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = api.get('SUPABASE_SERVICE_ROLE_KEY');
  const dbPassword = api.get('SUPABASE_DB_PASSWORD');
  const region = api.get('SUPABASE_DB_REGION');
  if (!supabaseUrl || !serviceRoleKey || !dbPassword || !region) {
    throw new Error('Missing required prod secrets for Storage/DB access');
  }
  const projectRef = supabaseUrl.replace(/^https:\/\/([^.]+)\.supabase\.co.*$/, '$1');
  const dbHost = `aws-0-${region}.pooler.supabase.com`;
  const dbUser = `postgres.${projectRef}`;
  return { supabaseUrl, serviceRoleKey, dbPassword, dbHost, dbUser };
}

async function createStorage(config) {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;
}

export async function createDb(config) {
  const pg = (await import('pg')).default;
  const client = new pg.Client({
    host: config.dbHost,
    port: 5432,
    user: config.dbUser,
    database: 'postgres',
    password: config.dbPassword,
    connectionTimeoutMillis: 15_000,
    query_timeout: 60_000,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

async function preflightQuota(storage) {
  const { error } = await storage.from(INPUT_BUCKET).list('', { limit: 1 });
  if (error) {
    if (error.status === 402 || error.statusCode === '402' || /402|restricted/i.test(error.message ?? '')) {
      process.stderr.write('quota still restricted\n');
      process.exit(QUOTA_RESTRICTED_EXIT);
    }
    throw new Error(`preflight list failed: ${error.message}`);
  }
}

async function listAllObjects(storage, bucket, prefix = '') {
  const out = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await storage.from(bucket).list(prefix, { limit: pageSize, offset });
    if (error) throw new Error(`list ${bucket}/${prefix} failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        out.push(...(await listAllObjects(storage, bucket, fullPath)));
      } else {
        out.push({
          path: fullPath,
          id: entry.id ?? null,
          // Legacy name: this is the content eTag, not storage.objects.version.
          version: entry.metadata?.eTag ?? null,
          etag: entry.metadata?.eTag ?? null,
          bytes: Number(entry.metadata?.size ?? 0) || 0,
          created_at: entry.created_at ?? null,
          updated_at: entry.updated_at ?? null,
        });
      }
    }
    if (data.length < pageSize) break;
  }
  return out;
}

export async function pathExists(storage, bucket, objectPath) {
  if (!validateObjectPath(objectPath)) throw new Error('Unsafe object path');
  const dir = path.posix.dirname(objectPath);
  const base = path.posix.basename(objectPath);
  const searchDir = dir === '.' ? '' : dir;
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await storage.from(bucket).list(searchDir, {
      search: base, limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`Exact object check failed: ${error.message}`);
    if (!Array.isArray(data)) throw new Error('Object check returned no inventory');
    if (data.some(item => item.name === base && item.id != null)) return true;
    if (data.length < pageSize) return false;
  }
}

export async function withDatabaseBatch(db, kind, callback) {
  const tables = ['public.saved_images', 'public.processing_credit_reservations', 'public.processing_jobs'];
  // The fresh recheck reads auth.sessions.refreshed_at; lock it for expire only so a
  // concurrent refresh cannot commit between the recheck and the row delete.
  if (kind === 'expire') tables.push('auth.users', 'auth.sessions', 'public.profiles', 'public.subscriptions', 'public.credit_transactions');
  else if (kind === 'source-delete') tables.push('public.blog_images', 'public.blog_posts');
  else if (kind !== 'purge') throw new Error('Unknown batch kind');
  await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  try {
    await db.query("SET LOCAL lock_timeout = '5s'");
    await db.query("SET LOCAL statement_timeout = '30s'");
    // Storage uses its own connection; locking storage.objects would deadlock its API.
    await db.query(`LOCK TABLE ${tables.join(', ')} IN SHARE ROW EXCLUSIVE MODE`);
    const outcome = await callback();
    await db.query(outcome?.status === 'ok' ? 'COMMIT' : 'ROLLBACK');
    return outcome;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

/** Same frozen native identity: object id, version, content eTag, size and exact timestamps. */
function sameNativeIdentity(row, source) {
  return row.id === source.id && row.version === source.version &&
    row.metadata?.eTag === source.metadata.eTag && Number(row.metadata?.size) === Number(source.metadata.size) &&
    sameExactTimestamp(row.created_at, source.created_at) && sameExactTimestamp(row.updated_at, source.updated_at);
}

/** Pinned hosted contract: immutable backup + exact native-version DELETE for the planned objects. */
export async function makeNativeVersionStorageActions({ plan, db, config, fetchFn = fetch }) {
  requireSupabaseSourceStore(plan.identity);
  const proof = await loadSourceObjectProof(plan.identity.runDir);
  if (!proof) throw new Error('Native source proof is required');
  const allowed = new Map(plan.rows.map(row => [makeObjectKey(row.bucket, row.path), row]));
  if (plan.rows.some(row => !ALL_BUCKETS.includes(row.bucket))) throw new Error('Native delete is proven only for the production buckets');
  const origin = new URL(config.supabaseUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Storage credentials require a trusted HTTPS origin');
  }
  const headers = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` };
  const assertTargets = (bucket, paths) => {
    if (!Array.isArray(paths) || paths.length > PURGE_BATCH_SIZE || new Set(paths).size !== paths.length ||
        paths.some(value => !allowed.has(makeObjectKey(bucket, value)) || !validateObjectPath(value))) {
      throw new Error('Native deletion requires a bounded set of planned paths');
    }
  };
  const guard = async bucket => {
    const version = await fetchFn(`${origin.origin}/storage/v1/version`, { headers, signal: AbortSignal.timeout(30_000) });
    if (!version.ok || (await version.text()).trim() !== '1.80.2') throw new Error('Unproven Storage server version');
    const state = (await db.query('SELECT versioning_status FROM storage.buckets WHERE id = $1', [bucket])).rows;
    if (state.length !== 1 || state[0].versioning_status !== 'DISABLED') throw new Error('Unproven Storage version history contract');
  };
  return {
    listExisting: async (bucket, paths) => {
      assertTargets(bucket, paths);
      return (await db.query('SELECT name AS path FROM storage.objects WHERE bucket_id = $1 AND name = ANY($2::text[])', [bucket, paths])).rows.map(row => row.path);
    },
    removeObjects: async (bucket, paths) => {
      assertTargets(bucket, paths);
      await guard(bucket);
      for (const objectPath of paths) {
        const source = proof.objects.get(makeObjectKey(bucket, objectPath));
        if (!source || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(source.version)) {
          throw new Error('Missing or invalid frozen native source version');
        }
        const current = (await db.query('SELECT to_jsonb(o) AS row FROM storage.objects o WHERE bucket_id = $1 AND name = $2', [bucket, objectPath])).rows;
        if (current.length === 0) continue;
        const row = current[0].row;
        if (current.length !== 1 || row.archived_at !== null || row.is_versioned !== false ||
            row.is_delete_marker !== false || !sameNativeIdentity(row, source)) {
          throw new Error('Native source changed after backup proof');
        }
        const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
        const response = await fetchFn(`${origin.origin}/storage/v1/object/${bucket}/${encodedPath}?versionId=${encodeURIComponent(source.version)}`, {
          method: 'DELETE', headers, signal: AbortSignal.timeout(30_000),
        });
        await response.body?.cancel();
        if (!response.ok) throw new Error(`Native source deletion refused: HTTP ${response.status}`);
      }
      await guard(bucket);
    },
  };
}

function storageActions(storage) {
  return {
    removeObjects: async () => {
      throw new Error('Unversioned Storage deletion is disabled');
    },
    listExisting: async (bucket, paths) => {
      const present = [];
      for (const objectPath of paths) if (await pathExists(storage, bucket, objectPath)) present.push(objectPath);
      return present;
    },
  };
}

export async function restoreGalleryObjects({ config, storage, runDir, rows, fetchFn = fetch }) {
  await verifyFrozenArtifacts({ runDir, rows });
  for (const row of rows) {
    if (await pathExists(storage, GALLERY_BUCKET, row.path)) continue;
    const metadata = row.object_metadata;
    if (!metadata || typeof metadata.mimetype !== 'string') throw new Error('Frozen restore metadata is required');
    const body = createReadStream(path.join(runDir, GALLERY_BUCKET, row.path));
    let response;
    try {
      response = await fetchFn(`${config.supabaseUrl}/storage/v1/object/${GALLERY_BUCKET}/${row.path}`, {
        method: 'POST',
        headers: {
          apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`,
          'Content-Type': metadata.mimetype,
          'Cache-Control': metadata.cacheControl ?? 'max-age=3600',
          'x-upsert': 'false',
        },
        body, duplex: 'half', signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`Backup restoration failed: HTTP ${response.status}`);
      await response.body?.cancel();
    } finally { body.destroy(); }
    const restored = await fetchFn(`${config.supabaseUrl}/storage/v1/object/${GALLERY_BUCKET}/${row.path}`, {
      headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (!restored.ok || !restored.body) throw new Error('Restored object could not be verified');
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const block of Readable.fromWeb(restored.body)) { hash.update(block); bytes += block.length; }
    if (hash.digest('hex') !== row.sha256 || bytes !== row.bytes) throw new Error('Restored object hash mismatch');
  }
}

function requireFreeDisk() {
  const output = execFileSync('df', ['-k', os.homedir()], { encoding: 'utf8' });
  const line = output.trim().split('\n').pop() ?? '';
  const freeKb = Number(line.split(/\s+/)[3]);
  if (!Number.isFinite(freeKb) || freeKb * 1024 < MIN_FREE_DISK_BYTES) {
    throw new Error(`Less than ${MIN_FREE_DISK_BYTES / 1024 ** 3} GB free at ${os.homedir()}`);
  }
}

// =============================================================================
// Subcommands
// =============================================================================

async function cmdBackup(args) {
  const bucketArg = args.bucket ?? 'all';
  const buckets = bucketArg === 'all' ? ALL_BUCKETS : [bucketArg];
  if (!ALL_BUCKETS.includes(bucketArg) && bucketArg !== 'all') {
    throw new Error(`Unknown bucket: ${bucketArg}`);
  }

  requireFreeDisk();
  const config = loadConfig();
  const storage = await createStorage(config);
  await preflightQuota(storage);
  const db = await createDb(config);

  // Query DB references per bucket to record db_reference
  const dbRefs = new Set();
  try {
    const saved = await db.query('SELECT storage_path FROM public.saved_images');
    for (const r of saved.rows) dbRefs.add(makeObjectKey(GALLERY_BUCKET, r.storage_path));
    const blog = await db.query('SELECT storage_path FROM public.blog_images');
    for (const r of blog.rows) if (r.storage_path) dbRefs.add(makeObjectKey(BLOG_BUCKET, r.storage_path));
    const res = await db.query('SELECT input_storage_path FROM public.processing_credit_reservations WHERE input_storage_path IS NOT NULL');
    for (const r of res.rows) dbRefs.add(makeObjectKey(INPUT_BUCKET, r.input_storage_path));
    const jobs = await db.query('SELECT input_image_path FROM public.processing_jobs WHERE input_image_path IS NOT NULL');
    for (const r of jobs.rows) dbRefs.add(makeObjectKey(INPUT_BUCKET, r.input_image_path));
  } finally {
    await db.end();
  }

  await runBackup({
    outputRoot: BACKUP_ROOT,
    resumeDir: args.resume,
    buckets,
    dbRefs,
    inventoryRetries: 2,
    listObjects: bucket => listAllObjects(storage, bucket),
    downloadObject: makeServiceRoleDownload({
      supabaseUrl: config.supabaseUrl,
      serviceRoleKey: config.serviceRoleKey,
    }),
    runCommand: defaultRunCommand,
    log,
  });
}


export async function writeFrozenPlan(backupDir, kind, rows) {
  const filename = kind === 'purge' ? 'purge-manifest' : kind === 'expire' ? 'expire-rows' : null;
  if (!filename) throw new Error(`Unknown plan kind: ${kind}`);
  const text = rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
  const digest = sha256OfText(text);
  const manifestPath = path.join(backupDir, `${filename}.jsonl`);
  // The digest is published last; a partial plan cannot pass the verification gate.
  await fs.writeFile(manifestPath, text, { flag: 'wx', mode: 0o400 });
  await fs.writeFile(path.join(backupDir, `${filename}.digest`), `${digest}\n`, { flag: 'wx', mode: 0o400 });
  return { manifestPath, digest };
}

async function cmdPlanPurge(args) {
  const backupDir = required(args.manifest, '--manifest <backup-run-dir>');
  const identity = await loadBackupIdentity(backupDir);
  requireSupabaseSourceStore(identity);
  const config = loadConfig();
  const storage = await createStorage(config);
  await preflightQuota(storage);

  const verifiedRows = identity.manifest;
  const verifiedByKey = new Map(verifiedRows.map(row => [makeObjectKey(row.bucket, row.path), row]));

  const db = await createDb(config);
  try {
    const { rows } = await db.query(INPUT_CANDIDATE_SQL);
    const liveByPath = new Map(rows.map(row => [row.path, row]));
    const selected = selectPurgePaths(rows, { verifiedByKey })
      .filter(row => {
        const live = liveByPath.get(row.path);
        const backup = verifiedByKey.get(makeObjectKey(INPUT_BUCKET, row.path));
        return Number(live.bytes) === backup.bytes &&
          sameExactTimestamp(live.created_at, backup.created_at) &&
          sameExactTimestamp(live.updated_at, backup.updated_at);
      })
      .map(row => {
        const backup = verifiedByKey.get(makeObjectKey(INPUT_BUCKET, row.path));
        return { ...row, object_created_at: backup.created_at, object_updated_at: backup.updated_at };
      });
    await verifyFrozenArtifacts({ runDir: identity.runDir, rows: selected });
    const { manifestPath, digest } = await writeFrozenPlan(backupDir, 'purge', selected);
    log(`plan-purge: ${selected.length} paths, digest: ${digest} -> ${manifestPath}`);
  } finally {
    await db.end();
  }
}



async function cmdPurge(args) {
  const manifestPath = path.resolve(required(args.manifest, '--manifest <purge-manifest.jsonl>'));
  if (!args.confirm) throw new Error('purge requires --confirm');
  const plan = await loadFrozenPlan({ backupRunDir: path.dirname(manifestPath), kind: 'purge', planPath: manifestPath });
  requireSupabaseSourceStore(plan.identity);
  const { resolvePrimaryCheckoutRoot, verifyFreshDatabaseBackup } = await import('./database-backup-gate.mjs');
  const repoRoot = await resolvePrimaryCheckoutRoot({ runner: defaultRunCommand });
  const databaseBackup = await verifyFreshDatabaseBackup({ repoRoot, runner: defaultRunCommand });
  log(`fresh database backup: ${JSON.stringify(databaseBackup)}`);
  const config = loadConfig();
  const storage = await createStorage(config);
  await preflightQuota(storage);
  const db = await createDb(config);
  const resultPath = path.join(plan.identity.runDir, 'purge-result.json');
  try {
    const result = await runPurge({
      plan, confirm: true, runner: defaultRunCommand,
      ...await makeNativeVersionStorageActions({ plan, db, config }),
      withLockedBatch: callback => withDatabaseBatch(db, 'purge', callback),
      checkStillEligible: async (bucket, paths) => (await db.query(INPUT_RECHECK_SQL, [bucket, paths])).rows,
      writeResult: payload => writeAtomicJson(resultPath, { ...payload, database_backup: databaseBackup }),
    });
    log(`purge: ${result.status}, deleted ${result.deleted.length}, dropped ${result.dropped.length} -> ${resultPath}`);
    if (result.status !== 'ok') process.exitCode = 1;
  } finally { await db.end(); }
}

async function cmdDeleteSource(args) {
  if (!args.confirm) throw new Error('delete-source requires --confirm');
  const plan = await loadSourceDeletePlan({ backupRunDir: path.resolve(required(args.manifest, '--manifest <backup-run-dir>')) });
  const { resolvePrimaryCheckoutRoot, verifyFreshDatabaseBackup } = await import('./database-backup-gate.mjs');
  const repoRoot = await resolvePrimaryCheckoutRoot({ runner: defaultRunCommand });
  const databaseBackup = await verifyFreshDatabaseBackup({ repoRoot, runner: defaultRunCommand });
  log(`fresh database backup: ${JSON.stringify(databaseBackup)}`);
  const config = loadConfig();
  const db = await createDb(config);
  const resultPath = path.join(plan.identity.runDir, 'source-delete-result.json');
  try {
    const result = await runSourceDelete({
      plan, confirm: true, runner: defaultRunCommand,
      ...await makeNativeVersionStorageActions({ plan, db, config }),
      checkFence: async () => isNativeFenced(await readFenceMatrix(db)),
      withLockedBatch: callback => withDatabaseBatch(db, 'source-delete', callback),
      checkStillEligible: async (bucket, paths) => bucket === INPUT_BUCKET
        ? (await db.query(INPUT_RECHECK_SQL, [bucket, paths])).rows
        : (await db.query(SOURCE_RECHECK_SQL[bucket], bucket === BLOG_BUCKET ? [paths, R2_PUBLIC_BASE] : [paths])).rows,
      writeResult: payload => writeAtomicJson(resultPath, { ...payload, database_backup: databaseBackup }),
    });
    log(`delete-source: ${result.status}, deleted ${result.deleted.length}, dropped ${result.dropped.length}, still present ${result.stillPresent.length} -> ${resultPath}`);
    if (result.status !== 'ok') process.exitCode = 1;
  } finally { await db.end(); }
}

/**
 * Find native objects that are not in, or differ from, the frozen source proof.
 * New objects get their own two-machine backup run (a normal `backup` run limited to
 * those objects). Run `source-proof`, `migrate-r2 plan`/`copy` and `delete-source`
 * on that new run directory. A changed object stops the command.
 */
async function cmdDelta(args) {
  const identity = requireSupabaseSourceStore(await loadBackupIdentity(required(args.manifest, '--manifest <backup-run-dir>')));
  const proof = await loadSourceObjectProof(identity.runDir);
  if (!proof) throw new Error('A source object proof is required; run verify-r2-references.mjs source-proof first');
  const config = loadConfig();
  const db = await createDb(config);
  let liveRows;
  try {
    liveRows = (await db.query('SELECT to_jsonb(o) AS row FROM storage.objects AS o WHERE o.bucket_id = ANY($1::text[])', [ALL_BUCKETS]))
      .rows.map(entry => entry.row);
  } finally {
    await db.end();
  }
  const delta = classifySourceDelta({ proofObjects: proof.objects, liveRows });
  log(`delta: ${delta.added.length} new, ${delta.changed.length} changed, ${delta.gone.length} gone`);
  if (delta.changed.length) throw new Error(`Changed source objects need an operator decision: ${delta.changed.join(', ')}`);
  if (!delta.added.length) return;
  const added = new Set(delta.added);
  requireFreeDisk();
  const storage = await createStorage(config);
  await preflightQuota(storage);
  const { runDir, manifest } = await runBackup({
    outputRoot: BACKUP_ROOT,
    buckets: ALL_BUCKETS,
    inventoryRetries: 2,
    listObjects: async bucket => (await listAllObjects(storage, bucket)).filter(object => added.has(makeObjectKey(bucket, object.path))),
    downloadObject: makeServiceRoleDownload({ supabaseUrl: config.supabaseUrl, serviceRoleKey: config.serviceRoleKey }),
    runCommand: defaultRunCommand,
    log,
  });
  const backedUp = manifest.map(row => makeObjectKey(row.bucket, row.path)).sort();
  if (JSON.stringify(backedUp) !== JSON.stringify(delta.added)) {
    throw new Error('Delta backup does not match the new native objects; rerun delta');
  }
  log(`delta backup run: ${runDir}`);
}

async function cmdPlanExpire(args) {
  const backupDir = required(args.manifest, '--manifest <backup-run-dir>');
  const identity = await loadBackupIdentity(backupDir);
  requireSupabaseSourceStore(identity);
  const config = loadConfig();
  const storage = await createStorage(config);
  await preflightQuota(storage);

  const verifiedRows = identity.manifest;
  const verifiedByKey = new Map(verifiedRows.map(row => [makeObjectKey(row.bucket, row.path), row]));

  const db = await createDb(config);
  try {
    const { rows } = await db.query(INACTIVE_GALLERY_SQL);
    const selected = rows.map(row => ({ ...row.snapshot, object_metadata: row.object_metadata }))
      .filter(row => verifiedByKey.has(makeObjectKey(GALLERY_BUCKET, row.storage_path)))
      .map(row => {
        const backupEntry = verifiedByKey.get(makeObjectKey(GALLERY_BUCKET, row.storage_path));
        return {
          id: row.id,
          user_id: row.user_id,
          bucket: GALLERY_BUCKET,
          path: row.storage_path,
          object_metadata: row.object_metadata,
          original_filename: row.original_filename,
          file_size_bytes: row.file_size_bytes,
          width: row.width,
          height: row.height,
          model_used: row.model_used,
          processing_mode: row.processing_mode,
          created_at: row.created_at,
          bytes: backupEntry?.bytes ?? row.file_size_bytes,
          sha256: backupEntry?.sha256 ?? null,
          object_created_at: backupEntry.created_at,
          object_updated_at: backupEntry.updated_at,
        };
      });
    await verifyFrozenArtifacts({ runDir: identity.runDir, rows: selected });
    const { manifestPath, digest } = await writeFrozenPlan(backupDir, 'expire', selected);
    log(`plan-expire: ${selected.length} rows across ${new Set(selected.map(r => r.user_id)).size} users, digest: ${digest} -> ${manifestPath}`);
  } finally {
    await db.end();
  }
}



async function cmdExpire(args) {
  const manifestPath = path.resolve(required(args.manifest, '--manifest <expire-rows.jsonl>'));
  if (!args.confirm) throw new Error('expire requires --confirm');
  const plan = await loadFrozenPlan({ backupRunDir: path.dirname(manifestPath), kind: 'expire', planPath: manifestPath });
  requireSupabaseSourceStore(plan.identity);
  const config = loadConfig();
  const storage = await createStorage(config);
  await preflightQuota(storage);
  const db = await createDb(config);
  const resultPath = path.join(plan.identity.runDir, 'expire-result.json');
  try {
    const result = await runExpire({
      plan, confirm: true, runner: defaultRunCommand,
      ...storageActions(storage),
      withLockedBatch: callback => withDatabaseBatch(db, 'expire', callback),
      loadCurrentRows: async ids => {
        const { rows } = await db.query(`WITH eligible AS (${GALLERY_RECHECK_SQL})
          SELECT to_jsonb(s) AS snapshot, e.id IS NOT NULL AS eligible,
                 to_jsonb(o)->>'created_at' AS object_created_at,
                 to_jsonb(o)->>'updated_at' AS object_updated_at,
                 (o.metadata->>'size')::bigint AS object_bytes
          FROM public.saved_images s LEFT JOIN eligible e ON e.id = s.id
          LEFT JOIN storage.objects o ON o.bucket_id = 'saved-images' AND o.name = s.storage_path
          WHERE s.id = ANY($1::uuid[])`, [ids]);
        return rows.map(row => ({ ...row.snapshot, eligible: row.eligible,
          object_created_at: row.object_created_at, object_updated_at: row.object_updated_at,
          object_bytes: row.object_bytes }));
      },
      deleteRows: async rows => {
        const result = await db.query(`WITH eligible AS (${GALLERY_RECHECK_SQL})
          DELETE FROM public.saved_images s
          USING jsonb_to_recordset($2::jsonb) AS frozen(id uuid, user_id uuid, path text, created_at timestamptz)
          WHERE s.id = frozen.id AND s.user_id = frozen.user_id AND s.storage_path = frozen.path
            AND s.created_at = frozen.created_at AND EXISTS (SELECT 1 FROM eligible e WHERE e.id = s.id)
          RETURNING s.id`, [rows.map(row => row.id), JSON.stringify(rows)]);
        return result.rows.map(row => row.id);
      },
      restoreObjects: rows => restoreGalleryObjects({ config, storage, runDir: plan.identity.runDir, rows }),
      writeResult: payload => writeAtomicJson(resultPath, payload),
    });
    log(`expire: ${result.status}, rows ${result.deletedRows.length} -> ${resultPath}`);
    if (result.status !== 'ok') process.exitCode = 1;
  } finally { await db.end(); }
}

export function blogPathFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const marker = `/${BLOG_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const raw = url.slice(index + marker.length).split('?')[0].split('#')[0];
  return raw.replace(/\/+$/, '') || null;
}

export function extractBlogPathsFromMarkdown(content) {
  if (!content || typeof content !== 'string') return [];
  const regex = /(?:https?:\/\/[^\s)\"']+)?\/storage\/v1\/(?:object|render\/image)\/public\/blog-images\/([a-zA-Z0-9_\-\.\/]+)/g;
  const found = new Set();
  let match;
  while ((match = regex.exec(content)) !== null) {
    const p = match[1].replace(/[),.\'\"]+$/, '');
    if (validateObjectPath(p)) found.add(p);
  }
  return Array.from(found);
}

// João accepted only this original broken body reference as a follow-up.
export function isAcceptedBaselineMissingReference(item) {
  return item?.sourceId === 'blog_posts:b26a2f86-ec30-40d0-8a33-bca21bfb7417' &&
    item.table === 'blog_posts' && item.field === 'content' &&
    item.source === '2026/01/1769887240667-tools-inline-1.webp' && item.reason === 'missing_manifest';
}

export async function verifyStorageIntegrity({ db, storage, log = () => {} }) {
  const gallery = await db.query('SELECT id, storage_path FROM public.saved_images');
  const blogImages = await db.query('SELECT id, storage_path, url FROM public.blog_images');
  const blogPosts = await db.query('SELECT id, featured_image_url, content FROM public.blog_posts');
  const targets = new Map();
  function addTarget(bucket, objectPath, table, id, field) {
    if (!objectPath) return;
    const key = makeObjectKey(bucket, objectPath);
    const source = { sourceId: `${table}:${id}`, table, field, source: objectPath, reason: 'missing_manifest' };
    if (!targets.has(key)) targets.set(key, { bucket, path: objectPath, sources: [] });
    targets.get(key).sources.push(source);
  }
  for (const row of gallery.rows) addTarget(GALLERY_BUCKET, row.storage_path, 'saved_images', row.id, 'storage_path');
  for (const row of blogImages.rows) {
    addTarget(BLOG_BUCKET, row.storage_path, 'blog_images', row.id, 'storage_path');
    addTarget(BLOG_BUCKET, blogPathFromUrl(row.url), 'blog_images', row.id, 'url');
  }
  for (const row of blogPosts.rows) {
    addTarget(BLOG_BUCKET, blogPathFromUrl(row.featured_image_url), 'blog_posts', row.id, 'featured_image_url');
    for (const objectPath of extractBlogPathsFromMarkdown(row.content)) {
      addTarget(BLOG_BUCKET, objectPath, 'blog_posts', row.id, 'content');
    }
  }
  const inventories = new Map();
  for (const bucket of new Set([...targets.values()].map(target => target.bucket))) {
    inventories.set(bucket, new Set((await listAllObjects(storage, bucket)).map(object => object.path)));
  }
  const missing = [...targets.values()].filter(target => !inventories.get(target.bucket).has(target.path));
  const unexpected = missing.filter(target => target.bucket !== BLOG_BUCKET || !target.sources.every(isAcceptedBaselineMissingReference));
  log(`verify-integrity: total targets checked: ${targets.size}, missing: ${missing.length}, unexpected: ${unexpected.length}`);
  for (const item of missing) {
    log(`  missing ${item.bucket}/${item.path} (from: ${item.sources.map(source => `${source.sourceId}.${source.field}`).join(', ')})`);
  }
  return { ok: unexpected.length === 0, missing, unexpected };
}

async function cmdVerifyIntegrity() {
  const config = loadConfig();
  const storage = await createStorage(config);
  await preflightQuota(storage);
  const db = await createDb(config);
  try {
    const result = await verifyStorageIntegrity({ db, storage, log });
    if (!result.ok) process.exitCode = 1;
  } finally {
    await db.end();
  }
}

function required(value, label) {
  if (!value) throw new Error(`missing required ${label}`);
  return value;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--confirm') args.confirm = true;
    else if (token === '--bucket') args.bucket = argv[++i];
    else if (token === '--manifest') args.manifest = argv[++i];
    else if (token === '--resume') args.resume = argv[++i];
    else args._.push(token);
  }
  return args;
}

function usage() {
  process.stdout.write(
    [
      'Usage: node scripts/storage/backup-and-purge.mjs <command> [options]',
      '  backup --bucket <name|all> [--resume <run-dir>]',
      '  plan-purge --manifest <backup-run-dir>',
      '  purge --manifest <purge-manifest.jsonl> --confirm',
      '  plan-expire --manifest <backup-run-dir>',
      '  expire --manifest <expire-rows.jsonl> --confirm',
      '  verify-integrity',
      '  delta --manifest <backup-run-dir>',
      '  delete-source --manifest <backup-run-dir> --confirm',
    ].join('\n') + '\n'
  );
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  // Independent review has not yet cleared backup and concurrent-update safeguards.
  if (command === 'purge' || command === 'expire') {
    throw new Error('Deletion disabled until backup and concurrency safeguards pass independent review');
  }
  const args = parseArgs(rest);
  switch (command) {
    case 'backup':
      return cmdBackup(args);
    case 'plan-purge':
      return cmdPlanPurge(args);
    case 'purge':
      return cmdPurge(args);
    case 'plan-expire':
      return cmdPlanExpire(args);
    case 'expire':
      return cmdExpire(args);
    case 'verify-integrity':
      return cmdVerifyIntegrity();
    case 'delta':
      return cmdDelta(args);
    case 'delete-source':
      return cmdDeleteSource(args);
    default:
      usage();
      process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`[storage] error: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
