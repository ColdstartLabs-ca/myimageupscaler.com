/**
 * Gallery Storage Service
 * Handles saving, listing, and deleting User Gallery Images
 */

import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../supabase/supabaseAdmin';
import {
  GALLERY_STORAGE_CONFIG,
  GALLERY_QUERY_CONFIG,
  getGalleryLimit,
  type GalleryTier,
} from '@shared/config/gallery.config';
import type {
  IGalleryImage,
  IGalleryListResponse,
  IGalleryStats,
} from '@shared/types/gallery.types';
import type { ProcessingMode } from '@shared/config/subscription.types';

// =============================================================================
// Configuration
// =============================================================================

const BUCKET_NAME = GALLERY_STORAGE_CONFIG.bucketName;

/**
 * Compression settings for gallery images
 * Max dimension: 2048px (fit inside, no enlargement)
 * Format: WebP quality 80
 */
const COMPRESSION_CONFIG = {
  maxDimension: 2048,
  quality: 80,
  format: 'webp' as const,
};

/**
 * Signed URL expiration time in seconds (1 hour)
 */
const SIGNED_URL_EXPIRES_IN = 3600;

// =============================================================================
// Types
// =============================================================================

/**
 * Metadata for saving an image
 */
export interface ISaveImageMetadata {
  /** Original filename from upload */
  filename: string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** AI model used for processing */
  modelUsed?: string;
  /** Processing mode applied */
  processingMode?: ProcessingMode;
}

/**
 * Result of saving an image
 */
export interface ISaveImageResult {
  /** The saved image record */
  image: IGalleryImage;
  /** Signed URL for viewing (time-limited) */
  signedUrl: string;
}

// =============================================================================
// PUBLIC FUNCTIONS
// =============================================================================

/**
 * Save an image to the user's gallery
 *
 * @param userId - The user's ID
 * @param imageUrl - URL of the image to fetch and save (CDN URL from processing result)
 * @param metadata - Additional metadata about the image
 * @returns The saved image record with signed URL
 * @throws Error if save fails or tier limit is exceeded
 */
export async function saveImage(
  userId: string,
  imageUrl: string,
  metadata: ISaveImageMetadata
): Promise<ISaveImageResult> {
  // 1. Check tier limit before proceeding
  const usage = await getUsage(userId);
  if (!usage.can_save_more) {
    throw new Error(
      `Gallery limit exceeded. You have reached the maximum of ${usage.max_allowed} images for your plan.`
    );
  }

  // 2. Fetch the image from the CDN URL
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from URL: ${response.status}`);
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());

  // 3. Compress the image
  const compressedBuffer = await compressForGallery(imageBuffer);

  // 4. Extract dimensions from compressed image
  const compressedMetadata = await sharp(compressedBuffer).metadata();
  const width = compressedMetadata.width ?? metadata.width ?? 0;
  const height = compressedMetadata.height ?? metadata.height ?? 0;

  // 5. Generate storage path: {user_id}/{uuid}.webp
  const storagePath = `${userId}/${randomUUID()}.webp`;

  // 6. Upload to Supabase Storage
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(storagePath, compressedBuffer, {
      contentType: 'image/webp',
      cacheControl: '31536000', // 1 year cache
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload image to storage: ${uploadError.message}`);
  }

  // 7. Insert database record
  const { data: dbRecord, error: dbError } = await supabaseAdmin
    .from('saved_images')
    .insert({
      user_id: userId,
      storage_path: storagePath,
      original_filename: metadata.filename,
      file_size_bytes: compressedBuffer.length,
      width,
      height,
      model_used: metadata.modelUsed ?? 'unknown',
      processing_mode: metadata.processingMode ?? 'both',
    })
    .select()
    .single();

  if (dbError) {
    // Try to clean up uploaded file if DB insert fails
    await supabaseAdmin.storage.from(BUCKET_NAME).remove([storagePath]);
    throw new Error(`Failed to save image record: ${dbError.message}`);
  }

  // 8. Generate signed URL for viewing
  const signedUrl = await generateSignedUrl(storagePath);

  return {
    image: dbRecord as IGalleryImage,
    signedUrl,
  };
}

/**
 * Compress an image buffer for gallery storage
 * - Resizes to max 2048px while maintaining aspect ratio
 * - Converts to WebP format
 * - Quality 80
 *
 * @param buffer - Image data as buffer
 * @returns Compressed image buffer
 */
export async function compressForGallery(buffer: Buffer): Promise<Buffer> {
  const image = sharp(buffer);
  const metadata = await image.metadata();

  // Determine if resize is needed
  const needsResize =
    (metadata.width && metadata.width > COMPRESSION_CONFIG.maxDimension) ||
    (metadata.height && metadata.height > COMPRESSION_CONFIG.maxDimension);

  let pipeline = image;

  if (needsResize) {
    pipeline = pipeline.resize(COMPRESSION_CONFIG.maxDimension, COMPRESSION_CONFIG.maxDimension, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Convert to WebP with compression
  const compressedBuffer = await pipeline.webp({ quality: COMPRESSION_CONFIG.quality }).toBuffer();

  return compressedBuffer;
}

/**
 * List images from a user's gallery with pagination
 *
 * @param userId - The user's ID
 * @param page - Page number (1-indexed)
 * @param limit - Number of items per page
 * @returns Paginated list of images with signed URLs
 */
export async function listImages(
  userId: string,
  page: number = 1,
  limit: number = GALLERY_QUERY_CONFIG.defaultPageSize
): Promise<IGalleryListResponse> {
  // Clamp page and limit to valid ranges
  const validPage = Math.max(1, page);
  const validLimit = Math.min(Math.max(1, limit), GALLERY_QUERY_CONFIG.maxPageSize);

  const offset = (validPage - 1) * validLimit;

  // Query with count
  const { data, error, count } = await supabaseAdmin
    .from('saved_images')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + validLimit - 1);

  if (error) {
    throw new Error(`Failed to list images: ${error.message}`);
  }

  const images = (data as IGalleryImage[]) ?? [];
  const total = count ?? 0;

  // Generate signed URLs for each image
  const imagesWithUrls = await Promise.all(
    images.map(async image => ({
      ...image,
      signed_url: await generateSignedUrl(image.storage_path),
    }))
  );

  return {
    images: imagesWithUrls,
    total,
    page: validPage,
    page_size: validLimit,
    has_more: offset + validLimit < total,
  };
}

/**
 * Delete an image from the user's gallery
 *
 * @param userId - The user's ID
 * @param imageId - The image ID to delete
 * @returns True if deletion was successful
 * @throws Error if image not found or not owned by user
 */
export async function deleteImage(userId: string, imageId: string): Promise<boolean> {
  // 1. Verify ownership and get storage path
  const { data: image, error: fetchError } = await supabaseAdmin
    .from('saved_images')
    .select('id, storage_path')
    .eq('id', imageId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to verify image ownership: ${fetchError.message}`);
  }

  if (!image) {
    throw new Error('Image not found or you do not have permission to delete it');
  }

  // 2. Delete from storage
  const { error: storageError } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .remove([image.storage_path]);

  if (storageError) {
    // Log but continue - we still want to delete the DB record
    console.error(`Failed to delete image from storage: ${storageError.message}`);
  }

  // 3. Delete from database
  const { error: dbError } = await supabaseAdmin
    .from('saved_images')
    .delete()
    .eq('id', imageId)
    .eq('user_id', userId);

  if (dbError) {
    throw new Error(`Failed to delete image record: ${dbError.message}`);
  }

  return true;
}

/**
 * Get gallery usage statistics for a user
 *
 * @param userId - The user's ID
 * @param tier - The user's subscription tier (optional, fetched if not provided)
 * @returns Gallery usage stats including count and limit
 */
export async function getUsage(userId: string, tier?: GalleryTier): Promise<IGalleryStats> {
  // Get count of user's images
  const { count, error } = await supabaseAdmin
    .from('saved_images')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to get image count: ${error.message}`);
  }

  const currentCount = count ?? 0;

  // If tier not provided, fetch from profile
  let userTier = tier;
  if (!userTier) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('subscription_tier, subscription_status')
      .eq('id', userId)
      .maybeSingle();

    // Determine tier based on subscription status
    if (profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing') {
      userTier = (profile.subscription_tier as GalleryTier) || 'hobby';
    } else {
      userTier = 'free';
    }
  }

  const maxAllowed = getGalleryLimit(userTier);

  return {
    current_count: currentCount,
    max_allowed: maxAllowed,
    total_size_bytes: 0, // Would require aggregation query - skip for now
    can_save_more: currentCount < maxAllowed,
  };
}

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * Generate a signed URL for viewing a private image
 *
 * @param storagePath - Path in Storage Bucket
 * @returns Signed URL valid for 1 hour
 */
async function generateSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_IN);

  if (error) {
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }

  return data.signedUrl;
}
