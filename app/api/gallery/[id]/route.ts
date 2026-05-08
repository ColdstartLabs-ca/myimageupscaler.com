/**
 * Gallery Delete API Route
 * DELETE /api/gallery/[id] - Delete an image from user's gallery
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@server/monitoring/logger';
import { ErrorCodes, createErrorResponse, serializeError } from '@shared/utils/errors';
import { deleteImage, getUsage } from '@server/services/galleryStorage.service';

export const dynamic = 'force-dynamic';

// =============================================================================
// DELETE Image Handler
// =============================================================================

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const logger = createLogger(req, 'gallery-delete-api');
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

    // Await params per Next.js 15 requirements
    const { id: imageId } = await params;
    logger.info('Delete gallery image request', { userId, imageId });

    // 2. Validate image ID format
    if (!imageId || typeof imageId !== 'string') {
      const { body, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Image ID is required',
        400
      );
      return NextResponse.json(body, { status });
    }

    // 3. Delete the image (verify ownership internally)
    await deleteImage(userId, imageId);

    // 4. Get updated usage stats
    const usage = await getUsage(userId);

    logger.info('Gallery image deleted successfully', { userId, imageId });

    return NextResponse.json({
      success: true,
      data: {
        deleted_id: imageId,
      },
      usage,
    });
  } catch (error) {
    // Await params again for error handling
    const { id: imageId } = await params;

    // Handle ownership/not found error
    if (error instanceof Error && error.message.includes('not found')) {
      logger.warn('Image not found or not owned by user', { userId, imageId });
      const { body, status } = createErrorResponse(
        ErrorCodes.NOT_FOUND,
        'Image not found or you do not have permission to delete it',
        404
      );
      return NextResponse.json(body, { status });
    }

    // Handle unexpected errors
    const errorMessage = serializeError(error);
    logger.error('Unexpected error in DELETE /api/gallery/[id]', {
      error: errorMessage,
      imageId,
      stack: error instanceof Error ? error.stack : undefined,
    });

    const { body, status } = createErrorResponse(ErrorCodes.INTERNAL_ERROR, errorMessage, 500);
    return NextResponse.json(body, { status });
  } finally {
    await logger.flush();
  }
}
