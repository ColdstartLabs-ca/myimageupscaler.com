/**
 * Gallery Configuration
 * Centralized configuration for saved image gallery limits and settings
 */

/**
 * Subscription tier type for gallery limits
 * Includes all subscription tiers from subscription.config.ts
 */
export type GalleryTier = 'free' | 'starter' | 'hobby' | 'pro' | 'business';

/**
 * Gallery limits per subscription tier
 * Defines the maximum number of images a user can save
 */
export const GALLERY_LIMITS: Record<GalleryTier, number> = {
  free: 5,
  starter: 50,
  hobby: 150,
  pro: 500,
  business: 2000,
} as const;

/**
 * Storage bucket configuration
 */
export const GALLERY_STORAGE_CONFIG = {
  /** Name of the Supabase storage bucket */
  bucketName: 'saved-images',
  /** Maximum file size in bytes (10MB) */
  maxFileSizeBytes: 10 * 1024 * 1024,
  /** Allowed MIME types for saved images */
  allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png'] as const,
  /** Path pattern: {user_id}/{filename} */
  pathPattern: '{user_id}/{filename}',
} as const;

/**
 * Gallery query configuration
 */
export const GALLERY_QUERY_CONFIG = {
  /** Default number of images per page */
  defaultPageSize: 20,
  /** Maximum number of images per page */
  maxPageSize: 100,
  /** Default sort order */
  defaultSortOrder: 'created_at_desc' as const,
} as const;

/**
 * Gallery feature configuration
 */
export const GALLERY_CONFIG = {
  /** Gallery limits per tier */
  limits: GALLERY_LIMITS,
  /** Storage configuration */
  storage: GALLERY_STORAGE_CONFIG,
  /** Query configuration */
  query: GALLERY_QUERY_CONFIG,
} as const;

/**
 * Get the gallery limit for a specific subscription tier
 * @param tier - The subscription tier
 * @returns The maximum number of images allowed
 */
export function getGalleryLimit(tier: GalleryTier): number {
  return GALLERY_LIMITS[tier];
}

/**
 * Check if a user can save more images based on their current count and tier
 * @param currentCount - Current number of saved images
 * @param tier - The subscription tier
 * @returns Whether the user can save more images
 */
export function canSaveMoreImages(currentCount: number, tier: GalleryTier): boolean {
  return currentCount < getGalleryLimit(tier);
}

/**
 * Get remaining image slots for a user
 * @param currentCount - Current number of saved images
 * @param tier - The subscription tier
 * @returns Number of remaining slots (0 if at or over limit)
 */
export function getRemainingSlots(currentCount: number, tier: GalleryTier): number {
  const limit = getGalleryLimit(tier);
  return Math.max(0, limit - currentCount);
}

/**
 * Type exports
 */
export type GalleryLimit = typeof GALLERY_LIMITS;
export type GalleryStorageConfig = typeof GALLERY_STORAGE_CONFIG;
export type GalleryQueryConfig = typeof GALLERY_QUERY_CONFIG;
