import { NextRequest, NextResponse } from 'next/server';
import { revalidateBlogPaths } from '@lib/blog/revalidate-blog-paths';
import { verifyBlogApiAuth, blogApiErrorResponse } from '@lib/middleware/blogApiAuth';
import { getBlogPostBySlug, updateBlogPost, deleteBlogPost } from '@server/services/blog.service';
import {
  updateBlogPostSchema,
  type ISingleResponse,
  type IBlogPost,
} from '@shared/validation/blog.schema';
import { createLogger } from '@server/monitoring/logger';
import seoLockRaw from '@/content/seo-lock.json';
import { hashSeoText, loadEffectiveLock, normalize, type ISeoLockEntry } from '@lib/seo/seo-lock';
import { loadAutoSeoLocks } from '@server/services/seo-lock.service';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import { clientEnv } from '@shared/config/env';

const SEO_LOCK = seoLockRaw as Record<string, ISeoLockEntry>;

async function getBlogLockEntries(
  slug: string
): Promise<Array<{ path: string; entry: ISeoLockEntry }>> {
  const englishPath = `/blog/${slug}`;
  const paths = SUPPORTED_LOCALES.map(locale =>
    locale === 'en' ? englishPath : `/${locale}${englishPath}`
  );
  const lock = await loadEffectiveLock(SEO_LOCK, () => loadAutoSeoLocks(paths));
  const localizedPath = new RegExp(`^/[^/]+/blog/${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return Object.entries(lock)
    .filter(([path]) => path === englishPath || localizedPath.test(path))
    .map(([path, entry]) => ({ path, entry }));
}

async function getBlogLockViolations(
  slug: string,
  body: Record<string, unknown>
): Promise<Array<{ path: string; field: string; expected: string; actual: string }>> {
  if (!['title', 'description', 'seo_title', 'seo_description'].some(field => field in body))
    return [];
  const entries = await getBlogLockEntries(slug);
  if (entries.length === 0) return [];
  const current = await getBlogPostBySlug(slug);
  if (!current) throw new Error('NOT_FOUND: Blog post not found');
  const candidate = { ...current, ...body };
  const changed: Partial<Record<'title' | 'description' | 'h1' | 'introHash', string>> = {};
  if ('title' in body) changed.h1 = normalize(String(candidate.title));
  if ('description' in body)
    changed.introHash = await hashSeoText(normalize(String(candidate.description)));
  if ('seo_title' in body || ('title' in body && !candidate.seo_title)) {
    changed.title = normalize(`${candidate.seo_title || candidate.title} | ${clientEnv.APP_NAME}`);
  }
  if ('seo_description' in body || ('description' in body && !candidate.seo_description)) {
    changed.description = normalize(String(candidate.seo_description || candidate.description));
  }
  return entries.flatMap(({ path, entry }) =>
    Object.entries(changed).flatMap(([field, actual]) => {
      const expected = entry[field as keyof typeof changed];
      return actual === expected ? [] : [{ path, field, expected, actual }];
    })
  );
}

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

    const lockViolations = await getBlogLockViolations(slug, validatedData);
    if (lockViolations.length > 0) {
      return blogApiErrorResponse(
        'SEO_LOCKED',
        `SEO lock prevents changing ${lockViolations.map(violation => violation.field).join(', ')} for ${slug}`,
        409,
        { violations: lockViolations }
      );
    }

    logger.info('Updating blog post', { slug });

    // Update the post
    const post = await updateBlogPost(slug, validatedData);

    logger.info('Blog post updated successfully', { slug, id: post.id });

    try {
      revalidateBlogPaths(slug);
      logger.info('Revalidated blog paths', { slug });
    } catch (revalidateError) {
      logger.warn('Failed to revalidate blog paths', { slug, error: revalidateError });
    }

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

    // Handle duplicate featured image error
    if (error instanceof Error && error.message.startsWith('DUPLICATE_IMAGE')) {
      return blogApiErrorResponse(
        'DUPLICATE_IMAGE',
        error.message.replace('DUPLICATE_IMAGE: ', ''),
        409
      );
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
