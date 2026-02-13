import { z } from 'zod';

// =============================================================================
// Blog Post Validation Schemas
// =============================================================================

/**
 * Slug validation - lowercase alphanumeric with hyphens
 * Matches the database constraint: slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
 */
const slugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters')
  .max(100, 'Slug must be at most 100 characters')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase with hyphens only');

/**
 * Blog post status enum
 */
export const blogStatusSchema = z.enum(['draft', 'published']);

export type IBlogStatus = z.infer<typeof blogStatusSchema>;

/**
 * Schema for creating a new blog post
 */
export const createBlogPostSchema = z.object({
  slug: slugSchema,
  title: z
    .string()
    .min(5, 'Title must be at least 5 characters')
    .max(200, 'Title must be at most 200 characters'),
  description: z
    .string()
    .min(20, 'Description must be at least 20 characters')
    .max(500, 'Description must be at most 500 characters'),
  content: z.string().min(100, 'Content must be at least 100 characters'),
  author: z.string().min(1).max(100).default('MyImageUpscaler Team'),
  category: z
    .string()
    .min(2, 'Category must be at least 2 characters')
    .max(50, 'Category must be at most 50 characters'),
  tags: z.array(z.string().min(2).max(30)).max(10, 'Maximum 10 tags allowed').default([]),
  featured_image_url: z.string().url('Featured image URL must be a valid URL').optional(),
  featured_image_alt: z
    .string()
    .max(200, 'Featured image alt text must be at most 200 characters')
    .optional(),
  seo_title: z.string().max(70, 'SEO title must be at most 70 characters').optional(),
  seo_description: z.string().max(160, 'SEO description must be at most 160 characters').optional(),
});

export type ICreateBlogPostInput = z.infer<typeof createBlogPostSchema>;

/**
 * Schema for updating a blog post (all fields optional except slug is omitted)
 */
export const updateBlogPostSchema = createBlogPostSchema.omit({ slug: true }).partial();

export type IUpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>;

/**
 * Schema for listing blog posts with filters and pagination
 */
export const listBlogPostsSchema = z.object({
  status: blogStatusSchema.optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  limit: z.coerce
    .number()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must be at most 100')
    .default(20),
  offset: z.coerce.number().min(0, 'Offset must be non-negative').default(0),
  sort: z.enum(['created_at', 'updated_at', 'published_at', 'title']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type IListBlogPostsQuery = z.infer<typeof listBlogPostsSchema>;

/**
 * Blog image type enum (defined early for use in upload schemas)
 */
export const blogImageTypeSchema = z.enum(['featured', 'inline']);

export type IBlogImageType = z.infer<typeof blogImageTypeSchema>;

/**
 * Schema for image upload with optional metadata
 * All metadata fields are optional for backwards compatibility
 */
export const imageUploadSchema = z.object({
  imageData: z.string().startsWith('data:image/', 'Image data must be a base64 data URI'),
  filename: z
    .string()
    .min(1, 'Filename is required')
    .max(255, 'Filename must be at most 255 characters'),
  alt_text: z.string().max(200, 'Alt text must be at most 200 characters').optional(),
  // Optional metadata fields for blog image reuse system
  tags: z.array(z.string().min(1).max(50)).max(20, 'Maximum 20 tags allowed').optional(),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
  image_type: blogImageTypeSchema.optional(),
  width: z.number().int().positive('Width must be a positive integer').optional(),
  height: z.number().int().positive('Height must be a positive integer').optional(),
  prompt: z.string().max(2000, 'Prompt must be at most 2000 characters').optional(),
});

export type IImageUploadInput = z.infer<typeof imageUploadSchema>;

/**
 * Schema for multipart form upload metadata
 * Tags are passed as comma-separated string in form field
 */
export const imageUploadMetadataSchema = z.object({
  alt_text: z.string().max(200, 'Alt text must be at most 200 characters').optional(),
  tags: z.string().max(1000, 'Tags string must be at most 1000 characters').optional(),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
  image_type: blogImageTypeSchema.optional(),
  width: z.number().int().positive('Width must be a positive integer').optional(),
  height: z.number().int().positive('Height must be a positive integer').optional(),
  prompt: z.string().max(2000, 'Prompt must be at most 2000 characters').optional(),
});

export type IImageUploadMetadataInput = z.infer<typeof imageUploadMetadataSchema>;

/**
 * Schema for publish/unpublish actions
 */
export const publishActionSchema = z.object({
  scheduled_at: z.coerce.date().optional(),
});

export type IPublishActionInput = z.infer<typeof publishActionSchema>;

// =============================================================================
// Response Types
// =============================================================================

/**
 * Blog post entity from database
 * Includes computed properties for frontend compatibility
 */
export type IBlogPost = {
  id: string;
  slug: string;
  title: string;
  description: string;
  content: string;
  author: string;
  category: string;
  tags: string[];
  featured_image_url?: string;
  featured_image_alt?: string;
  status: IBlogStatus;
  published_at?: string;
  reading_time?: string;
  seo_title?: string;
  seo_description?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  // Computed properties for frontend compatibility
  /** Alias for published_at or created_at */
  date?: string;
  /** Alias for featured_image_url */
  image?: string;
  /** Alias for reading_time */
  readingTime?: string;
};

/**
 * Blog post metadata (for listings, without content)
 */
export interface IBlogPostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  category: string;
  tags: string[];
  image?: string;
  readingTime: string;
}

/**
 * Image upload response
 */
export interface IImageUploadResponse {
  url: string;
  key: string;
  filename: string;
  /** Metadata record ID if metadata was provided and saved */
  metadata_id?: string;
}

/**
 * Paginated list response
 */
export interface IPaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Single item response
 */
export interface ISingleResponse<T> {
  success: true;
  data: T;
}

/**
 * Error response
 */
export interface IErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// =============================================================================
// Blog Image Metadata Validation Schemas
// =============================================================================

/**
 * Schema for blog image metadata
 */
export const blogImageMetadataSchema = z.object({
  url: z.string().url('Image URL must be a valid URL'),
  storage_path: z.string().min(1, 'Storage path is required'),
  alt_text: z.string().max(200, 'Alt text must be at most 200 characters'),
  tags: z.array(z.string().min(1).max(50)).max(20, 'Maximum 20 tags allowed').default([]),
  description: z.string().max(500, 'Description must be at most 500 characters'),
  image_type: blogImageTypeSchema,
  width: z.number().int().positive('Width must be a positive integer'),
  height: z.number().int().positive('Height must be a positive integer'),
  prompt: z.string().max(2000, 'Prompt must be at most 2000 characters').optional(),
  used_in_posts: z.array(z.string().min(1).max(100)).default([]),
});

export type IBlogImageMetadata = z.infer<typeof blogImageMetadataSchema>;

/**
 * Schema for blog image metadata with database fields (includes id and created_at)
 */
export const blogImageMetadataWithDbSchema = blogImageMetadataSchema.extend({
  id: z.string().uuid(),
  created_at: z.string(),
});

export type IBlogImageMetadataWithDb = z.infer<typeof blogImageMetadataWithDbSchema>;

/**
 * Schema for searching blog images
 */
export const searchBlogImagesSchema = z.object({
  tags: z.array(z.string().min(1)).optional(),
  image_type: blogImageTypeSchema.optional(),
  limit: z.coerce
    .number()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must be at most 100')
    .default(10),
  offset: z.coerce.number().min(0, 'Offset must be non-negative').default(0),
});

export type ISearchBlogImagesQuery = z.infer<typeof searchBlogImagesSchema>;

/**
 * Schema for saving blog image metadata (input to service function)
 */
export const saveBlogImageMetadataSchema = z.object({
  url: z.string().url('Image URL must be a valid URL'),
  storage_path: z.string().min(1, 'Storage path is required'),
  alt_text: z.string().max(200, 'Alt text must be at most 200 characters'),
  tags: z.array(z.string().min(1).max(50)).max(20, 'Maximum 20 tags allowed').default([]),
  description: z.string().max(500, 'Description must be at most 500 characters'),
  image_type: blogImageTypeSchema,
  width: z.number().int().positive('Width must be a positive integer'),
  height: z.number().int().positive('Height must be a positive integer'),
  prompt: z.string().max(2000, 'Prompt must be at most 2000 characters').optional(),
});

export type ISaveBlogImageMetadataInput = z.infer<typeof saveBlogImageMetadataSchema>;
