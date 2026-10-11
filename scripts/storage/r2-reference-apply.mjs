#!/usr/bin/env node
/**
 * PRD-SQR-02 concrete reference apply engine (library only, no CLI).
 *
 * This engine applies the FROZEN reference plan produced by
 * `verify-r2-references.mjs` to the database: gallery rows flip
 * `storage_backend` from `supabase` to `r2`, blog image URLs and blog post
 * bodies/featured images move to the trusted assets domain. It never talks to
 * R2, never deletes a row or object, and never rewrites any other field.
 *
 * Safety contract (docs/PRDs/supabase-quota-recovery/README.md):
 *   - The backup identity is re-loaded from disk and the caller identity must
 *     bind it. A synthetic identity fails.
 *   - The plan and its REQUIRED raw digest are read from regular files inside
 *     the run dir with the shared helper (symlink/traversal escape fails).
 *   - The raw plan sha256 must equal the digest and the plan must name the
 *     verified run, manifest sha, object count, byte total and the canonical
 *     assets base.
 *   - A full current reference re-verification (`verifyCurrent`) must return
 *     `ok`, `missing_count: 0`, the frozen plan itself and the matching digest
 *     BEFORE any write. A known missing blog reference is not waivable.
 *   - A fresh database backup (`verifyFreshDatabaseBackup`) must succeed BEFORE
 *     any transaction or UPDATE. Its failure means zero DB writes.
 *   - Writes run in bounded (<=50) READ COMMITTED transactions with a 2s lock
 *     timeout and a 30s statement timeout. Each row uses a native full-row CAS
 *     (`to_jsonb(t) = before::jsonb`). A zero-row CAS rolls the batch back and
 *     stops. A failed COMMIT stops without reversing committed writes.
 *   - Only the fixed tables/columns are touched. Identifiers are never
 *     interpolated from the plan; every value is a bound parameter.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  SHA256_REGEX,
  assertSafeRegularFile,
  isSafeObjectPath,
  loadBackupIdentity,
} from './backup-verification.mjs';
import { chunk } from './backup-and-purge.mjs';
import { DEFAULT_PUBLIC_BASE, PLAN_DIGEST_FILE, PLAN_FILE } from './verify-r2-references.mjs';

export const APPLY_BATCH_SIZE = 50;
export const PRIVATE_BUCKET = 'miu-private';
export const PUBLIC_BUCKET = 'miu-public';
export const SAVED_BACKEND_LEGACY = 'supabase';
export const SAVED_BACKEND_TARGET = 'r2';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fixed statements only. The table/column names are constants; no plan value is
// ever interpolated into SQL.
const UPDATE_SQL = Object.freeze({
  saved_images:
    'UPDATE public.saved_images AS t SET storage_backend = $2 WHERE t.id = $1::uuid AND to_jsonb(t) = $3::jsonb RETURNING to_jsonb(t) AS row',
  blog_images:
    'UPDATE public.blog_images AS t SET url = $2 WHERE t.id = $1::uuid AND to_jsonb(t) = $3::jsonb RETURNING to_jsonb(t) AS row',
  blog_posts:
    'UPDATE public.blog_posts AS t SET content = $2, featured_image_url = $3 WHERE t.id = $1::uuid AND to_jsonb(t) = $4::jsonb RETURNING to_jsonb(t) AS row',
});

const ALLOWED_FIELDS = Object.freeze({
  saved_images: ['storage_backend'],
  blog_images: ['url'],
  blog_posts: ['content', 'featured_image_url'],
});

const BEGIN_SQL = 'BEGIN ISOLATION LEVEL READ COMMITTED';
const LOCK_TIMEOUT_SQL = "SET LOCAL lock_timeout = '2s'";
const STATEMENT_TIMEOUT_SQL = "SET LOCAL statement_timeout = '30s'";
const COMMIT_SQL = 'COMMIT';
const ROLLBACK_SQL = 'ROLLBACK';

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function required(value, label) {
  if (!value) throw new Error(`missing required ${label}`);
  return value;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

function isDeepEqual(a, b) {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
}

function canonicalBase(publicBase) {
  return publicBase.endsWith('/') ? publicBase.slice(0, -1) : publicBase;
}

/** The caller identity must bind the freshly loaded, verified backup run. */
function assertIdentityBinding(passed, fresh) {
  for (const field of ['manifestSha256', 'checksumListSha256', 'objectCount', 'totalBytes', 'runBasename']) {
    if (passed?.[field] !== fresh[field]) {
      throw new Error(`Backup identity ${field} does not match the verified backup run`);
    }
  }
}

/** The frozen plan must bind the verified run and the canonical assets base. */
function assertPlanBinding(identity, plan) {
  if (!isPlainObject(plan)) throw new Error('Reference plan must be an object');
  if (plan.run_id !== identity.runBasename) throw new Error('Reference plan run_id does not match the backup run');
  if (plan.manifest_sha256 !== identity.manifestSha256) {
    throw new Error('Reference plan manifest_sha256 does not match the backup run');
  }
  if (plan.manifest_object_count !== identity.objectCount) {
    throw new Error('Reference plan object count does not match the backup run');
  }
  if (plan.manifest_total_bytes !== identity.totalBytes) {
    throw new Error('Reference plan byte total does not match the backup run');
  }
  if (plan.public_base !== DEFAULT_PUBLIC_BASE) {
    throw new Error(`Reference plan public_base must be the canonical assets domain: ${DEFAULT_PUBLIC_BASE}`);
  }
  if (!Array.isArray(plan.gallery) || !Array.isArray(plan.blog)) {
    throw new Error('Reference plan must contain gallery and blog arrays');
  }
}

/** A blog target URL must be exactly the canonical assets URL for its path. */
function assertExactAssetsUrl(value, publicBase, expectedPath) {
  const expected = `${canonicalBase(publicBase)}/${expectedPath}`;
  if (value !== expected) throw new Error(`URL is not the exact trusted assets URL: ${String(value)}`);
}

/** A featured image URL must sit on the assets domain with a safe object path. */
function assertAssetsUrl(value, publicBase) {
  const base = canonicalBase(publicBase);
  if (typeof value !== 'string' || !value.startsWith(`${base}/`)) {
    throw new Error(`URL is not on the trusted assets domain: ${String(value)}`);
  }
  const rest = value.slice(base.length + 1);
  if (!isSafeObjectPath(rest)) throw new Error(`Untrusted assets URL path: ${String(value)}`);
}

/** The plan may change only the allowed fields; every other field stays exact. */
function assertOnlyAllowedChanges(before, after, allowed, table, id) {
  const beforeKeys = Object.keys(before).sort();
  const afterKeys = Object.keys(after).sort();
  if (beforeKeys.length !== afterKeys.length || beforeKeys.some((key, index) => key !== afterKeys[index])) {
    throw new Error(`Plan row ${table}:${id} changes the field set`);
  }
  const changed = [];
  for (const key of beforeKeys) {
    const same = isDeepEqual(before[key], after[key]);
    if (allowed.includes(key)) {
      if (!same) changed.push(key);
    } else if (!same) {
      throw new Error(`Plan row ${table}:${id} changes a disallowed field: ${key}`);
    }
  }
  if (changed.length === 0) throw new Error(`Plan row ${table}:${id} has no allowed field change`);
  return changed;
}

/** Validate one plan row into a concrete parameterized update. */
function buildOperation(entry, publicBase) {
  if (!isPlainObject(entry)) throw new Error('Plan entry must be an object');
  const table = entry.table;
  const sql = UPDATE_SQL[table];
  if (!sql) throw new Error(`Plan references an unknown table: ${String(table)}`);
  const id = entry.id;
  if (typeof id !== 'string' || !UUID_REGEX.test(id)) throw new Error(`Plan row id is not a UUID: ${String(id)}`);
  const before = entry.before;
  const after = entry.after;
  if (!isPlainObject(before) || !isPlainObject(after)) {
    throw new Error(`Plan row ${table}:${id} lacks before/after objects`);
  }
  if (before.id !== id) throw new Error(`Plan before.id does not match id for ${table}:${id}`);
  const changed = assertOnlyAllowedChanges(before, after, ALLOWED_FIELDS[table], table, id);

  if (table === 'saved_images') {
    if (!UUID_REGEX.test(String(before.user_id))) throw new Error(`Saved row ${id} user_id is not a UUID`);
    if (!isSafeObjectPath(before.storage_path)) throw new Error(`Saved row ${id} has an unsafe storage path`);
    if (entry.target_bucket !== PRIVATE_BUCKET) throw new Error(`Saved row ${id} target bucket must be ${PRIVATE_BUCKET}`);
    if (entry.target_key !== `saved/${before.storage_path}`) throw new Error(`Saved row ${id} target key mismatch`);
    if (before.storage_backend !== SAVED_BACKEND_LEGACY || after.storage_backend !== SAVED_BACKEND_TARGET) {
      throw new Error(`Saved row ${id} backend change must be ${SAVED_BACKEND_LEGACY} -> ${SAVED_BACKEND_TARGET}`);
    }
    return { table, id, sql, params: [id, after.storage_backend, JSON.stringify(before)] };
  }

  if (table === 'blog_images') {
    if (!isSafeObjectPath(before.storage_path)) throw new Error(`Blog image ${id} has an unsafe storage path`);
    if (entry.target_bucket !== PUBLIC_BUCKET) throw new Error(`Blog image ${id} target bucket must be ${PUBLIC_BUCKET}`);
    if (entry.target_key !== before.storage_path) throw new Error(`Blog image ${id} target key must keep the original path`);
    assertExactAssetsUrl(after.url, publicBase, before.storage_path);
    return { table, id, sql, params: [id, after.url, JSON.stringify(before)] };
  }

  if (!('content' in before) || !('featured_image_url' in before)) {
    throw new Error(`Blog post ${id} lacks content/featured_image_url`);
  }
  if (changed.includes('featured_image_url') && after.featured_image_url !== null) {
    assertAssetsUrl(after.featured_image_url, publicBase);
  }
  if (changed.includes('content') && typeof after.content !== 'string') {
    throw new Error(`Blog post ${id} content must stay a string`);
  }
  return { table, id, sql, params: [id, after.content, after.featured_image_url, JSON.stringify(before)] };
}

/**
 * Apply the frozen reference plan. Every dependency is injectable so a test is
 * hermetic: no real network, no real credentials, no production write.
 */
export async function runReferenceApply({
  identity,
  planPath,
  planDigestPath,
  db,
  verifyCurrent,
  verifyFreshDatabaseBackup,
  log = () => {},
} = {}) {
  if (!identity || typeof identity !== 'object') throw new Error('runReferenceApply requires a backup identity');
  if (!db || typeof db.query !== 'function') throw new Error('runReferenceApply requires a db client');
  if (typeof verifyCurrent !== 'function') throw new Error('runReferenceApply requires a verifyCurrent function');
  if (typeof verifyFreshDatabaseBackup !== 'function') {
    throw new Error('runReferenceApply requires a verifyFreshDatabaseBackup function');
  }
  if (typeof log !== 'function') throw new Error('runReferenceApply requires a log function');

  const freshIdentity = await loadBackupIdentity(required(identity.runDir, 'backup identity runDir'));
  assertIdentityBinding(identity, freshIdentity);

  const resolvedPlan = path.resolve(planPath ?? path.join(freshIdentity.runDir, PLAN_FILE));
  const resolvedDigest = path.resolve(planDigestPath ?? path.join(freshIdentity.runDir, PLAN_DIGEST_FILE));
  await assertSafeRegularFile(freshIdentity.runDir, resolvedPlan);
  await assertSafeRegularFile(freshIdentity.runDir, resolvedDigest);

  const rawPlan = await fs.readFile(resolvedPlan, 'utf8');
  const rawDigest = (await fs.readFile(resolvedDigest, 'utf8')).trim();
  const rawSha256 = sha256Text(rawPlan);
  if (!SHA256_REGEX.test(rawDigest)) throw new Error('Reference plan digest is not a 64-hex SHA256');
  if (rawDigest !== rawSha256) throw new Error('Reference plan digest does not bind the raw plan file');

  let plan;
  try {
    plan = JSON.parse(rawPlan);
  } catch (error) {
    throw new Error(`Invalid reference plan JSON: ${errorMessage(error)}`);
  }
  if (JSON.stringify(plan) !== rawPlan) throw new Error('Reference plan file is not canonical JSON');
  assertPlanBinding(freshIdentity, plan);

  // Full current reference re-verification BEFORE any write. A missing
  // pre-existing blog reference is an explicit blocker, never waived.
  const current = await verifyCurrent();
  if (!current || current.ok !== true || current.missing_count !== 0) {
    throw new Error(`Current reference verification failed: missing_count=${current?.missing_count ?? 'unknown'}`);
  }
  if (current.source_etag_unbound !== 0) {
    throw new Error(`Current source eTag proof is incomplete: unbound=${current.source_etag_unbound ?? 'unknown'}`);
  }
  // Source byte proof alone does not fence a concurrent Storage overwrite.
  if (current.source_native_fenced !== true) throw new Error('Native source fencing is not verified');
  if (current.plan_sha256 !== rawSha256) throw new Error('Current plan digest does not match the frozen plan');
  if (!isDeepEqual(current.plan, plan)) throw new Error('Current plan does not match the frozen plan');

  const operations = [
    ...plan.gallery.map(entry => buildOperation(entry, DEFAULT_PUBLIC_BASE)),
    ...plan.blog.map(entry => buildOperation(entry, DEFAULT_PUBLIC_BASE)),
  ];

  // The fresh database backup must succeed before ANY transaction or UPDATE.
  await verifyFreshDatabaseBackup();

  const applied = [];
  let galleryCount = 0;
  let blogCount = 0;
  let batches = 0;

  for (const batch of chunk(operations, APPLY_BATCH_SIZE)) {
    batches += 1;
    await db.query(BEGIN_SQL);
    try {
      await db.query(LOCK_TIMEOUT_SQL);
      await db.query(STATEMENT_TIMEOUT_SQL);
      for (const operation of batch) {
        const result = await db.query(operation.sql, operation.params);
        if (!result || result.rowCount !== 1) {
          throw new Error(`Reference apply CAS failed for ${operation.table}:${operation.id}`);
        }
        const returned = result.rows?.[0]?.row;
        if (!returned || returned.id !== operation.id) {
          throw new Error(`Reference apply did not return the native row for ${operation.table}:${operation.id}`);
        }
        applied.push(Object.freeze({ table: operation.table, id: operation.id }));
        if (operation.table === 'saved_images') galleryCount += 1;
        else blogCount += 1;
        log(`applied ${operation.table}:${operation.id}`);
      }
    } catch (error) {
      await db.query(ROLLBACK_SQL);
      throw error;
    }
    // A failed COMMIT is uncertain: stop without reversing anything.
    await db.query(COMMIT_SQL);
  }

  return Object.freeze({
    run_id: freshIdentity.runBasename,
    plan_sha256: rawSha256,
    applied: Object.freeze({ gallery: galleryCount, blog: blogCount, total: applied.length }),
    batches,
    rows: Object.freeze(applied),
  });
}
