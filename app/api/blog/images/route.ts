import { NextRequest, NextResponse } from 'next/server';
import { verifyBlogApiAuth, blogApiErrorResponse } from '@lib/middleware/blogApiAuth';
import { searchBlogImages } from '@server/services/blogImageStorage.service';
import { searchBlogImagesSchema } from '@shared/validation/blog.schema';
import { createLogger } from '@server/monitoring/logger';

/**
 * Response interface for blog image search
 */
interface IBlogImageSearchResponse {
  success: true;
  data: IBlogImageSearchResultItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Individual image result item in search response
 */
interface IBlogImageSearchResultItem {
  url: string;
  alt_text: string;
  description: string;
  tags: string[];
  image_type: 'featured' | 'inline';
  width: number;
  height: number;
  prompt?: string | null;
  created_at: string;
}

/**
 * GET /api/blog/images - Search blog images by tags and/or image type
 *
 * Query parameters:
 * - tags: Comma-separated list of tags to filter by (e.g., "before-after,comparison")
 * - image_type: Filter by image type ('featured' | 'inline')
 * - limit: Maximum number of results (default: 10, max: 100)
 * - offset: Number of results to skip (default: 0)
 *
 * Requires x-api-key header authentication
 *
 * Response format:
 * {
 *   success: true,
 *   data: [{url, alt_text, description, tags, image_type, width, height, prompt, created_at}],
 *   pagination: {total, limit, offset}
 * }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const logger = createLogger(request, 'blog-images-search');

  try {
    // Verify API key authentication
    const authResult = await verifyBlogApiAuth(request);
    if (!authResult.authenticated) {
      return authResult.error!;
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const tagsParam = searchParams.get('tags');
    const imageTypeParam = searchParams.get('image_type');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    // Build search query object with coercion
    const searchQuery = {
      tags: tagsParam
        ? tagsParam
            .split(',')
            .map(t => t.trim())
            .filter(Boolean)
        : undefined,
      image_type: imageTypeParam ?? undefined,
      limit: limitParam ? parseInt(limitParam, 10) : 10,
      offset: offsetParam ? parseInt(offsetParam, 10) : 0,
    };

    // Validate search parameters using Zod schema
    const validatedQuery = searchBlogImagesSchema.parse(searchQuery);

    logger.info('Searching blog images', {
      tags: validatedQuery.tags,
      image_type: validatedQuery.image_type,
      limit: validatedQuery.limit,
      offset: validatedQuery.offset,
    });

    // Call service to search images
    const { data: images, total } = await searchBlogImages(validatedQuery);

    // Transform results to response format (exclude storage_path and used_in_posts)
    const data: IBlogImageSearchResultItem[] = images.map(img => ({
      url: img.url,
      alt_text: img.alt_text,
      description: img.description,
      tags: img.tags,
      image_type: img.image_type,
      width: img.width,
      height: img.height,
      prompt: img.prompt,
      created_at: img.created_at,
    }));

    // Build response
    const response: IBlogImageSearchResponse = {
      success: true,
      data,
      pagination: {
        total,
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        hasMore: validatedQuery.offset + validatedQuery.limit < total,
      },
    };

    logger.info('Blog image search completed', { resultCount: images.length });

    return NextResponse.json(response);
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof Error && 'name' in error && error.name === 'ZodError') {
      return blogApiErrorResponse('VALIDATION_ERROR', 'Invalid search parameters', 400, error);
    }

    // Handle other errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to search blog images', { message: errorMessage });
    return blogApiErrorResponse('INTERNAL_ERROR', 'Failed to search blog images', 500);
  } finally {
    await logger.flush();
  }
}
