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
  maxPixels?: number | null; // Max total pixels (width * height) - null disables pixel resizing
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

interface ICompressionPassResult {
  blob: Blob;
  dimensions: { width: number; height: number };
}

export interface IConstrainedDimensionsInput {
  width: number;
  height: number;
  maxWidth?: number;
  maxHeight?: number;
  maxPixels?: number | null;
  maintainAspectRatio?: boolean;
}

function violatesConstraints(
  width: number,
  height: number,
  maxWidth?: number,
  maxHeight?: number,
  maxPixels?: number | null
): boolean {
  if (maxWidth && width > maxWidth) return true;
  if (maxHeight && height > maxHeight) return true;
  if (maxPixels != null && width * height > maxPixels) return true;
  return false;
}

export function getConstrainedDimensions({
  width,
  height,
  maxWidth,
  maxHeight,
  maxPixels,
  maintainAspectRatio = true,
}: IConstrainedDimensionsInput): { width: number; height: number } {
  if (!maintainAspectRatio) {
    let constrainedWidth = Math.min(width, maxWidth ?? width);
    let constrainedHeight = Math.min(height, maxHeight ?? height);

    if (maxPixels != null && constrainedWidth * constrainedHeight > maxPixels) {
      const scaleFactor = Math.sqrt(maxPixels / (constrainedWidth * constrainedHeight));
      constrainedWidth = Math.max(1, Math.floor(constrainedWidth * scaleFactor));
      constrainedHeight = Math.max(1, Math.floor(constrainedHeight * scaleFactor));
    }

    return { width: constrainedWidth, height: constrainedHeight };
  }

  let scale = 1;

  if (maxWidth || maxHeight) {
    const widthScale = maxWidth ? maxWidth / width : 1;
    const heightScale = maxHeight ? maxHeight / height : 1;
    scale = Math.min(scale, widthScale, heightScale, 1);
  }

  if (maxPixels != null && width * height > maxPixels) {
    scale = Math.min(scale, Math.sqrt(maxPixels / (width * height)));
  }

  let constrainedWidth = Math.max(1, Math.round(width * scale));
  let constrainedHeight = Math.max(1, Math.round(height * scale));

  if (
    scale < 1 &&
    violatesConstraints(constrainedWidth, constrainedHeight, maxWidth, maxHeight, maxPixels)
  ) {
    constrainedWidth = Math.max(1, Math.floor(width * scale));
    constrainedHeight = Math.max(1, Math.floor(height * scale));
  }

  return { width: constrainedWidth, height: constrainedHeight };
}

function getOutputFormatFromMimeType(type: string): 'jpeg' | 'png' | 'webp' {
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  return 'jpeg';
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
  const outputFormat = targetSizeBytes
    ? format || 'jpeg'
    : format || getOutputFormatFromMimeType(file.type);

  // If target size is specified, use iterative compression
  if (targetSizeBytes) {
    return await compressToTargetSize(file, targetSizeBytes, {
      maxWidth,
      maxHeight,
      maxPixels: options.maxPixels,
      format: outputFormat,
      maintainAspectRatio,
    });
  }

  // Otherwise, compress once with the specified quality
  const img = await loadImage(file);

  const maxPixels = options.maxPixels ?? IMAGE_VALIDATION.MAX_PIXELS;
  const constrainedDimensions = getConstrainedDimensions({
    width: img.width,
    height: img.height,
    maxWidth,
    maxHeight,
    maxPixels: options.maxPixels != null ? maxPixels : null,
    maintainAspectRatio,
  });

  const compressed = await compressOnce(file, {
    quality,
    maxWidth: constrainedDimensions.width,
    maxHeight: constrainedDimensions.height,
    format: outputFormat,
    maintainAspectRatio,
  });

  const reductionPercent = Math.round(((originalSize - compressed.blob.size) / originalSize) * 100);

  return {
    blob: compressed.blob,
    originalSize,
    compressedSize: compressed.blob.size,
    reductionPercent,
    dimensions: compressed.dimensions,
  };
}

/**
 * Compress an image, then guarantee the result fits a byte ceiling.
 *
 * Lossless formats (and any format the browser silently substituted for an
 * unsupported one) can grow well past the tier upload limit even while the
 * image shrinks in pixels. When that happens, fall back to a JPEG encode
 * targeted at the ceiling so the upload is never rejected downstream.
 */
export async function compressImageWithinByteLimit(
  file: File,
  options: ICompressionOptions,
  maxBytes: number
): Promise<ICompressionResult> {
  const result = await compressImage(file, options);

  if (result.blob.size <= maxBytes) {
    return result;
  }

  return await compressImage(file, {
    ...options,
    format: 'jpeg',
    targetSizeBytes: maxBytes,
  });
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
  const img = await loadImage(file);
  let targetDimensions = getConstrainedDimensions({
    width: img.width,
    height: img.height,
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    maxPixels: options.maxPixels ?? null,
    maintainAspectRatio: options.maintainAspectRatio,
  });

  // Apply the pixel-constrained dimensions
  const constrainedOptions = {
    ...options,
    maxWidth: targetDimensions.width,
    maxHeight: targetDimensions.height,
  };

  let minQuality = 1;
  let maxQuality = 95;
  let bestBlob: Blob | null = null;
  let bestDimensions = targetDimensions;
  let iterations = 0;
  const maxIterations = 8; // Limit iterations to avoid infinite loops

  while (iterations < maxIterations && maxQuality - minQuality > 5) {
    const quality = Math.floor((minQuality + maxQuality) / 2);
    const compressed = await compressOnce(file, { ...constrainedOptions, quality });
    const blob = compressed.blob;

    if (blob.size <= targetBytes) {
      // Success! But try to get higher quality if possible
      bestBlob = blob;
      bestDimensions = compressed.dimensions;
      minQuality = quality;
    } else {
      // Too large, reduce quality
      maxQuality = quality;
    }

    iterations++;
  }

  // If we still don't have a result, try minimum quality
  if (!bestBlob) {
    const compressed = await compressOnce(file, { ...constrainedOptions, quality: minQuality });
    bestBlob = compressed.blob;
    bestDimensions = compressed.dimensions;
  }

  // If still too large after quality reduction, reduce dimensions further.
  // The scale factor is derived from a blob encoded at the binary search's
  // quality, while this pass re-encodes at quality 75, so a single pass can
  // still land over the ceiling. Callers treat the ceiling as a guarantee
  // (tier upload limits), so keep shrinking instead of returning oversized.
  const maxReductionPasses = 3;
  let reductionPasses = 0;
  let reducedDimensions = targetDimensions;

  while (bestBlob.size > targetBytes && reductionPasses < maxReductionPasses) {
    const scaleFactor = Math.sqrt(targetBytes / bestBlob.size);
    const newMaxWidth = Math.max(1, Math.floor(reducedDimensions.width * scaleFactor));
    const newMaxHeight = Math.max(1, Math.floor(reducedDimensions.height * scaleFactor));

    const compressed = await compressOnce(file, {
      ...constrainedOptions,
      quality: 75,
      maxWidth: newMaxWidth,
      maxHeight: newMaxHeight,
    });
    bestBlob = compressed.blob;
    reducedDimensions = compressed.dimensions;
    reductionPasses++;
  }

  targetDimensions = reductionPasses > 0 ? reducedDimensions : bestDimensions;

  const reductionPercent = Math.round(((originalSize - bestBlob.size) / originalSize) * 100);

  return {
    blob: bestBlob,
    originalSize,
    compressedSize: bestBlob.size,
    reductionPercent,
    dimensions: targetDimensions,
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
): Promise<ICompressionPassResult> {
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

      const outputType = `image/${format}`;
      const outputQuality = format === 'png' ? undefined : quality / 100;

      canvas.toBlob(
        blob => {
          if (blob) {
            resolve({
              blob,
              dimensions: {
                width: targetWidth,
                height: targetHeight,
              },
            });
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        outputType,
        outputQuality
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
