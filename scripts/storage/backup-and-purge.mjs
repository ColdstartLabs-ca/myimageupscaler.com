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
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { loadBackupIdentity, loadFrozenPlan, verifyFrozenArtifacts, verifyRemoteBatch } from './backup-verification.mjs';

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
const INPUT_CANDIDATE_SQL = `
  SELECT o.name AS path,
         coalesce((o.metadata->>'size')::bigint, 0) AS bytes,
         o.created_at, o.updated_at,
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


const INPUT_RECHECK_SQL = `
  SELECT o.name AS path,
         o.created_at,
         o.updated_at,
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

const INACTIVE_GALLERY_SQL = `
  SELECT to_jsonb(s) AS snapshot, o.metadata AS object_metadata
  FROM public.saved_images s
  JOIN storage.objects o ON o.bucket_id = 'saved-images' AND o.name = s.storage_path
  JOIN auth.users u ON u.id = s.user_id
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE (
          u.last_sign_in_at < now() - interval '30 days'
          OR (u.last_sign_in_at IS NULL AND u.created_at < now() - interval '30 days')
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
          WHERE ct.user_id = s.user_id AND ct.type = 'purchase' AND ct.amount > 0
        )
`;

const GALLERY_RECHECK_SQL = `
  SELECT s.id, s.user_id, s.storage_path
  FROM public.saved_images s
  JOIN auth.users u ON u.id = s.user_id
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.id = ANY($1::uuid[])
    AND (
          u.last_sign_in_at < now() - interval '30 days'
          OR (u.last_sign_in_at IS NULL AND u.created_at < now() - interval '30 days')
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
          WHERE ct.user_id = s.user_id AND ct.type = 'purchase' AND ct.amount > 0
        )
    AND (
          SELECT count(*) FROM public.saved_images s2
          WHERE s2.storage_path = s.storage_path
        ) = 1
`;
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

async function streamHashFile(filePath) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: hash.digest('hex'), bytes };
}

/** Stable inventory fingerprint: full identity, not only a count. */
export function inventoryFingerprint(objects, bucket = '') {
  return (objects ?? [])
    .map(object =>
      [
        bucket || object.bucket || '',
        object.path,
        object.id ?? '',
        object.version ?? '',
        object.created_at ?? '',
        object.updated_at ?? '',
        Number(object.bytes) || 0,
      ].join('\u0000')
    )
    .sort()
    .join('\n');
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
 * exact. A failed stream leaves the unverified temp file in place and never
 * creates the final artifact.
 */
export async function streamDownloadToFile({ url, headers, targetPath, expectedBytes, fetchFn = fetch }) {
  const response = await fetchFn(url, { headers });
  if (!response || !response.ok || !response.body) {
    throw new Error(`download failed: HTTP ${response?.status ?? 'no-response'}`);
  }
  const tmp = `${targetPath}.part.${process.pid}.${Date.now()}.${(atomicTmpCounter += 1)}`;
  const hash = createHash('sha256');
  let bytes = 0;
  const hashing = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  const sink = createWriteStream(tmp, { mode: 0o600 });
  await pipeline(Readable.fromWeb(response.body), hashing, sink);
  if (expectedBytes != null && bytes !== Number(expectedBytes)) {
    throw new Error(`Byte size mismatch for ${targetPath}: expected ${expectedBytes}, got ${bytes}`);
  }
  await fs.rename(tmp, targetPath);
  return { sha256: hash.digest('hex'), bytes };
}

/**
 * Backup orchestrator. Injectable listing/download/runner keep the destructive
 * and network behavior out of tests while the real functions run in production.
 */
export async function runBackup({
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
} = {}) {
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
  mkdirSync(root, { recursive: true, mode: 0o700 });
  mkdirSync(runDir, { recursive: true, mode: 0o700 });

  const checkpointFile = path.join(runDir, 'backup-checkpoint.json');
  const checkpoint = readCheckpoint(checkpointFile) ?? { downloaded: {} };
  if (!checkpoint.downloaded || typeof checkpoint.downloaded !== 'object') {
    checkpoint.downloaded = {};
  }

  const manifest = [];
  const inventories = new Map();
  let expectedCount = 0;
  let expectedBytes = 0;
  let completedObjects = 0;
  let completedBytes = 0;
  let nextProgressAt = 50;

  for (const bucket of buckets) {
    const first = await listObjects(bucket);
    const second = await listObjects(bucket);
    if (inventoryFingerprint(first, bucket) !== inventoryFingerprint(second, bucket)) {
      throw new Error(`Unstable object listing for ${bucket}`);
    }
    const objects = second ?? [];
    inventories.set(bucket, inventoryFingerprint(objects, bucket));
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
          const entry = checkpoint.downloaded[key];
          const sameSource =
            entry &&
            isValidSha256(entry.sha256) &&
            isSafeByteCount(entry.bytes) &&
            entry.created_at === (object.created_at ?? null) &&
            entry.updated_at === (object.updated_at ?? null) &&
            Number(entry.bytes) === (Number(object.bytes) || 0) &&
            (entry.version ?? null) === (object.id ?? null);
          if (sameSource) {
            try {
              const hashed = await streamHashFile(targetPath);
              if (hashed.sha256 === entry.sha256 && hashed.bytes === entry.bytes) {
                sha256 = hashed.sha256;
                bytes = hashed.bytes;
              }
            } catch {
              // Missing or unreadable artifact: re-download below.
            }
          }

          let downloadedEntry = null;
          if (!sha256) {
            const result = await downloadObject({
              bucket,
              path: object.path,
              targetPath,
              expectedBytes: Number(object.bytes) || 0,
            });
            sha256 = result.sha256;
            bytes = result.bytes;
            downloadedEntry = {
              sha256,
              bytes,
              created_at: object.created_at ?? null,
              updated_at: object.updated_at ?? null,
              version: object.id ?? null,
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
      await writeAtomicJson(checkpointFile, checkpoint);
      if (completedObjects >= nextProgressAt) {
        log(`progress: ${bucket} ${completedObjects} objects, ${completedBytes} bytes`);
        nextProgressAt += 50;
      }
      if (firstError) throw firstError;
    }
  }

  for (const [bucket, fingerprint] of inventories) {
    if (inventoryFingerprint(await listObjects(bucket), bucket) !== fingerprint) {
      throw new Error(`Inventory changed during backup: ${bucket}`);
    }
  }

  if (manifest.length !== expectedCount) {
    throw new Error(`Manifest count mismatch: ${manifest.length} != ${expectedCount}`);
  }
  const manifestBytes = manifest.reduce((sum, row) => sum + row.bytes, 0);
  if (manifestBytes !== expectedBytes) {
    throw new Error(`Manifest byte mismatch: ${manifestBytes} != ${expectedBytes}`);
  }

  const manifestContent = manifest.map(row => JSON.stringify(row)).join('\n') + '\n';
  const sha256Content = manifest.map(row => `${row.sha256}  ${row.bucket}/${row.path}`).join('\n') + '\n';
  await writeAtomicRawText(path.join(runDir, 'manifest.jsonl'), manifestContent);
  await writeAtomicRawText(path.join(runDir, 'manifest.sha256'), sha256Content);

  // Local integrity gate before any second copy.
  await runCommand('sha256sum', ['-c', 'manifest.sha256'], { cwd: runDir });
  log(`manifest verified locally: ${manifest.length} objects, ${manifestBytes} bytes`);

  // Second copy to the Debian laptop, then verify both sides.
  const remoteBase = `~/backups/miu-storage/${path.basename(runDir)}`;
  await runCommand('ssh', [laptop, `mkdir -p ${remoteBase}/`]);
  await runCommand('rsync', ['-a', '--checksum', `${runDir}/`, `${laptop}:${remoteBase}/`]);
  await runCommand('ssh', [laptop, `cd ${remoteBase} && sha256sum -c manifest.sha256`]);

  const localManifestDigest = sha256OfText(manifestContent);
  const remoteOutput = await runCommand('ssh', [laptop, `sha256sum ${remoteBase}/manifest.jsonl`]);
  const remoteManifestDigest = String(remoteOutput ?? '').trim().split(/\s+/)[0];
  if (remoteManifestDigest !== localManifestDigest) {
    throw new Error(`Remote manifest digest mismatch: local=${localManifestDigest} remote=${remoteManifestDigest}`);
  }

  const receipt = {
    run_id: path.basename(runDir),
    object_count: manifest.length,
    total_bytes: manifestBytes,
    manifest_sha256: localManifestDigest,
    checksum_list_sha256: sha256OfText(sha256Content),
    remote: `${laptop}:${remoteBase}/`,
    verified_at: new Date().toISOString(),
  };
  await writeAtomicJson(path.join(runDir, 'backup-verification.json'), receipt);
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
  const known = new Set(plan.rows.map(row => kind === 'purge' ? row.path : row.id));
  const completed = kind === 'purge' ? state.deleted : state.deletedRows;
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
    new Date(live.created_at).getTime() === Date.parse(frozen.object_created_at) &&
    new Date(live.updated_at).getTime() === Date.parse(frozen.object_updated_at);
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
    timeout: 120_000,
  });
}

function makeServiceRoleDownload({ supabaseUrl, serviceRoleKey, fetchFn = fetch }) {
  return ({ bucket, path: objectPath, targetPath, expectedBytes }) =>
    streamDownloadToFile({
      url: `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`,
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      targetPath,
      expectedBytes,
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
          version: entry.metadata?.eTag ?? null,
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
  if (kind === 'expire') tables.push('auth.users', 'public.profiles', 'public.subscriptions', 'public.credit_transactions');
  else if (kind !== 'purge') throw new Error('Unknown batch kind');
  await db.query('BEGIN');
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

function storageActions(storage) {
  return {
    removeObjects: async (bucket, paths) => {
      const { error } = await storage.from(bucket).remove(paths);
      if (error) throw new Error(error.message);
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
          new Date(live.created_at).getTime() === Date.parse(backup.created_at) &&
          new Date(live.updated_at).getTime() === Date.parse(backup.updated_at);
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
  const config = loadConfig();
  const storage = await createStorage(config);
  await preflightQuota(storage);
  const db = await createDb(config);
  const resultPath = path.join(plan.identity.runDir, 'purge-result.json');
  try {
    const result = await runPurge({
      plan, confirm: true, runner: defaultRunCommand,
      ...storageActions(storage),
      withLockedBatch: callback => withDatabaseBatch(db, 'purge', callback),
      checkStillEligible: async (bucket, paths) => (await db.query(INPUT_RECHECK_SQL, [bucket, paths])).rows,
      writeResult: payload => writeAtomicJson(resultPath, payload),
    });
    log(`purge: ${result.status}, deleted ${result.deleted.length}, dropped ${result.dropped.length} -> ${resultPath}`);
    if (result.status !== 'ok') process.exitCode = 1;
  } finally { await db.end(); }
}

async function cmdPlanExpire(args) {
  const backupDir = required(args.manifest, '--manifest <backup-run-dir>');
  const identity = await loadBackupIdentity(backupDir);
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
                 o.created_at AS object_created_at, o.updated_at AS object_updated_at,
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

async function cmdVerifyIntegrity() {
  const config = loadConfig();
  const storage = await createStorage(config);
  await preflightQuota(storage);
  const db = await createDb(config);
  try {
    const gallery = await db.query('SELECT storage_path FROM public.saved_images');
    const blogImages = await db.query('SELECT storage_path, url FROM public.blog_images');
    const blogPosts = await db.query(
      "SELECT featured_image_url, content FROM public.blog_posts"
    );

    const targets = new Map();
    function addTarget(bucket, p, source) {
      if (!p) return;
      const key = makeObjectKey(bucket, p);
      if (!targets.has(key)) {
        targets.set(key, { bucket, path: p, sources: [source] });
      } else {
        targets.get(key).sources.push(source);
      }
    }

    for (const row of gallery.rows) {
      addTarget(GALLERY_BUCKET, row.storage_path, 'saved_images.storage_path');
    }
    for (const row of blogImages.rows) {
      if (row.storage_path) addTarget(BLOG_BUCKET, row.storage_path, 'blog_images.storage_path');
      const pathFromUrl = blogPathFromUrl(row.url);
      if (pathFromUrl) addTarget(BLOG_BUCKET, pathFromUrl, 'blog_images.url');
    }
    for (const row of blogPosts.rows) {
      const pathFromFeatured = blogPathFromUrl(row.featured_image_url);
      if (pathFromFeatured) addTarget(BLOG_BUCKET, pathFromFeatured, 'blog_posts.featured_image_url');
      const bodyPaths = extractBlogPathsFromMarkdown(row.content);
      for (const bp of bodyPaths) addTarget(BLOG_BUCKET, bp, 'blog_posts.content');
    }

    const inventories = new Map();
    for (const bucket of new Set([...targets.values()].map(target => target.bucket))) {
      inventories.set(bucket, new Set((await listAllObjects(storage, bucket)).map(object => object.path)));
    }
    const missing = [];
    for (const target of targets.values()) {
      if (!inventories.get(target.bucket).has(target.path)) {
        missing.push(target);
      }
    }
    log(`verify-integrity: total targets checked: ${targets.size}, missing: ${missing.length}`);
    if (missing.length > 0) {
      for (const item of missing) log(`  missing ${item.bucket}/${item.path} (from: ${item.sources.join(', ')})`);
      process.exitCode = 1;
    }
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
