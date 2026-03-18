/**
 * Server-Side Image Resizer
 *
 * Ensures images fit within model-specific pixel limits using sharp.
 * Called before sending images to Replicate to prevent GPU OOM errors.
 *
 * @see docs/PRDs/replicate-image-size-safety.md
 */

import sharp from 'sharp';
import { MODEL_MAX_INPUT_PIXELS } from '@shared/config/model-costs.config';

/**
 * Result of the image resize operation
 */
export interface IResizeResult {
  /** Base64 encoded image data (possibly resized) */
  imageData: string;
  /** MIME type of the image */
  mimeType: string;
  /** Current dimensions (after any resize) */
  dimensions: { width: number; height: number };
  /** Whether the image was resized */
  wasResized: boolean;
  /** Original dimensions before resize (only set if wasResized is true) */
  originalDimensions?: { width: number; height: number };
}

/**
 * Options for the resize operation
 */
export interface IResizeOptions {
  /** JPEG quality for output (default: 90) */
  quality?: number;
  /** Force a specific max pixel count (overrides model lookup) */
  maxPixels?: number;
}

/**
 * Default resize options
 */
const DEFAULT_OPTIONS: Required<Omit<IResizeOptions, 'maxPixels'>> = {
  quality: 90,
};

/**
 * Supported MIME types for resizing
 * Sharp supports many formats, but we limit to what our app accepts
 */
const SUPPORTED_OUTPUT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'jpeg', // Convert HEIC to JPEG
  'image/avif': 'jpeg', // Convert AVIF to JPEG
  'image/tiff': 'jpeg', // Convert TIFF to JPEG
};

/**
 * Get the maximum input pixels for a specific model
 * Returns the model-specific limit if defined, otherwise falls back to global default
 *
 * @param modelId - The model identifier (e.g., 'real-esrgan', 'gfpgan')
 * @returns Maximum number of pixels allowed for the model
 */
export function getMaxPixelsForModel(modelId: string): number {
  if (modelId in MODEL_MAX_INPUT_PIXELS) {
    return MODEL_MAX_INPUT_PIXELS[modelId];
  }
  // Fallback to most conservative limit (real-esrgan)
  return 1_500_000;
}

/**
 * Parse base64 image data and extract buffer with metadata
 *
 * @param imageData - Base64 string or data URL
 * @returns Buffer and MIME type
 */
function parseImageData(imageData: string): { buffer: Buffer; mimeType: string } {
  // Handle data URL format: data:image/jpeg;base64,/9j/4AAQ...
  if (imageData.startsWith('data:')) {
    const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Invalid data URL format');
    }
    const mimeType = match[1].toLowerCase();
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    return { buffer, mimeType };
  }

  // Raw base64 - assume JPEG
  const buffer = Buffer.from(imageData, 'base64');
  return { buffer, mimeType: 'image/jpeg' };
}

/**
 * Determine output format based on input MIME type
 * HEIC, AVIF, TIFF are converted to JPEG for compatibility
 *
 * @param inputMimeType - Input image MIME type
 * @returns Output format and MIME type
 */
function getOutputFormat(inputMimeType: string): { format: string; mimeType: string } {
  const normalizedMime = inputMimeType.toLowerCase();

  // Map to output format
  const format = SUPPORTED_OUTPUT_TYPES[normalizedMime];

  if (!format) {
    // Unknown format - default to JPEG
    return { format: 'jpeg', mimeType: 'image/jpeg' };
  }

  // Return original MIME type for standard formats, JPEG for converted ones
  const outputMime =
    format === 'jpeg' && normalizedMime !== 'image/jpeg' ? 'image/jpeg' : normalizedMime;

  return { format, mimeType: outputMime };
}

/**
 * Ensure an image fits within a model's pixel limit
 *
 * This is the core function for preventing GPU OOM errors.
 * If the image exceeds the model's limit, it's resized to fit while
 * maintaining aspect ratio.
 *
 * @param imageData - Base64 encoded image data (raw or data URL)
 * @param modelId - Target model ID (e.g., 'real-esrgan', 'clarity-upscaler')
 * @param options - Optional resize settings
 * @returns Resize result with possibly resized image and metadata
 *
 * @example
 * ```typescript
 * const result = await ensureFitsModel(base64Image, 'real-esrgan');
 * if (result.wasResized) {
 *   console.log(`Resized from ${result.originalDimensions.width}x${result.originalDimensions.height}`);
 * }
 * // Use result.imageData for processing
 * ```
 */
export async function ensureFitsModel(
  imageData: string,
  modelId: string,
  options: IResizeOptions = {}
): Promise<IResizeResult> {
  const { quality } = { ...DEFAULT_OPTIONS, ...options };
  const maxPixels = options.maxPixels ?? getMaxPixelsForModel(modelId);

  // Parse input image
  const { buffer: inputBuffer, mimeType: inputMimeType } = parseImageData(imageData);

  // Get image metadata using sharp
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(inputBuffer).metadata();
  } catch (error) {
    throw new Error(
      `Failed to read image metadata: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Validate dimensions are readable
  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to determine image dimensions');
  }

  const originalWidth = metadata.width;
  const originalHeight = metadata.height;
  const originalPixels = originalWidth * originalHeight;

  // Check if resize is needed
  if (originalPixels <= maxPixels) {
    // Image fits within limit - return as-is
    // Reconstruct data URL if needed for consistency
    const outputData = imageData.startsWith('data:')
      ? imageData
      : `data:${inputMimeType};base64,${imageData}`;

    return {
      imageData: outputData,
      mimeType: inputMimeType,
      dimensions: { width: originalWidth, height: originalHeight },
      wasResized: false,
    };
  }

  // Calculate scale factor to fit within maxPixels while maintaining aspect ratio
  // scale = sqrt(maxPixels / originalPixels)
  const scaleFactor = Math.sqrt(maxPixels / originalPixels);
  const targetWidth = Math.floor(originalWidth * scaleFactor);
  const targetHeight = Math.floor(originalHeight * scaleFactor);

  // Ensure we don't exceed maxPixels due to rounding
  let finalWidth = targetWidth;
  let finalHeight = targetHeight;
  if (finalWidth * finalHeight > maxPixels) {
    // Reduce by 1 pixel on each dimension to be safe
    finalWidth = Math.max(1, targetWidth - 1);
    finalHeight = Math.max(1, targetHeight - 1);
  }

  // Determine output format
  const { format, mimeType: outputMimeType } = getOutputFormat(inputMimeType);

  // Perform resize using sharp
  let resizedBuffer: Buffer;
  try {
    const sharpInstance = sharp(inputBuffer).resize(finalWidth, finalHeight, {
      fit: 'inside',
      withoutEnlargement: true,
      kernel: 'lanczos3', // High-quality downsampling
    });

    // Apply format-specific options
    switch (format) {
      case 'jpeg':
        resizedBuffer = await sharpInstance.jpeg({ quality }).toBuffer();
        break;
      case 'png':
        resizedBuffer = await sharpInstance.png({ compressionLevel: 6 }).toBuffer();
        break;
      case 'webp':
        resizedBuffer = await sharpInstance.webp({ quality }).toBuffer();
        break;
      default:
        resizedBuffer = await sharpInstance.jpeg({ quality }).toBuffer();
    }
  } catch (error) {
    throw new Error(
      `Failed to resize image: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Verify resized dimensions
  const resizedMetadata = await sharp(resizedBuffer).metadata();
  if (!resizedMetadata.width || !resizedMetadata.height) {
    throw new Error('Failed to verify resized image dimensions');
  }

  // Convert to base64 data URL
  const base64Data = resizedBuffer.toString('base64');
  const outputData = `data:${outputMimeType};base64,${base64Data}`;

  return {
    imageData: outputData,
    mimeType: outputMimeType,
    dimensions: { width: resizedMetadata.width, height: resizedMetadata.height },
    wasResized: true,
    originalDimensions: { width: originalWidth, height: originalHeight },
  };
}

/**
 * Get image dimensions from base64 data using sharp
 *
 * @param imageData - Base64 encoded image data
 * @returns Dimensions or null if unable to determine
 */
export async function getImageDimensions(
  imageData: string
): Promise<{ width: number; height: number } | null> {
  try {
    const { buffer } = parseImageData(imageData);
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) {
      return null;
    }

    return { width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}
