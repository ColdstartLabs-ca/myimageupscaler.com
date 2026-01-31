import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyBlogApiAuth, blogApiErrorResponse } from '@lib/middleware/blogApiAuth';
import { unpublishBlogPost, getBlogPostBySlug } from '@server/services/blog.service';
import { type ISingleResponse } from '@shared/validation/blog.schema';
import { createLogger } from '@server/monitoring/logger';

/**
 * POST /api/blog/posts/[slug]/unpublish - Unpublish a blog post (revert to draft)
 *
 * Requires x-api-key header authentication
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const logger = createLogger(request, 'blog-posts-unpublish');

  try {
    // Verify API key authentication
    const authResult = await verifyBlogApiAuth(request);
    if (!authResult.authenticated) {
      return authResult.error!;
    }

    const { slug } = await params;

    logger.info('Unpublishing blog post', { slug });

    // Check if post exists
    const existingPost = await getBlogPostBySlug(slug);
    if (!existingPost) {
      logger.info('Blog post not found', { slug });
      return blogApiErrorResponse('NOT_FOUND', 'Blog post not found', 404);
    }

    // Already draft - idempotent
    if (existingPost.status === 'draft') {
      logger.info('Blog post already draft', { slug, id: existingPost.id });
      const response: ISingleResponse<typeof existingPost> = {
        success: true,
        data: existingPost,
      };
      return NextResponse.json(response);
    }

    // Unpublish the post
    const post = await unpublishBlogPost(slug);

    logger.info('Blog post unpublished successfully', { slug, id: post.id });

    // Trigger on-demand revalidation to remove from public listings
    try {
      revalidatePath('/blog');
      revalidatePath(`/blog/${slug}`);
      logger.info('Revalidated blog paths', { slug });
    } catch (revalidateError) {
      // Log but don't fail the request if revalidation fails
      logger.warn('Failed to revalidate paths', { error: revalidateError });
    }

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
    logger.error('Failed to unpublish blog post', { message: errorMessage });
    return blogApiErrorResponse('INTERNAL_ERROR', 'Failed to unpublish blog post', 500);
  } finally {
    await logger.flush();
  }
}
