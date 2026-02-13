import sharp from 'sharp';
import { supabaseAdmin } from '../supabase/supabaseAdmin';
import type {
  IBlogImageMetadataWithDb,
  ISaveBlogImageMetadataInput,
  ISearchBlogImagesQuery,
} from '@shared/validation/blog.schema';

// =============================================================================
// Configuration
// =============================================================================

const BUCKET_NAME = 'blog-images';

/**
 * Supported MIME types for image uploads
 */
const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/**
 * Maximum file size before compression: 10MB
 */
const MAX_INPUT_SIZE = 10 * 1024 * 1024;

/**
 * Compression settings
 */
const COMPRESSION_CONFIG = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 80,
  format: 'webp' as const,
};

// =============================================================================
// PUBLIC FUNCTIONS
// =============================================================================

/**
 * Upload an image to Supabase Storage with compression
 *
 * @param buffer - Image data as buffer
 * @param filename - Original filename
 * @param mimeType - MIME type of the image
 * @returns Object with CDN URL and storage path
 */
export async function uploadBlogImage(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<{ url: string; id: string; width: number; height: number }> {
  // Validate MIME type
  if (!SUPPORTED_MIME_TYPES.includes(mimeType as (typeof SUPPORTED_MIME_TYPES)[number])) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }

  // Validate file size
  if (buffer.length > MAX_INPUT_SIZE) {
    throw new Error(`File size exceeds ${MAX_INPUT_SIZE / (1024 * 1024)}MB limit`);
  }

  // Compress the image
  const compressedBuffer = await compressImage(buffer);

  // Extract dimensions from the compressed image (reflects actual stored dimensions)
  const compressedMetadata = await sharp(compressedBuffer).metadata();
  const width = compressedMetadata.width ?? 0;
  const height = compressedMetadata.height ?? 0;

  // Generate unique filename with timestamp
  const timestamp = Date.now();
  const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
  const baseName = sanitizedName.replace(/\.[^.]+$/, ''); // Remove extension
  const storagePath = `${getDatePath()}/${timestamp}-${baseName}.webp`;

  // Upload to Supabase Storage
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(storagePath, compressedBuffer, {
      contentType: 'image/webp',
      cacheControl: '31536000', // 1 year cache
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabaseAdmin.storage.from(BUCKET_NAME).getPublicUrl(data.path);

  return {
    url: urlData.publicUrl,
    id: data.path,
    width,
    height,
  };
}

/**
 * Delete an image from Supabase Storage
 *
 * @param path - Storage path of the image
 */
export async function deleteBlogImage(path: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(BUCKET_NAME).remove([path]);

  if (error) {
    throw new Error(`Failed to delete image: ${error.message}`);
  }
}

/**
 * Convert base64 data URI to buffer and MIME type
 *
 * @param dataUri - Base64 data URI (e.g., "data:image/jpeg;base64,...")
 * @returns Object with buffer and MIME type
 */
export function parseDataUri(dataUri: string): { buffer: Buffer; mimeType: string } {
  // Parse data URI format: data:image/jpeg;base64,/9j/4AAQ...
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new Error('Invalid data URI format');
  }

  const mimeType = match[1];
  const base64Data = match[2];

  // Convert base64 to buffer
  const buffer = Buffer.from(base64Data, 'base64');

  return { buffer, mimeType };
}

/**
 * Get image dimensions from a buffer
 *
 * @param buffer - Image data as buffer
 * @returns Object with width and height
 */
export async function getImageDimensions(
  buffer: Buffer
): Promise<{ width: number; height: number }> {
  const image = sharp(buffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to extract image dimensions');
  }

  return {
    width: metadata.width,
    height: metadata.height,
  };
}

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * Compress and optimize an image using sharp
 * - Resizes to max dimensions while maintaining aspect ratio
 * - Converts to WebP format for optimal compression
 * - Strips metadata
 */
async function compressImage(buffer: Buffer): Promise<Buffer> {
  const image = sharp(buffer);
  const metadata = await image.metadata();

  // Determine if resize is needed
  const needsResize =
    (metadata.width && metadata.width > COMPRESSION_CONFIG.maxWidth) ||
    (metadata.height && metadata.height > COMPRESSION_CONFIG.maxHeight);

  let pipeline = image;

  if (needsResize) {
    pipeline = pipeline.resize(COMPRESSION_CONFIG.maxWidth, COMPRESSION_CONFIG.maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Convert to WebP with compression
  const compressedBuffer = await pipeline.webp({ quality: COMPRESSION_CONFIG.quality }).toBuffer();

  return compressedBuffer;
}

/**
 * Generate date-based path for organized storage
 * Format: YYYY/MM
 */
function getDatePath(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}/${month}`;
}

// =============================================================================
// BLOG IMAGE METADATA FUNCTIONS
// =============================================================================

/**
 * Save blog image metadata to the database
 *
 * @param metadata - Image metadata to save
 * @returns The saved metadata record with id and created_at
 */
export async function saveBlogImageMetadata(
  metadata: ISaveBlogImageMetadataInput
): Promise<IBlogImageMetadataWithDb> {
  const { data, error } = await supabaseAdmin
    .from('blog_images')
    .insert({
      url: metadata.url,
      storage_path: metadata.storage_path,
      alt_text: metadata.alt_text,
      tags: metadata.tags,
      description: metadata.description,
      image_type: metadata.image_type,
      width: metadata.width,
      height: metadata.height,
      prompt: metadata.prompt ?? null,
      used_in_posts: [],
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save blog image metadata: ${error.message}`);
  }

  return data as IBlogImageMetadataWithDb;
}

/**
 * Search result from searchBlogImages including total count for pagination
 */
export interface ISearchBlogImagesResult {
  data: IBlogImageMetadataWithDb[];
  total: number;
}

/**
 * Search blog images by tags and/or image type
 *
 * @param query - Search parameters including tags, image_type, limit, and offset
 * @returns Object with matching blog image metadata and total count for pagination
 */
export async function searchBlogImages(
  query: ISearchBlogImagesQuery
): Promise<ISearchBlogImagesResult> {
  let dbQuery = supabaseAdmin
    .from('blog_images')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(query.offset, query.offset + query.limit - 1);

  // Filter by image_type if provided
  if (query.image_type) {
    dbQuery = dbQuery.eq('image_type', query.image_type);
  }

  // Filter by tags if provided (uses PostgreSQL array containment operator)
  if (query.tags && query.tags.length > 0) {
    dbQuery = dbQuery.contains('tags', query.tags);
  }

  const { data, error, count } = await dbQuery;

  if (error) {
    throw new Error(`Failed to search blog images: ${error.message}`);
  }

  return {
    data: (data as IBlogImageMetadataWithDb[]) ?? [],
    total: count ?? 0,
  };
}

/**
 * Get a blog image by its URL
 *
 * @param url - The public URL of the image
 * @returns The blog image metadata or null if not found
 */
export async function getBlogImageByUrl(url: string): Promise<IBlogImageMetadataWithDb | null> {
  const { data, error } = await supabaseAdmin
    .from('blog_images')
    .select('*')
    .eq('url', url)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get blog image by URL: ${error.message}`);
  }

  return data as IBlogImageMetadataWithDb | null;
}

/**
 * Update the used_in_posts array for a blog image
 *
 * @param imageId - The UUID of the image
 * @param postSlugs - Array of post slugs to set
 */
export async function updateBlogImageUsedInPosts(
  imageId: string,
  postSlugs: string[]
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('blog_images')
    .update({ used_in_posts: postSlugs })
    .eq('id', imageId);

  if (error) {
    throw new Error(`Failed to update blog image used_in_posts: ${error.message}`);
  }
}
