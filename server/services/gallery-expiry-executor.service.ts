/**
 * PRD-SQR-04 verified gallery-expiry executor.
 *
 * Deletes one fully-verified image at a time. Recovery runs before new claims,
 * and every claim is restored from its immutable archive unless the object is
 * proven gone and the atomic finish confirms the exact row delete. The executor
 * never deletes an archive, a user-wide row, or a saved_images row directly.
 * Registry, claim, recover, finish, and release live in SQL; this file only
 * drives them and does the R2 identity checks.
 */

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

import {
  buildSavedKey,
  deleteObject,
  head,
  restoreGalleryArchive,
  R2_PRIVATE_BUCKET,
} from './r2-storage.service';

const MAX_ITEMS_PER_RUN = 10;
const RUN_BUDGET_MS = 20_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_LOWER_RE = /^[0-9a-f]{64}$/;
const MAX_ETAG_LENGTH = 130;
const ARCHIVE_PREFIX = 'archive/gallery/';

export interface IVerifiedGalleryExpiryResult {
  /** Registry items handled this run (recovery plus new claims). */
  processed: number;
  /** Images actually deleted after an atomic finish returned `completed`. */
  deleted: number;
  /** Images restored from the immutable archive after a claim. */
  recovered: number;
  /** Items left in `deleting` or errors that need operator review. */
  failed: number;
}

export interface IGalleryExpiryRegistryRow {
  image_id: string;
  user_id: string;
  storage_path: string;
  saved_row: unknown;
  sha256: string;
  size_bytes: number | string;
  source_etag: string | null;
  archive_key: string;
  archive_etag: string | null;
  state: string;
  attempt_id: string | null;
  started_at: string | null;
}

interface IHeadIdentity {
  status: number;
  etag: string | null;
  contentLength: number | null;
  /** True when the object carries any encoding other than an explicit identity. */
  hasEncoding: boolean;
}

/** A quoted, non-empty, strong ETag with no inner quote or ASCII control character. */
function isQuotedStrongEtag(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 2 || value.length > MAX_ETAG_LENGTH) return false;
  if (!value.startsWith('"') || !value.endsWith('"')) return false;
  const inner = value.slice(1, -1);
  if (inner.length === 0) return false;
  return ![...inner].some(character => {
    const code = character.charCodeAt(0);
    return character === '"' || code <= 0x1f || code === 0x7f;
  });
}

/** Mirrors the storage service key guard so no IO happens on an unsafe key. */
function isSafeSavedKey(key: string): boolean {
  if (key.length === 0 || key.startsWith('/') || key.endsWith('/')) return false;
  if (key.includes('..') || key.includes('\\')) return false;
  return ![...key].some(character => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function parseLength(value: string | null): number | null {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readFinishState(data: unknown): 'completed' | 'restore_required' | 'unknown' {
  if (data === 'completed' || data === 'restore_required') return data;
  if (data && typeof data === 'object') {
    const state = (data as { state?: unknown }).state;
    if (state === 'completed' || state === 'restore_required') return state;
  }
  return 'unknown';
}

/** The registry snapshot must bind exactly to the row identity and be R2-backed. */
function savedRowBinds(row: IGalleryExpiryRegistryRow): boolean {
  if (row.saved_row === null || typeof row.saved_row !== 'object') return false;
  const snapshot = row.saved_row as Record<string, unknown>;
  return (
    snapshot.id === row.image_id &&
    snapshot.user_id === row.user_id &&
    snapshot.storage_path === row.storage_path &&
    snapshot.storage_backend === 'r2'
  );
}

function isValidBinding(row: IGalleryExpiryRegistryRow): boolean {
  if (!UUID_RE.test(row.image_id) || !UUID_RE.test(row.user_id)) return false;
  if (typeof row.storage_path !== 'string' || row.storage_path.length === 0) return false;
  if (row.storage_path.startsWith('/') || row.storage_path.includes('..')) return false;
  if (!isSafeSavedKey(buildSavedKey(row.storage_path))) return false;
  if (!savedRowBinds(row)) return false;
  if (typeof row.sha256 !== 'string' || !SHA256_LOWER_RE.test(row.sha256)) return false;
  const sizeBytes = Number(row.size_bytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return false;
  if (!isQuotedStrongEtag(row.source_etag)) return false;
  if (!isQuotedStrongEtag(row.archive_etag)) return false;
  if (row.archive_key !== `${ARCHIVE_PREFIX}${row.image_id}/${row.sha256}`) return false;
  if (typeof row.attempt_id !== 'string' || !UUID_RE.test(row.attempt_id)) return false;
  return true;
}

async function savedImageExists(imageId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('saved_images')
    .select('id')
    .eq('id', imageId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load saved image: ${error.message}`);
  return data !== null;
}

async function headIdentity(key: string): Promise<IHeadIdentity> {
  const response = await head(R2_PRIVATE_BUCKET, key);
  const encoding = response.headers.get('content-encoding');
  return {
    status: response.status,
    etag: response.headers.get('etag'),
    contentLength: parseLength(response.headers.get('content-length')),
    hasEncoding: encoding !== null && encoding.toLowerCase() !== 'identity',
  };
}

function matchesSource(identity: IHeadIdentity, row: IGalleryExpiryRegistryRow): boolean {
  return (
    identity.status === 200 &&
    identity.etag === row.source_etag &&
    identity.contentLength === Number(row.size_bytes) &&
    !identity.hasEncoding
  );
}

function matchesArchive(identity: IHeadIdentity, row: IGalleryExpiryRegistryRow): boolean {
  return (
    identity.status === 200 &&
    identity.etag === row.archive_etag &&
    identity.contentLength === Number(row.size_bytes) &&
    !identity.hasEncoding
  );
}

async function restoreRow(row: IGalleryExpiryRegistryRow): Promise<string> {
  const restored: unknown = await restoreGalleryArchive({
    imageId: row.image_id,
    sha256: row.sha256,
    storagePath: row.storage_path,
    archiveEtag: row.archive_etag as string,
    sourceEtag: row.source_etag as string,
    sizeBytes: Number(row.size_bytes),
  });
  const etag =
    typeof restored === 'string' ? restored : (restored as { etag?: string } | null)?.etag;
  if (!etag) throw new Error('restoreGalleryArchive returned no ETag');
  return etag;
}

async function releaseRow(row: IGalleryExpiryRegistryRow, sourceEtag: string): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc('release_gallery_expiry_image', {
    p_image_id: row.image_id,
    p_attempt_id: row.attempt_id,
    p_source_etag: sourceEtag,
  });
  if (error) throw new Error(`Failed to release gallery expiry image: ${error.message}`);
  if (data !== true) throw new Error('Gallery expiry release did not match a deleting attempt');
}

/** Restore from the archive and release the claim only on verified success. */
async function restoreAndRelease(row: IGalleryExpiryRegistryRow): Promise<boolean> {
  try {
    const etag = await restoreRow(row);
    await releaseRow(row, etag);
    return true;
  } catch {
    return false;
  }
}

/** Restore a claimed image; a failed restore counts as `failed` and stops new claims. */
async function resolveRestore(
  row: IGalleryExpiryRegistryRow,
  counters: IVerifiedGalleryExpiryResult
): Promise<boolean> {
  if (await restoreAndRelease(row)) {
    counters.recovered += 1;
    return true;
  }
  counters.failed += 1;
  return false;
}

async function finishClaim(row: IGalleryExpiryRegistryRow): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('finish_gallery_expiry_image', {
    p_image_id: row.image_id,
    p_attempt_id: row.attempt_id,
  });
  if (error) throw new Error(`Failed to finish gallery expiry image: ${error.message}`);
  return readFinishState(data);
}

async function leaseRecoverable(): Promise<IGalleryExpiryRegistryRow[] | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc('recover_gallery_expiry_images', {
      p_limit: 1,
    });
    if (error) return null;
    return (data ?? []) as IGalleryExpiryRegistryRow[];
  } catch {
    return null;
  }
}

async function claimOne(): Promise<IGalleryExpiryRegistryRow[] | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc('claim_gallery_expiry_images', {
      p_limit: 1,
    });
    if (error) return null;
    return (data ?? []) as IGalleryExpiryRegistryRow[];
  } catch {
    return null;
  }
}

/**
 * Recovery: an unfinished deleting row may belong to a user who is active or
 * paid now. If the image row still exists, always restore it and never delete.
 * An absent row completes the journal without touching storage.
 *
 * The binding is validated before any DB or storage IO. On any uncertainty the
 * caller stops new claims so an operator can review the retained row.
 */
async function recoverOne(
  row: IGalleryExpiryRegistryRow,
  counters: IVerifiedGalleryExpiryResult
): Promise<'continue' | 'stop'> {
  if (!isValidBinding(row)) {
    counters.failed += 1;
    return 'stop';
  }

  let exists: boolean;
  try {
    exists = await savedImageExists(row.image_id, row.user_id);
  } catch {
    counters.failed += 1;
    return 'stop';
  }

  if (exists) {
    return (await resolveRestore(row, counters)) ? 'continue' : 'stop';
  }

  let state: string;
  try {
    state = await finishClaim(row);
  } catch {
    counters.failed += 1;
    return 'stop';
  }
  if (state !== 'completed') {
    counters.failed += 1;
    return 'stop';
  }
  return 'continue';
}

/**
 * New claim: verify source and archive identity, delete only the saved object,
 * require an exact 404, then finish atomically. Any mismatch, error, or
 * uncertain commit stops further new claims; a changed source is never deleted
 * or overwritten and stays `deleting` for operator review.
 */
async function expireOne(
  row: IGalleryExpiryRegistryRow,
  counters: IVerifiedGalleryExpiryResult
): Promise<'continue' | 'stop'> {
  if (!isValidBinding(row)) {
    counters.failed += 1;
    return 'stop';
  }

  const savedKey = buildSavedKey(row.storage_path);
  if (!isSafeSavedKey(savedKey)) {
    counters.failed += 1;
    return 'stop';
  }

  let original: IHeadIdentity;
  try {
    original = await headIdentity(savedKey);
  } catch {
    counters.failed += 1;
    return 'stop';
  }

  if (original.status === 404) {
    return (await resolveRestore(row, counters)) ? 'continue' : 'stop';
  }

  if (!matchesSource(original, row)) {
    counters.failed += 1;
    return 'stop';
  }

  let archive: IHeadIdentity;
  try {
    archive = await headIdentity(row.archive_key);
  } catch {
    counters.failed += 1;
    return 'stop';
  }

  if (!matchesArchive(archive, row)) {
    await resolveRestore(row, counters);
    return 'stop';
  }

  try {
    await deleteObject(R2_PRIVATE_BUCKET, savedKey);
  } catch {
    await resolveRestore(row, counters);
    return 'stop';
  }

  let after: IHeadIdentity;
  try {
    after = await headIdentity(savedKey);
  } catch {
    await resolveRestore(row, counters);
    return 'stop';
  }

  if (after.status !== 404) {
    await resolveRestore(row, counters);
    return 'stop';
  }

  let state: string;
  try {
    state = await finishClaim(row);
  } catch {
    await resolveRestore(row, counters);
    return 'stop';
  }

  if (state === 'completed') {
    counters.deleted += 1;
    return 'continue';
  }

  await resolveRestore(row, counters);
  return 'stop';
}

/**
 * Run one bounded verified-expiry pass. Recovery runs first, then at most ten
 * items total within a twenty-second budget, one claim at a time.
 */
export async function runVerifiedGalleryExpiry(): Promise<IVerifiedGalleryExpiryResult> {
  const counters: IVerifiedGalleryExpiryResult = {
    processed: 0,
    deleted: 0,
    recovered: 0,
    failed: 0,
  };
  const deadline = Date.now() + RUN_BUDGET_MS;
  let handled = 0;
  let stopNewClaims = false;

  while (!stopNewClaims && handled < MAX_ITEMS_PER_RUN && Date.now() < deadline) {
    const rows = await leaseRecoverable();
    if (rows === null) {
      stopNewClaims = true;
      break;
    }
    const row = rows[0];
    if (!row) break;
    handled += 1;
    counters.processed += 1;
    if ((await recoverOne(row, counters)) === 'stop') {
      stopNewClaims = true;
      break;
    }
  }

  while (!stopNewClaims && handled < MAX_ITEMS_PER_RUN && Date.now() < deadline) {
    const rows = await claimOne();
    if (rows === null) {
      counters.failed += 1;
      break;
    }
    const row = rows[0];
    if (!row) break;
    handled += 1;
    counters.processed += 1;
    if ((await expireOne(row, counters)) === 'stop') stopNewClaims = true;
  }

  return counters;
}
