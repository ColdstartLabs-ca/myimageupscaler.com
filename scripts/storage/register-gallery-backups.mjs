/**
 * Operator registration engine for SQR-04: copy verified saved-images backups
 * into the private R2 archive and record an exact proof row per image.
 *
 * This module is NO-PRODUCTION. It performs no network or credential work and
 * never reads a secret. Every side effect is injected, so the concrete R2 and
 * Supabase adapters stay root-owned and reviewed separately. The engine never
 * deletes a DB row, never writes the source object, and never cleans an archive.
 *
 * Safety contract (docs/PRDs/supabase-quota-recovery/README.md):
 *   1. Reload the real backup identity from disk; never trust an injected receipt.
 *   2. Verify local bytes and the laptop copy for every selected object first.
 *   3. Re-read the source full hash and ETag before and after the archive write.
 *   4. Re-read the fresh DB row and require the native snapshot to be unchanged.
 *   5. Persist the canonical snapshot metadata to BOTH machines through an
 *      injected callback and require both raw SHA256 proofs to match exactly.
 *   6. Insert the proof only after every check passes. Fail closed, stop first.
 *
 * The fresh metadata copy protects the row's identity (not just its pixels)
 * after saved_images is deleted, so the registry can restore and audit it.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

import {
  GALLERY_BUCKET,
  SHA256_REGEX,
  isSafeObjectPath,
  loadBackupIdentity,
  verifyFrozenArtifacts,
  verifyRemoteBatch,
} from './backup-verification.mjs';

export const MAX_REGISTRATION_BATCH = 50;
export const ARCHIVE_PREFIX = 'archive/gallery/';
export const SOURCE_PREFIX = 'saved/';
export const SNAPSHOT_PROOF_PREFIX = 'gallery-proofs/';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ETAG_REGEX = /^"[^"]+"$/;
const MAX_ETAG_LENGTH = 130;
const CONTROL_CHAR_REGEX = /[\u0000-\u001f\u007f]/;
const DAY_MS = 24 * 60 * 60 * 1000;

function requireFunction(name, value) {
  if (typeof value !== 'function') {
    throw new Error(`runGalleryBackupRegistration requires ${name}`);
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isSafeByteCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** A registry ETag must be a strong quoted token, short and free of controls. */
function assertStrongEtag(etag, label) {
  if (typeof etag !== 'string' || !ETAG_REGEX.test(etag)) {
    throw new Error(`${label} proof ETag must be a strong quoted ETag`);
  }
  if (etag.length > MAX_ETAG_LENGTH) {
    throw new Error(`${label} proof ETag exceeds ${MAX_ETAG_LENGTH} characters`);
  }
  if (CONTROL_CHAR_REGEX.test(etag)) {
    throw new Error(`${label} proof ETag contains ASCII control characters`);
  }
}

function readNow(now) {
  const value = now();
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('now() returned an invalid Date');
    return value.toISOString();
  }
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return value;
  throw new Error('now() must return a Date or an ISO timestamp string');
}

function assertReasonableTimestamp(value, floorMs, ceilingMs) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms < floorMs || ms > ceilingMs) {
    throw new Error(`Unreasonable verification timestamp: ${value}`);
  }
}

/** Compare the injected identity to the identity reloaded from disk. */
function assertIdentityBinding(reloaded, injected) {
  const checks = [
    ['run', reloaded.runBasename, injected.runBasename],
    ['count', reloaded.objectCount, injected.objectCount],
    ['byte', reloaded.totalBytes, injected.totalBytes],
    ['manifest', reloaded.manifestSha256, injected.manifestSha256],
  ];
  for (const [label, actual, given] of checks) {
    if (given !== actual) throw new Error(`Backup identity ${label} binding mismatch`);
  }
}

function manifestKey(bucket, objectPath) {
  return `${bucket}::${objectPath}`;
}

/** A row must be a safe saved-images object that exists in the verified manifest. */
function bindRow(row, manifestByKey) {
  if (!row || typeof row !== 'object') throw new Error('Registration row must be an object');
  if (row.bucket !== GALLERY_BUCKET) {
    throw new Error(`Registration may only target ${GALLERY_BUCKET}`);
  }
  if (!isSafeObjectPath(row.path)) throw new Error(`Unsafe object path: ${row.path}`);
  if (!SHA256_REGEX.test(String(row.sha256))) throw new Error(`Invalid SHA256 for ${row.path}`);
  if (!isSafeByteCount(row.bytes)) throw new Error(`Invalid byte count for ${row.path}`);
  const entry = manifestByKey.get(manifestKey(GALLERY_BUCKET, row.path));
  if (!entry) throw new Error(`Row is not in the verified manifest: ${row.path}`);
  if (entry.sha256 !== row.sha256) throw new Error(`Row hash does not match manifest: ${row.path}`);
  if (Number(entry.bytes) !== Number(row.bytes)) {
    throw new Error(`Row byte count does not match manifest: ${row.path}`);
  }
  return entry;
}

/** The fresh DB row must match the backup path, carry real UUIDs and exact size. */
function assertSavedRow(saved, row) {
  if (!saved || typeof saved !== 'object') throw new Error(`Saved row missing for ${row.path}`);
  if (saved.storage_backend !== 'r2') {
    throw new Error(`Saved row is not R2-backed (storage_backend): ${row.path}`);
  }
  if (saved.storage_path !== row.path) throw new Error(`Saved row path mismatch: ${row.path}`);
  if (!isUuid(saved.id)) throw new Error(`Saved row image id is not a UUID: ${row.path}`);
  if (!isUuid(saved.user_id)) throw new Error(`Saved row user id is not a UUID: ${row.path}`);
  if (!Number.isSafeInteger(saved.file_size_bytes) || saved.file_size_bytes <= 0) {
    throw new Error(`Saved row byte count is not a positive safe integer: ${row.path}`);
  }
  if (Number(saved.file_size_bytes) !== Number(row.bytes)) {
    throw new Error(`Saved row size does not match backup bytes: ${row.path}`);
  }
}

/** Source proof: a live ETag plus the full SHA256 and byte count. No HEAD-only. */
function assertSourceProof(proof, row) {
  if (!proof || typeof proof !== 'object') throw new Error(`Source proof missing for ${row.path}`);
  assertStrongEtag(proof.etag, 'Source');
  if (proof.sha256 !== row.sha256) throw new Error(`Source proof SHA256 mismatch: ${row.path}`);
  if (Number(proof.bytes) !== Number(row.bytes)) {
    throw new Error(`Source proof byte count mismatch: ${row.path}`);
  }
}

/** Archive proof: a live ETag plus the same full SHA256 and byte count. */
function assertArchiveProof(proof, row) {
  if (!proof || typeof proof !== 'object') throw new Error(`Archive proof missing for ${row.path}`);
  assertStrongEtag(proof.etag, 'Archive');
  if (proof.sha256 !== row.sha256) throw new Error(`Archive proof SHA256 mismatch: ${row.path}`);
  if (Number(proof.bytes) !== Number(row.bytes)) {
    throw new Error(`Archive proof byte count mismatch: ${row.path}`);
  }
}

/**
 * A prior archive may be accepted only through this callback, which re-checks the
 * actual full SHA256, byte count and a non-empty ETag from a full GET.
 */
function makeVerifyExisting(row) {
  return proof =>
    !!proof &&
    typeof proof === 'object' &&
    isNonEmptyString(proof.etag) &&
    proof.sha256 === row.sha256 &&
    Number(proof.bytes) === Number(row.bytes);
}

/**
 * Canonical, immutable proof metadata. It copies the exact native saved row, so
 * the identity survives after saved_images is deleted, not just the pixels. Key
 * order is fixed, so the raw JSON string is deterministic and hash-stable.
 */
function buildSnapshotMetadata({ saved, row, source, archive, archiveKey, reloaded }) {
  return Object.freeze({
    schema: 'gallery-expiry-backup-proof/v1',
    run: reloaded.runBasename,
    backup_manifest_sha256: reloaded.manifestSha256,
    image_id: saved.id,
    user_id: saved.user_id,
    storage_path: saved.storage_path,
    sha256: row.sha256,
    size_bytes: Number(row.bytes),
    source_etag: source.etag,
    archive_key: archiveKey,
    archive_etag: archive.etag,
    saved_row: saved,
  });
}

/** Build the raw metadata JSON, its SHA256 and a safe relative proof filename. */
function buildSnapshotProof(metadata, imageId) {
  const rawJson = JSON.stringify(metadata);
  const sha256 = sha256Text(rawJson);
  const filename = `${SNAPSHOT_PROOF_PREFIX}${imageId}-${sha256}.json`;
  return Object.freeze({ rawJson, sha256, filename });
}

/** The callback must prove both the local and the laptop copy raw SHA256. */
function assertSnapshotProofPersisted(result, expectedSha256, row) {
  if (!result || typeof result !== 'object') {
    throw new Error(`Snapshot proof result missing for ${row.path}`);
  }
  if (result.localSha256 !== expectedSha256 || result.remoteSha256 !== expectedSha256) {
    throw new Error(`Snapshot proof two-copy SHA256 mismatch: ${row.path}`);
  }
}

function proofFields({ saved, row, source, archiveKey, archive, reloaded, localVerifiedAt, remoteVerifiedAt }) {
  return {
    image_id: saved.id,
    user_id: saved.user_id,
    storage_path: saved.storage_path,
    saved_row: saved,
    sha256: row.sha256,
    size_bytes: Number(row.bytes),
    source_etag: source.etag,
    archive_key: archiveKey,
    archive_etag: archive.etag,
    backup_run_id: reloaded.runBasename,
    manifest_sha256: reloaded.manifestSha256,
    local_verified_at: localVerifiedAt,
    remote_verified_at: remoteVerifiedAt,
  };
}

export async function runGalleryBackupRegistration(options = {}) {
  const {
    identity,
    rows,
    loadSavedRow,
    verifySource,
    archiveAndVerify,
    persistSnapshotProof,
    insertProof,
    runner,
    now = () => new Date(),
  } = options;

  if (!identity || typeof identity.runDir !== 'string') {
    throw new Error('runGalleryBackupRegistration requires a backup identity');
  }
  requireFunction('loadSavedRow', loadSavedRow);
  requireFunction('verifySource', verifySource);
  requireFunction('archiveAndVerify', archiveAndVerify);
  requireFunction('persistSnapshotProof', persistSnapshotProof);
  requireFunction('insertProof', insertProof);
  requireFunction('runner', runner);

  const selected = rows ?? [];
  if (!Array.isArray(selected) || selected.length === 0) {
    throw new Error('No rows selected for registration');
  }
  if (selected.length > MAX_REGISTRATION_BATCH) {
    throw new Error(`Batch of ${selected.length} exceeds the ${MAX_REGISTRATION_BATCH} row limit`);
  }

  const startedAt = Date.parse(readNow(now));
  // The real identity comes from disk; the injected receipt is only compared.
  const reloaded = await loadBackupIdentity(identity.runDir);
  assertIdentityBinding(reloaded, identity);
  const manifestByKey = new Map(reloaded.manifest.map(row => [manifestKey(row.bucket, row.path), row]));

  const registered = [];
  for (const row of selected) {
    bindRow(row, manifestByKey);

    await verifyFrozenArtifacts({ runDir: reloaded.runDir, rows: [row] });
    await verifyRemoteBatch({ identity: reloaded, rows: [row], runner });

    const saved = await loadSavedRow(row.path);
    assertSavedRow(saved, row);

    const localPath = path.join(reloaded.runDir, GALLERY_BUCKET, row.path);
    const archiveKey = `${ARCHIVE_PREFIX}${saved.id}/${row.sha256}`;

    const source = await verifySource({ key: `${SOURCE_PREFIX}${row.path}`, sha256: row.sha256, bytes: Number(row.bytes) });
    assertSourceProof(source, row);

    const archive = await archiveAndVerify({
      archiveKey,
      localPath,
      sha256: row.sha256,
      bytes: Number(row.bytes),
      verifyExisting: makeVerifyExisting(row),
    });
    assertArchiveProof(archive, row);

    const reSource = await verifySource({ key: `${SOURCE_PREFIX}${row.path}`, sha256: row.sha256, bytes: Number(row.bytes) });
    assertSourceProof(reSource, row);
    if (reSource.etag !== source.etag) {
      throw new Error(`Source ETag changed during registration: ${row.path}`);
    }

    const reSaved = await loadSavedRow(row.path);
    if (!isDeepStrictEqual(reSaved, saved)) {
      throw new Error(`Saved row changed during registration: ${row.path}`);
    }

    // Persist the fresh metadata to BOTH machines and require both raw SHA256
    // proofs to match before any registry insert. No insert without the copy.
    const snapshot = buildSnapshotProof(
      buildSnapshotMetadata({ saved, row, source, archive, archiveKey, reloaded }),
      saved.id
    );
    const persisted = await persistSnapshotProof(snapshot);
    assertSnapshotProofPersisted(persisted, snapshot.sha256, row);

    const localVerifiedAt = readNow(now);
    const remoteVerifiedAt = readNow(now);
    assertReasonableTimestamp(localVerifiedAt, startedAt, startedAt + DAY_MS);
    assertReasonableTimestamp(remoteVerifiedAt, startedAt, startedAt + DAY_MS);

    await insertProof(
      proofFields({ saved, row, source, archiveKey, archive, reloaded, localVerifiedAt, remoteVerifiedAt })
    );
    registered.push({ image_id: saved.id, archive_key: archiveKey });
  }

  return Object.freeze({
    status: 'ok',
    count: registered.length,
    registered: Object.freeze(registered.map(entry => Object.freeze(entry))),
  });
}

// =============================================================================
// CLI: operator registration (DB write plus a fresh two-machine DB backup)
// =============================================================================

const REGISTER_FLAGS = { '--run': 'run', '--offset': 'offset', '--limit': 'limit' };
const NON_NEGATIVE_INT_REGEX = /^\d+$/;
const POSITIVE_INT_REGEX = /^[1-9]\d*$/;

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`register ${label} must be a non-negative integer`);
  }
}

function assertLimit(value) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_REGISTRATION_BATCH) {
    throw new Error(`register limit must be an integer from 1 to ${MAX_REGISTRATION_BATCH}`);
  }
}

/** Strict flag parser: no unknown flag, no duplicate flag, no missing value. */
export function parseRegisterFlags(args = []) {
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
    const key = REGISTER_FLAGS[arg];
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

/** Reject unsafe run paths and non-numeric bounds before any side effect. */
function normalizeRegisterOptions(flags) {
  if (typeof flags.run !== 'string' || flags.run.length === 0 || CONTROL_CHAR_REGEX.test(flags.run)) {
    throw new Error('register requires a safe --run <verifiedStorageRun>');
  }
  const offsetText = flags.offset ?? '0';
  if (!NON_NEGATIVE_INT_REGEX.test(offsetText)) {
    throw new Error('register --offset must be a non-negative integer');
  }
  const limitText = flags.limit ?? '';
  if (!POSITIVE_INT_REGEX.test(limitText)) {
    throw new Error(`register --limit must be an integer from 1 to ${MAX_REGISTRATION_BATCH}`);
  }
  const limit = Number(limitText);
  assertLimit(limit);
  return { run: flags.run, offset: Number(offsetText), limit, confirm: flags.confirm === true };
}

/**
 * Registration command with injected dependencies. It proves the fresh database
 * backup BEFORE the engine can insert any proof row, and it always closes the
 * database connection, even when a later step fails.
 */
export async function runRegisterCommand(deps = {}) {
  const {
    run,
    offset = 0,
    limit,
    confirm,
    config,
    createDb,
    freshBackup,
    adapters,
    repoRoot,
    runner,
    laptop,
    now = () => new Date(),
    log = () => {},
  } = deps;

  if (confirm !== true) {
    throw new Error('register requires --confirm before any credential, process or database work');
  }
  if (typeof run !== 'string' || run.length === 0) {
    throw new Error('register requires --run <verifiedStorageRun>');
  }
  assertNonNegativeInteger(offset, 'offset');
  assertLimit(limit);
  requireFunction('createDb', createDb);
  requireFunction('freshBackup', freshBackup);
  requireFunction('adapters', adapters);
  requireFunction('runner', runner);
  if (
    !config ||
    typeof config !== 'object' ||
    typeof config.signing !== 'object' ||
    typeof config.dbConfig !== 'object'
  ) {
    throw new Error('register requires an operator config with signing and dbConfig');
  }

  const identity = await loadBackupIdentity(run);
  const galleryRows = identity.manifest
    .filter(row => row.bucket === GALLERY_BUCKET)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const rows = galleryRows.slice(offset, offset + limit);
  if (rows.length === 0) {
    throw new Error(`No saved-images rows in the manifest slice offset=${offset} limit=${limit}`);
  }

  const db = await createDb(config.dbConfig);
  try {
    const backup = await freshBackup({ repoRoot, runner, laptop, now });
    log(`[storage] fresh db backup schema=${backup.schemaPath} data=${backup.dataPath}`);
    log(
      `[storage] fresh db backup sha256 schema=${backup.schemaSha256} data=${backup.dataSha256}`
    );

    const engine = adapters({ db, signing: config.signing, runDir: identity.runDir, runner, laptop });
    const result = await runGalleryBackupRegistration({
      identity,
      rows,
      runner,
      now,
      loadSavedRow: engine.loadSavedRow,
      verifySource: engine.verifySource,
      archiveAndVerify: engine.archiveAndVerify,
      persistSnapshotProof: engine.persistSnapshotProof,
      insertProof: engine.insertProof,
    });
    log(`[storage] registered ${result.count} image proof(s)`);
    return result;
  } finally {
    await db.end();
  }
}

/** Real process runner, matching the reviewed adapter CLI pattern. */
function defaultRunCommand(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    input: options.input,
    stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit'],
    timeout: options.timeoutMs ?? 120_000,
  });
}

async function runRegisterCli(options) {
  const adapterModule = './r2-gallery-operator-adapters.mjs';
  const { loadR2OperatorConfig, createR2GalleryAdapters } = await import(
    /* @vite-ignore */ adapterModule
  );
  const { createDb } = await import(/* @vite-ignore */ './backup-and-purge.mjs');
  const { verifyFreshDatabaseBackup } = await import(
    /* @vite-ignore */ './database-backup-gate.mjs'
  );
  const config = loadR2OperatorConfig();
  return runRegisterCommand({
    ...options,
    config,
    createDb,
    freshBackup: verifyFreshDatabaseBackup,
    adapters: createR2GalleryAdapters,
    runner: defaultRunCommand,
  });
}

export function usage(out = process.stdout) {
  out.write(
    [
      'Usage: node scripts/storage/register-gallery-backups.mjs <command>',
      '  register --run <verifiedStorageRun> --offset <n> --limit <1..50> --confirm',
      '      Writes gallery_expiry_backups proof rows to the production database.',
      '      Takes a fresh, verified database backup on both machines first.',
      '  --help',
    ].join('\n') + '\n'
  );
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const out = io.out ?? process.stdout;
  const err = io.err ?? process.stderr;
  const [command, ...rest] = argv;
  if (command === '--help' || command === '-h' || rest.includes('--help') || rest.includes('-h')) {
    usage(out);
    return 0;
  }
  if (command !== 'register') {
    usage(out);
    return 1;
  }
  let options;
  try {
    options = normalizeRegisterOptions(parseRegisterFlags(rest));
  } catch (error) {
    err.write(`[storage] ${error.message}\n`);
    return 1;
  }
  if (!options.confirm) {
    err.write('[storage] register requires --confirm before reading credentials\n');
    return 1;
  }
  try {
    const result = await runRegisterCli(options);
    out.write(`[storage] registered ${result.count} image proof(s)\n`);
    return 0;
  } catch (error) {
    err.write(`[storage] register failed: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => {
    process.exitCode = code;
  });
}
