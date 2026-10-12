#!/usr/bin/env node
/**
 * Bucket-level upload fence for the Supabase -> R2 source-delete cutover.
 *
 * The ACL freeze is infeasible on hosted Supabase (`postgres` is not a member of
 * `supabase_storage_admin`, so it cannot revoke grants that role made). This tool uses
 * the supported Storage API instead: for each source bucket it snapshots the bucket
 * config, then sets `file_size_limit = 1` and `allowed_mime_types =
 * ['application/x-miu-storage-frozen']`. Restore PUTs the exact snapshot back and
 * verifies equality.
 *
 * The live gate (`isSourceFenced`) is read from the database: all three buckets carry
 * exactly the frozen limits AND `storage.objects` has no permissive INSERT/UPDATE/ALL
 * RLS policy for anon, authenticated or public. Mutations need `--confirm`, a 0600 `wx`
 * snapshot and its sha256. Nothing here prints a secret.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const FENCED_BUCKETS = Object.freeze(['saved-images', 'blog-images', 'upscale-inputs']);
export const FROZEN_FILE_SIZE_LIMIT = 1;
export const FROZEN_MIME_TYPES = Object.freeze(['application/x-miu-storage-frozen']);
const SNAPSHOT_VERSION = 1;
const WRITE_POLICY_COMMANDS = Object.freeze(['INSERT', 'UPDATE', 'ALL']);
const UNPRIVILEGED_ROLES = Object.freeze(['public', 'anon', 'authenticated']);
const TRUSTED_ORIGIN = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;

const bucketList = FENCED_BUCKETS.map(id => `'${id}'`).join(', ');

/** Embeddable expression: bucket configs plus the permissive storage.objects policies. */
export const BUCKET_FENCE_STATE_SQL = `(SELECT jsonb_build_object(
  'buckets', COALESCE((SELECT jsonb_object_agg(b.id, jsonb_build_object(
      'public', b.public,
      'file_size_limit', b.file_size_limit,
      'allowed_mime_types', to_jsonb(b.allowed_mime_types)))
    FROM storage.buckets AS b WHERE b.id IN (${bucketList})), '{}'::jsonb),
  'policies', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'name', p.policyname, 'cmd', p.cmd, 'roles', to_jsonb(p.roles)))
    FROM pg_policies AS p
    WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.permissive = 'PERMISSIVE'), '[]'::jsonb)))`;

export const BUCKET_FENCE_SQL = `SELECT ${BUCKET_FENCE_STATE_SQL} AS state`;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sameMimeTypes(left, right) {
  if (left === null || right === null || !Array.isArray(left) || !Array.isArray(right)) return left === right;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Config fields that matter, normalised so absent fields compare as null. */
function pickConfig(bucket) {
  return {
    public: bucket?.public,
    file_size_limit: bucket?.file_size_limit ?? null,
    allowed_mime_types: bucket?.allowed_mime_types ?? null,
  };
}

function sameConfig(left, right) {
  return left.public === right.public && left.file_size_limit === right.file_size_limit &&
    sameMimeTypes(left.allowed_mime_types, right.allowed_mime_types);
}

function hasFrozenLimits(bucket) {
  return bucket?.file_size_limit === FROZEN_FILE_SIZE_LIMIT &&
    sameMimeTypes(bucket?.allowed_mime_types ?? null, FROZEN_MIME_TYPES);
}

// =============================================================================
// Live gate
// =============================================================================

/** Throws on a malformed state; `isSourceFenced` is the never-throwing wrapper. */
export function deriveBucketFence(state) {
  if (!isPlainObject(state) || !isPlainObject(state.buckets) || !Array.isArray(state.policies)) {
    throw new Error('Bucket fence state is malformed');
  }
  const bucketViolations = FENCED_BUCKETS.filter(id => !hasFrozenLimits(state.buckets[id]));
  const policyViolations = state.policies.filter(policy =>
    WRITE_POLICY_COMMANDS.includes(String(policy?.cmd).toUpperCase()) &&
    Array.isArray(policy.roles) && policy.roles.some(role => UNPRIVILEGED_ROLES.includes(role)));
  return Object.freeze({
    fenced: bucketViolations.length === 0 && policyViolations.length === 0,
    bucketViolations,
    policyViolations,
  });
}

export function isSourceFenced(state) {
  try {
    return deriveBucketFence(state).fenced === true;
  } catch {
    return false;
  }
}

/**
 * In-progress S3-protocol multipart uploads. The local Storage 1.80.2 proof showed that a
 * multipart upload started before the freeze still completes (and overwrites) after it, so the
 * bucket fence cannot stop it. Informational: it is not part of the gate, but freeze reports it.
 */
export async function readPendingUploads(db) {
  const probe = await db.query("SELECT to_regclass('storage.s3_multipart_uploads') IS NOT NULL AS present");
  if (probe?.rows?.[0]?.present !== true) return Object.freeze({ available: false, count: null, buckets: Object.freeze({}) });
  const { rows } = await db.query(
    `SELECT bucket_id, count(*)::int AS n FROM storage.s3_multipart_uploads WHERE bucket_id IN (${bucketList}) GROUP BY bucket_id`
  );
  const buckets = Object.fromEntries(rows.map(row => [row.bucket_id, Number(row.n)]));
  return Object.freeze({ available: true, count: Object.values(buckets).reduce((sum, n) => sum + n, 0), buckets: Object.freeze(buckets) });
}

export async function readBucketFenceState(db) {
  const result = await db.query(BUCKET_FENCE_SQL);
  const state = result?.rows?.[0]?.state;
  if (!isPlainObject(state)) throw new Error('Bucket fence state query returned no row');
  return state;
}

// =============================================================================
// Storage API (service role)
// =============================================================================

async function bucketRequest(api, method, id, body) {
  const response = await api.fetchFn(`${api.baseUrl}/storage/v1/bucket/${encodeURIComponent(id)}`, {
    method,
    headers: {
      apikey: api.serviceKey,
      Authorization: `Bearer ${api.serviceKey}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    throw new Error(`Storage API ${method} bucket ${id} failed: HTTP ${response.status}`);
  }
  return response.json();
}

async function getBucketConfig(api, id) {
  const bucket = await bucketRequest(api, 'GET', id);
  if (typeof bucket?.public !== 'boolean') throw new Error(`Bucket ${id} returned no public flag`);
  return pickConfig(bucket);
}

async function putBucketConfig(api, id, body) {
  await bucketRequest(api, 'PUT', id, body);
}

// =============================================================================
// Snapshot file
// =============================================================================

export async function captureBucketSnapshot(api, { now = () => new Date() } = {}) {
  const buckets = {};
  for (const id of FENCED_BUCKETS) buckets[id] = await getBucketConfig(api, id);
  return { version: SNAPSHOT_VERSION, captured_at: now().toISOString(), buckets };
}

function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot) || snapshot.version !== SNAPSHOT_VERSION || !isPlainObject(snapshot.buckets)) {
    throw new Error('Unsupported bucket snapshot');
  }
  for (const id of FENCED_BUCKETS) {
    const bucket = snapshot.buckets[id];
    const validLimit = bucket?.file_size_limit === null || Number.isInteger(bucket?.file_size_limit);
    const validMime = bucket?.allowed_mime_types === null ||
      (Array.isArray(bucket?.allowed_mime_types) && bucket.allowed_mime_types.every(value => typeof value === 'string'));
    if (!isPlainObject(bucket) || typeof bucket.public !== 'boolean' || !validLimit || !validMime) {
      throw new Error(`Bucket snapshot has an invalid entry for ${id}`);
    }
  }
  return snapshot;
}

/** `wx` + 0600: a snapshot is evidence and is never overwritten. */
export async function writeBucketSnapshotFile(filePath, snapshot) {
  validateSnapshot(snapshot);
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  await fs.writeFile(filePath, text, { flag: 'wx', mode: 0o600 });
  return Object.freeze({ path: filePath, sha256: sha256Text(text) });
}

export async function loadBucketSnapshotFile(filePath, expectedSha256) {
  const stats = await fs.lstat(filePath);
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('Bucket snapshot must be a regular file');
  const text = await fs.readFile(filePath, 'utf8');
  const sha256 = sha256Text(text);
  if (expectedSha256 !== undefined && sha256 !== expectedSha256) {
    throw new Error(`Bucket snapshot sha256 mismatch: expected ${expectedSha256}, got ${sha256}`);
  }
  return Object.freeze({ snapshot: validateSnapshot(JSON.parse(text)), sha256 });
}

// =============================================================================
// Commands
// =============================================================================

function requireConfirm(confirm, command) {
  if (confirm !== true) throw new Error(`${command} requires --confirm`);
}

function frozenBody() {
  return { file_size_limit: FROZEN_FILE_SIZE_LIMIT, allowed_mime_types: [...FROZEN_MIME_TYPES] };
}

/** The exact snapshot, including null limits, so restore does not invent a default. */
function restoreBody(config) {
  return { public: config.public, file_size_limit: config.file_size_limit, allowed_mime_types: config.allowed_mime_types };
}

export async function runBucketStatus({ db } = {}) {
  const state = await readBucketFenceState(db);
  return { ...deriveBucketFence(state), state, pendingUploads: await readPendingUploads(db) };
}

export async function runBucketSnapshot({ api, out, now } = {}) {
  const snapshot = await captureBucketSnapshot(api, { now });
  const frozen = FENCED_BUCKETS.filter(id => hasFrozenLimits(snapshot.buckets[id]));
  if (frozen.length > 0) throw new Error(`Refusing to snapshot buckets that are already frozen: ${frozen.join(', ')}`);
  const written = await writeBucketSnapshotFile(out, snapshot);
  return Object.freeze({ ...written, snapshot });
}

async function liveConfigs(api) {
  const live = {};
  for (const id of FENCED_BUCKETS) live[id] = await getBucketConfig(api, id);
  return live;
}

export async function runBucketFreeze({ api, db, snapshotPath, snapshotSha256, confirm, log = () => {} } = {}) {
  requireConfirm(confirm, 'freeze');
  const { snapshot, sha256 } = await loadBucketSnapshotFile(snapshotPath, snapshotSha256);
  const frozenInSnapshot = FENCED_BUCKETS.filter(id => hasFrozenLimits(snapshot.buckets[id]));
  if (frozenInSnapshot.length > 0) throw new Error('Refusing to freeze from a frozen snapshot');

  const live = await liveConfigs(api);
  const drifted = FENCED_BUCKETS.filter(id => !sameConfig(live[id], snapshot.buckets[id]));
  if (drifted.length > 0) throw new Error(`Snapshot is stale: live config differs for ${drifted.join(', ')}; take a new snapshot`);

  const policyViolations = deriveBucketFence(await readBucketFenceState(db)).policyViolations;
  if (policyViolations.length > 0) {
    throw new Error(`storage.objects has direct-write policy for anon/authenticated/public: ${policyViolations.map(policy => policy.name).join(', ')}`);
  }

  const touched = [];
  try {
    for (const id of FENCED_BUCKETS) {
      touched.push(id);
      await putBucketConfig(api, id, frozenBody());
      log(`[bucket-fence] froze ${id}`);
    }
    const state = await readBucketFenceState(db);
    const result = deriveBucketFence(state);
    if (!result.fenced) throw new Error('Live state is not fenced after the freeze');
    const pendingUploads = await readPendingUploads(db);
    if (pendingUploads.count !== 0) {
      log(`[bucket-fence] WARNING pending S3 multipart uploads=${pendingUploads.count ?? 'unknown'}: they can still complete after the freeze`);
    }
    return { ...result, snapshot_sha256: sha256, pendingUploads };
  } catch (error) {
    const failed = [];
    for (const id of touched) {
      try {
        await putBucketConfig(api, id, restoreBody(snapshot.buckets[id]));
      } catch (rollbackError) {
        failed.push(`${id}: ${errorMessage(rollbackError)}`);
      }
    }
    throw new Error(
      `Freeze failed (${errorMessage(error)}); ` +
      (failed.length === 0 ? 'rolled back to the snapshot' : `ROLLBACK INCOMPLETE, run restore: ${failed.join('; ')}`)
    );
  }
}

export async function runBucketRestore({ api, snapshotPath, snapshotSha256, confirm, log = () => {} } = {}) {
  requireConfirm(confirm, 'restore');
  const { snapshot, sha256 } = await loadBucketSnapshotFile(snapshotPath, snapshotSha256);
  if (FENCED_BUCKETS.some(id => hasFrozenLimits(snapshot.buckets[id]))) {
    throw new Error('Refusing to restore a frozen snapshot');
  }
  const live = await liveConfigs(api);
  const toRestore = [];
  const changed = [];
  for (const id of FENCED_BUCKETS) {
    if (sameConfig(live[id], snapshot.buckets[id])) continue;
    if (hasFrozenLimits(live[id]) && live[id].public === snapshot.buckets[id].public) toRestore.push(id);
    else changed.push(id);
  }
  if (changed.length > 0) throw new Error(`Bucket config changed since the freeze for ${changed.join(', ')}; refusing to overwrite it`);
  if (toRestore.length === 0) throw new Error('Live buckets are not frozen; nothing to restore');

  for (const id of toRestore) {
    await putBucketConfig(api, id, restoreBody(snapshot.buckets[id]));
    log(`[bucket-fence] restored ${id}`);
  }
  const after = await liveConfigs(api);
  const mismatched = FENCED_BUCKETS.filter(id => !sameConfig(after[id], snapshot.buckets[id]));
  if (mismatched.length > 0) {
    throw new Error(`Live bucket config does not match the snapshot after restore: ${mismatched.join(', ')}`);
  }
  return { restored: true, snapshot_sha256: sha256 };
}

// =============================================================================
// CLI
// =============================================================================

const VALUE_FLAGS = { '--snapshot': 'snapshot', '--snapshot-sha256': 'snapshotSha256', '--out': 'out' };
const MUTATING = new Set(['freeze', 'restore']);

export function parseBucketFenceFlags(args = []) {
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
    const key = VALUE_FLAGS[arg];
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

function usage() {
  process.stdout.write([
    'Usage: node scripts/storage/storage-bucket-fence.mjs <command>',
    '  snapshot --out <file>',
    '  freeze --confirm --snapshot <file> --snapshot-sha256 <sha256>',
    '  restore --confirm --snapshot <file> --snapshot-sha256 <sha256>',
    '  status',
  ].join('\n') + '\n');
}

function formatStatus(result) {
  return `fenced=${result.fenced} pending_s3_multipart=${result.pendingUploads?.count ?? 'unknown'}` +
    (result.bucketViolations.length ? ` unfrozen=${result.bucketViolations.join(',')}` : '') +
    (result.policyViolations.length ? ` write_policies=${result.policyViolations.map(policy => policy.name).join(',')}` : '');
}

/** Real default: service-role key and project URL from the prod secret; never printed. */
async function defaultLoadConfig() {
  const adapters = await import(/* @vite-ignore */ './r2-gallery-operator-adapters.mjs');
  const { dbConfig } = adapters.loadR2OperatorConfig();
  return { dbConfig, ...adapters.loadSupabaseApiConfig() };
}

export async function runBucketFenceCli(argv, deps = {}) {
  const [command, ...rest] = argv;
  const writeLog = line => process.stdout.write(`${line}\n`);
  if (command === 'help' || command === undefined) return usage();
  if (!['snapshot', 'status', ...MUTATING].includes(command)) {
    usage();
    process.exitCode = 1;
    return undefined;
  }
  const flags = parseBucketFenceFlags(rest);
  if (MUTATING.has(command) && flags.confirm !== true) throw new Error(`${command} requires --confirm`);
  if (MUTATING.has(command) && !flags.snapshot) throw new Error('missing required --snapshot <file>');
  if (MUTATING.has(command) && !flags.snapshotSha256) {
    throw new Error('missing required --snapshot-sha256 <sha256 printed by snapshot>');
  }
  if (flags.snapshotSha256 !== undefined && !/^[0-9a-f]{64}$/.test(flags.snapshotSha256)) {
    throw new Error('--snapshot-sha256 must be 64 hex characters');
  }
  if (command === 'snapshot' && !flags.out) throw new Error('missing required --out <file>');

  const log = deps.log ?? writeLog;
  const loadConfig = deps.loadConfig ?? defaultLoadConfig;
  const createDb = deps.createDb ?? (async config => (
    await import(/* @vite-ignore */ './backup-and-purge.mjs')
  ).createDb(config));

  const config = await loadConfig();
  if (!TRUSTED_ORIGIN.test(String(config.supabaseUrl ?? ''))) {
    throw new Error('Supabase URL must be a trusted HTTPS *.supabase.co origin');
  }
  const api = { baseUrl: config.supabaseUrl, serviceKey: config.serviceRoleKey, fetchFn: deps.fetchFn ?? fetch };

  if (command === 'snapshot') {
    const result = await runBucketSnapshot({ api, out: flags.out });
    log(`[bucket-fence] snapshot ${result.path} sha256=${result.sha256}`);
    return result;
  }
  const db = await createDb(config.dbConfig);
  try {
    if (command === 'status') {
      const result = await runBucketStatus({ db });
      log(formatStatus(result));
      return result;
    }
    if (command === 'freeze') {
      const result = await runBucketFreeze({ api, db, snapshotPath: flags.snapshot, snapshotSha256: flags.snapshotSha256, confirm: true, log });
      log(`[bucket-fence] ${formatStatus(result)}`);
      return result;
    }
    const result = await runBucketRestore({ api, snapshotPath: flags.snapshot, snapshotSha256: flags.snapshotSha256, confirm: true, log });
    log(`[bucket-fence] restored exact bucket config from snapshot sha256=${result.snapshot_sha256}`);
    return result;
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runBucketFenceCli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`[storage-bucket-fence] error: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
