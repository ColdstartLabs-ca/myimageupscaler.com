import { NextRequest, NextResponse } from 'next/server';
import { verifyBlogApiAuth, blogApiErrorResponse } from '@lib/middleware/blogApiAuth';
import { createBlogPost, listBlogPosts } from '@server/services/blog.service';
import {
  createBlogPostSchema,
  listBlogPostsSchema,
  type ISingleResponse,
  type IPaginatedResponse,
} from '@shared/validation/blog.schema';
import { createLogger } from '@server/monitoring/logger';

/**
 * POST /api/blog/posts - Create a new blog post (draft)
 *
 * Requires x-api-key header authentication
 */
export async function POST(request: NextRequest) {
  const logger = createLogger(request, 'blog-posts-create');

  try {
    // Verify API key authentication
    const authResult = await verifyBlogApiAuth(request);
    if (!authResult.authenticated) {
      return authResult.error!;
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createBlogPostSchema.parse(body);

    logger.info('Creating blog post', { slug: validatedData.slug });

    // Create the post
    const post = await createBlogPost(validatedData);

    logger.info('Blog post created successfully', { slug: post.slug, id: post.id });

    const response: ISingleResponse<typeof post> = {
      success: true,
      data: post,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    await logger.flush();

    // Handle Zod validation errors
    if (error instanceof Error && 'name' in error && error.name === 'ZodError') {
      return blogApiErrorResponse('VALIDATION_ERROR', 'Invalid request data', 400, error);
    }

    // Handle duplicate slug error
    if (error instanceof Error && error.message.startsWith('DUPLICATE_SLUG')) {
      return blogApiErrorResponse('DUPLICATE_SLUG', 'A post with this slug already exists', 409);
    }

    // Handle other errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create blog post', { message: errorMessage });
    return blogApiErrorResponse('INTERNAL_ERROR', 'Failed to create blog post', 500);
  } finally {
    await logger.flush();
  }
}

/**
 * GET /api/blog/posts - List blog posts with filters and pagination
 *
 * Requires x-api-key header authentication
 */
export async function GET(request: NextRequest) {
  const logger = createLogger(request, 'blog-posts-list');

  try {
    // Verify API key authentication
    const authResult = await verifyBlogApiAuth(request);
    if (!authResult.authenticated) {
      return authResult.error!;
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const query = listBlogPostsSchema.parse(Object.fromEntries(searchParams.entries()));

    logger.info('Listing blog posts', { status: query.status, category: query.category, tag: query.tag });

    // Fetch posts
    const result = await listBlogPosts(query);

    logger.info('Blog posts listed successfully', { count: result.posts.length, total: result.total });

    const response: IPaginatedResponse<typeof result.posts[number]> = {
      success: true,
      data: result.posts,
      pagination: {
        total: result.total,
        limit: query.limit,
        offset: query.offset,
        hasMore: result.hasMore,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    await logger.flush();

    // Handle Zod validation errors
    if (error instanceof Error && 'name' in error && error.name === 'ZodError') {
      return blogApiErrorResponse('VALIDATION_ERROR', 'Invalid query parameters', 400, error);
    }

    // Handle other errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list blog posts', { message: errorMessage });
    return blogApiErrorResponse('INTERNAL_ERROR', 'Failed to list blog posts', 500);
  } finally {
    await logger.flush();
  }
}
