/**
 * Gallery Types
 * TypeScript interfaces for saved image gallery feature
 */

import type { ProcessingMode } from '../config/subscription.types';

/**
 * Represents a saved image in the user's gallery
 */
export interface IGalleryImage {
  /** Unique identifier */
  id: string;
  /** User ID who owns this image */
  user_id: string;
  /** Path in Supabase Storage bucket */
  storage_path: string;
  /** Original filename from user upload */
  original_filename: string;
  /** File size in bytes */
  file_size_bytes: number;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** AI model used for processing */
  model_used: string;
  /** Processing mode applied */
  processing_mode: ProcessingMode;
  /** Timestamp when image was saved */
  created_at: string;
  /** Signed URL for viewing (time-limited) */
  signed_url?: string;
}

/**
 * Request payload for saving an image to the gallery
 */
export interface ISaveImageRequest {
  /** Storage path in the bucket */
  storage_path: string;
  /** Original filename */
  original_filename: string;
  /** File size in bytes */
  file_size_bytes: number;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** AI model used for processing */
  model_used: string;
  /** Processing mode applied */
  processing_mode: ProcessingMode;
}

/**
 * Response for gallery list endpoint
 */
export interface IGalleryListResponse {
  /** Array of saved images */
  images: IGalleryImage[];
  /** Total count of images (for pagination) */
  total: number;
  /** Current page number (1-indexed) */
  page: number;
  /** Number of items per page */
  page_size: number;
  /** Whether there are more pages */
  has_more: boolean;
}

/**
 * Response for single image operations
 */
export interface IGalleryImageResponse {
  /** The saved image */
  image: IGalleryImage;
  /** Signed URL for downloading (time-limited) */
  download_url?: string;
}

/**
 * Gallery query parameters
 */
export interface IGalleryQueryParams {
  /** Page number (1-indexed, default: 1) */
  page?: number;
  /** Number of items per page (default: 20, max: 100) */
  page_size?: number;
  /** Sort order */
  sort_order?: 'created_at_desc' | 'created_at_asc';
}

/**
 * Gallery storage statistics for a user
 */
export interface IGalleryStats {
  /** Current number of saved images */
  current_count: number;
  /** Maximum allowed images for user's tier */
  max_allowed: number;
  /** Total storage used in bytes */
  total_size_bytes: number;
  /** Whether user can save more images */
  can_save_more: boolean;
}

/**
 * Delete image response
 */
export interface IGalleryDeleteResponse {
  /** Whether deletion was successful */
  success: boolean;
  /** ID of the deleted image */
  deleted_id: string;
}
