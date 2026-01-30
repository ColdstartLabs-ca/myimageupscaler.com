import { NextRequest, NextResponse } from 'next/server';
import { verifyBlogApiAuth, blogApiErrorResponse } from '@lib/middleware/blogApiAuth';
import { publishBlogPost, getBlogPostBySlug } from '@server/services/blog.service';
import { type ISingleResponse } from '@shared/validation/blog.schema';
import { createLogger } from '@server/monitoring/logger';

/**
 * POST /api/blog/posts/[slug]/publish - Publish a draft blog post
 *
 * Requires x-api-key header authentication
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const logger = createLogger(request, 'blog-posts-publish');

  try {
    // Verify API key authentication
    const authResult = await verifyBlogApiAuth(request);
    if (!authResult.authenticated) {
      return authResult.error!;
    }

    const { slug } = await params;

    logger.info('Publishing blog post', { slug });

    // Check if post exists
    const existingPost = await getBlogPostBySlug(slug);
    if (!existingPost) {
      logger.info('Blog post not found', { slug });
      return blogApiErrorResponse('NOT_FOUND', 'Blog post not found', 404);
    }

    // Already published - idempotent
    if (existingPost.status === 'published') {
      logger.info('Blog post already published', { slug, id: existingPost.id });
      const response: ISingleResponse<typeof existingPost> = {
        success: true,
        data: existingPost,
      };
      return NextResponse.json(response);
    }

    // Publish the post
    const post = await publishBlogPost(slug);

    logger.info('Blog post published successfully', { slug, id: post.id, published_at: post.published_at });

    const response: ISingleResponse<typeof post> = {
      success: true,
      data: post,
    };

    return NextResponse.json(response);
  } catch (error) {
    await logger.flush();

    // Handle not found error
    if (error instanceof Error && error.message.startsWith('NOT_FOUND')) {
      return blogApiErrorResponse('NOT_FOUND', 'Blog post not found', 404);
    }

    // Handle other errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to publish blog post', { message: errorMessage });
    return blogApiErrorResponse('INTERNAL_ERROR', 'Failed to publish blog post', 500);
  } finally {
    await logger.flush();
  }
}
