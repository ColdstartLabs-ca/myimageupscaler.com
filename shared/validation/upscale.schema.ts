import { z } from 'zod';

// Enhancement settings schema (reusable)
const enhancementSettingsSchema = z.object({
  clarity: z.boolean().default(true),
  color: z.boolean().default(true),
  lighting: z.boolean().default(false),
  denoise: z.boolean().default(true),
  artifacts: z.boolean().default(true),
  details: z.boolean().default(false),
});

// Nano Banana Pro configuration schema
const nanoBananaProConfigSchema = z.object({
  aspectRatio: z
    .enum([
      'match_input_image',
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9',
    ])
    .default('match_input_image'),
  resolution: z.enum(['1K', '2K', '4K']).default('2K'),
  outputFormat: z.enum(['jpg', 'png']).default('png'),
  safetyFilterLevel: z
    .enum(['block_low_and_above', 'block_medium_and_above', 'block_only_high'])
    .default('block_only_high'),
});

/**
 * Image validation constants
 */
export const IMAGE_VALIDATION = {
  MAX_SIZE_FREE: 5 * 1024 * 1024, // 5MB for free tier
  MAX_SIZE_PAID: 25 * 1024 * 1024, // 25MB for paid tier
  MAX_SIZE_DEFAULT: 5 * 1024 * 1024, // Default to free tier limit
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const,
  MIN_DIMENSION: 64,
  MAX_DIMENSION: 8192,
  MAX_PIXELS: 2_000_000, // ~1414x1414 max - GPU memory limit for upscaling
};

/**
 * Calculate the approximate size of base64 data in bytes
 */
export function getBase64Size(base64: string): number {
  // Remove data URL prefix if present
  const data = base64.includes(',') ? base64.split(',')[1] : base64;
  // Base64 encodes 3 bytes into 4 characters, so multiply by 0.75
  // Account for padding characters
  const padding = (data.match(/=/g) || []).length;
  return Math.floor((data.length * 3) / 4) - padding;
}

/**
 * Result of tier-aware image validation
 */
export interface IImageValidationResult {
  valid: boolean;
  error?: string;
  sizeBytes?: number;
}

/**
 * Validate image size based on user tier
 * Call this AFTER Zod schema validation and BEFORE processing/charging credits
 *
 * @param imageData - Base64 encoded image data
 * @param isPaidUser - Whether the user has a paid subscription
 * @returns Validation result with error message if invalid
 */
export function validateImageSizeForTier(
  imageData: string,
  isPaidUser: boolean
): IImageValidationResult {
  const sizeBytes = getBase64Size(imageData);
  const maxSize = isPaidUser ? IMAGE_VALIDATION.MAX_SIZE_PAID : IMAGE_VALIDATION.MAX_SIZE_FREE;
  const maxSizeMB = maxSize / 1024 / 1024;

  if (sizeBytes > maxSize) {
    return {
      valid: false,
      error: `Image size (${(sizeBytes / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowed for your tier (${maxSizeMB}MB)`,
      sizeBytes,
    };
  }

  return { valid: true, sizeBytes };
}

/**
 * Validate image dimensions
 * Note: This requires decoding the image which should be done server-side
 *
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns Validation result with error message if invalid
 */
export function validateImageDimensions(width: number, height: number): IImageValidationResult {
  const { MIN_DIMENSION, MAX_DIMENSION } = IMAGE_VALIDATION;

  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    return {
      valid: false,
      error: `Image dimensions (${width}x${height}) are too small. Minimum: ${MIN_DIMENSION}x${MIN_DIMENSION}px`,
    };
  }

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return {
      valid: false,
      error: `Image dimensions (${width}x${height}) are too large. Maximum: ${MAX_DIMENSION}x${MAX_DIMENSION}px`,
    };
  }

  return { valid: true };
}

/**
 * Validation schema for the upscale API endpoint
 * New format based on Quality Tiers and Additional Options
 *
 * Note: Size validation is intentionally NOT in this schema because
 * the limit depends on user tier. Use validateImageSizeForTier() after
 * determining user subscription status.
 */
export const upscaleSchema = z.object({
  imageData: z
    .string()
    .min(1, 'Image data is required')
    .refine(
      data => {
        // Basic check that it looks like base64 data
        // Allows for data URLs or raw base64
        if (data.startsWith('data:')) {
          const base64Part = data.split(',')[1];
          return base64Part && base64Part.length > 0;
        }
        return data.length > 0;
      },
      { message: 'Invalid image data format' }
    ),
  mimeType: z
    .string()
    .default('image/jpeg')
    .refine(
      type =>
        IMAGE_VALIDATION.ALLOWED_TYPES.includes(
          type as (typeof IMAGE_VALIDATION.ALLOWED_TYPES)[number]
        ),
      { message: `Invalid image type. Allowed: ${IMAGE_VALIDATION.ALLOWED_TYPES.join(', ')}` }
    ),
  // Enhancement prompt from LLM analysis (legacy - will be removed)
  enhancementPrompt: z.string().optional(),
  config: z.object({
    // New quality tier based configuration
    qualityTier: z
      .enum(['auto', 'quick', 'face-restore', 'budget-edit', 'hd-upscale', 'face-pro', 'ultra'])
      .default('auto'),
    scale: z.union([z.literal(2), z.literal(4), z.literal(8)]).default(2),

    // Additional options (replaces mode + toggles)
    additionalOptions: z
      .object({
        smartAnalysis: z.boolean().default(false), // AI suggests enhancements (hidden when tier='auto')
        enhance: z.boolean().default(false), // Enable enhancement processing
        enhanceFaces: z.boolean().default(false), // Face restoration - user opt-in
        preserveText: z.boolean().default(false), // Text preservation - user opt-in
        customInstructions: z.string().optional(), // Custom LLM prompt (opens modal when enabled)
        enhancement: enhancementSettingsSchema.optional(), // Detailed enhancement settings
      })
      .default({
        smartAnalysis: false,
        enhance: false,
        enhanceFaces: false,
        preserveText: false,
      }),

    // Studio tier specific configuration (only for 'studio' tier)
    nanoBananaProConfig: nanoBananaProConfigSchema.optional(),
  }),
});

/**
 * Magic bytes for supported image formats
 */
const MAGIC_BYTES = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header (WebP starts with RIFF)
  'image/gif': [0x47, 0x49, 0x46], // GIF87a or GIF89a
} as const;

/**
 * Validate image magic bytes against claimed MIME type
 * @param imageData - Base64 encoded image data
 * @param claimedMimeType - MIME type claimed by client
 */
export function validateMagicBytes(
  imageData: string,
  claimedMimeType: string
): IImageValidationResult & { detectedMimeType?: string } {
  try {
    // Extract base64 data
    const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;

    if (!base64Data || base64Data.length < 16) {
      return {
        valid: false,
        error: 'Image data too short for format detection',
      };
    }

    // Decode first 12 bytes (enough for all checks)
    const binaryString = atob(base64Data.slice(0, 16));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Detect actual MIME type from magic bytes
    let detectedMimeType: string | null = null;

    for (const [mimeType, signature] of Object.entries(MAGIC_BYTES)) {
      if (signature.every((byte, index) => bytes[index] === byte)) {
        // Special check for WebP (RIFF header + WEBP at offset 8)
        if (mimeType === 'image/webp') {
          const webpSignature = [0x57, 0x45, 0x42, 0x50]; // "WEBP"
          if (!webpSignature.every((byte, i) => bytes[i + 8] === byte)) {
            continue; // Not actually WebP
          }
        }
        detectedMimeType = mimeType;
        break;
      }
    }

    // HEIC detection (more complex, check for ftyp box)
    if (
      !detectedMimeType &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    ) {
      detectedMimeType = 'image/heic';
    }

    if (!detectedMimeType) {
      return {
        valid: false,
        error: 'Unrecognized image format',
      };
    }

    // Normalize MIME types for comparison
    const normalizedClaimed = claimedMimeType.toLowerCase();
    const normalizedDetected = detectedMimeType.toLowerCase();

    if (normalizedClaimed !== normalizedDetected) {
      return {
        valid: false,
        error: `MIME type mismatch: claimed ${normalizedClaimed}, detected ${normalizedDetected}`,
        detectedMimeType,
      };
    }

    return { valid: true, detectedMimeType };
  } catch {
    return {
      valid: false,
      error: 'Failed to decode image data for format validation',
    };
  }
}

/**
 * Decode image dimensions from base64 data
 * Works for JPEG, PNG, and WebP
 */
export function decodeImageDimensions(imageData: string): { width: number; height: number } | null {
  const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;

  // Decode enough bytes for dimension extraction
  const binaryString = atob(base64Data.slice(0, 1000)); // First ~750 bytes
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // PNG: dimensions at fixed offset (width at 16-19, height at 20-23)
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }

  // JPEG: scan for SOF0 or SOF2 marker
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] === 0xff) {
        const marker = bytes[i + 1];
        // SOF0 (0xC0) or SOF2 (0xC2) contain dimensions
        if (marker === 0xc0 || marker === 0xc2) {
          const height = (bytes[i + 5] << 8) | bytes[i + 6];
          const width = (bytes[i + 7] << 8) | bytes[i + 8];
          return { width, height };
        }
        // Skip to next marker
        const length = (bytes[i + 2] << 8) | bytes[i + 3];
        i += 2 + length;
      } else {
        i++;
      }
    }
  }

  // WebP: check for VP8 or VP8L chunk
  if (bytes[0] === 0x52 && bytes[1] === 0x49) {
    // VP8 lossy: dimensions at offset 26-29
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20) {
      const width = ((bytes[27] << 8) | bytes[26]) & 0x3fff;
      const height = ((bytes[29] << 8) | bytes[28]) & 0x3fff;
      return { width, height };
    }
    // VP8L lossless: dimensions at offset 21-24
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x4c) {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return { width, height };
    }
  }

  return null; // Could not decode
}

export type IUpscaleInput = z.infer<typeof upscaleSchema>;
export type IUpscaleConfig = z.infer<typeof upscaleSchema>['config'];
