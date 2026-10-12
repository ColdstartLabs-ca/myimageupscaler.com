#!/usr/bin/env node
/**
 * PRD-SQR-02 ACL-freeze fence for `storage.objects` (operator tool).
 *
 * The approved "short ACL freeze" revokes INSERT, UPDATE and DELETE on
 * `storage.objects` from PUBLIC, anon, authenticated and service_role, so no
 * native Storage write path (REST, TUS, S3, multipart, signed URL) can change a
 * source object while the reference flip and the source delete run. The exact
 * original grants (including grantors) are recorded first and restored last.
 *
 * Commands: snapshot (read-only) | freeze | allow-delete | restore | status.
 * Every mutation needs `--confirm`. The privilege matrix is read live from
 * `has_table_privilege`, so `fenced` is a measured fact, never a stored flag.
 * Every statement uses fixed text; only validated role names are interpolated.
 * No secret is printed.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const FENCE_ROLES = Object.freeze(['PUBLIC', 'anon', 'authenticated', 'service_role']);
const WRITE_PRIVILEGES = Object.freeze(['INSERT', 'UPDATE', 'DELETE']);
const TABLE_PRIVILEGES = Object.freeze([...WRITE_PRIVILEGES, 'SELECT']);
const MATRIX_KEYS = Object.freeze([...TABLE_PRIVILEGES, 'INSERT_ANY_COLUMN', 'UPDATE_ANY_COLUMN']);
const ACL_PRIVILEGES = Object.freeze([
  'INSERT', 'SELECT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN',
]);
const ROLE_REGEX = /^[a-z_][a-z0-9_]*$/;
const SNAPSHOT_VERSION = 1;
const TXN_LOCK_TIMEOUT_SQL = "SET LOCAL lock_timeout = '3s'";
const TXN_STATEMENT_TIMEOUT_SQL = "SET LOCAL statement_timeout = '30s'";

// A missing role yields NULL (not an error), which deriveFence rejects as malformed.
const privilegeSql = (fn, privilege) =>
  `CASE WHEN r.role <> 'public' AND to_regrole(r.role) IS NULL THEN NULL ` +
  `ELSE ${fn}(r.role, 'storage.objects', '${privilege}') END`;

/** Scalar jsonb subquery: effective privileges per fenced role (PUBLIC = 'public'). */
export const FENCE_MATRIX_SQL = `(SELECT jsonb_object_agg(r.label, jsonb_build_object(
    ${TABLE_PRIVILEGES.map(p => `'${p}', ${privilegeSql('has_table_privilege', p)}`).join(',\n    ')},
    'INSERT_ANY_COLUMN', ${privilegeSql('has_any_column_privilege', 'INSERT')},
    'UPDATE_ANY_COLUMN', ${privilegeSql('has_any_column_privilege', 'UPDATE')}))
  FROM (VALUES ('public', 'PUBLIC'), ('anon', 'anon'), ('authenticated', 'authenticated'),
               ('service_role', 'service_role')) AS r(role, label))`;

const MATRIX_QUERY_SQL = `SELECT ${FENCE_MATRIX_SQL} AS matrix`;

const SNAPSHOT_SQL = `SELECT current_user AS connected_as,
  pg_get_userbyid(c.relowner) AS owner,
  c.relacl::text AS relacl,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'grantor', pg_get_userbyid(a.grantor),
      'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      'privilege', a.privilege_type,
      'grantable', a.is_grantable))
    FROM aclexplode(c.relacl) AS a), '[]'::jsonb) AS acl,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('attnum', t.attnum, 'name', t.attname, 'acl', t.attacl::text)
      ORDER BY t.attnum)
    FROM pg_attribute AS t
    WHERE t.attrelid = c.oid AND t.attnum > 0 AND NOT t.attisdropped), '[]'::jsonb) AS columns,
  ${FENCE_MATRIX_SQL} AS matrix
FROM pg_class AS c
WHERE c.oid = 'storage.objects'::regclass`;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function assertRoleName(value, label) {
  if (value !== 'PUBLIC' && !(typeof value === 'string' && ROLE_REGEX.test(value))) {
    throw new Error(`Unsafe role name in ${label}: ${JSON.stringify(value)}`);
  }
  return value;
}

/** Quoted identifier for `SET ROLE`; the name is already validated. */
function quoteRole(role) {
  return `"${assertRoleName(role, 'statement')}"`;
}

// =============================================================================
// Fence derivation
// =============================================================================

/**
 * Derive the fence from a privilege matrix. Fenced means INSERT and UPDATE are
 * false for all four roles (table and any column) and DELETE is false for every
 * role except service_role. A malformed matrix throws (fail closed).
 */
export function deriveFence(matrix) {
  if (!isPlainObject(matrix)) throw new Error('Privilege matrix is missing');
  const violations = [];
  for (const role of FENCE_ROLES) {
    const row = matrix[role];
    for (const key of MATRIX_KEYS) {
      if (!isPlainObject(row) || typeof row[key] !== 'boolean') {
        throw new Error(`Privilege matrix is malformed: ${role}.${key}`);
      }
    }
    for (const key of ['INSERT', 'UPDATE', 'INSERT_ANY_COLUMN', 'UPDATE_ANY_COLUMN']) {
      if (row[key]) violations.push(`${role} ${key}`);
    }
    if (role !== 'service_role' && row.DELETE) violations.push(`${role} DELETE`);
  }
  return Object.freeze({
    fenced: violations.length === 0,
    delete_open: matrix.service_role.DELETE === true,
    violations: Object.freeze(violations),
  });
}

/** True only for a complete matrix that is fenced; never throws. */
export function isNativeFenced(matrix) {
  try {
    return deriveFence(matrix).fenced === true;
  } catch {
    return false;
  }
}

export async function readFenceMatrix(db) {
  const { rows } = await db.query(MATRIX_QUERY_SQL);
  const matrix = rows?.[0]?.matrix;
  deriveFence(matrix);
  return matrix;
}

async function readFenceState(db) {
  const matrix = await readFenceMatrix(db);
  return Object.freeze({ matrix, ...deriveFence(matrix) });
}

// =============================================================================
// Snapshot
// =============================================================================

function entryKey(entry) {
  return `${entry.grantor}\u0000${entry.grantee}\u0000${entry.privilege}`;
}

function sortedAcl(acl) {
  return [...acl]
    .map(entry => ({
      grantor: entry.grantor, grantee: entry.grantee, privilege: entry.privilege, grantable: entry.grantable,
    }))
    .sort((a, b) => (entryKey(a) < entryKey(b) ? -1 : entryKey(a) > entryKey(b) ? 1 : 0));
}

/** Read-only capture of the exact ACL, column ACLs and effective privileges. */
export async function captureSnapshot(db, { now = () => new Date() } = {}) {
  const { rows } = await db.query(SNAPSHOT_SQL);
  const row = rows?.[0];
  if (!row) throw new Error('storage.objects was not found');
  const snapshot = {
    version: SNAPSHOT_VERSION,
    relation: 'storage.objects',
    captured_at: now().toISOString(),
    connected_as: row.connected_as,
    owner: row.owner,
    relacl: row.relacl,
    acl: sortedAcl(row.acl ?? []),
    columns: (row.columns ?? []).map(column => ({ attnum: column.attnum, name: column.name, acl: column.acl ?? null })),
    matrix: row.matrix,
  };
  validateSnapshot(snapshot);
  return snapshot;
}

function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot) || snapshot.version !== SNAPSHOT_VERSION || snapshot.relation !== 'storage.objects') {
    throw new Error('Unsupported ACL snapshot');
  }
  if (typeof snapshot.relacl !== 'string' || snapshot.relacl.length === 0) {
    throw new Error('ACL snapshot has no explicit relacl; restore cannot be exact');
  }
  assertRoleName(snapshot.owner, 'snapshot owner role');
  assertRoleName(snapshot.connected_as, 'snapshot connected role');
  if (!Array.isArray(snapshot.acl) || !Array.isArray(snapshot.columns)) throw new Error('ACL snapshot is malformed');
  for (const entry of snapshot.acl) {
    assertRoleName(entry?.grantor, 'snapshot grantor role');
    assertRoleName(entry?.grantee, 'snapshot grantee role');
    if (!ACL_PRIVILEGES.includes(entry.privilege) || typeof entry.grantable !== 'boolean') {
      throw new Error('ACL snapshot has an invalid privilege entry');
    }
  }
  deriveFence(snapshot.matrix);
  return snapshot;
}

/** `wx` + 0600: a snapshot is evidence and is never overwritten. */
export async function writeSnapshotFile(filePath, snapshot) {
  validateSnapshot(snapshot);
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  await fs.writeFile(filePath, text, { flag: 'wx', mode: 0o600 });
  return Object.freeze({ path: filePath, sha256: sha256Text(text) });
}

export async function loadSnapshotFile(filePath, expectedSha256) {
  const stats = await fs.lstat(filePath);
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('ACL snapshot must be a regular file');
  const text = await fs.readFile(filePath, 'utf8');
  const sha256 = sha256Text(text);
  if (expectedSha256 !== undefined && sha256 !== expectedSha256) {
    throw new Error(`ACL snapshot sha256 mismatch: expected ${expectedSha256}, got ${sha256}`);
  }
  const snapshot = validateSnapshot(JSON.parse(text));
  return Object.freeze({ snapshot, sha256 });
}

// =============================================================================
// Statement generation
// =============================================================================

function isFencedWrite(entry) {
  return FENCE_ROLES.includes(entry.grantee) && WRITE_PRIVILEGES.includes(entry.privilege);
}

/** Group statements by acting role. A REVOKE or GRANT only affects the acting grantor's entries. */
function actingAs(grantor, connectedAs, statements) {
  if (grantor === connectedAs) return statements;
  return [`SET LOCAL ROLE ${quoteRole(grantor)}`, ...statements, 'RESET ROLE'];
}

/** One REVOKE per grantor that holds a fenced write grant in `acl`. */
export function buildFreezeStatements(acl, connectedAs) {
  const grantors = [...new Set(acl.filter(isFencedWrite).map(entry => entry.grantor))].sort();
  return grantors.flatMap(grantor => actingAs(grantor, connectedAs, [
    `REVOKE ${WRITE_PRIVILEGES.join(', ')} ON storage.objects FROM ${FENCE_ROLES.join(', ')}`,
  ]));
}

export const ALLOW_DELETE_SQL = 'GRANT DELETE ON storage.objects TO service_role';

/** Remove every live fenced write grant, then re-grant exactly the snapshot grants with their grantors. */
export function buildRestoreStatements(liveAcl, snapshotAcl, connectedAs) {
  const grants = sortedAcl(snapshotAcl.filter(isFencedWrite));
  const grantors = [...new Set(grants.map(entry => entry.grantor))].sort();
  return [
    ...buildFreezeStatements(liveAcl, connectedAs),
    ...grantors.flatMap(grantor => actingAs(grantor, connectedAs, grants
      .filter(entry => entry.grantor === grantor)
      .map(entry => `GRANT ${entry.privilege} ON storage.objects TO ${entry.grantee}${entry.grantable ? ' WITH GRANT OPTION' : ''}`))),
  ];
}

// =============================================================================
// Operations
// =============================================================================

function requireConfirm(confirm, command) {
  if (confirm !== true) throw new Error(`${command} requires --confirm`);
}

async function inTransaction(db, work) {
  await db.query('BEGIN');
  try {
    await db.query(TXN_LOCK_TIMEOUT_SQL);
    await db.query(TXN_STATEMENT_TIMEOUT_SQL);
    const result = await work();
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

export async function runStatus({ db } = {}) {
  return readFenceState(db);
}

export async function runSnapshot({ db, out, now } = {}) {
  if (!out) throw new Error('snapshot requires --out <file>');
  const snapshot = await captureSnapshot(db, { now });
  const written = await writeSnapshotFile(path.resolve(out), snapshot);
  return Object.freeze({ ...written, snapshot });
}

function assertSameAcl(live, snapshot, message) {
  if (JSON.stringify(sortedAcl(live.acl)) !== JSON.stringify(sortedAcl(snapshot.acl))) throw new Error(message);
  if (JSON.stringify(live.columns) !== JSON.stringify(snapshot.columns)) {
    throw new Error(`${message.replace('table ACL', 'column ACL')}`);
  }
}

/**
 * Freeze: a fresh verified dual database backup first, then one short
 * transaction that revokes and verifies the effective privileges before COMMIT.
 */
export async function runFreeze({ db, snapshotPath, confirm, freshBackup, log = () => {} } = {}) {
  requireConfirm(confirm, 'freeze');
  if (typeof freshBackup !== 'function') throw new Error('freeze requires the fresh database backup gate');
  if (!snapshotPath) throw new Error('freeze requires --snapshot <file>');
  const { snapshot, sha256 } = await loadSnapshotFile(snapshotPath);
  if (isNativeFenced(snapshot.matrix)) throw new Error('ACL snapshot is already fenced; take it before the freeze');

  const backup = await freshBackup();
  log(`[fence] fresh database backup verified: ${JSON.stringify(backup ?? {})}`);

  await inTransaction(db, async () => {
    const live = await captureSnapshot(db);
    assertSameAcl(live, snapshot, 'ACL snapshot is stale: live table ACL differs from the snapshot');
    for (const statement of buildFreezeStatements(snapshot.acl, live.connected_as)) await db.query(statement);
    const state = await readFenceState(db);
    if (!state.fenced || state.delete_open) {
      throw new Error(`Storage is not fenced after REVOKE: ${state.violations.join(', ') || 'DELETE still open'}`);
    }
  });
  const state = await readFenceState(db);
  if (!state.fenced || state.delete_open) throw new Error('Storage is not fenced after COMMIT');
  return Object.freeze({ ...state, snapshot_sha256: sha256 });
}

/** Open DELETE for service_role only. INSERT and UPDATE stay revoked. */
export async function runAllowDelete({ db, confirm } = {}) {
  requireConfirm(confirm, 'allow-delete');
  return inTransaction(db, async () => {
    const before = await readFenceState(db);
    if (!before.fenced) throw new Error(`Storage is not fenced; refuse to open DELETE: ${before.violations.join(', ')}`);
    await db.query(ALLOW_DELETE_SQL);
    const after = await readFenceState(db);
    if (!after.fenced || after.matrix.service_role.DELETE !== true) {
      throw new Error('Storage is not fenced with service_role DELETE after GRANT');
    }
    return after;
  });
}

/** Restore the exact original grants and verify ACL, column ACLs and effective privileges. */
export async function runRestore({ db, snapshotPath, confirm, log = () => {} } = {}) {
  requireConfirm(confirm, 'restore');
  if (!snapshotPath) throw new Error('restore requires --snapshot <file>');
  const { snapshot, sha256 } = await loadSnapshotFile(snapshotPath);
  return inTransaction(db, async () => {
    const before = await captureSnapshot(db);
    for (const statement of buildRestoreStatements(before.acl, snapshot.acl, before.connected_as)) await db.query(statement);
    const after = await captureSnapshot(db);
    assertSameAcl(after, snapshot, 'Restored table ACL does not match the snapshot');
    if (JSON.stringify(after.matrix) !== JSON.stringify(snapshot.matrix)) {
      throw new Error('Restored effective privileges do not match the snapshot');
    }
    const textEqual = after.relacl === snapshot.relacl;
    if (!textEqual) log('[fence] warning: relacl text order differs; entries are identical');
    return Object.freeze({ restored: true, relacl_text_equal: textEqual, snapshot_sha256: sha256, matrix: after.matrix });
  });
}

// =============================================================================
// CLI
// =============================================================================

const VALUE_FLAGS = { '--snapshot': 'snapshot', '--out': 'out' };
const MUTATING = new Set(['freeze', 'allow-delete', 'restore']);

export function parseFenceFlags(args = []) {
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
    'Usage: node scripts/storage/storage-acl-fence.mjs <command>',
    '  snapshot --out <file>',
    '  freeze --confirm --snapshot <file>',
    '  allow-delete --confirm',
    '  restore --confirm --snapshot <file>',
    '  status',
  ].join('\n') + '\n');
}

function formatMatrix(state) {
  const lines = FENCE_ROLES.map(role => {
    const row = state.matrix[role];
    return `  ${role.padEnd(14)} ${MATRIX_KEYS.map(key => `${key}=${row[key]}`).join(' ')}`;
  });
  return [...lines, `fenced=${state.fenced} delete_open=${state.delete_open}` +
    (state.violations.length ? ` violations=${state.violations.join(',')}` : '')].join('\n');
}

/** Real gate runner: no timeout, because `yarn db:backup` can run for minutes. */
async function gateRunner(command, args, options = {}) {
  const { execFileSync } = await import('node:child_process');
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    input: options.input,
    stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit'],
  });
}

export async function runFenceCli(argv, deps = {}) {
  const [command, ...rest] = argv;
  const writeLog = line => process.stdout.write(`${line}\n`);
  if (command === 'help' || command === undefined) return usage();
  const commands = new Set(['snapshot', 'status', ...MUTATING]);
  if (!commands.has(command)) {
    usage();
    process.exitCode = 1;
    return undefined;
  }
  const flags = parseFenceFlags(rest);
  if (MUTATING.has(command) && flags.confirm !== true) throw new Error(`${command} requires --confirm`);
  if ((command === 'freeze' || command === 'restore') && !flags.snapshot) {
    throw new Error('missing required --snapshot <file>');
  }
  if (command === 'snapshot' && !flags.out) throw new Error('missing required --out <file>');

  const log = deps.log ?? writeLog;
  const loadConfig = deps.loadConfig ?? (async () => (
    await import(/* @vite-ignore */ './r2-gallery-operator-adapters.mjs')
  ).loadR2OperatorConfig());
  const createDb = deps.createDb ?? (async config => (
    await import(/* @vite-ignore */ './backup-and-purge.mjs')
  ).createDb(config));

  const config = await loadConfig();
  const db = await createDb(config.dbConfig);
  try {
    if (command === 'snapshot') {
      const result = await runSnapshot({ db, out: flags.out });
      log(`[fence] snapshot ${result.path} sha256=${result.sha256}`);
      return result;
    }
    if (command === 'status') {
      const state = await runStatus({ db });
      log(formatMatrix(state));
      return state;
    }
    if (command === 'freeze') {
      const freshBackup = deps.freshBackup ?? (async () => {
        const gate = await import(/* @vite-ignore */ './database-backup-gate.mjs');
        const repoRoot = await gate.resolvePrimaryCheckoutRoot({ runner: gateRunner });
        return gate.verifyFreshDatabaseBackup({ repoRoot, runner: gateRunner });
      });
      const state = await runFreeze({ db, snapshotPath: flags.snapshot, confirm: true, freshBackup, log });
      log(formatMatrix(state));
      return state;
    }
    if (command === 'allow-delete') {
      const state = await runAllowDelete({ db, confirm: true });
      log(formatMatrix(state));
      return state;
    }
    const result = await runRestore({ db, snapshotPath: flags.snapshot, confirm: true, log });
    log(`[fence] restored exact grants from snapshot sha256=${result.snapshot_sha256}`);
    return result;
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runFenceCli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`[storage-acl-fence] error: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
