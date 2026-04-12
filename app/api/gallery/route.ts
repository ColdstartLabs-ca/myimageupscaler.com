/**
 * Gallery API Routes
 * GET  /api/gallery     - List user's saved images
 * POST /api/gallery     - Save a new image to gallery
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@server/monitoring/logger';
import { ErrorCodes, createErrorResponse, serializeError } from '@shared/utils/errors';
import {
  listImages,
  saveImage,
  getUsage,
  type ISaveImageMetadata,
} from '@server/services/galleryStorage.service';
import {
  saveImageSchema,
  galleryListQuerySchema,
  type ISaveImageInput,
} from '@shared/validation/gallery.schema';
import type { IGalleryListResponse, IGalleryStats } from '@shared/types/gallery.types';
import { ZodError } from 'zod';

export const dynamic = 'force-dynamic';

// =============================================================================
// Response Types
// =============================================================================

interface IGalleryListApiResponse {
  success: true;
  data: IGalleryListResponse;
  usage: IGalleryStats;
}

interface IGallerySaveApiResponse {
  success: true;
  data: IGalleryListResponse['images'][0];
  usage: IGalleryStats;
}

// =============================================================================
// GET /api/gallery - List user's saved images
// =============================================================================

export async function GET(req: NextRequest): Promise<NextResponse> {
  const logger = createLogger(req, 'gallery-api');
  let userId: string | undefined;

  try {
    // 1. Extract authenticated user ID from middleware header
    userId = req.headers.get('X-User-Id') || undefined;
    if (!userId) {
      logger.warn('Unauthorized request - no user ID');
      const { body, status } = createErrorResponse(
        ErrorCodes.UNAUTHORIZED,
        'Authentication required',
        401
      );
      return NextResponse.json(body, { status });
    }

    // 2. Parse and validate query parameters
    const url = new URL(req.url);
    const queryParams = {
      page: url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!, 10) : undefined,
      pageSize: url.searchParams.get('page_size')
        ? parseInt(url.searchParams.get('page_size')!, 10)
        : undefined,
      sortOrder: url.searchParams.get('sort_order') as
        | 'created_at_desc'
        | 'created_at_asc'
        | undefined,
    };

    const validatedQuery = galleryListQuerySchema.parse(queryParams);

    // 3. Fetch images and usage stats
    const [imagesResponse, usage] = await Promise.all([
      listImages(userId, validatedQuery.page, validatedQuery.pageSize, validatedQuery.sortOrder),
      getUsage(userId),
    ]);

    logger.info('Gallery list fetched', {
      userId,
      count: imagesResponse.images.length,
      total: imagesResponse.total,
    });

    // 4. Return response
    const response: IGalleryListApiResponse = {
      success: true,
      data: imagesResponse,
      usage,
    };

    return NextResponse.json(response);
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      logger.warn('Validation error', { errors: error.errors });
      const { body, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid request parameters',
        400,
        { validationErrors: error.errors }
      );
      return NextResponse.json(body, { status });
    }

    // Handle unexpected errors
    const errorMessage = serializeError(error);
    logger.error('Unexpected error in GET /api/gallery', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    const { body, status } = createErrorResponse(ErrorCodes.INTERNAL_ERROR, errorMessage, 500);
    return NextResponse.json(body, { status });
  } finally {
    await logger.flush();
  }
}

// =============================================================================
// POST /api/gallery - Save an image to gallery
// =============================================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  const logger = createLogger(req, 'gallery-api');
  let userId: string | undefined;

  try {
    // 1. Extract authenticated user ID from middleware header
    userId = req.headers.get('X-User-Id') || undefined;
    if (!userId) {
      logger.warn('Unauthorized request - no user ID');
      const { body, status } = createErrorResponse(
        ErrorCodes.UNAUTHORIZED,
        'Authentication required',
        401
      );
      return NextResponse.json(body, { status });
    }

    // 2. Parse and validate request body
    const body = await req.json();
    const validatedInput: ISaveImageInput = saveImageSchema.parse(body);

    // 3. Prepare metadata
    const metadata: ISaveImageMetadata = {
      filename: validatedInput.filename,
      width: validatedInput.width,
      height: validatedInput.height,
      modelUsed: validatedInput.modelUsed,
      processingMode: validatedInput.processingMode,
    };

    // 4. Save the image
    const result = await saveImage(userId, validatedInput.imageUrl, metadata);

    // 5. Get updated usage stats
    const usage = await getUsage(userId);

    logger.info('Image saved to gallery', {
      userId,
      imageId: result.image.id,
      filename: metadata.filename,
    });

    // 6. Return response (consistent structure with GET endpoint)
    const response: IGallerySaveApiResponse = {
      success: true,
      data: {
        ...result.image,
        signed_url: result.signedUrl,
      },
      usage,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      logger.warn('Validation error', { errors: error.errors });
      const { body, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid request data',
        400,
        { validationErrors: error.errors }
      );
      return NextResponse.json(body, { status });
    }

    // Handle gallery limit exceeded error
    if (error instanceof Error && error.message.includes('Gallery limit exceeded')) {
      logger.info('Gallery limit exceeded', { userId });
      const { body, status } = createErrorResponse(ErrorCodes.FORBIDDEN, error.message, 403);
      return NextResponse.json(body, { status });
    }

    // Handle unexpected errors
    const errorMessage = serializeError(error);
    logger.error('Unexpected error in POST /api/gallery', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    const { body, status } = createErrorResponse(ErrorCodes.INTERNAL_ERROR, errorMessage, 500);
    return NextResponse.json(body, { status });
  } finally {
    await logger.flush();
  }
}
