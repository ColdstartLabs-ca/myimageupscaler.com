/**
 * Gallery Cleanup Service
 * Handles cleanup of gallery images for inactive free users
 *
 * Cleanup Rules:
 * - Only affects users with subscription_tier = 'free' (or null)
 * - Inactivity = profile.updated_at > 30 days ago
 * - Delete both storage files AND database records
 * - Process in batches of 50 to avoid timeouts
 */

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { GALLERY_STORAGE_CONFIG } from '@shared/config/gallery.config';
import { isUuidShaped } from '@shared/validation/uuid';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Number of days of inactivity before cleanup
 */
const INACTIVITY_DAYS = 30;

/**
 * Batch size for processing (to avoid timeouts)
 */
const BATCH_SIZE = 50;

/**
 * Bucket name for storage operations
 */
const BUCKET_NAME = GALLERY_STORAGE_CONFIG.bucketName;
const UPSCALE_INPUT_BUCKET_NAME = 'upscale-inputs';
const UPSCALE_INPUT_TTL_MS = 60 * 60 * 1000;
const STORAGE_PAGE_LIMIT = 100;
const CLEANUP_STATE_VERSION = 1;
const CLEANUP_STATE_PATH = '_system/gallery-cleanup-state.png';
const CLEANUP_STATE_VERSION_KEY = 'cleanup_version';
const CLEANUP_STATE_CURSOR_KEY = 'cleanup_cursor';
const CLEANUP_CURSOR_MAX_LENGTH = 4096;
// The input bucket permits image MIME types only, so the opaque cursor lives in
// metadata on a reserved valid image object rather than in a user-visible path.
const CLEANUP_STATE_IMAGE = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0,
  0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 100, 248, 15, 0, 1, 5, 1, 1, 39, 24,
  227, 102, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);
const UPSCALE_INPUT_EXTENSION_PATTERN = /\.(?:jpg|png|webp|heic)$/i;

// =============================================================================
// Types
// =============================================================================

/**
 * Result of identifying inactive users
 */
export interface IInactiveUsersResult {
  /** Array of user IDs that are inactive */
  userIds: string[];
  /** Total count found */
  total: number;
}

/**
 * Result of cleaning up a single user's gallery
 */
export interface IUserCleanupResult {
  /** User ID that was cleaned */
  userId: string;
  /** Number of images deleted */
  imagesDeleted: number;
  /** Whether cleanup was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of running the full cleanup job
 */
export interface ICleanupJobResult {
  /** Number of users processed */
  usersProcessed: number;
  /** Total images deleted */
  imagesDeleted: number;
  /** Individual user results */
  results: IUserCleanupResult[];
  /** Timestamp of cleanup run */
  timestamp: string;
  /** Number of orphaned direct-upload input objects deleted */
  upscaleInputsDeleted: number;
  /** Number of orphaned input objects in failed deletion batches */
  upscaleInputsFailed: number;
}

export interface IUpscaleInputCleanupResult {
  deleted: number;
  failed: number;
}

type StorageBucket = ReturnType<typeof supabaseAdmin.storage.from>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStorageErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return 'Unknown storage error';
}

function isNotFoundStorageError(error: unknown): boolean {
  if (!isRecord(error)) return false;

  return error.status === 404 || error.statusCode === 404 || error.statusCode === '404';
}

function isValidCleanupCursor(cursor: unknown): cursor is string {
  if (
    typeof cursor !== 'string' ||
    cursor.length === 0 ||
    cursor.length > CLEANUP_CURSOR_MAX_LENGTH
  ) {
    return false;
  }

  return [...cursor].every(character => {
    const code = character.charCodeAt(0);
    return code > 0x1f && code !== 0x7f;
  });
}

async function readCleanupCursor(bucket: StorageBucket): Promise<string | null> {
  const { data, error } = await bucket.info(CLEANUP_STATE_PATH);

  if (error) {
    if (isNotFoundStorageError(error)) return null;
    throw new Error(
      `Failed to restore temporary upscale input cleanup state: ${getStorageErrorMessage(error)}`
    );
  }

  if (!data) return null;

  const metadata: unknown = data.metadata;
  if (!isRecord(metadata)) return null;

  // storage-js recursively camel-cases metadata returned by info(), while
  // older clients may still expose the keys exactly as they were uploaded.
  const version = metadata.cleanupVersion ?? metadata[CLEANUP_STATE_VERSION_KEY];
  if (version !== String(CLEANUP_STATE_VERSION)) {
    return null;
  }

  const cursor = metadata.cleanupCursor ?? metadata[CLEANUP_STATE_CURSOR_KEY];
  return isValidCleanupCursor(cursor) ? cursor : null;
}

async function persistCleanupCursor(bucket: StorageBucket, cursor: string | null): Promise<void> {
  const { error } = await bucket.upload(CLEANUP_STATE_PATH, CLEANUP_STATE_IMAGE, {
    contentType: 'image/png',
    metadata: {
      [CLEANUP_STATE_VERSION_KEY]: String(CLEANUP_STATE_VERSION),
      [CLEANUP_STATE_CURSOR_KEY]: cursor ?? '',
    },
    upsert: true,
  });

  if (error) {
    throw new Error(
      `Failed to persist temporary upscale input cleanup state: ${getStorageErrorMessage(error)}`
    );
  }
}

function getDirectUpscaleInputPath(file: { key: string }): string | null {
  const segments = file.key.split('/');
  const objectName = segments[1];
  const extension = objectName ? UPSCALE_INPUT_EXTENSION_PATTERN.exec(objectName)?.[0] : undefined;
  const objectId = extension && objectName ? objectName.slice(0, -extension.length) : undefined;

  // Keep cleaning UUID-shaped files admitted before the UUIDv4 contract was enforced.
  if (
    segments.length !== 2 ||
    !segments[0] ||
    !objectId ||
    !isUuidShaped(objectId)
  ) {
    return null;
  }

  return file.key;
}

// =============================================================================
// PUBLIC FUNCTIONS
// =============================================================================

/**
 * Remove direct-upload input objects that outlived the processing request.
 *
 * The request route deletes successful and handled-failure inputs in `finally`,
 * but a terminated Worker cannot run that cleanup. Only direct UUID-named input
 * files are eligible; nested `outputs/` objects remain available for delivery.
 */
export async function cleanupStaleUpscaleInputs(
  now = new Date()
): Promise<IUpscaleInputCleanupResult> {
  const bucket = supabaseAdmin.storage.from(UPSCALE_INPUT_BUCKET_NAME);
  const staleBefore = now.getTime() - UPSCALE_INPUT_TTL_MS;
  const cursor = await readCleanupCursor(bucket);
  const listOptions = {
    limit: STORAGE_PAGE_LIMIT,
    prefix: '',
    ...(cursor ? { cursor } : {}),
    with_delimiter: false,
    sortBy: { column: 'name' as const, order: 'asc' as const },
  };
  const { data, error } = await bucket.listV2(listOptions);

  if (error) {
    throw new Error(`Failed to list temporary upscale inputs: ${getStorageErrorMessage(error)}`);
  }
  if (!data || !Array.isArray(data.objects)) {
    throw new Error('Failed to list temporary upscale inputs: invalid list response');
  }
  if (data.objects.length > STORAGE_PAGE_LIMIT) {
    throw new Error('Failed to list temporary upscale inputs: page exceeded cleanup limit');
  }

  const nextCursor: string | null = data.hasNext ? (data.nextCursor ?? null) : null;
  if (data.hasNext && (!isValidCleanupCursor(nextCursor) || nextCursor === cursor)) {
    throw new Error('Failed to list temporary upscale inputs: invalid continuation cursor');
  }

  let deleted = 0;
  let failed = 0;
  let deletionFailed = false;
  let batch: string[] = [];

  const deleteBatch = async (paths: string[]): Promise<boolean> => {
    const { error: removeError } = await bucket.remove(paths);
    if (removeError) {
      failed += paths.length;
      console.error(
        '[GalleryCleanup] Error deleting stale temporary inputs:',
        getStorageErrorMessage(removeError)
      );
      return false;
    }

    deleted += paths.length;
    return true;
  };

  for (const file of data.objects) {
    if (file.metadata == null || !file.created_at) continue;

    const inputPath = getDirectUpscaleInputPath(file);
    if (!inputPath) continue;

    const createdAt = Date.parse(file.created_at);
    if (!Number.isFinite(createdAt) || createdAt >= staleBefore) continue;

    batch.push(inputPath);
    if (batch.length < BATCH_SIZE) continue;

    if (!(await deleteBatch(batch))) {
      deletionFailed = true;
      break;
    }
    batch = [];
  }

  if (!deletionFailed && batch.length > 0 && !(await deleteBatch(batch))) {
    deletionFailed = true;
  }

  await persistCleanupCursor(bucket, deletionFailed ? cursor : nextCursor);

  return { deleted, failed };
}

/**
 * Find all inactive free users with saved images
 * Inactive = profile.updated_at > 30 days ago
 *
 * @returns List of inactive user IDs
 */
export async function findInactiveFreeUsers(): Promise<IInactiveUsersResult> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - INACTIVITY_DAYS);

  // Step 1: Query for free users whose profiles haven't been updated in 30 days
  // Get tier (null or free) first, then filter status at application level for reliability
  const { data: freeUsers, error } = await supabaseAdmin
    .from('profiles')
    .select('id, subscription_status')
    .or('subscription_tier.is.null,subscription_tier.eq.free')
    .lt('updated_at', cutoffDate.toISOString());

  if (error) {
    console.error('[GalleryCleanup] Error finding inactive users:', error.message);
    throw new Error(`Failed to find inactive users: ${error.message}`);
  }

  if (!freeUsers || freeUsers.length === 0) {
    return { userIds: [], total: 0 };
  }

  // Step 2: Filter out users with active or trialing subscriptions (application-level filter)
  // This is more reliable than trying to do nested OR/AND in PostgREST
  const inactiveUsers = freeUsers.filter(
    user => user.subscription_status !== 'active' && user.subscription_status !== 'trialing'
  );

  if (inactiveUsers.length === 0) {
    return { userIds: [], total: 0 };
  }

  // Filter to only users who actually have saved images
  const userIds = inactiveUsers.map(u => u.id);
  const userIdsWithImages: string[] = [];

  // Check in batches to avoid query limits
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);
    const { data: usersWithImages, error: countError } = await supabaseAdmin
      .from('saved_images')
      .select('user_id')
      .in('user_id', batch);

    if (countError) {
      console.error('[GalleryCleanup] Error checking for images:', countError.message);
      continue;
    }

    // Get unique user IDs that have images
    const uniqueUserIds = [...new Set(usersWithImages?.map(img => img.user_id) || [])];
    userIdsWithImages.push(...uniqueUserIds);
  }

  console.log(
    `[GalleryCleanup] Found ${userIdsWithImages.length} inactive free users with saved images`
  );

  return {
    userIds: userIdsWithImages,
    total: userIdsWithImages.length,
  };
}

/**
 * Delete all gallery images for a specific user
 *
 * @param userId - The user ID to clean up
 * @returns Cleanup result for the user
 */
export async function cleanupUserGallery(userId: string): Promise<IUserCleanupResult> {
  try {
    // 1. Get all images for this user
    const { data: images, error: fetchError } = await supabaseAdmin
      .from('saved_images')
      .select('id, storage_path')
      .eq('user_id', userId);

    if (fetchError) {
      throw new Error(`Failed to fetch images: ${fetchError.message}`);
    }

    if (!images || images.length === 0) {
      return {
        userId,
        imagesDeleted: 0,
        success: true,
      };
    }

    const imageCount = images.length;
    console.log(`[GalleryCleanup] Cleaning up ${imageCount} images for user ${userId}`);

    // 2. Delete files from storage in batches
    const storagePaths = images.map(img => img.storage_path);

    for (let i = 0; i < storagePaths.length; i += BATCH_SIZE) {
      const batch = storagePaths.slice(i, i + BATCH_SIZE);
      const { error: storageError } = await supabaseAdmin.storage.from(BUCKET_NAME).remove(batch);

      if (storageError) {
        // Log but continue - we still want to delete DB records
        console.error(
          `[GalleryCleanup] Storage deletion error for user ${userId}:`,
          storageError.message
        );
      }
    }

    // 3. Delete database records
    const { error: dbError } = await supabaseAdmin
      .from('saved_images')
      .delete()
      .eq('user_id', userId);

    if (dbError) {
      throw new Error(`Failed to delete image records: ${dbError.message}`);
    }

    console.log(`[GalleryCleanup] Successfully deleted ${imageCount} images for user ${userId}`);

    return {
      userId,
      imagesDeleted: imageCount,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[GalleryCleanup] Error cleaning up user ${userId}:`, errorMessage);

    return {
      userId,
      imagesDeleted: 0,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Run the full cleanup job for all inactive free users
 *
 * @returns Summary of the cleanup job
 */
export async function runGalleryCleanup(): Promise<ICleanupJobResult> {
  console.log('[GalleryCleanup] Starting gallery cleanup job...');
  const startTime = Date.now();

  const results: IUserCleanupResult[] = [];
  let totalImagesDeleted = 0;
  let upscaleInputsDeleted = 0;
  let upscaleInputsFailed = 0;

  try {
    const inputCleanup = await cleanupStaleUpscaleInputs();
    upscaleInputsDeleted = inputCleanup.deleted;
    upscaleInputsFailed = inputCleanup.failed;
  } catch (error) {
    console.error(
      '[GalleryCleanup] Temporary upscale input cleanup failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }

  try {
    // 1. Find inactive free users with images
    const { userIds } = await findInactiveFreeUsers();

    if (userIds.length === 0) {
      console.log('[GalleryCleanup] No inactive users with images to clean up');
      return {
        usersProcessed: 0,
        imagesDeleted: 0,
        results: [],
        timestamp: new Date().toISOString(),
        upscaleInputsDeleted,
        upscaleInputsFailed,
      };
    }

    // 2. Process users in batches
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);

      // Process each user in the batch
      const batchResults = await Promise.all(batch.map(userId => cleanupUserGallery(userId)));

      results.push(...batchResults);
      totalImagesDeleted += batchResults.reduce((sum, result) => sum + result.imagesDeleted, 0);
    }

    const duration = Date.now() - startTime;
    console.log(
      `[GalleryCleanup] Cleanup complete: ${results.length} users processed, ${totalImagesDeleted} images deleted in ${duration}ms`
    );

    return {
      usersProcessed: results.length,
      imagesDeleted: totalImagesDeleted,
      results,
      timestamp: new Date().toISOString(),
      upscaleInputsDeleted,
      upscaleInputsFailed,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[GalleryCleanup] Cleanup job failed:', errorMessage);

    return {
      usersProcessed: results.length,
      imagesDeleted: totalImagesDeleted,
      results,
      timestamp: new Date().toISOString(),
      upscaleInputsDeleted,
      upscaleInputsFailed,
    };
  }
}

/**
 * Get cleanup statistics for monitoring
 *
 * @returns Statistics about potential cleanup candidates
 */
export async function getCleanupStats(): Promise<{
  inactiveFreeUsersWithImages: number;
  totalImagesToCleanup: number;
  oldestInactiveDate: string | null;
}> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - INACTIVITY_DAYS);

    // Step 1: Get free tier users whose profiles haven't been updated in 30 days
    // Filter status at application level for reliability
    const { data: freeUsers, error } = await supabaseAdmin
      .from('profiles')
      .select('id, updated_at, subscription_status')
      .or('subscription_tier.is.null,subscription_tier.eq.free')
      .lt('updated_at', cutoffDate.toISOString());

    if (error || !freeUsers) {
      return {
        inactiveFreeUsersWithImages: 0,
        totalImagesToCleanup: 0,
        oldestInactiveDate: null,
      };
    }

    // Step 2: Filter out users with active or trialing subscriptions (application-level filter)
    const inactiveUsers = freeUsers.filter(
      user => user.subscription_status !== 'active' && user.subscription_status !== 'trialing'
    );

    if (inactiveUsers.length === 0) {
      return {
        inactiveFreeUsersWithImages: 0,
        totalImagesToCleanup: 0,
        oldestInactiveDate: null,
      };
    }

    // Count how many have images
    const userIds = inactiveUsers.map(u => u.id);
    const { count: totalImages, error: countError } = await supabaseAdmin
      .from('saved_images')
      .select('*', { count: 'exact', head: true })
      .in('user_id', userIds);

    if (countError) {
      console.error('[GalleryCleanup] Error counting images:', countError.message);
    }

    // Find oldest inactive date
    const dates = inactiveUsers.map(u => new Date(u.updated_at).getTime()).filter(Boolean);
    const oldestTimestamp = dates.length > 0 ? Math.min(...dates) : null;
    const oldestInactiveDate = oldestTimestamp ? new Date(oldestTimestamp).toISOString() : null;

    return {
      inactiveFreeUsersWithImages: inactiveUsers.length,
      totalImagesToCleanup: totalImages || 0,
      oldestInactiveDate,
    };
  } catch (error) {
    console.error(
      '[GalleryCleanup] Error getting inactive users:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      inactiveFreeUsersWithImages: 0,
      totalImagesToCleanup: 0,
      oldestInactiveDate: null,
    };
  }
}
