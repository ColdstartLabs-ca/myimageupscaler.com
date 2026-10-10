#!/usr/bin/env node
/**
 * Strict, read-only verification helpers for SQR-01 frozen plans.
 *
 * Purpose: prove that a frozen purge/expiry plan is bound to a verified backup
 * run and that every planned artifact still matches its backup hash, byte count
 * and source identity before a caller acts on it. This module never deletes,
 * uploads, or touches production. It only reads local files and runs an
 * injectable process runner for the mandatory remote proof.
 *
 * Safety contract (docs/PRDs/supabase-quota-recovery/README.md):
 *   - Local backup and raw manifests first, verified by SHA256.
 *   - Deletes come from a frozen manifest only, never a prefix or bucket sweep.
 *   - Every planned object must match its verified backup entry. Fail closed.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const INPUT_BUCKET = 'upscale-inputs';
export const GALLERY_BUCKET = 'saved-images';
export const BLOG_BUCKET = 'blog-images';
export const PRODUCTION_BUCKETS = [INPUT_BUCKET, GALLERY_BUCKET, BLOG_BUCKET];

export const MANIFEST_FILE = 'manifest.jsonl';
export const CHECKSUM_FILE = 'manifest.sha256';
export const RECEIPT_FILE = 'backup-verification.json';
export const SHA256_REGEX = /^[0-9a-f]{64}$/;
export const SAFE_OBJECT_PATH_REGEX = /^[a-zA-Z0-9_\-\.\/]+$/;
export const SAFE_RUN_BASENAME_REGEX = /^[A-Za-z0-9_-]+$/;

const PLAN_SPECS = {
  purge: {
    bucket: INPUT_BUCKET,
    planFile: 'purge-manifest.jsonl',
    digestFile: 'purge-manifest.digest',
    galleryRestore: false,
  },
  expire: {
    bucket: GALLERY_BUCKET,
    planFile: 'expire-rows.jsonl',
    digestFile: 'expire-rows.digest',
    galleryRestore: true,
  },
};

const GALLERY_REQUIRED_FIELDS = [
  'id',
  'user_id',
  'path',
  'original_filename',
  'file_size_bytes',
  'width',
  'height',
  'model_used',
  'processing_mode',
  'created_at',
];

const DEFAULT_LAPTOP = 'joao@192.168.1.126';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

function isSha256(value) {
  return typeof value === 'string' && SHA256_REGEX.test(value);
}

function isSafeByteCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function isSafeObjectPath(objectPath) {
  if (!objectPath || typeof objectPath !== 'string') return false;
  if (objectPath.startsWith('/') || objectPath.endsWith('/')) return false;
  if (objectPath.includes('..') || /[\r\n\0]/.test(objectPath)) return false;
  for (const segment of objectPath.split('/')) {
    if (segment === '.' || segment === '..' || segment.length === 0) return false;
  }
  return SAFE_OBJECT_PATH_REGEX.test(objectPath);
}

export function assertSafeRunBasename(runBasename) {
  if (typeof runBasename !== 'string' || !SAFE_RUN_BASENAME_REGEX.test(runBasename)) {
    throw new Error(`Unsafe run directory basename for SSH: ${runBasename}`);
  }
  return runBasename;
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

/** Read raw JSONL. Blank interior lines, CR bytes and non-object rows are errors. */
export function parseRawJsonl(text) {
  if (typeof text !== 'string') throw new Error('JSONL content must be a string');
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') throw new Error(`Blank JSONL line at ${index + 1}`);
    if (line.includes('\r')) throw new Error(`CR byte in JSONL line ${index + 1}`);
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSON at line ${index + 1}: ${error.message}`);
    }
    if (!isPlainObject(parsed)) throw new Error(`JSONL line ${index + 1} is not an object`);
    rows.push(parsed);
  }
  return rows;
}

/**
 * Reject traversal, absolute paths and every symlink in the chain from `root`
 * down to `target`, and require the final entry to be a regular file.
 */
export async function assertSafeRegularFile(rootResolved, targetPath) {
  const target = path.resolve(targetPath);
  const rel = path.relative(rootResolved, target);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path traversal escape: ${targetPath}`);
  }
  const segments = rel.split(path.sep);
  let cursor = rootResolved;
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]);
    let stats;
    try {
      stats = await fs.lstat(cursor);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Missing expected file: ${segments.slice(0, index + 1).join('/')}`);
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`Symlink escape: ${segments.slice(0, index + 1).join('/')}`);
    }
    const isLast = index === segments.length - 1;
    if (isLast && !stats.isFile()) {
      throw new Error(`Not a regular file: ${segments.join('/')}`);
    }
    if (!isLast && !stats.isDirectory()) {
      throw new Error(`Non-directory parent: ${segments.slice(0, index + 1).join('/')}`);
    }
  }
}

function assertNoDuplicate(seen, key, label) {
  if (seen.has(key)) throw new Error(`Duplicate ${label}: ${key}`);
  seen.add(key);
}

export function validateManifestRows(rows) {
  const seen = new Set();
  for (const row of rows) {
    if (!PRODUCTION_BUCKETS.includes(row.bucket)) {
      throw new Error(`Unknown bucket in manifest: ${row.bucket}`);
    }
    if (!isSafeObjectPath(row.path)) {
      throw new Error(`Unsafe object path in manifest: ${row.path}`);
    }
    if (!isSha256(row.sha256)) {
      throw new Error(`Invalid SHA256 in manifest for ${row.bucket}/${row.path}`);
    }
    if (!isSafeByteCount(row.bytes)) {
      throw new Error(`Invalid byte count in manifest for ${row.bucket}/${row.path}`);
    }
    const key = `${row.bucket}::${row.path}`;
    assertNoDuplicate(seen, key, 'manifest entry');
  }
  return rows;
}

/** Parse and validate the raw `sha256sum -c` checksum list against the manifest. */
export function validateChecksumList(rawChecksum, manifestRows) {
  const expected = new Map(manifestRows.map(row => [`${row.bucket}/${row.path}`, row.sha256]));
  const seen = new Set();
  const lines = rawChecksum.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (\S.*)$/.exec(line);
    if (!match) throw new Error(`Malformed checksum line: ${JSON.stringify(line)}`);
    const [, digest, key] = match;
    if (seen.has(key)) throw new Error(`Duplicate checksum entry: ${key}`);
    seen.add(key);
    if (!expected.has(key)) throw new Error(`Extra checksum entry not in manifest: ${key}`);
    if (expected.get(key) !== digest) throw new Error(`Checksum digest mismatch for ${key}`);
  }
  if (seen.size !== expected.size) {
    throw new Error(`Checksum list does not cover manifest: ${seen.size} of ${expected.size}`);
  }
  return seen.size;
}

/**
 * Load a backup run's raw manifest, checksum list and receipt. The receipt must
 * bind the actual raw SHA256 of the manifest and of the checksum list, the exact
 * object count and the safe byte sum. Returns a frozen backup identity.
 */
export async function loadBackupIdentity(runDir) {
  const rootResolved = path.resolve(runDir);
  const rootStats = await fs.lstat(rootResolved);
  if (rootStats.isSymbolicLink()) throw new Error(`Run directory is a symlink: ${rootResolved}`);
  if (!rootStats.isDirectory()) throw new Error(`Run directory is not a directory: ${rootResolved}`);
  const runBasename = assertSafeRunBasename(path.basename(rootResolved));

  const manifestPath = path.join(rootResolved, MANIFEST_FILE);
  const checksumPath = path.join(rootResolved, CHECKSUM_FILE);
  const receiptPath = path.join(rootResolved, RECEIPT_FILE);
  await assertSafeRegularFile(rootResolved, manifestPath);
  await assertSafeRegularFile(rootResolved, checksumPath);
  await assertSafeRegularFile(rootResolved, receiptPath);

  const rawManifest = await fs.readFile(manifestPath, 'utf8');
  const rawChecksum = await fs.readFile(checksumPath, 'utf8');
  const rawReceipt = await fs.readFile(receiptPath, 'utf8');

  const manifest = validateManifestRows(parseRawJsonl(rawManifest));
  validateChecksumList(rawChecksum, manifest);

  let receipt;
  try {
    receipt = JSON.parse(rawReceipt);
  } catch (error) {
    throw new Error(`Invalid receipt JSON: ${error.message}`);
  }
  if (!isPlainObject(receipt)) throw new Error('Receipt must be an object');

  const manifestSha256 = sha256Text(rawManifest);
  const checksumListSha256 = sha256Text(rawChecksum);
  const objectCount = manifest.length;
  const totalBytes = manifest.reduce((sum, row) => sum + Number(row.bytes), 0);

  if (!isSafeByteCount(receipt.object_count) || receipt.object_count !== objectCount) {
    throw new Error(`Receipt object_count mismatch: ${receipt.object_count} != ${objectCount}`);
  }
  if (!isSafeByteCount(receipt.total_bytes) || receipt.total_bytes !== totalBytes) {
    throw new Error(`Receipt total_bytes mismatch: ${receipt.total_bytes} != ${totalBytes}`);
  }
  if (receipt.manifest_sha256 !== manifestSha256) {
    throw new Error('Receipt manifest_sha256 does not bind the raw manifest');
  }
  if (receipt.checksum_list_sha256 !== checksumListSha256) {
    throw new Error('Receipt checksum_list_sha256 does not bind the raw checksum list');
  }
  if (receipt.run_id != null && receipt.run_id !== runBasename) {
    throw new Error(`Receipt run_id mismatch: ${receipt.run_id} != ${runBasename}`);
  }
  if (receipt.verified_at != null && typeof receipt.verified_at !== 'string') {
    throw new Error('Receipt verified_at must be a string');
  }

  return Object.freeze({
    runDir: rootResolved,
    runBasename,
    manifest: Object.freeze(manifest.map(row => Object.freeze({ ...row }))),
    receipt: Object.freeze({ ...receipt }),
    manifestSha256,
    checksumListSha256,
    objectCount,
    totalBytes,
  });
}

function bindPlanRowToBackup(row, manifestByKey) {
  const key = `${row.bucket}::${row.path}`;
  const entry = manifestByKey.get(key);
  if (!entry) throw new Error(`Planned object is not in the backup manifest: ${key}`);
  if (entry.sha256 !== row.sha256) throw new Error(`Planned hash does not match backup for ${key}`);
  if (Number(entry.bytes) !== Number(row.bytes)) {
    throw new Error(`Planned byte count does not match backup for ${key}`);
  }
  for (const field of ['created_at', 'updated_at']) {
    const sourceField = `object_${field}`;
    if (typeof row[sourceField] !== 'string' || !Number.isFinite(Date.parse(row[sourceField]))) {
      throw new Error(`Missing or invalid ${sourceField} for ${key}`);
    }
    if (row[sourceField] !== entry[field]) {
      throw new Error(`Planned ${field} does not match backup identity for ${key}`);
    }
  }
}

/**
 * Load a frozen purge or expiry plan, its REQUIRED raw digest, and bind every
 * row to the verified backup identity. The raw SHA256 of the plan file binds all
 * fields, including gallery row id/user/path/created metadata.
 */
export async function loadFrozenPlan({ backupRunDir, kind, planPath, planDigestPath } = {}) {
  const spec = PLAN_SPECS[kind];
  if (!spec) throw new Error(`Unknown plan kind: ${kind}`);

  const identity = await loadBackupIdentity(backupRunDir);
  const resolvedPlan = planPath ?? path.join(identity.runDir, spec.planFile);
  const resolvedDigest = planDigestPath ?? path.join(identity.runDir, spec.digestFile);
  await assertSafeRegularFile(identity.runDir, resolvedPlan);
  await assertSafeRegularFile(identity.runDir, resolvedDigest);

  const rawPlan = await fs.readFile(resolvedPlan, 'utf8');
  const rawDigest = (await fs.readFile(resolvedDigest, 'utf8')).trim();
  const planSha256 = sha256Text(rawPlan);
  if (!isSha256(rawDigest)) throw new Error('Plan digest is not a 64-hex SHA256');
  if (rawDigest !== planSha256) {
    throw new Error(`Plan digest mismatch: expected ${rawDigest}, got ${planSha256}`);
  }

  const rows = parseRawJsonl(rawPlan);
  const manifestByKey = new Map(identity.manifest.map(row => [`${row.bucket}::${row.path}`, row]));
  const seenPaths = new Set();
  const seenIds = new Set();

  for (const row of rows) {
    if (row.bucket !== spec.bucket) {
      throw new Error(`Plan kind ${kind} may only target ${spec.bucket}, got ${row.bucket}`);
    }
    if (!isSafeObjectPath(row.path)) throw new Error(`Unsafe plan path: ${row.path}`);
    if (!isSha256(row.sha256)) throw new Error(`Invalid plan SHA256 for ${row.bucket}/${row.path}`);
    if (!isSafeByteCount(row.bytes)) {
      throw new Error(`Invalid plan byte count for ${row.bucket}/${row.path}`);
    }
    const key = `${row.bucket}::${row.path}`;
    assertNoDuplicate(seenPaths, key, 'plan object');

    if (spec.galleryRestore) {
      for (const field of GALLERY_REQUIRED_FIELDS) {
        if (row[field] == null) throw new Error(`Missing gallery field ${field} for ${key}`);
      }
      if (typeof row.id !== 'string' || row.id.length === 0) {
        throw new Error(`Invalid gallery row id for ${key}`);
      }
      if (typeof row.user_id !== 'string' || row.user_id.length === 0) {
        throw new Error(`Invalid gallery user_id for ${key}`);
      }
      if (!Number.isFinite(Date.parse(row.created_at))) {
        throw new Error(`Invalid gallery created_at for ${key}`);
      }
      assertNoDuplicate(seenIds, row.id, 'gallery rowID');
    }

    bindPlanRowToBackup(row, manifestByKey);
  }

  return Object.freeze({
    identity,
    kind,
    planSha256,
    rows: Object.freeze(rows.map(row => Object.freeze({ ...row }))),
  });
}

/**
 * Stream-hash every selected artifact against its bound hash and exact byte count.
 * The whole batch is checked before success is returned. No hash override exists.
 */
export async function verifyFrozenArtifacts({ runDir, rows } = {}) {
  const rootResolved = path.resolve(runDir);
  const results = [];
  const errors = [];
  let totalBytes = 0;

  for (const row of rows ?? []) {
    const key = `${row.bucket}/${row.path}`;
    try {
      if (!isSafeObjectPath(row.path)) throw new Error('unsafe object path');
      const artifactPath = path.join(rootResolved, row.bucket, row.path);
      await assertSafeRegularFile(rootResolved, artifactPath);
      const actual = await streamHashFile(artifactPath);
      if (actual.sha256 !== row.sha256) throw new Error(`SHA256 mismatch (${actual.sha256})`);
      if (actual.bytes !== Number(row.bytes)) {
        throw new Error(`byte count mismatch (${actual.bytes} != ${row.bytes})`);
      }
      totalBytes += actual.bytes;
      results.push(Object.freeze({ key, sha256: actual.sha256, bytes: actual.bytes }));
    } catch (error) {
      errors.push(`${key}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Artifact verification failed:\n${errors.join('\n')}`);
  }
  return Object.freeze({ verified: results.length, totalBytes, artifacts: Object.freeze(results) });
}

/** Build a shell-safe `sha256sum -c` input for the selected batch. */
export function buildBatchChecksumInput(rows) {
  const lines = (rows ?? []).map(row => {
    if (!PRODUCTION_BUCKETS.includes(row.bucket)) {
      throw new Error(`Unknown bucket in batch: ${row.bucket}`);
    }
    if (!isSafeObjectPath(row.path)) throw new Error(`Unsafe batch path: ${row.path}`);
    if (!isSha256(row.sha256)) throw new Error(`Invalid batch SHA256 for ${row.bucket}/${row.path}`);
    return `${row.sha256}  ${row.bucket}/${row.path}`;
  });
  return lines.length ? `${lines.join('\n')}\n` : '';
}

/**
 * Mandatory exact remote proof through an injectable process runner. The batch
 * lines come from the caller's local expectations, not the laptop's list, and
 * the remote manifest digest must equal the bound identity digest.
 */
export async function verifyRemoteBatch({
  identity,
  rows,
  runner,
  laptop = DEFAULT_LAPTOP,
  remoteBase,
} = {}) {
  if (!isPlainObject(identity)) throw new Error('verifyRemoteBatch requires a backup identity');
  if (typeof runner !== 'function') throw new Error('verifyRemoteBatch requires a process runner');
  const runBasename = assertSafeRunBasename(identity.runBasename);
  const remoteDir = remoteBase ?? `~/backups/miu-storage/${runBasename}`;
  const batch = rows ?? [];

  const checksumInput = buildBatchChecksumInput(batch);
  const checkOutput = await runner('ssh', [laptop, `cd ${remoteDir} && sha256sum -c -`], {
    input: checksumInput,
  });
  if (checkOutput == null) throw new Error('Missing remote verification proof');
  const checkText = String(checkOutput);
  if (/FAILED/.test(checkText)) throw new Error('Remote checksum verification failed');
  const okLines = checkText.split('\n').filter(line => /:\s*OK\s*$/.test(line.trim()));
  if (okLines.length !== batch.length) {
    throw new Error(`Remote proof incomplete: ${okLines.length} of ${batch.length} OK`);
  }

  const digestOutput = await runner('ssh', [laptop, `sha256sum ${remoteDir}/${MANIFEST_FILE}`]);
  if (digestOutput == null) throw new Error('Missing remote manifest digest proof');
  const remoteDigest = String(digestOutput).trim().split(/\s+/)[0];
  if (!isSha256(remoteDigest)) throw new Error('Remote manifest digest is not a 64-hex SHA256');
  if (remoteDigest !== identity.manifestSha256) {
    throw new Error(
      `Remote manifest digest mismatch: local=${identity.manifestSha256} remote=${remoteDigest}`
    );
  }

  return Object.freeze({
    verified: batch.length,
    manifestSha256: identity.manifestSha256,
    remoteDir,
    checksumInput,
  });
}
