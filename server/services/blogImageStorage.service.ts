import sharp from 'sharp';
import { supabaseAdmin } from '../supabase/supabaseAdmin';

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
): Promise<{ url: string; id: string }> {
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
