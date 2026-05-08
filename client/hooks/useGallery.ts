'use client';

import { useState, useCallback } from 'react';
import { useToastStore } from '@client/store/toastStore';
import { analytics } from '@client/analytics/analyticsClient';
import { createClient } from '@shared/utils/supabase/client';
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

type ApiErrorBody = {
  message?: string;
  error?: string | { message?: string; code?: string };
  code?: string;
};

const GALLERY_WEBP_CONFIG = {
  quality: 0.82,
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Authentication required');
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

function getApiErrorMessage(data: ApiErrorBody | null, fallback: string): string {
  if (!data) {
    return fallback;
  }

  if (data.message) {
    return data.message;
  }

  if (typeof data.error === 'string') {
    return data.error;
  }

  if (data.error?.message) {
    return data.error.message;
  }

  return fallback;
}

function getWebpFilename(filename: string): string {
  const baseName = filename.replace(/\.[^.]+$/, '');
  return `${baseName || 'image'}.webp`;
}

function getImageFetchUrlForConversion(imageUrl: string): string {
  if (imageUrl.startsWith('blob:')) {
    return imageUrl;
  }

  try {
    const url = new URL(imageUrl);
    const hostname = url.hostname.toLowerCase();
    const isReplicateUrl =
      hostname === 'replicate.delivery' ||
      hostname.endsWith('.replicate.delivery') ||
      hostname === 'replicate.com' ||
      hostname.endsWith('.replicate.com');

    if (isReplicateUrl) {
      return `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    }
  } catch {
    return imageUrl;
  }

  return imageUrl;
}

async function canvasToWebpBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(new Error('Browser failed to encode WebP image'));
          return;
        }
        resolve(blob);
      },
      'image/webp',
      GALLERY_WEBP_CONFIG.quality
    );
  });
}

async function convertImageUrlToWebpFile(
  imageUrl: string,
  filename: string
): Promise<{ file: File; width: number; height: number }> {
  const response = await fetch(getImageFetchUrlForConversion(imageUrl));
  if (!response.ok) {
    throw new Error(`Failed to fetch image for WebP conversion: ${response.status}`);
  }

  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Browser canvas is unavailable');
  }

  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();

  const webpBlob = await canvasToWebpBlob(canvas);
  return {
    file: new File([webpBlob], getWebpFilename(filename), { type: 'image/webp' }),
    width,
    height,
  };
}

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
      const response = await fetch('/api/gallery?page_size=1', {
        headers: await getAuthHeaders(),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as ApiErrorBody | null;
        throw new Error(getApiErrorMessage(data, 'Failed to fetch gallery usage'));
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

        const response = await fetch(`/api/gallery?${params.toString()}`, {
          headers: await getAuthHeaders(),
        });
        const data = (await response.json()) as ApiErrorBody & {
          success?: boolean;
          data?: IGalleryListResponse;
          usage?: IGalleryStats;
        };

        if (!response.ok) {
          throw new Error(getApiErrorMessage(data, 'Failed to fetch images'));
        }

        const responseData = data.data;
        if (!responseData) {
          throw new Error('Failed to fetch images');
        }

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
        const authHeaders = await getAuthHeaders();
        let response: Response;

        try {
          const converted = await convertImageUrlToWebpFile(input.imageUrl, input.filename);
          const formData = new FormData();
          formData.append('file', converted.file);
          formData.append('filename', converted.file.name);
          formData.append('width', converted.width.toString());
          formData.append('height', converted.height.toString());
          if (input.modelUsed) formData.append('modelUsed', input.modelUsed);
          if (input.processingMode) formData.append('processingMode', input.processingMode);

          response = await fetch('/api/gallery', {
            method: 'POST',
            headers: authHeaders,
            body: formData,
          });
        } catch (conversionError) {
          console.warn(
            '[useGallery] WebP conversion failed, falling back to URL save:',
            conversionError
          );
          response = await fetch('/api/gallery', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders,
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
        }

        const data = (await response.json()) as ApiErrorBody & {
          success?: boolean;
          data?: IGalleryListResponse['images'][0];
          usage?: IGalleryStats;
        };

        if (!response.ok) {
          // Handle gallery limit exceeded
          const errorCode = typeof data.error === 'object' ? data.error.code : data.code;
          if (response.status === 403 || errorCode === 'FORBIDDEN') {
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
          if (response.status === 401 || errorCode === 'UNAUTHORIZED') {
            showToast({
              message: 'Please sign in to save images to your gallery',
              type: 'info',
            });
            setError('Authentication required');
            return false;
          }

          throw new Error(getApiErrorMessage(data, 'Failed to save image'));
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
          headers: await getAuthHeaders(),
        });

        const data = (await response.json()) as ApiErrorBody & {
          success?: boolean;
          usage?: IGalleryStats;
        };

        if (!response.ok) {
          throw new Error(getApiErrorMessage(data, 'Failed to delete image'));
        }

        // Remove image from local state
        setListState(prev => ({
          ...prev,
          images: prev.images.filter(img => img.id !== imageId),
          total: Math.max(0, prev.total - 1),
        }));

        // Update usage stats from response (API returns { success, data, usage })
        if (data.usage) {
          setUsage(data.usage);
        }

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
    [isDeleting, showToast]
  );

  // Usage stats are updated inline from API responses (GET, POST, DELETE all return usage).
  // fetchUsage is still exported for external callers that need a manual refresh.

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
