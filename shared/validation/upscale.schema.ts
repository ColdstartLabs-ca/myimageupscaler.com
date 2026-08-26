import { z } from 'zod';

import { MODEL_MAX_INPUT_PIXELS } from '@shared/config/model-costs.config';
import { QUALITY_TIER_CONFIG, type QualityTier } from '@shared/types/coreflow.types';

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
  // 10MB, not 25MB. A 25MB image base64-encodes to ~33MB of body, which the
  // Worker cannot buffer: the paid ceiling was above MAX_REQUEST_BYTES, so a
  // paid user uploading the size we advertised was rejected or killed the
  // Worker outright. 10MB * 1.4 envelope = 14MB of body, inside the cap.
  MAX_SIZE_PAID: 10 * 1024 * 1024, // 10MB for paid tier
  MAX_SIZE_DEFAULT: 5 * 1024 * 1024, // Default to free tier limit
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const,
  MIN_DIMENSION: 64,
  MAX_DIMENSION: 8192,
  MAX_PIXELS: 1_500_000, // ~1225x1225 max - GPU memory limit for upscaling (matches real-esrgan)
  // Ceiling for the whole JSON request body, not the decoded image. The Worker
  // gets 128MB; `req.json()` holds the raw text and the parsed string, and JS
  // strings are UTF-16, so peak is ~4 bytes per body byte. 24MB of body peaked
  // at ~96MB and left only ~32MB for the runtime, the decoded image and the
  // provider response, so the Worker still died under the guard. 16MB caps the
  // peak at 64MB, half the heap.
  MAX_REQUEST_BYTES: 16 * 1024 * 1024,
};

/**
 * Index where the base64 payload starts, skipping any `data:...;base64,` prefix.
 *
 * These strings are megabytes. Every full copy costs ~2 bytes per character
 * against the Worker's 128MB limit, so callers take an offset and slice only
 * the bytes they actually read rather than splitting the whole payload.
 */
export function getBase64PayloadOffset(imageData: string): number {
  if (!imageData.startsWith('data:')) return 0;
  const comma = imageData.indexOf(',');
  return comma === -1 ? 0 : comma + 1;
}

/** Length of the base64 payload without materializing it. */
export function getBase64PayloadLength(imageData: string): number {
  return Math.max(0, imageData.length - getBase64PayloadOffset(imageData));
}

/** Read the first `length` characters of the payload without copying the rest. */
export function readBase64Prefix(imageData: string, length: number): string {
  const offset = getBase64PayloadOffset(imageData);
  return imageData.slice(offset, offset + length);
}

/**
 * Calculate the approximate size of base64 data in bytes
 */
export function getBase64Size(base64: string): number {
  const length = getBase64PayloadLength(base64);
  if (length === 0) return 0;
  // Base64 padding is at most two '=' and always at the very end, so the tail
  // answers it — scanning the full payload would allocate a match array per call.
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((length * 3) / 4) - padding;
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
 * Get the maximum input pixels for a specific model
 * Returns the model-specific limit if defined, otherwise falls back to the global default
 *
 * @param modelId - The model identifier (e.g., 'real-esrgan', 'gfpgan')
 * @returns Maximum number of pixels allowed for the model
 */
export function getMaxPixelsForModel(modelId: string): number {
  if (modelId in MODEL_MAX_INPUT_PIXELS) {
    return MODEL_MAX_INPUT_PIXELS[modelId];
  }
  // Fallback to global default (most conservative)
  return IMAGE_VALIDATION.MAX_PIXELS;
}

/**
 * Get the client-side pixel limit for a quality tier.
 *
 * Explicit model tiers use their model-specific limit. `auto` falls back to the
 * conservative global default because the server may still resolve to a stricter
 * model. `bg-removal` skips Replicate entirely, so it has no Replicate pixel cap.
 */
export function getMaxPixelsForQualityTier(qualityTier: QualityTier): number | null {
  if (qualityTier === 'bg-removal' || qualityTier === 'quick') {
    // Quick must preserve the original input dimensions. The server either uses
    // Real-ESRGAN directly, routes eligible 2x requests to a tiled fallback, or
    // rejects the request. Never silently downsize and redefine the selected scale.
    return null;
  }

  const modelId = QUALITY_TIER_CONFIG[qualityTier]?.modelId;
  if (!modelId) {
    return IMAGE_VALIDATION.MAX_PIXELS;
  }

  return getMaxPixelsForModel(modelId);
}

/**
 * Validation schema for the upscale API endpoint
 * New format based on Quality Tiers and Additional Options
 *
 * Note: Size validation is intentionally NOT in this schema because
 * the limit depends on user tier. Use validateImageSizeForTier() after
 * determining user subscription status.
 */
export const upscaleSchema = z
  .object({
    imageData: z
      .string()
      .min(1, 'Image data is required')
      .refine(
        // Length arithmetic only — splitting here would copy the whole payload
        // before the request has been size-checked.
        data => getBase64PayloadLength(data) > 0,
        { message: 'Invalid image data format' }
      )
      .optional(),
    storagePath: z.string().trim().min(1).max(200).optional(),
    jobId: z.string().uuid().optional(),
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
        .enum([
          'auto',
          'quick',
          'face-restore',
          'fast-edit',
          'budget-edit',
          'budget-old-photo',
          'seedream-edit',
          'anime-upscale',
          'hd-upscale',
          'face-pro',
          'ultra',
          'lighting-fix',
          'resume-photo',
          'photo-repair',
          'clarity-pro',
          'crisp-upscale',
          'nano-banana-2',
        ])
        .default('auto'),
      scale: z.union([z.literal(2), z.literal(4), z.literal(8)]).default(2),
      targetResolution: z.enum(['2k', '4k', '8k']).optional(),

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
  })
  .superRefine((input, context) => {
    const hasInlineImage = typeof input.imageData === 'string';
    const hasStorageImage = typeof input.storagePath === 'string';
    if (hasInlineImage === hasStorageImage) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one image source',
        path: ['imageData'],
      });
    }
    if (hasStorageImage && !input.jobId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A job ID is required for a temporary storage image',
        path: ['jobId'],
      });
    }
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

/** Brands that identify an ISO base-media file as HEIC/HEIF rather than video. */
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];

/**
 * Resolve the true image format from magic bytes.
 *
 * Returns `valid: true` with `detectedMimeType` whenever the content is a recognized
 * image format. It does NOT check that format against any allowlist — callers must do
 * that against `detectedMimeType`, never against the client-supplied value.
 *
 * @param imageData - Base64 encoded image data
 * @param _claimedMimeType - IGNORED. Retained so existing call sites keep compiling.
 *   The client-supplied MIME type is a hint, not evidence: an attacker sets it freely,
 *   so comparing it against the detected type rejected honest uploads without adding
 *   any protection. See git history for 2026-07-25.
 */
export function validateMagicBytes(
  imageData: string,
  _claimedMimeType?: string
): IImageValidationResult & { detectedMimeType?: string } {
  try {
    if (getBase64PayloadLength(imageData) < 16) {
      return {
        valid: false,
        error: 'Image data too short for format detection',
      };
    }

    // Decode first 12 bytes (enough for all checks)
    const binaryString = atob(readBase64Prefix(imageData, 16));
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

    // HEIC detection: an ISO base-media 'ftyp' box, but only when the brand at bytes
    // 8-11 is an actual HEIF brand. Without the brand check this also matches MP4,
    // MOV and M4A, letting video through as image/heic.
    if (
      !detectedMimeType &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    ) {
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
      if (HEIF_BRANDS.includes(brand)) {
        detectedMimeType = 'image/heic';
      }
    }

    if (!detectedMimeType) {
      return {
        valid: false,
        error: 'Unrecognized image format',
      };
    }

    // The detected type is authoritative and the claimed type is only a hint, so a
    // disagreement between two real image formats is not an error — a genuine PNG
    // labelled image/png-vs-jpeg is an ordinary user file. Callers must enforce their
    // allowlist against `detectedMimeType`, not against the client-supplied value.
    //
    // This does not weaken the guarantee that motivated magic-byte validation: content
    // must still resolve to a recognized image format before it reaches any AI provider.
    // Requiring claimed === detected never added protection, because an attacker sets
    // the claimed label themselves; it only rejected honest uploads.
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
  // Decode enough bytes for dimension extraction
  // Phone JPEGs often have 20-60KB EXIF blocks before SOF marker
  // Reading ~32KB ensures we can find dimensions in 99%+ of JPEGs
  // Align slice to multiple of 4 (base64 requirement) to avoid atob errors
  const rawSliceLen = Math.min(getBase64PayloadLength(imageData), 44000);
  const sliceLen = Math.floor(rawSliceLen / 4) * 4;
  let binaryString: string;
  try {
    binaryString = atob(readBase64Prefix(imageData, sliceLen));
  } catch {
    return null; // Invalid base64 - can't decode dimensions
  }
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

type IParsedUpscaleRequest = z.infer<typeof upscaleSchema>;

/** Internal processor input after storage/base64 resolution. */
export type IUpscaleInput = Omit<IParsedUpscaleRequest, 'imageData' | 'storagePath' | 'jobId'> & {
  imageData: string;
};
export type IUpscaleConfig = IParsedUpscaleRequest['config'];
