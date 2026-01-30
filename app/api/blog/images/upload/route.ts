import { NextRequest, NextResponse } from 'next/server';
import { verifyBlogApiAuth, blogApiErrorResponse } from '@lib/middleware/blogApiAuth';
import { uploadToCloudflareImages, parseDataUri } from '@server/services/cloudflareImages.service';
import { imageUploadSchema, type ISingleResponse, type IImageUploadResponse } from '@shared/validation/blog.schema';
import { createLogger } from '@server/monitoring/logger';

/**
 * POST /api/blog/images/upload - Upload an image to Cloudflare Images
 *
 * Accepts two formats:
 * 1. multipart/form-data with file field
 * 2. JSON with imageData (base64 data URI) and filename
 *
 * Requires x-api-key header authentication
 * Requires Cloudflare Pro plan with Images enabled
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
      // Alt text extracted but not yet stored - for future use with blog_media table
      void formData.get('alt_text') as string | undefined;

      logger.info('Processing multipart image upload', { filename, mimeType, size: buffer.length });
    } else {
      // Handle JSON with base64
      const body = await request.json();
      const validatedData = imageUploadSchema.parse(body);

      const parsed = parseDataUri(validatedData.imageData);
      buffer = parsed.buffer;
      mimeType = parsed.mimeType;
      filename = validatedData.filename;
      // Alt text extracted but not yet stored - for future use with blog_media table
      void validatedData.alt_text;

      logger.info('Processing base64 image upload', { filename, mimeType, size: buffer.length });
    }

    // Upload to Cloudflare Images
    const result = await uploadToCloudflareImages(buffer, filename, mimeType);

    logger.info('Image uploaded successfully', { id: result.id, url: result.url });

    const response: ISingleResponse<IImageUploadResponse> = {
      success: true,
      data: {
        url: result.url,
        key: result.id, // Using image ID as the key
        filename: result.id, // Cloudflare Images uses ID as identifier
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    await logger.flush();

    // Handle Zod validation errors
    if (error instanceof Error && 'name' in error && error.name === 'ZodError') {
      return blogApiErrorResponse('VALIDATION_ERROR', 'Invalid request data', 400, error);
    }

    // Handle specific Cloudflare Images errors
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
      if (error.message.includes('Cloudflare Images upload failed')) {
        return blogApiErrorResponse('UPLOAD_FAILED', error.message, 500);
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
