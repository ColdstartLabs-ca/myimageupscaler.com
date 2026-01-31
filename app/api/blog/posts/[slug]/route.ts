import { NextRequest, NextResponse } from 'next/server';
import { verifyBlogApiAuth, blogApiErrorResponse } from '@lib/middleware/blogApiAuth';
import { getBlogPostBySlug, updateBlogPost, deleteBlogPost } from '@server/services/blog.service';
import {
  updateBlogPostSchema,
  type ISingleResponse,
  type IBlogPost,
} from '@shared/validation/blog.schema';
import { createLogger } from '@server/monitoring/logger';

/**
 * GET /api/blog/posts/[slug] - Get a single blog post by slug
 *
 * Requires x-api-key header authentication
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const logger = createLogger(request, 'blog-posts-get');

  try {
    // Verify API key authentication
    const authResult = await verifyBlogApiAuth(request);
    if (!authResult.authenticated) {
      return authResult.error!;
    }

    const { slug } = await params;

    logger.info('Fetching blog post', { slug });

    // Fetch post
    const post = await getBlogPostBySlug(slug);

    if (!post) {
      logger.info('Blog post not found', { slug });
      return blogApiErrorResponse('NOT_FOUND', 'Blog post not found', 404);
    }

    logger.info('Blog post fetched successfully', { slug, id: post.id });

    const response: ISingleResponse<IBlogPost> = {
      success: true,
      data: post,
    };

    return NextResponse.json(response);
  } catch (error) {
    await logger.flush();

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch blog post', { message: errorMessage });
    return blogApiErrorResponse('INTERNAL_ERROR', 'Failed to fetch blog post', 500);
  } finally {
    await logger.flush();
  }
}

/**
 * PATCH /api/blog/posts/[slug] - Update a blog post
 *
 * Requires x-api-key header authentication
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const logger = createLogger(request, 'blog-posts-patch');

  try {
    // Verify API key authentication
    const authResult = await verifyBlogApiAuth(request);
    if (!authResult.authenticated) {
      return authResult.error!;
    }

    const { slug } = await params;

    // Parse and validate request body
    const body = await request.json();
    const validatedData = updateBlogPostSchema.parse(body);

    logger.info('Updating blog post', { slug });

    // Update the post
    const post = await updateBlogPost(slug, validatedData);

    logger.info('Blog post updated successfully', { slug, id: post.id });

    const response: ISingleResponse<typeof post> = {
      success: true,
      data: post,
    };

    return NextResponse.json(response);
  } catch (error) {
    await logger.flush();

    // Handle Zod validation errors
    if (error instanceof Error && 'name' in error && error.name === 'ZodError') {
      return blogApiErrorResponse('VALIDATION_ERROR', 'Invalid request data', 400, error);
    }

    // Handle not found error
    if (error instanceof Error && error.message.startsWith('NOT_FOUND')) {
      return blogApiErrorResponse('NOT_FOUND', 'Blog post not found', 404);
    }

    // Handle other errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update blog post', { message: errorMessage });
    return blogApiErrorResponse('INTERNAL_ERROR', 'Failed to update blog post', 500);
  } finally {
    await logger.flush();
  }
}

/**
 * DELETE /api/blog/posts/[slug] - Delete a blog post
 *
 * Requires x-api-key header authentication
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const logger = createLogger(request, 'blog-posts-delete');

  try {
    // Verify API key authentication
    const authResult = await verifyBlogApiAuth(request);
    if (!authResult.authenticated) {
      return authResult.error!;
    }

    const { slug } = await params;

    logger.info('Deleting blog post', { slug });

    // Delete the post
    await deleteBlogPost(slug);

    logger.info('Blog post deleted successfully', { slug });

    return NextResponse.json({
      success: true,
      message: 'Blog post deleted successfully',
    });
  } catch (error) {
    await logger.flush();

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete blog post', { message: errorMessage });
    return blogApiErrorResponse('INTERNAL_ERROR', 'Failed to delete blog post', 500);
  } finally {
    await logger.flush();
  }
}
