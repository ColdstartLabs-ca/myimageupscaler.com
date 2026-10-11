#!/usr/bin/env node
/**
 * PRD-SQR-02 Phase 3 reference verification and frozen rewrite plan (read-only).
 *
 * This module proves that every current saved-image row and every blog/post public
 * source reference still resolves to a verified R2 object (local backup + laptop +
 * R2 full GET with exact sha256 and byte count) and then emits a FROZEN rewrite
 * PLAN that is not applied. It never writes to the database, never touches R2 and
 * never deletes. The guarded operator CLI exposes `verify` (read-only report plus
 * frozen plan) and `apply` (`--confirm`, fresh DB backup first). No secret is read
 * at import; `help` alone runs without any credential or database work.
 *
 * Safety contract (docs/PRDs/supabase-quota-recovery/README.md):
 *   - The caller passes an identity; the real verified backup run is re-loaded and
 *     the caller identity must bind its manifest sha, run, count and byte total.
 *   - Local proof (`verifyFrozenArtifacts`), the mandatory remote laptop proof
 *     (`verifyRemoteBatch`), the R2 full-GET read-back (`readbackVerify`, shared
 *     with the migration) and, for every unique blog target, a public
 *     assets-domain full GET with the same sha256 and byte count run before any
 *     reference is reported verified.
 *   - A reference with no manifest row, a changed hash, an ambiguous URL or an
 *     unknown storage URL is reported missing with its count and source id. It is
 *     never reported verified. A known pre-existing gap is an explicit failure, not
 *     a whitelist.
 *   - The gallery backend flips `supabase` -> `r2` only after object proof, binding
 *     the exact row id and owner. Blog URLs swap the exact Supabase public
 *     `blog-images` prefix for the assets domain, preserving the path, only for
 *     verified targets, and keep every other post field and content byte intact.
 *   - The plan is native JSON (no Date conversion), canonical, with a SHA256 digest.
 *     An optional write is `wx` + mode 0400 and rejects symlinks and traversal.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  SHA256_REGEX,
  assertSafeRegularFile,
  isSafeObjectPath,
  loadBackupIdentity,
  verifyFrozenArtifacts,
  verifyRemoteBatch,
} from './backup-verification.mjs';
import { SAVED_BUCKET as GALLERY_BUCKET, BLOG_BUCKET, DEFAULT_EXPIRES_SECONDS, mapManifestRow, readbackVerify, defaultRunner } from './migrate-r2.mjs';
import { chunk } from './backup-and-purge.mjs';
import { presignGetUrl } from '../../server/services/r2-presign.mjs';

export const DEFAULT_PUBLIC_BASE = 'https://assets.myimageupscaler.com';
export const SOURCE_SUPABASE_ORIGIN = 'https://xqysaylskffsfwunczbd.supabase.co';
export const VERIFY_BATCH_SIZE = 50;
export const PLAN_FILE = 'r2-reference-plan.json';
export const PLAN_DIGEST_FILE = 'r2-reference-plan.digest';
export const SAVED_BACKEND_TABLE = 'saved_images';
export const SAVED_BACKEND_LEGACY = 'supabase';
export const SAVED_BACKEND_TARGET = 'r2';

const CONTROL_CHAR_REGEX = /[\u0000-\u001f\u007f]/;
const R2_ENDPOINT_HOST_REGEX = /^[0-9a-f]{32}\.r2\.cloudflarestorage\.com$/;
const STORAGE_URL_MARKER = '/storage/v1/';
const BLOG_PATH_CHARS = '[a-zA-Z0-9_\\-./]+';
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

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

/** A fresh global regex so `lastIndex` never carries across calls. */
function supabaseBlogUrlRegex() {
  return new RegExp(
    `(https?://[^\\s)"']*?)/storage/v1/(?:object|render/image)/public/blog-images/(${BLOG_PATH_CHARS})`,
    'g'
  );
}

/** True only for URLs on this project's trusted Supabase origin. */
function isTrustedOrigin(origin, sourceOrigin) {
  return origin === sourceOrigin;
}

/** Reject a noncanonical assets base before any proof or plan IO runs. */
export function assertCanonicalPublicBase(publicBase = DEFAULT_PUBLIC_BASE) {
  if (publicBase !== DEFAULT_PUBLIC_BASE) {
    throw new Error(`publicBase must be the canonical assets domain: ${DEFAULT_PUBLIC_BASE}`);
  }
  return publicBase;
}

/** Body URLs: every absolute http(s) URL in Markdown or HTML content. */
const BODY_URL_REGEX = /https?:\/\/[^\s"'<>(){}[\]]+/g;

export function extractBodyUrls(content) {
  if (typeof content !== 'string') return [];
  const urls = [];
  const seen = new Set();
  let match;
  const regex = new RegExp(BODY_URL_REGEX.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    const url = match[0].replace(TRAILING_PUNCTUATION, '');
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

/** The path inside a public assets-domain URL, or null when the host differs. */
export function assetsDomainPath(url, publicBase = DEFAULT_PUBLIC_BASE) {
  if (typeof url !== 'string') return null;
  const base = publicBase.endsWith('/') ? publicBase.slice(0, -1) : publicBase;
  if (!url.startsWith(`${base}/`)) return null;
  const raw = url.slice(base.length + 1).split('?')[0].split('#')[0];
  return isSafeObjectPath(raw) ? raw : null;
}

/**
 * Public assets URL for one verified object path. Each segment is percent-encoded
 * and the slash is preserved, so a segment can never leak into a query string or
 * fragment and the public path keeps its exact segment boundaries.
 */
export function publicObjectUrl(publicBase, sourcePath) {
  const base = publicBase.endsWith('/') ? publicBase.slice(0, -1) : publicBase;
  const encoded = String(sourcePath)
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
  return `${base}/${encoded}`;
}

/**
 * Wrap the injected fetch for the public proof. The existing read-back already
 * sets `redirect: 'error'` and a bounded timeout; this adds `cache: 'no-store'`
 * and rejects any non-identity content-encoding before a byte is hashed, so an
 * encoded body is never mistaken for a byte mismatch.
 */
function publicReadbackFetch(fetchFn) {
  return async (url, init = {}) => {
    const response = await fetchFn(url, { ...init, cache: 'no-store' });
    const encoding = response?.headers?.get?.('content-encoding');
    if (encoding && encoding.toLowerCase() !== 'identity') {
      throw new Error(`Public read-back returned unexpected content encoding: ${encoding}`);
    }
    return response;
  };
}

/**
 * Classify one whole-URL field. Only this project's trusted Supabase origin and
 * its assets domain yield a path. Two different paths in one URL are ambiguous.
 * A foreign host with a same-looking storage path is never a path. A trusted
 * storage URL that is not a supported blog reference is unknown.
 */
export function classifySourceUrl(url, publicBase = DEFAULT_PUBLIC_BASE, sourceOrigin = SOURCE_SUPABASE_ORIGIN) {
  if (typeof url !== 'string' || url.trim() === '') return { kind: 'empty' };
  const trimmed = url.trim();
  const paths = new Set();
  const assetsPath = assetsDomainPath(trimmed, publicBase);
  if (assetsPath) paths.add(assetsPath);
  let foreignCollision = false;
  for (const match of trimmed.matchAll(supabaseBlogUrlRegex())) {
    const candidate = match[2].replace(TRAILING_PUNCTUATION, '');
    if (!isSafeObjectPath(candidate)) continue;
    if (isTrustedOrigin(match[1], sourceOrigin)) paths.add(candidate);
    else foreignCollision = true;
  }
  const signals = paths.size + (foreignCollision ? 1 : 0);
  if (signals > 1) return { kind: 'ambiguous', paths: [...paths] };
  if (paths.size === 1) return { kind: 'path', path: [...paths][0] };
  if (foreignCollision) return { kind: 'unknown' };
  if (trimmed.includes(STORAGE_URL_MARKER)) return { kind: 'unknown' };
  return { kind: 'none' };
}

/** True when a trusted Supabase public/render prefix precedes the verified blog path. */
function isSupabaseBlogUrl(url, publicPath, sourceOrigin = SOURCE_SUPABASE_ORIGIN) {
  if (typeof url !== 'string') return false;
  for (const match of url.matchAll(supabaseBlogUrlRegex())) {
    if (!isTrustedOrigin(match[1], sourceOrigin)) continue;
    const candidate = match[2].replace(TRAILING_PUNCTUATION, '');
    if (candidate === publicPath) return true;
  }
  return false;
}

/**
 * Replace every trusted Supabase public blog URL whose path is verified with the
 * assets domain, preserving the path and any trailing punctuation. Foreign hosts,
 * unverified URLs and every other byte stay exactly as they were.
 */
export function replaceVerifiedBlogUrls(content, verifiedPaths, publicBase = DEFAULT_PUBLIC_BASE, sourceOrigin = SOURCE_SUPABASE_ORIGIN) {
  if (typeof content !== 'string') return content;
  const base = publicBase.endsWith('/') ? publicBase.slice(0, -1) : publicBase;
  return content.replace(supabaseBlogUrlRegex(), (match, origin, rawPath) => {
    if (!isTrustedOrigin(origin, sourceOrigin)) return match;
    const cleaned = rawPath.replace(TRAILING_PUNCTUATION, '');
    if (!verifiedPaths.has(cleaned)) return match;
    const suffix = rawPath.slice(cleaned.length);
    return `${base}/${cleaned}${suffix}`;
  });
}

function pushReference(references, failures, bucket, objectPath, table, id, field) {
  const sourceId = `${table}:${id}`;
  if (typeof objectPath !== 'string' || objectPath === '') return;
  if (!isSafeObjectPath(objectPath)) {
    failures.push({ sourceId, table, field, source: objectPath, reason: 'unsafe_path' });
    return;
  }
  references.push({ bucket, path: objectPath, table, id, field, sourceId, key: `${bucket}::${objectPath}` });
}

function pushUrlReference(references, failures, url, table, id, field, publicBase, sourceOrigin) {
  const sourceId = `${table}:${id}`;
  const classified = classifySourceUrl(url, publicBase, sourceOrigin);
  if (classified.kind === 'ambiguous') {
    failures.push({ sourceId, table, field, source: url, reason: 'ambiguous', paths: classified.paths });
    return;
  }
  if (classified.kind === 'unknown') {
    failures.push({ sourceId, table, field, source: url, reason: 'unknown_url' });
    return;
  }
  if (classified.kind !== 'path') return;
  pushReference(references, failures, BLOG_BUCKET, classified.path, table, id, field);
}

/** Collect each absolute URL in a Markdown/HTML body and classify it alone. */
function pushBodyReferences(references, failures, content, table, id, publicBase, sourceOrigin) {
  const sourceId = `${table}:${id}`;
  let urls;
  try {
    urls = extractBodyUrls(content);
  } catch (error) {
    failures.push({ sourceId, table, field: 'content', source: null, reason: 'content_parse_error', detail: errorMessage(error) });
    return;
  }
  for (const url of urls) {
    pushUrlReference(references, failures, url, table, id, 'content', publicBase, sourceOrigin);
  }
}

/**
 * Collect every current reference from the three tables. Each reference keeps its
 * exact source bucket/path and source id. Missing/ambiguous/unknown sources are
 * returned as structured failures, never silently dropped.
 */
export function collectR2References({ savedRows = [], blogRows = [], postRows = [], publicBase = DEFAULT_PUBLIC_BASE, sourceOrigin = SOURCE_SUPABASE_ORIGIN } = {}) {
  assertCanonicalPublicBase(publicBase);
  const references = [];
  const failures = [];

  for (const row of savedRows) {
    pushReference(references, failures, GALLERY_BUCKET, row.storage_path, SAVED_BACKEND_TABLE, row.id, 'storage_path');
  }
  for (const row of blogRows) {
    pushReference(references, failures, BLOG_BUCKET, row.storage_path, 'blog_images', row.id, 'storage_path');
    pushUrlReference(references, failures, row.url, 'blog_images', row.id, 'url', publicBase, sourceOrigin);
  }
  for (const row of postRows) {
    pushUrlReference(references, failures, row.featured_image_url, 'blog_posts', row.id, 'featured_image_url', publicBase, sourceOrigin);
    if (typeof row.content === 'string') {
      pushBodyReferences(references, failures, row.content, 'blog_posts', row.id, publicBase, sourceOrigin);
    }
  }
  return { references, failures };
}

function assertSigning(signing) {
  if (!signing || typeof signing !== 'object') {
    throw new Error('verifyR2References requires a signing configuration');
  }
  const { endpoint, accessKeyId, secretAccessKey } = signing;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Signing configuration requires endpoint, accessKeyId and secretAccessKey');
  }
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') throw new Error('Signing endpoint must use HTTPS');
  if (!R2_ENDPOINT_HOST_REGEX.test(url.hostname)) {
    throw new Error(`Signing endpoint must be a Cloudflare R2 account endpoint: ${url.hostname}`);
  }
  return { ...signing, endpoint, expiresSeconds: signing.expiresSeconds ?? DEFAULT_EXPIRES_SECONDS };
}

/** Bind the caller identity to the freshly loaded, verified backup run. */
function assertIdentityBindings(passed, fresh) {
  for (const field of ['manifestSha256', 'checksumListSha256', 'objectCount', 'totalBytes', 'runBasename']) {
    if (passed?.[field] !== fresh[field]) {
      throw new Error(`Backup identity ${field} does not match the verified backup run`);
    }
  }
}

function buildPlan({ identity, publicBase, sourceOrigin, verifiedRefKeys, verifiedPaths, savedRows, blogRows, postRows, targetByKey }) {
  const gallery = [];
  for (const row of savedRows) {
    const key = `${GALLERY_BUCKET}::${row.storage_path}`;
    if (!verifiedRefKeys.has(key)) continue;
    const backend = row.storage_backend ?? SAVED_BACKEND_LEGACY;
    if (backend !== SAVED_BACKEND_LEGACY) continue;
    const target = targetByKey.get(key);
    gallery.push({
      table: SAVED_BACKEND_TABLE,
      id: row.id,
      user_id: row.user_id ?? null,
      path: row.storage_path,
      target_bucket: target.targetBucket,
      target_key: target.targetKey,
      before: { ...row },
      after: { ...row, storage_backend: SAVED_BACKEND_TARGET },
    });
  }

  const blog = [];
  for (const row of blogRows) {
    const key = `${BLOG_BUCKET}::${row.storage_path}`;
    if (!verifiedRefKeys.has(key)) continue;
    const target = targetByKey.get(key);
    const changed = isSupabaseBlogUrl(row.url, row.storage_path, sourceOrigin);
    if (!changed) continue;
    blog.push({
      table: 'blog_images',
      id: row.id,
      user_id: row.user_id ?? null,
      field: 'url',
      target_bucket: target.targetBucket,
      target_key: target.targetKey,
      before: { ...row },
      after: { ...row, url: `${publicBase}/${row.storage_path}` },
    });
  }
  for (const row of postRows) {
    const after = { ...row };
    let changed = false;
    if (typeof row.featured_image_url === 'string') {
      const classified = classifySourceUrl(row.featured_image_url, publicBase, sourceOrigin);
      const path0 = classified.kind === 'path' ? classified.path : null;
      if (path0 && verifiedRefKeys.has(`${BLOG_BUCKET}::${path0}`) && isSupabaseBlogUrl(row.featured_image_url, path0, sourceOrigin)) {
        after.featured_image_url = `${publicBase}/${path0}`;
        changed = true;
      }
    }
    if (typeof row.content === 'string') {
      const next = replaceVerifiedBlogUrls(row.content, verifiedPaths, publicBase, sourceOrigin);
      if (next !== row.content) {
        after.content = next;
        changed = true;
      }
    }
    if (!changed) continue;
    blog.push({
      table: 'blog_posts',
      id: row.id,
      user_id: row.user_id ?? null,
      field: 'content',
      before: { ...row },
      after,
    });
  }

  return {
    run_id: identity.runBasename,
    manifest_sha256: identity.manifestSha256,
    manifest_object_count: identity.objectCount,
    manifest_total_bytes: identity.totalBytes,
    public_base: publicBase,
    gallery,
    blog,
  };
}

/**
 * Read-only operator engine. Every dependency is injectable so a test is hermetic:
 * no real network, no real credentials, no production read or write.
 */
export async function verifyR2References({
  identity,
  savedRows = [],
  blogRows = [],
  postRows = [],
  signing,
  presignGet = presignGetUrl,
  fetchFn = fetch,
  runner,
  publicBase = DEFAULT_PUBLIC_BASE,
  sourceOrigin = SOURCE_SUPABASE_ORIGIN,
  batchSize = VERIFY_BATCH_SIZE,
} = {}) {
  assertCanonicalPublicBase(publicBase);
  if (!identity || !Array.isArray(identity.manifest)) {
    throw new Error('verifyR2References requires a backup identity');
  }
  if (typeof presignGet !== 'function') throw new Error('verifyR2References requires a presignGet function');
  if (typeof fetchFn !== 'function') throw new Error('verifyR2References requires a fetch function');
  if (typeof runner !== 'function') throw new Error('verifyR2References requires a remote proof runner');
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > VERIFY_BATCH_SIZE) {
    throw new Error(`Batch size must be an integer from 1 to ${VERIFY_BATCH_SIZE}`);
  }

  const resolvedSigning = assertSigning(signing);
  const freshIdentity = await loadBackupIdentity(required(identity.runDir, 'backup identity runDir'));
  assertIdentityBindings(identity, freshIdentity);

  const { references, failures } = collectR2References({ savedRows, blogRows, postRows, publicBase, sourceOrigin });

  const manifestByKey = new Map(freshIdentity.manifest.map(row => [`${row.bucket}::${row.path}`, row]));
  const entries = new Map();
  const missing = [...failures];

  for (const ref of references) {
    const manifestRow = manifestByKey.get(ref.key);
    if (!manifestRow) {
      missing.push({ sourceId: ref.sourceId, table: ref.table, field: ref.field, source: ref.path, reason: 'missing_manifest' });
      continue;
    }
    if (!entries.has(ref.key)) {
      const mapped = mapManifestRow(manifestRow);
      entries.set(ref.key, { ...mapped, refs: [] });
    }
    entries.get(ref.key).refs.push(ref);
  }

  const publicFetch = publicReadbackFetch(fetchFn);
  let sourceETagUnbound = 0;

  for (const batch of chunk([...entries.values()], batchSize)) {
    const sourceRows = batch.map(entry => ({
      bucket: entry.sourceBucket,
      path: entry.sourcePath,
      sha256: entry.sha256,
      bytes: entry.bytes,
    }));
    const sourceProof = await verifyFrozenArtifacts({ runDir: freshIdentity.runDir, rows: sourceRows });
    sourceETagUnbound += sourceProof.etagUnbound;
    await verifyRemoteBatch({ identity: freshIdentity, rows: sourceRows, runner });
    for (const entry of batch) {
      await readbackVerify({
        presignGet,
        signing: resolvedSigning,
        fetchFn,
        targetBucket: entry.targetBucket,
        targetKey: entry.targetKey,
        expectedSha256: entry.sha256,
        expectedBytes: entry.bytes,
      });
      // Every unique blog target must also be proven on the public assets domain,
      // because the published URL points there. Gallery objects stay private.
      if (entry.sourceBucket !== BLOG_BUCKET) continue;
      await readbackVerify({
        presignGet: () => publicObjectUrl(publicBase, entry.sourcePath),
        signing: resolvedSigning,
        fetchFn: publicFetch,
        targetBucket: entry.targetBucket,
        targetKey: entry.targetKey,
        expectedSha256: entry.sha256,
        expectedBytes: entry.bytes,
      });
    }
  }

  const verifiedRefKeys = new Set(entries.keys());
  const verifiedPaths = new Set(
    [...entries.values()].filter(entry => entry.sourceBucket === BLOG_BUCKET).map(entry => entry.sourcePath)
  );
  const targetByKey = new Map([...entries.entries()]);
  const verified = references.filter(ref => verifiedRefKeys.has(ref.key));

  const plan = buildPlan({
    identity: freshIdentity,
    publicBase,
    sourceOrigin,
    verifiedRefKeys,
    verifiedPaths,
    savedRows,
    blogRows,
    postRows,
    targetByKey,
  });
  const planSha256 = sha256Text(JSON.stringify(plan));

  return Object.freeze({
    ok: missing.length === 0,
    manifest_sha256: freshIdentity.manifestSha256,
    reference_count: references.length + failures.length,
    verified_count: verified.length,
    target_count: entries.size,
    missing_count: missing.length,
    source_etag_unbound: sourceETagUnbound,
    verified: Object.freeze(verified.map(ref => Object.freeze({ ...ref }))),
    missing: Object.freeze(missing.map(item => Object.freeze({ ...item }))),
    plan: Object.freeze(plan),
    plan_sha256: planSha256,
  });
}

/**
 * Reject traversal and any existing symlink or non-directory parent. The final
 * file may be absent; `wx` later refuses to overwrite.
 */
async function assertSafeNewFilePath(rootResolved, targetPath) {
  const target = path.resolve(targetPath);
  const rel = path.relative(rootResolved, target);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes the backup directory: ${targetPath}`);
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
    if (isLast) throw new Error(`Refusing to overwrite an existing file: ${segments.join('/')}`);
    if (!stats.isDirectory()) throw new Error(`Non-directory parent: ${segments.slice(0, index + 1).join('/')}`);
  }
}

/** Write the canonical plan and its digest, `wx` + mode 0400, no overwrite. */
export async function writeReferencePlan(backupDir, plan, { planPath, planDigestPath } = {}) {
  const rootResolved = path.resolve(required(backupDir, 'backup directory'));
  const text = JSON.stringify(plan);
  const digest = sha256Text(text);
  const resolvedPlanPath = planPath ?? path.join(rootResolved, PLAN_FILE);
  const resolvedDigestPath = planDigestPath ?? path.join(rootResolved, PLAN_DIGEST_FILE);
  await assertSafeNewFilePath(rootResolved, resolvedPlanPath);
  await assertSafeNewFilePath(rootResolved, resolvedDigestPath);
  await fs.writeFile(resolvedPlanPath, text, { flag: 'wx', mode: 0o400 });
  await fs.writeFile(resolvedDigestPath, `${digest}\n`, { flag: 'wx', mode: 0o400 });
  return { planPath: resolvedPlanPath, digestPath: resolvedDigestPath, digest };
}

// =============================================================================
// CLI: guarded operator verify and apply
// =============================================================================

const REFERENCE_VALUE_FLAGS = { '--manifest': 'manifest', '--plan': 'plan', '--digest': 'digest' };

/** Strict flag parser: no unknown flag, no duplicate flag, no missing value. */
export function parseReferenceFlags(args = []) {
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
    const key = REFERENCE_VALUE_FLAGS[arg];
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

/** Resolve a `--plan`/`--digest` value to a safe child path inside the run dir. */
function resolveChildPath(rootResolved, value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a child filename`);
  }
  if (CONTROL_CHAR_REGEX.test(value) || path.isAbsolute(value)) {
    throw new Error(`${label} must be a safe child filename`);
  }
  const root = path.resolve(rootResolved);
  const resolved = path.resolve(root, value);
  const rel = path.relative(root, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`${label} escapes the backup directory`);
  }
  return resolved;
}

/** Full native JSON rows for every current reference table. No Date coercion. */
export async function loadCurrentReferenceRows(db) {
  if (!db || typeof db.query !== 'function') {
    throw new Error('loadCurrentReferenceRows requires a db client');
  }
  const [saved, blog, posts] = await Promise.all([
    db.query('SELECT to_jsonb(si) AS row FROM public.saved_images AS si ORDER BY si.id'),
    db.query('SELECT to_jsonb(bi) AS row FROM public.blog_images AS bi ORDER BY bi.id'),
    db.query('SELECT to_jsonb(bp) AS row FROM public.blog_posts AS bp ORDER BY bp.id'),
  ]);
  return Object.freeze({
    savedRows: Object.freeze(saved.rows.map(entry => entry.row)),
    blogRows: Object.freeze(blog.rows.map(entry => entry.row)),
    postRows: Object.freeze(posts.rows.map(entry => entry.row)),
  });
}

function assertOperatorInputs({ manifest, config, createDb, runner }) {
  const backupRunDir = required(manifest, '--manifest <backup-run-dir>');
  if (!config || typeof config !== 'object' || typeof config.signing !== 'object') {
    throw new Error('operator config with signing is required');
  }
  if (typeof createDb !== 'function') throw new Error('a database factory is required');
  if (typeof runner !== 'function') throw new Error('a process runner is required');
  return backupRunDir;
}

function assertSupabaseSource(identity, command) {
  if (identity.sourceStore !== 'supabase') {
    throw new Error(`${command} requires a Supabase source backup: ${identity.sourceStore}`);
  }
}

/** Compact report: counts plus each missing source id and reason. */
function missingReport(result) {
  return result.missing.map(item => `${item.sourceId}:${item.reason}`).join(', ');
}

/**
 * Read-only reference verify command with injected dependencies. It always
 * closes the database, writes the frozen plan only when verification is `ok`,
 * and returns nonzero (by throwing) with no plan file on any missing reference.
 */
export async function runVerifyReferencesCommand(deps = {}) {
  const {
    manifest,
    plan,
    digest,
    config,
    createDb,
    runner,
    engine = verifyR2References,
    loadIdentity = loadBackupIdentity,
    loadRows = loadCurrentReferenceRows,
    presignGet = presignGetUrl,
    fetchFn = fetch,
    writePlan = writeReferencePlan,
    log = () => {},
  } = deps;

  const backupRunDir = assertOperatorInputs({ manifest, config, createDb, runner });
  const identity = await loadIdentity(backupRunDir);
  assertSupabaseSource(identity, 'verify');

  const db = await createDb(config.dbConfig);
  let result;
  try {
    const rows = await loadRows(db);
    result = await engine({
      identity,
      savedRows: rows.savedRows,
      blogRows: rows.blogRows,
      postRows: rows.postRows,
      signing: config.signing,
      presignGet,
      fetchFn,
      runner,
    });
  } finally {
    await db.end();
  }

  log(
    `[storage] verify references=${result.reference_count} verified=${result.verified_count} ` +
      `targets=${result.target_count} missing=${result.missing_count}`
  );

  if (result.ok !== true) {
    const error = new Error(
      `Reference verification failed with ${result.missing_count} missing reference(s): ${missingReport(result)}`
    );
    error.result = result;
    throw error;
  }

  const planPath = plan ? resolveChildPath(identity.runDir, plan, '--plan') : undefined;
  const planDigestPath = digest ? resolveChildPath(identity.runDir, digest, '--digest') : undefined;
  const written = await writePlan(identity.runDir, result.plan, { planPath, planDigestPath });
  log(`[storage] wrote reference plan ${written.planPath}`);
  return Object.freeze({ result, ...written });
}

/**
 * Apply command with injected dependencies. The confirm guard runs before the
 * database factory or any loader. The injected apply engine owns the ordering:
 * a fresh two-machine database backup is proven before any UPDATE, and a missing
 * baseline blog reference is never waived. Sources are only ever read.
 */
export async function runApplyReferencesCommand(deps = {}) {
  const {
    manifest,
    plan,
    digest,
    confirm,
    config,
    createDb,
    runner,
    engine = verifyR2References,
    loadIdentity = loadBackupIdentity,
    loadRows = loadCurrentReferenceRows,
    presignGet = presignGetUrl,
    fetchFn = fetch,
    apply,
    freshBackup,
    resolveCheckoutRoot,
    log = () => {},
  } = deps;

  if (confirm !== true) {
    throw new Error('apply requires --confirm before any credential, process or database work');
  }
  const backupRunDir = assertOperatorInputs({ manifest, config, createDb, runner });
  if (typeof apply !== 'function') throw new Error('apply requires the reference apply engine');
  if (typeof freshBackup !== 'function') throw new Error('apply requires a fresh database backup function');
  if (typeof resolveCheckoutRoot !== 'function') throw new Error('apply requires a checkout root resolver');

  const identity = await loadIdentity(backupRunDir);
  assertSupabaseSource(identity, 'apply');

  const planPath = plan ? resolveChildPath(identity.runDir, plan, '--plan') : undefined;
  const planDigestPath = digest ? resolveChildPath(identity.runDir, digest, '--digest') : undefined;

  const db = await createDb(config.dbConfig);
  try {
    const verifyCurrent = async () => {
      const rows = await loadRows(db);
      return engine({
        identity,
        savedRows: rows.savedRows,
        blogRows: rows.blogRows,
        postRows: rows.postRows,
        signing: config.signing,
        presignGet,
        fetchFn,
        runner,
      });
    };
    const result = await apply({
      identity,
      planPath,
      planDigestPath,
      db,
      verifyCurrent,
      verifyFreshDatabaseBackup: async () => {
        const repoRoot = await resolveCheckoutRoot({ runner });
        return freshBackup({ repoRoot, runner });
      },
    });
    log(`[storage] applied ${result.applied.total} reference row(s)`);
    return result;
  } finally {
    await db.end();
  }
}

/** Capture current source metadata separately; never rewrite a historical backup. */
export async function runSourceProofCommand({ manifest, config, createDb, log = () => {} }) {
  const identity = await loadBackupIdentity(path.resolve(required(manifest, 'manifest')));
  assertSupabaseSource(identity, 'source-proof');
  const checkpointPath = path.join(identity.runDir, 'backup-checkpoint.json');
  await assertSafeRegularFile(identity.runDir, checkpointPath);
  const checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
  const { exactTimestampMicros } = await import('./backup-and-purge.mjs');
  const milliseconds = value => {
    const micros = exactTimestampMicros(value);
    if (micros === null) throw new Error('Invalid source identity timestamp');
    return micros / 1000n;
  };
  const db = await createDb(config.dbConfig);
  let sources;
  try {
    await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    sources = (await db.query(
      'SELECT to_jsonb(o) AS row FROM storage.objects AS o WHERE bucket_id = ANY($1::text[])',
      [[...new Set(identity.manifest.map(row => row.bucket))]]
    )).rows.map(entry => entry.row);
  } finally {
    try { await db.query('ROLLBACK'); } finally { await db.end(); }
  }
  const byKey = new Map(sources.map(row => [`${row.bucket_id}::${row.name}`, row]));
  const rows = identity.manifest.map(row => {
    const key = `${row.bucket}::${row.path}`;
    const source = byKey.get(key);
    const frozen = checkpoint.downloaded?.[key];
    if (!source || !frozen || source.id !== frozen.version ||
        typeof source.version !== 'string' || source.version.length === 0 ||
        Number(source.metadata?.size) !== row.bytes ||
        milliseconds(source.created_at) !== milliseconds(frozen.created_at) ||
        milliseconds(source.updated_at) !== milliseconds(frozen.updated_at)) {
      throw new Error(`Changed or missing source identity: ${key}`);
    }
    if (typeof source.metadata?.eTag !== 'string') throw new Error(`Missing source eTag: ${key}`);
    return { ...row, object_metadata: source.metadata };
  });
  const verified = await verifyFrozenArtifacts({ runDir: identity.runDir, rows });
  if (verified.etagUnbound !== 0) throw new Error('Incomplete source eTag proof');
  const proof = {
    manifest_sha256: identity.manifestSha256,
    captured_at: new Date().toISOString(),
    objects: identity.manifest.map(row => ({
      bucket: row.bucket, path: row.path, source: byKey.get(`${row.bucket}::${row.path}`),
    })),
  };
  await writeReferencePlan(identity.runDir, proof, {
    planPath: path.join(identity.runDir, 'source-object-proof.json'),
    planDigestPath: path.join(identity.runDir, 'source-object-proof.digest'),
  });
  log(`[storage] captured ${proof.objects.length} source object identities; cutover remains gated`);
  return proof;
}

/** Fill only the dependencies the caller did not inject; secrets load last. */
async function resolveReferenceDeps(deps, needsApply) {
  const resolved = { ...deps };
  if (resolved.config == null) {
    const { loadR2OperatorConfig } = await import(
      /* @vite-ignore */ './r2-gallery-operator-adapters.mjs'
    );
    resolved.config = loadR2OperatorConfig();
  }
  if (resolved.createDb == null) {
    const { createDb } = await import(/* @vite-ignore */ './backup-and-purge.mjs');
    resolved.createDb = createDb;
  }
  if (resolved.runner == null) resolved.runner = defaultRunner;
  if (needsApply) {
    if (resolved.apply == null) {
      const { runReferenceApply } = await import(/* @vite-ignore */ './r2-reference-apply.mjs');
      resolved.apply = runReferenceApply;
    }
    if (resolved.freshBackup == null || resolved.resolveCheckoutRoot == null) {
      const gate = await import(/* @vite-ignore */ './database-backup-gate.mjs');
      if (resolved.freshBackup == null) resolved.freshBackup = gate.verifyFreshDatabaseBackup;
      if (resolved.resolveCheckoutRoot == null) {
        resolved.resolveCheckoutRoot = gate.resolvePrimaryCheckoutRoot;
      }
    }
  }
  return resolved;
}

function usage() {
  process.stdout.write(
    [
      'Usage: node scripts/storage/verify-r2-references.mjs <command>',
      '  help',
      '  source-proof --manifest <backup-run-dir>',
      '  verify --manifest <backup-run-dir> [--plan <file>] [--digest <file>]',
      '  apply  --manifest <backup-run-dir> --confirm [--plan <file>] [--digest <file>]',
    ].join('\n') + '\n'
  );
}

export async function runVerifyReferencesCli(argv, deps = {}) {
  const [command, ...rest] = argv;
  const writeLog = line => process.stdout.write(`${line}\n`);
  switch (command) {
    case 'help':
    case undefined:
      return usage();
    case 'source-proof': {
      const flags = parseReferenceFlags(rest);
      if (!flags.manifest) throw new Error('missing required --manifest <backup-run-dir>');
      if (flags.confirm || flags.plan || flags.digest) throw new Error('source-proof accepts only --manifest');
      const resolved = await resolveReferenceDeps(deps, false);
      return runSourceProofCommand({ ...resolved, manifest: flags.manifest, log: resolved.log ?? writeLog });
    }
    case 'verify': {
      const flags = parseReferenceFlags(rest);
      if (!flags.manifest) throw new Error('missing required --manifest <backup-run-dir>');
      const resolved = await resolveReferenceDeps(deps, false);
      return runVerifyReferencesCommand({ ...resolved, ...flags, log: resolved.log ?? writeLog });
    }
    case 'apply': {
      const flags = parseReferenceFlags(rest);
      if (flags.confirm !== true) {
        throw new Error('apply requires --confirm before reading credentials');
      }
      if (!flags.manifest) throw new Error('missing required --manifest <backup-run-dir>');
      const resolved = await resolveReferenceDeps(deps, true);
      return runApplyReferencesCommand({ ...resolved, ...flags, log: resolved.log ?? writeLog });
    }
    default:
      usage();
      process.exitCode = 1;
  }
}

async function main() {
  await runVerifyReferencesCli(process.argv.slice(2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`[verify-r2-references] error: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
