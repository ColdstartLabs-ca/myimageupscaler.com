import {
  buildDevKey,
  deleteObject,
  presignGet,
  put,
  R2_PRIVATE_BUCKET,
  R2_PUBLIC_BASE_URL,
  R2_PUBLIC_BUCKET,
} from '@server/services/r2-storage.service';
import { decodeImageDimensions } from '@shared/validation/upscale.schema';
import { supabaseAdmin } from '../supabase/supabaseAdmin';
import type {
  IBlogImageMetadataWithDb,
  ISaveBlogImageMetadataInput,
  ISearchBlogImagesQuery,
} from '@shared/validation/blog.schema';

// =============================================================================
// Configuration
// =============================================================================

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
 * Maximum file size before transform: 10MB
 */
const MAX_INPUT_SIZE = 10 * 1024 * 1024;

/**
 * Maximum transformed output size: 10MB
 */
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;

/**
 * Cloudflare image transform settings. The transform runs at the edge, so the
 * Worker CPU limit does not apply to the resize/encode itself.
 */
const TRANSFORM_CONFIG = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 80,
} as const;

/** Hard ceiling for the edge transform fetch. */
const TRANSFORM_TIMEOUT_MS = 30_000;

/** Private prefix for the short-lived staged original. */
const STAGED_PREFIX_SEGMENT = 'blog-transform';

// =============================================================================
// PUBLIC FUNCTIONS
// =============================================================================

/**
 * Upload an image to R2 storage with compression
 *
 * @param buffer - Image data as buffer
 * @param filename - Original filename
 * @param mimeType - MIME type of the image
 * @returns Object with public URL and relative storage path
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

  // Stage the original under a unique private key with an immutable PUT. The
  // key is only owned once the PUT succeeds; a collision (412) or an ambiguous
  // failure must never trigger a delete of bytes this request does not own.
  const stagedKey = buildDevKey(STAGED_PREFIX_SEGMENT, crypto.randomUUID());
  let stagedOwned = false;
  let outputBytes: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let width = 0;
  let height = 0;

  try {
    await put(R2_PRIVATE_BUCKET, stagedKey, new Uint8Array(buffer), mimeType);
    stagedOwned = true;

    // Ask Cloudflare to resize and re-encode the staged original to WebP.
    const presignedUrl = await presignGet(R2_PRIVATE_BUCKET, stagedKey);
    const transformOptions = {
      cache: 'no-store' as const,
      redirect: 'manual' as const,
      signal: AbortSignal.timeout(TRANSFORM_TIMEOUT_MS),
      cf: {
        image: {
          width: TRANSFORM_CONFIG.maxWidth,
          height: TRANSFORM_CONFIG.maxHeight,
          fit: 'scale-down',
          format: 'webp',
          quality: TRANSFORM_CONFIG.quality,
          metadata: 'none',
          anim: false,
        },
      },
    };
    const response = await fetch(presignedUrl, transformOptions);

    if (!response.ok) {
      throw new Error(`Blog image transform failed: ${response.status}`);
    }

    const contentType = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (contentType !== 'image/webp') {
      throw new Error(`Blog image transform returned ${contentType || 'no'} content type`);
    }

    outputBytes = await readBoundedBody(response, MAX_OUTPUT_SIZE);
    if (outputBytes.byteLength === 0) {
      throw new Error('Blog image transform returned an empty body');
    }

    // The transform must return real WebP. The content type header is only a
    // hint, so verify the actual framing before trusting the bytes.
    const dimensions = decodeWebpOutputDimensions(outputBytes);
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      throw new Error('Unable to decode transformed image dimensions');
    }
    if (
      dimensions.width > TRANSFORM_CONFIG.maxWidth ||
      dimensions.height > TRANSFORM_CONFIG.maxHeight
    ) {
      throw new Error('Transformed image exceeds maximum dimensions');
    }
    width = dimensions.width;
    height = dimensions.height;
  } finally {
    // Remove the staged copy before the public write. A cleanup failure stops
    // the request, so no public result is ever acknowledged without cleanup.
    if (stagedOwned) {
      await deleteObject(R2_PRIVATE_BUCKET, stagedKey);
    }
  }

  // Generate unique filename with timestamp
  const timestamp = Date.now();
  const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
  const baseName = sanitizedName.replace(/\.[^.]+$/, ''); // Remove extension
  const storagePath = `${getDatePath()}/${timestamp}-${baseName}.webp`;

  // Upload to R2 (public bucket). The public bucket holds blog images only, so
  // the object key equals the relative `storage_path` (`YYYY/MM/<name>.webp`).
  await put(R2_PUBLIC_BUCKET, storagePath, outputBytes, 'image/webp');

  return {
    url: buildPublicUrl(storagePath),
    id: storagePath,
    width,
    height,
  };
}

/**
 * Delete an image from R2 storage
 *
 * @param path - Relative storage path of the image
 */
export async function deleteBlogImage(path: string): Promise<void> {
  await deleteObject(R2_PUBLIC_BUCKET, path);
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
  // Bounded, Worker-compatible decoder: no native image library is loaded.
  // The shared decoder covers JPEG/PNG/WebP. GIF is only needed for blog
  // images, so its handling stays local and never widens the shared decoder
  // used by the upscale security path.
  const dimensions =
    decodeImageDimensions(buffer.toString('base64')) ?? decodeGifDimensions(buffer);

  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error('Unable to extract image dimensions');
  }

  return {
    width: dimensions.width,
    height: dimensions.height,
  };
}

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * Read a response body while bounding the total bytes. An over-limit body stops
 * the stream immediately and never reaches the public bucket.
 */
async function readBoundedBody(
  response: Response,
  maxBytes: number
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Blog image transform returned no body');
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error('Blog image transform output exceeds size limit');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** RIFF container magic ("RIFF") and WebP file magic ("WEBP"). */
const WEBP_RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_FILE_MAGIC = [0x57, 0x45, 0x42, 0x50] as const;

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function matchesMagic(bytes: Uint8Array, offset: number, magic: readonly number[]): boolean {
  return magic.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Decode the canvas dimensions of a real WebP payload. Unlike the generic
 * shared decoder, this verifies the full RIFF/WEBP signature and the chunk
 * bounds, so a JPEG/PNG/GIF body, a wrong-magic blob, or a truncated or
 * incomplete WebP chunk cannot be mistaken for valid transformed output.
 */
function decodeWebpOutputDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // 12-byte RIFF header plus an 8-byte chunk header.
  if (bytes.length < 20) return null;
  if (!matchesMagic(bytes, 0, WEBP_RIFF_MAGIC) || !matchesMagic(bytes, 8, WEBP_FILE_MAGIC)) {
    return null;
  }
  if (readUint32LE(bytes, 4) !== bytes.length - 8) return null;

  let hasImageData = false;
  for (let offset = 12; offset < bytes.length; ) {
    if (offset + 8 > bytes.length) return null;
    const size = readUint32LE(bytes, offset + 4);
    const next = offset + 8 + size + (size & 1);
    if (next > bytes.length) return null;
    const kind = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    if (kind === 'VP8 ') {
      if (
        size < 10 ||
        bytes[offset + 11] !== 0x9d ||
        bytes[offset + 12] !== 0x01 ||
        bytes[offset + 13] !== 0x2a
      )
        return null;
      hasImageData = true;
    } else if (kind === 'VP8L') {
      if (size < 5 || bytes[offset + 8] !== 0x2f) return null;
      hasImageData = true;
    }
    offset = next;
  }
  if (!hasImageData) return null;

  const fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  const chunkSize = readUint32LE(bytes, 16);
  // The declared chunk must fit inside the bytes actually received.
  if (20 + chunkSize > bytes.length) return null;

  if (fourcc === 'VP8X') {
    if (chunkSize < 10 || bytes.length < 30) return null;
    const width = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
    const height = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
    return { width, height };
  }

  if (fourcc === 'VP8 ') {
    if (chunkSize < 10 || bytes.length < 30) return null;
    // Key-frame start code marks a real VP8 frame header at offset 23.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = ((bytes[27] << 8) | bytes[26]) & 0x3fff;
    const height = ((bytes[29] << 8) | bytes[28]) & 0x3fff;
    return { width, height };
  }

  if (fourcc === 'VP8L') {
    if (chunkSize < 5 || bytes.length < 25) return null;
    if (bytes[20] !== 0x2f) return null;
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }

  return null;
}

/**
 * Read GIF dimensions. GIF stays a blog-only format: the shared decoder does
 * not accept it, so this keeps the shared security boundary unchanged.
 */
function decodeGifDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 10) return null;
  const signature = buffer.toString('latin1', 0, 6);
  if (signature !== 'GIF87a' && signature !== 'GIF89a') return null;
  const width = buffer[6] | (buffer[7] << 8);
  const height = buffer[8] | (buffer[9] << 8);
  return { width, height };
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

/**
 * Build the public URL for a blog object key, encoding each path segment.
 */
function buildPublicUrl(objectKey: string): string {
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  return `${R2_PUBLIC_BASE_URL}/${encodedKey}`;
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
