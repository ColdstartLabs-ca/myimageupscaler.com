import { serverEnv } from '@shared/config/env';

// =============================================================================
// Cloudflare Images Configuration
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
 * Maximum file size: 10MB
 * Cloudflare Images has a 10MB limit for direct uploads
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// =============================================================================
// PUBLIC FUNCTIONS
// =============================================================================

/**
 * Upload an image buffer to Cloudflare Images
 *
 * Uses Cloudflare Images API v1
 * Requires Pro plan with Images enabled
 *
 * @param buffer - Image data as buffer
 * @param filename - Original filename
 * @param mimeType - MIME type of the image
 * @returns Object with CDN URL and image ID
 */
export async function uploadToCloudflareImages(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<{ url: string; id: string }> {
  // Validate MIME type
  if (!SUPPORTED_MIME_TYPES.includes(mimeType as (typeof SUPPORTED_MIME_TYPES)[number])) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }

  // Validate file size
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
  }

  // Create FormData for Cloudflare Images API
  const formData = new FormData();
  // Convert Buffer to Uint8Array for Blob compatibility
  const uint8Array = new Uint8Array(buffer);
  formData.append('file', new Blob([uint8Array], { type: mimeType }), filename);

  // Cloudflare Images API endpoint
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${serverEnv.CLOUDFLARE_ACCOUNT_ID}/images/v1`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serverEnv.CLOUDFLARE_API_TOKEN}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cloudflare Images upload failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Cloudflare Images upload failed: ${JSON.stringify(data.errors)}`);
  }

  // Return the direct URL and image ID
  // Cloudflare Images returns variants array with different sizes
  // We use the first variant (usually the original or public URL)
  const imageUrl = data.result.variants?.[0] || data.result.display_url;

  return {
    url: imageUrl,
    id: data.result.id,
  };
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
