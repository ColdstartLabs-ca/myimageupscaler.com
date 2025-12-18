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
      .enum(['auto', 'quick', 'face-restore', 'hd-upscale', 'face-pro', 'ultra'])
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

export type IUpscaleInput = z.infer<typeof upscaleSchema>;
export type IUpscaleConfig = z.infer<typeof upscaleSchema>['config'];
