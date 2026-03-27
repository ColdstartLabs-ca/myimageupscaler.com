/**
 * Gallery Validation Schemas
 * Zod schemas for gallery API request validation
 */

import { z } from 'zod';

/**
 * Processing mode enum for validation
 */
export const processingModeSchema = z.enum(['upscale', 'enhance', 'both', 'custom']);

/**
 * Schema for saving an image to the gallery
 */
export const saveImageSchema = z.object({
  /** URL of the image to save (CDN URL from processing result) */
  imageUrl: z
    .string()
    .url('Image URL must be a valid URL')
    .refine(
      url => url.startsWith('http://') || url.startsWith('https://'),
      'Image URL must use HTTP or HTTPS protocol'
    ),
  /** Original filename for display purposes */
  filename: z
    .string()
    .min(1, 'Filename is required')
    .max(255, 'Filename must be at most 255 characters')
    .refine(
      name => !name.includes('/') && !name.includes('\\'),
      'Filename cannot contain path separators'
    ),
  /** Original image width in pixels (optional metadata) */
  width: z.number().int().positive('Width must be a positive integer').optional(),
  /** Original image height in pixels (optional metadata) */
  height: z.number().int().positive('Height must be a positive integer').optional(),
  /** AI model used for processing (optional metadata) */
  modelUsed: z.string().max(100, 'Model name must be at most 100 characters').optional(),
  /** Processing mode applied (optional metadata) */
  processingMode: processingModeSchema.optional(),
});

export type ISaveImageInput = z.infer<typeof saveImageSchema>;

/**
 * Schema for gallery list query parameters
 */
export const galleryListQuerySchema = z.object({
  /** Page number (1-indexed, default: 1) */
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  /** Number of items per page (default: 20, max: 100) */
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'Page size must be at least 1')
    .max(100, 'Page size must be at most 100')
    .default(20),
  /** Sort order */
  sortOrder: z.enum(['created_at_desc', 'created_at_asc']).default('created_at_desc'),
});

export type IGalleryListQueryInput = z.infer<typeof galleryListQuerySchema>;

/**
 * Schema for delete image request (path parameter)
 */
export const deleteImageSchema = z.object({
  /** Image ID to delete */
  id: z.string().uuid('Image ID must be a valid UUID'),
});

export type IDeleteImageInput = z.infer<typeof deleteImageSchema>;
