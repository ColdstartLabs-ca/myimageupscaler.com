'use client';

import { useState, useCallback } from 'react';
import { useToastStore } from '@client/store/toastStore';
import { analytics } from '@client/analytics/analyticsClient';
import { GALLERY_QUERY_CONFIG } from '@shared/config/gallery.config';
import type {
  IGalleryStats,
  IGalleryListResponse,
  IGalleryListState,
} from '@shared/types/gallery.types';
import type { ProcessingMode } from '@shared/config/subscription.types';

// Re-export IGalleryListState for backward compatibility
export type { IGalleryListState } from '@shared/types/gallery.types';

/**
 * Input type for saving an image
 */
export interface ISaveImageInput {
  /** URL of the image to save */
  imageUrl: string;
  /** Original filename */
  filename: string;
  /** Image width in pixels (optional) */
  width?: number;
  /** Image height in pixels (optional) */
  height?: number;
  /** AI model used for processing */
  modelUsed?: string;
  /** Processing mode applied */
  processingMode?: ProcessingMode;
}

/**
 * Return type for useGallery hook
 */
export interface IUseGalleryReturn {
  /** Save an image to the gallery */
  saveImage: (input: ISaveImageInput) => Promise<boolean>;
  /** Delete an image from the gallery */
  deleteImage: (imageId: string) => Promise<boolean>;
  /** Fetch gallery usage stats */
  fetchUsage: () => Promise<void>;
  /** Fetch gallery images with pagination */
  fetchImages: (page?: number, append?: boolean) => Promise<void>;
  /** Load more images (next page) */
  loadMore: () => Promise<void>;
  /** Refresh gallery (reset to page 1) */
  refresh: () => Promise<void>;
  /** Current gallery usage stats */
  usage: IGalleryStats | null;
  /** Gallery list state */
  listState: IGalleryListState;
  /** Whether a save operation is in progress */
  isSaving: boolean;
  /** Whether a delete operation is in progress */
  isDeleting: boolean;
  /** Whether usage stats are loading */
  isLoadingUsage: boolean;
  /** Whether images are loading */
  isLoadingImages: boolean;
  /** Error message if last operation failed */
  error: string | null;
  /** Saved image ID from most recent save (for UI state) */
  lastSavedImageId: string | null;
}

/**
 * Initial list state
 */
const initialListState: IGalleryListState = {
  images: [],
  total: 0,
  page: 1,
  pageSize: GALLERY_QUERY_CONFIG.defaultPageSize,
  hasMore: false,
};

/**
 * Hook for managing gallery operations
 * Provides save, delete, list, and usage tracking functionality
 */
export function useGallery(): IUseGalleryReturn {
  const { showToast } = useToastStore();
  const [usage, setUsage] = useState<IGalleryStats | null>(null);
  const [listState, setListState] = useState<IGalleryListState>(initialListState);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedImageId, setLastSavedImageId] = useState<string | null>(null);

  /**
   * Fetch gallery usage stats
   */
  const fetchUsage = useCallback(async () => {
    setIsLoadingUsage(true);
    setError(null);

    try {
      const response = await fetch('/api/gallery?page_size=1');
      if (!response.ok) {
        throw new Error('Failed to fetch gallery usage');
      }

      const data = await response.json();
      if (data.success && data.usage) {
        setUsage(data.usage);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch gallery usage';
      setError(errorMessage);
      console.error('[useGallery] Error fetching usage:', err);
    } finally {
      setIsLoadingUsage(false);
    }
  }, []);

  /**
   * Fetch gallery images with pagination
   */
  const fetchImages = useCallback(
    async (page: number = 1, append: boolean = false) => {
      setIsLoadingImages(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          page_size: GALLERY_QUERY_CONFIG.defaultPageSize.toString(),
          sort_order: GALLERY_QUERY_CONFIG.defaultSortOrder,
        });

        const response = await fetch(`/api/gallery?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to fetch images');
        }

        const responseData: IGalleryListResponse = data.data;

        setListState(prev => ({
          images: append ? [...prev.images, ...responseData.images] : responseData.images,
          total: responseData.total,
          page: responseData.page,
          pageSize: responseData.page_size,
          hasMore: responseData.has_more,
        }));

        // Also update usage from response
        if (data.usage) {
          setUsage(data.usage);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch images';
        setError(errorMessage);
        console.error('[useGallery] Error fetching images:', err);

        showToast({
          message: errorMessage,
          type: 'error',
        });
      } finally {
        setIsLoadingImages(false);
      }
    },
    [showToast]
  );

  /**
   * Load more images (next page)
   */
  const loadMore = useCallback(async () => {
    if (listState.hasMore && !isLoadingImages) {
      await fetchImages(listState.page + 1, true);
    }
  }, [listState.hasMore, listState.page, isLoadingImages, fetchImages]);

  /**
   * Refresh gallery (reset to page 1)
   * Note: fetchImages already updates usage from the API response, so no separate fetchUsage call needed
   */
  const refresh = useCallback(async () => {
    await fetchImages(1, false);
  }, [fetchImages]);

  /**
   * Save an image to the gallery
   * @returns true if save was successful, false otherwise
   */
  const saveImage = useCallback(
    async (input: ISaveImageInput): Promise<boolean> => {
      if (isSaving) return false;

      setIsSaving(true);
      setError(null);
      setLastSavedImageId(null);

      try {
        const response = await fetch('/api/gallery', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageUrl: input.imageUrl,
            filename: input.filename,
            width: input.width,
            height: input.height,
            modelUsed: input.modelUsed,
            processingMode: input.processingMode,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          // Handle gallery limit exceeded
          if (response.status === 403 || data.code === 'FORBIDDEN') {
            analytics.track('gallery_limit_reached', {
              currentCount: usage?.current_count ?? 0,
              maxAllowed: usage?.max_allowed ?? 0,
            });

            showToast({
              message: 'Gallery full. Upgrade to save more images.',
              type: 'warning',
            });

            setError('Gallery limit reached');
            return false;
          }

          // Handle authentication error
          if (response.status === 401 || data.code === 'UNAUTHORIZED') {
            showToast({
              message: 'Please sign in to save images to your gallery',
              type: 'info',
            });
            setError('Authentication required');
            return false;
          }

          throw new Error(data.message || data.error || 'Failed to save image');
        }

        // Update usage stats from response (API returns { success, data, usage })
        if (data.usage) {
          setUsage(data.usage);
        }

        // Store saved image ID for UI state
        if (data.data?.id) {
          setLastSavedImageId(data.data.id);
        }

        // Track successful save
        analytics.track('gallery_image_saved', {
          imageId: data.data?.id,
          currentCount: data.usage?.current_count ?? 0,
          maxAllowed: data.usage?.max_allowed ?? 0,
          modelUsed: input.modelUsed,
          processingMode: input.processingMode,
        });

        // Show success toast with usage count
        const currentCount = data.usage?.current_count ?? 0;
        const maxAllowed = data.usage?.max_allowed ?? 0;
        showToast({
          message: `Image saved to gallery (${currentCount}/${maxAllowed})`,
          type: 'success',
        });

        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to save image';
        setError(errorMessage);
        console.error('[useGallery] Error saving image:', err);

        showToast({
          message: errorMessage,
          type: 'error',
        });

        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, usage, showToast]
  );

  /**
   * Delete an image from the gallery
   * @returns true if delete was successful, false otherwise
   */
  const deleteImage = useCallback(
    async (imageId: string): Promise<boolean> => {
      if (isDeleting) return false;

      setIsDeleting(true);
      setError(null);

      try {
        const response = await fetch(`/api/gallery/${imageId}`, {
          method: 'DELETE',
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to delete image');
        }

        // Remove image from local state
        setListState(prev => ({
          ...prev,
          images: prev.images.filter(img => img.id !== imageId),
          total: Math.max(0, prev.total - 1),
        }));

        // Refresh usage stats
        await fetchUsage();

        showToast({
          message: 'Image removed from gallery',
          type: 'success',
        });

        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete image';
        setError(errorMessage);
        console.error('[useGallery] Error deleting image:', err);

        showToast({
          message: errorMessage,
          type: 'error',
        });

        return false;
      } finally {
        setIsDeleting(false);
      }
    },
    [isDeleting, fetchUsage, showToast]
  );

  // Usage stats are fetched automatically by fetchImages() which returns usage data.
  // No separate mount effect needed - Gallery component calls fetchImages(1) on mount.
  // fetchUsage is still exported for manual refresh scenarios (e.g., after delete).

  return {
    saveImage,
    deleteImage,
    fetchUsage,
    fetchImages,
    loadMore,
    refresh,
    usage,
    listState,
    isSaving,
    isDeleting,
    isLoadingUsage,
    isLoadingImages,
    error,
    lastSavedImageId,
  };
}
