/**
 * Gallery Expiry Read Fallback (SQR-04)
 *
 * While the expiry executor is deleting a saved image, its original `saved/...`
 * object may already be gone. The operator backup job records an immutable
 * `archive/...` copy in the private `gallery_expiry_backups` journal before the
 * image becomes claimable. Gallery reads use this helper to pick the archive key
 * for any image whose registry row is `ready` or `deleting`, so a crash between
 * object delete and row delete never leaves an unreadable DB reference.
 *
 * A `ready` proof is included on purpose: an attempt UUID fences SQL completion
 * but cannot fence a stale worker's external R2 DELETE. That stale worker may
 * delete the original after a newer worker restored and released the row back to
 * `ready`, then crash. Reading the archive for `ready` too preserves availability
 * through that race. `completed` is excluded because its DB row is already gone.
 *
 * Fail closed: a lookup error or a malformed/foreign proof throws. Callers must
 * never silently fall back to the potentially deleted original key.
 */

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

import { buildSavedKey } from './r2-storage.service';

export interface IGalleryObjectRow {
  id: string;
  storage_path: string;
}

interface IGalleryExpiryBackupEntry {
  image_id: string;
  user_id: string;
  storage_path: string;
  sha256: string;
  archive_key: string;
}

/** The registry's archive key is exactly `archive/gallery/<imageUUID>/<sha256>`. */
const SHA256_LOWER_HEX = /^[0-9a-f]{64}$/;

export function deriveGalleryArchiveKey(imageId: string, sha256: string): string {
  return `archive/gallery/${imageId}/${sha256}`;
}

/**
 * Resolve the private R2 object key for each supplied owned image.
 *
 * @param userId - The authenticated owner; the registry lookup is scoped to it.
 * @param images - Owner-filtered rows: `{ id, storage_path }`.
 * @returns image id -> R2 key. Archive key when a valid `ready` or `deleting`
 *          row exists, otherwise `buildSavedKey(storage_path)`.
 * @throws Error when the registry lookup fails, or any returned proof is foreign
 *         or malformed. Never signs an arbitrary key.
 */
export async function resolveGalleryObjectKeys(
  userId: string,
  images: IGalleryObjectRow[]
): Promise<Map<string, string>> {
  const keyByImageId = new Map<string, string>();
  if (images.length === 0) {
    return keyByImageId;
  }

  const ownedPathById = new Map<string, string>();
  for (const image of images) {
    ownedPathById.set(image.id, image.storage_path);
    keyByImageId.set(image.id, buildSavedKey(image.storage_path));
  }

  const { data, error } = await supabaseAdmin
    .from('gallery_expiry_backups')
    .select('image_id,user_id,storage_path,sha256,archive_key')
    .eq('user_id', userId)
    .in('state', ['ready', 'deleting'])
    .in('image_id', [...ownedPathById.keys()]);

  if (error) {
    throw new Error(`Failed to load gallery expiry registry: ${error.message}`);
  }

  for (const entry of (data ?? []) as IGalleryExpiryBackupEntry[]) {
    const ownedPath = ownedPathById.get(entry?.image_id);
    const isOwnedProof =
      ownedPath !== undefined &&
      entry.user_id === userId &&
      entry.storage_path === ownedPath &&
      typeof entry.sha256 === 'string' &&
      SHA256_LOWER_HEX.test(entry.sha256) &&
      entry.archive_key === deriveGalleryArchiveKey(entry.image_id, entry.sha256);
    if (!isOwnedProof) {
      throw new Error('Invalid gallery expiry backup registration');
    }
    keyByImageId.set(entry.image_id, entry.archive_key);
  }

  return keyByImageId;
}
