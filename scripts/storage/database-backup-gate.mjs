#!/usr/bin/env node
/**
 * Fresh database backup gate for the SQR-04 operator registration CLI.
 *
 * Before registration records any proof row, it must take a new database backup
 * and prove it on both machines. This module owns that gate. It always exports
 * the database, discovers the exactly-new schema and data archives, verifies
 * them locally, copies them to the laptop and re-verifies them there with the
 * local expected checksums.
 *
 * NO PRODUCTION SIDE EFFECTS AT IMPORT and NO credentials are read here. Every
 * process effect is injected, so a hermetic test can prove the gate without a
 * real database, network or secret. No DB write happens and no secret is ever
 * printed. Any failure throws, so the caller registers nothing.
 */

import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

export const DEFAULT_LAPTOP = 'joao@192.168.1.126';
export const BACKUP_DIR_NAME = 'backups';
export const REMOTE_BACKUP_DIR = '~/backups/miu-db';
export const BACKUP_STEM_REGEX =
  /^backup_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.(schema|data)\.sql\.gz$/;

function requireFunction(name, value) {
  if (typeof value !== 'function') throw new Error(`verifyFreshDatabaseBackup requires ${name}`);
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

async function streamHashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

/** Directory inventory as a name set. A missing directory is an empty set. */
async function listDirectoryNames(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return new Set(entries.filter(entry => !entry.isDirectory()).map(entry => entry.name));
  } catch (error) {
    if (error.code === 'ENOENT') return new Set();
    throw error;
  }
}

async function assertRegularNonSymlink(filePath, label) {
  let stats;
  try {
    stats = await fs.lstat(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Missing fresh backup archive: ${label}`);
    throw error;
  }
  if (stats.isSymbolicLink()) throw new Error(`Fresh backup archive is a symlink: ${label}`);
  if (!stats.isFile()) throw new Error(`Fresh backup archive is not a regular file: ${label}`);
}

/**
 * Resolve the primary owning checkout from any linked worktree. `git rev-parse
 * --git-common-dir` names the shared `.git` directory; its parent is the primary
 * checkout, which is where `yarn db:backup` must run.
 */
export async function resolvePrimaryCheckoutRoot({ runner, cwd = process.cwd() } = {}) {
  requireFunction('runner', runner);
  const output = await runner('git', ['rev-parse', '--git-common-dir'], { cwd });
  const commonDir = String(output ?? '').trim();
  if (commonDir.length === 0) throw new Error('git rev-parse --git-common-dir returned nothing');
  const resolved = path.resolve(cwd, commonDir);
  if (path.basename(resolved) !== '.git') {
    throw new Error(`Not a valid git root (no .git common dir): ${commonDir}`);
  }
  return path.dirname(resolved);
}

/** Exactly one new stem must carry both the schema and the data archive. */
function selectFreshStem(newNames) {
  const kindsByStem = new Map();
  for (const name of newNames) {
    const match = BACKUP_STEM_REGEX.exec(name);
    if (!match) throw new Error(`Unexpected new backup file: ${name}`);
    const [, stem, kind] = match;
    if (!kindsByStem.has(stem)) kindsByStem.set(stem, new Set());
    kindsByStem.get(stem).add(kind);
  }
  if (kindsByStem.size !== 1) {
    throw new Error(`Expected exactly one new backup pair, found ${kindsByStem.size}`);
  }
  const [stem, kinds] = [...kindsByStem.entries()][0];
  if (!kinds.has('schema') || !kinds.has('data')) {
    throw new Error(`New backup pair is incomplete for ${stem}`);
  }
  return stem;
}

/**
 * Take a fresh database backup and prove it on both machines before returning.
 * The schema and data archives must be brand new, regular and non-symlinked,
 * pass local `gzip -t`, and pass the laptop `gzip -t` plus a `sha256sum -c -`
 * proof built from the LOCAL expected checksums. Both OK lines are required.
 */
export async function verifyFreshDatabaseBackup({
  repoRoot,
  runner,
  laptop = DEFAULT_LAPTOP,
  now = () => new Date(),
} = {}) {
  requireFunction('runner', runner);
  const root = repoRoot ? path.resolve(repoRoot) : await resolvePrimaryCheckoutRoot({ runner });
  const backupsDir = path.join(root, BACKUP_DIR_NAME);

  const before = await listDirectoryNames(backupsDir);
  await runner('yarn', ['db:backup'], { cwd: root });
  await runner('yarn', ['db:backups'], { cwd: root });
  const after = await listDirectoryNames(backupsDir);
  const newNames = [...after].filter(name => !before.has(name));

  const stem = selectFreshStem(newNames);
  const schemaName = `backup_${stem}.schema.sql.gz`;
  const dataName = `backup_${stem}.data.sql.gz`;
  const schemaPath = path.join(backupsDir, schemaName);
  const dataPath = path.join(backupsDir, dataName);
  await assertRegularNonSymlink(schemaPath, schemaName);
  await assertRegularNonSymlink(dataPath, dataName);

  await runner('gzip', ['-t', '--', schemaPath]);
  await runner('gzip', ['-t', '--', dataPath]);

  const schemaSha256 = await streamHashFile(schemaPath);
  const dataSha256 = await streamHashFile(dataPath);

  const remoteDir = `${REMOTE_BACKUP_DIR}/${stem}`;
  await runner('ssh', [laptop, `mkdir -p ${remoteDir}`]);
  await runner('rsync', ['-a', '--', schemaPath, `${laptop}:${remoteDir}/`]);
  await runner('rsync', ['-a', '--', dataPath, `${laptop}:${remoteDir}/`]);
  await runner('ssh', [laptop, `gzip -t ${remoteDir}/${schemaName} ${remoteDir}/${dataName}`]);

  const checksumInput = `${schemaSha256}  ${schemaName}\n${dataSha256}  ${dataName}\n`;
  const checkOutput = await runner('ssh', [laptop, `cd ${remoteDir} && sha256sum -c -`], {
    input: checksumInput,
  });
  const text = String(checkOutput ?? '');
  if (/FAILED/.test(text)) throw new Error('Remote database backup checksum verification failed');
  for (const name of [schemaName, dataName]) {
    if (!text.includes(`${name}: OK`)) {
      throw new Error(`Remote database backup proof incomplete: ${name}`);
    }
  }

  return Object.freeze({
    stem,
    schemaPath,
    dataPath,
    schemaSha256,
    dataSha256,
    remoteDir,
    verifiedAt: readNow(now),
  });
}
