import { NextRequest, NextResponse } from 'next/server';
import { verifyBlogApiAuth, blogApiErrorResponse } from '@lib/middleware/blogApiAuth';
import {
  uploadBlogImage,
  parseDataUri,
  saveBlogImageMetadata,
} from '@server/services/blogImageStorage.service';
import {
  imageUploadSchema,
  imageUploadMetadataSchema,
  type ISingleResponse,
  type IImageUploadResponse,
  type IBlogImageType,
} from '@shared/validation/blog.schema';
import { createLogger } from '@server/monitoring/logger';
import { ZodError } from 'zod';

/**
 * Parse tags from comma-separated string to array
 */
function parseTags(tagsString: string | null | undefined): string[] | undefined {
  if (!tagsString) return undefined;
  return tagsString
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);
}

/**
 * Interface for extracted metadata from request
 */
interface IExtractedMetadata {
  alt_text?: string;
  tags?: string[];
  description?: string;
  image_type?: IBlogImageType;
  prompt?: string;
}

/**
 * POST /api/blog/images/upload - Upload an image to Supabase Storage
 *
 * Accepts two formats:
 * 1. multipart/form-data with file field and optional metadata fields
 * 2. JSON with imageData (base64 data URI), filename, and optional metadata
 *
 * Images are automatically compressed to WebP format (max 1920x1080, 80% quality)
 *
 * Optional metadata fields (for blog image reuse system):
 * - tags: string[] (comma-separated in multipart)
 * - description: string
 * - image_type: 'featured' | 'inline'
 * - prompt: string (AI generation prompt)
 *
 * Note: width/height are auto-extracted from the compressed image and stored in metadata.
 *
 * Requires x-api-key header authentication
 */
export async function POST(request: NextRequest) {
  const logger = createLogger(request, 'blog-images-upload');

  try {
    // Verify API key authentication
    const authResult = await verifyBlogApiAuth(request);
    if (!authResult.authenticated) {
      return authResult.error!;
    }

    const contentType = request.headers.get('content-type') || '';

    let buffer: Buffer;
    let filename: string;
    let mimeType: string;
    let metadata: IExtractedMetadata = {};

    if (contentType.startsWith('multipart/form-data')) {
      // Handle multipart/form-data
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return blogApiErrorResponse('VALIDATION_ERROR', 'No file provided', 400);
      }

      buffer = Buffer.from(await file.arrayBuffer());
      filename = file.name;
      mimeType = file.type;

      // Extract optional metadata from form fields
      const rawMetadata = {
        alt_text: formData.get('alt_text') as string | null,
        tags: formData.get('tags') as string | null,
        description: formData.get('description') as string | null,
        image_type: formData.get('image_type') as string | null,
        width: formData.get('width') as string | null,
        height: formData.get('height') as string | null,
        prompt: formData.get('prompt') as string | null,
      };

      // Validate metadata with Zod
      const validatedMetadata = imageUploadMetadataSchema.parse({
        alt_text: rawMetadata.alt_text || undefined,
        tags: rawMetadata.tags || undefined,
        description: rawMetadata.description || undefined,
        image_type: rawMetadata.image_type || undefined,
        width: rawMetadata.width ? parseInt(rawMetadata.width, 10) : undefined,
        height: rawMetadata.height ? parseInt(rawMetadata.height, 10) : undefined,
        prompt: rawMetadata.prompt || undefined,
      });

      // Parse tags from comma-separated string
      metadata = {
        ...validatedMetadata,
        tags: parseTags(validatedMetadata.tags ?? null),
      };

      logger.info('Processing multipart image upload', {
        filename,
        mimeType,
        size: buffer.length,
        hasMetadata: Object.keys(metadata).length > 0,
      });
    } else {
      // Handle JSON with base64
      const body = await request.json();
      const validatedData = imageUploadSchema.parse(body);

      const parsed = parseDataUri(validatedData.imageData);
      buffer = parsed.buffer;
      mimeType = parsed.mimeType;
      filename = validatedData.filename;

      // Extract metadata from validated JSON body
      // Note: width/height are not extracted here — actual dimensions come from the compressed upload result
      metadata = {
        alt_text: validatedData.alt_text,
        tags: validatedData.tags,
        description: validatedData.description,
        image_type: validatedData.image_type,
        prompt: validatedData.prompt,
      };

      logger.info('Processing base64 image upload', {
        filename,
        mimeType,
        size: buffer.length,
        hasMetadata: Object.keys(metadata).length > 0,
      });
    }

    // Compress and upload to Supabase Storage
    const result = await uploadBlogImage(buffer, filename, mimeType);

    logger.info('Image uploaded successfully', { id: result.id, url: result.url });

    // Prepare response data
    const responseData: IImageUploadResponse = {
      url: result.url,
      key: result.id, // Using image ID as the key
      filename: result.id, // Cloudflare Images uses ID as identifier
    };

    // Save metadata to blog_images table if any metadata is provided
    const hasMetadata =
      metadata.alt_text ||
      (metadata.tags && metadata.tags.length > 0) ||
      metadata.description ||
      metadata.image_type ||
      metadata.prompt;

    if (hasMetadata) {
      // Use dimensions from the compressed uploaded image (reflects actual stored size)
      // Caller-provided dimensions are ignored because the image is always compressed
      const finalWidth = result.width;
      const finalHeight = result.height;

      // Only save metadata if we have valid dimensions (DB requires width > 0 and height > 0)
      if (!finalWidth || !finalHeight) {
        logger.warn('Skipping metadata save: could not determine image dimensions', {
          width: finalWidth,
          height: finalHeight,
        });
      } else {
        // Save metadata to database
        const savedMetadata = await saveBlogImageMetadata({
          url: result.url,
          storage_path: result.id,
          alt_text: metadata.alt_text ?? '',
          tags: metadata.tags ?? [],
          description: metadata.description ?? '',
          image_type: metadata.image_type ?? 'inline',
          width: finalWidth,
          height: finalHeight,
          prompt: metadata.prompt,
        });

        // Add metadata ID to response
        responseData.metadata_id = savedMetadata.id;

        logger.info('Image metadata saved', { metadata_id: savedMetadata.id });
      }
    }

    const response: ISingleResponse<IImageUploadResponse> = {
      success: true,
      data: responseData,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return blogApiErrorResponse('VALIDATION_ERROR', 'Invalid request data', 400, error.errors);
    }

    // Handle specific storage errors
    if (error instanceof Error) {
      if (error.message.includes('Unsupported MIME type')) {
        return blogApiErrorResponse('UNSUPPORTED_TYPE', error.message, 400);
      }
      if (error.message.includes('exceeds') && error.message.includes('limit')) {
        return blogApiErrorResponse('FILE_TOO_LARGE', error.message, 400);
      }
      if (error.message.includes('Invalid data URI')) {
        return blogApiErrorResponse('INVALID_DATA_URI', error.message, 400);
      }
      if (
        error.message.includes('Storage upload failed') ||
        error.message.includes('Supabase Storage')
      ) {
        return blogApiErrorResponse('UPLOAD_FAILED', error.message, 500);
      }
      if (error.message.includes('Failed to save blog image metadata')) {
        return blogApiErrorResponse('METADATA_ERROR', error.message, 500);
      }
    }

    // Handle other errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to upload image', { message: errorMessage });
    return blogApiErrorResponse('INTERNAL_ERROR', 'Failed to upload image', 500);
  } finally {
    await logger.flush();
  }
}
