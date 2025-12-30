/**
 * Client-side image compression utilities
 * Uses Canvas API for resizing and format conversion
 */

import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

export interface ICompressionOptions {
  targetSizeBytes?: number; // Target file size in bytes
  quality?: number; // Quality from 1-100 (default: 80)
  maxWidth?: number; // Max width in pixels
  maxHeight?: number; // Max height in pixels
  maxPixels?: number; // Max total pixels (width * height) - defaults to GPU limit
  format?: 'jpeg' | 'png' | 'webp'; // Output format (default: original or jpeg)
  maintainAspectRatio?: boolean; // Maintain aspect ratio (default: true)
}

export interface ICompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  reductionPercent: number;
  dimensions: { width: number; height: number };
}

/**
 * Compress an image file to meet size/quality requirements
 * Uses iterative quality adjustment if targetSizeBytes is specified
 */
export async function compressImage(
  file: File,
  options: ICompressionOptions = {}
): Promise<ICompressionResult> {
  const {
    targetSizeBytes,
    quality = 80,
    maxWidth,
    maxHeight,
    format,
    maintainAspectRatio = true,
  } = options;

  const originalSize = file.size;

  // Determine output format
  const outputFormat =
    format || (file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpeg');

  // If target size is specified, use iterative compression
  if (targetSizeBytes) {
    return await compressToTargetSize(file, targetSizeBytes, {
      maxWidth,
      maxHeight,
      format: outputFormat,
      maintainAspectRatio,
    });
  }

  // Otherwise, compress once with the specified quality
  const blob = await compressOnce(file, {
    quality,
    maxWidth,
    maxHeight,
    format: outputFormat,
    maintainAspectRatio,
  });

  const img = await loadImage(file);
  const reductionPercent = Math.round(((originalSize - blob.size) / originalSize) * 100);

  return {
    blob,
    originalSize,
    compressedSize: blob.size,
    reductionPercent,
    dimensions: { width: img.width, height: img.height },
  };
}

/**
 * Compress image to fit under a target file size and pixel limit
 * Uses binary search to find optimal quality level
 */
async function compressToTargetSize(
  file: File,
  targetBytes: number,
  options: Omit<ICompressionOptions, 'quality' | 'targetSizeBytes'>
): Promise<ICompressionResult> {
  const originalSize = file.size;
  const maxPixels = options.maxPixels ?? IMAGE_VALIDATION.MAX_PIXELS;

  const img = await loadImage(file);
  const originalPixels = img.width * img.height;

  // Calculate dimensions that fit within max pixels while maintaining aspect ratio
  let targetWidth = img.width;
  let targetHeight = img.height;

  if (originalPixels > maxPixels) {
    const scaleFactor = Math.sqrt(maxPixels / originalPixels);
    targetWidth = Math.floor(img.width * scaleFactor);
    targetHeight = Math.floor(img.height * scaleFactor);
  }

  // Apply the pixel-constrained dimensions
  const constrainedOptions = {
    ...options,
    maxWidth: Math.min(targetWidth, options.maxWidth ?? targetWidth),
    maxHeight: Math.min(targetHeight, options.maxHeight ?? targetHeight),
  };

  let minQuality = 1;
  let maxQuality = 95;
  let bestBlob: Blob | null = null;
  let iterations = 0;
  const maxIterations = 8; // Limit iterations to avoid infinite loops

  while (iterations < maxIterations && maxQuality - minQuality > 5) {
    const quality = Math.floor((minQuality + maxQuality) / 2);
    const blob = await compressOnce(file, { ...constrainedOptions, quality });

    if (blob.size <= targetBytes) {
      // Success! But try to get higher quality if possible
      bestBlob = blob;
      minQuality = quality;
    } else {
      // Too large, reduce quality
      maxQuality = quality;
    }

    iterations++;
  }

  // If we still don't have a result, try minimum quality
  if (!bestBlob) {
    bestBlob = await compressOnce(file, { ...constrainedOptions, quality: minQuality });
  }

  // If still too large after quality reduction, reduce dimensions further
  if (bestBlob.size > targetBytes) {
    const scaleFactor = Math.sqrt(targetBytes / bestBlob.size);
    const newMaxWidth = Math.floor(targetWidth * scaleFactor);
    const newMaxHeight = Math.floor(targetHeight * scaleFactor);

    bestBlob = await compressOnce(file, {
      ...constrainedOptions,
      quality: 75,
      maxWidth: newMaxWidth,
      maxHeight: newMaxHeight,
    });

    targetWidth = newMaxWidth;
    targetHeight = newMaxHeight;
  }

  const reductionPercent = Math.round(((originalSize - bestBlob.size) / originalSize) * 100);

  return {
    blob: bestBlob,
    originalSize,
    compressedSize: bestBlob.size,
    reductionPercent,
    dimensions: { width: targetWidth, height: targetHeight },
  };
}

/**
 * Single compression pass
 */
async function compressOnce(
  file: File,
  options: {
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
    format?: 'jpeg' | 'png' | 'webp';
    maintainAspectRatio?: boolean;
  }
): Promise<Blob> {
  const {
    quality = 80,
    maxWidth,
    maxHeight,
    format = 'jpeg',
    maintainAspectRatio = true,
  } = options;

  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const objectUrl = URL.createObjectURL(file);

    if (!ctx) {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Canvas not supported'));
      return;
    }

    img.onload = () => {
      let targetWidth = img.width;
      let targetHeight = img.height;

      // Resize if max dimensions specified
      if (maxWidth || maxHeight) {
        if (maintainAspectRatio) {
          const aspectRatio = img.width / img.height;
          const effectiveMaxWidth = maxWidth || img.width;
          const effectiveMaxHeight = maxHeight || img.height;

          if (img.width > effectiveMaxWidth || img.height > effectiveMaxHeight) {
            if (effectiveMaxWidth / effectiveMaxHeight > aspectRatio) {
              targetHeight = effectiveMaxHeight;
              targetWidth = Math.round(effectiveMaxHeight * aspectRatio);
            } else {
              targetWidth = effectiveMaxWidth;
              targetHeight = Math.round(effectiveMaxWidth / aspectRatio);
            }
          }
        } else {
          targetWidth = Math.min(img.width, maxWidth || img.width);
          targetHeight = Math.min(img.height, maxHeight || img.height);
        }
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // High-quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      URL.revokeObjectURL(objectUrl);

      canvas.toBlob(
        blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        `image/${format}`,
        quality / 100
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    img.src = objectUrl;
  });
}

/**
 * Load image and get dimensions
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    img.src = objectUrl;
  });
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}
