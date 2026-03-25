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
}

// =============================================================================
// PUBLIC FUNCTIONS
// =============================================================================

/**
 * Find all inactive free users with saved images
 * Inactive = profile.updated_at > 30 days ago
 *
 * @returns List of inactive user IDs
 */
export async function findInactiveFreeUsers(): Promise<IInactiveUsersResult> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - INACTIVITY_DAYS);

  // Query for free users with saved images whose profiles haven't been updated in 30 days
  // Logic: tier is (null or free) AND status is (null or NOT active/trialing)
  // Using nested AND in the second OR clause to properly exclude active/trialing users
  const { data: inactiveUsers, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .or('subscription_tier.is.null,subscription_tier.eq.free')
    .or(
      'subscription_status.is.null,and(subscription_status.neq.active,subscription_status.neq.trialing)'
    )
    .lt('updated_at', cutoffDate.toISOString());

  if (error) {
    console.error('[GalleryCleanup] Error finding inactive users:', error.message);
    throw new Error(`Failed to find inactive users: ${error.message}`);
  }

  if (!inactiveUsers || inactiveUsers.length === 0) {
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
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[GalleryCleanup] Cleanup job failed:', errorMessage);

    return {
      usersProcessed: results.length,
      imagesDeleted: totalImagesDeleted,
      results,
      timestamp: new Date().toISOString(),
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

    // Get count of inactive free users with images
    // Use nested AND/OR to properly exclude active/trialing users:
    // (tier is null/free) AND (status is null OR (status != active AND status != trialing))
    const { data: inactiveUsers, error } = await supabaseAdmin
      .from('profiles')
      .select('id, updated_at')
      .or('subscription_tier.is.null,subscription_tier.eq.free')
      .or(
        'subscription_status.is.null,and(subscription_status.neq.active,subscription_status.neq.trialing)'
      )
      .lt('updated_at', cutoffDate.toISOString());

    if (error || !inactiveUsers) {
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
