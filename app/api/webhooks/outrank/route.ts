import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { serverEnv } from '@shared/config/env';
import {
  outrankWebhookPayloadSchema,
  mapOutrankArticleToBlogInput,
} from '@shared/validation/outrank-webhook.schema';
import { createBlogPost, publishBlogPost, slugExists } from '@server/services/blog.service';
import { createLogger } from '@server/monitoring/logger';

/**
 * POST /api/webhooks/outrank
 *
 * Receives article publish events from Outrank.so.
 * Authentication: Authorization: Bearer <OUTRANK_WEBHOOK_SECRET>
 *
 * This route is public (no JWT auth) — it uses its own Bearer token auth.
 * See PUBLIC_API_ROUTES in shared/config/security.ts.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const logger = createLogger(request, 'outrank-webhook');

  try {
    // 1. Check if webhook secret is configured
    const secret = serverEnv.OUTRANK_WEBHOOK_SECRET;
    if (!secret) {
      logger.warn('Outrank webhook secret is not configured');
      return NextResponse.json({ message: 'Webhook not configured' }, { status: 503 });
    }

    // 2. Validate Authorization header
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token || token !== secret) {
      logger.warn('Outrank webhook received invalid or missing Authorization header');
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 3. Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      logger.warn('Outrank webhook received invalid JSON body');
      return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
    }

    const parseResult = outrankWebhookPayloadSchema.safeParse(body);
    if (!parseResult.success) {
      logger.warn('Outrank webhook payload validation failed', {
        errors: parseResult.error.errors,
      });
      return NextResponse.json(
        { message: 'Invalid payload', errors: parseResult.error.errors },
        { status: 400 }
      );
    }

    const payload = parseResult.data;
    const { articles } = payload.data;

    logger.info('Outrank webhook received', {
      eventType: payload.event_type,
      articleCount: articles.length,
    });

    const processed: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    // 4. Process each article
    for (const article of articles) {
      const mappedInput = mapOutrankArticleToBlogInput(article);
      const { slug } = mappedInput;

      // Check if slug already exists — skip duplicates
      const exists = await slugExists(slug);
      if (exists) {
        logger.info('Skipping article — slug already exists', { slug });
        skipped.push(slug);
        continue;
      }

      // Create the blog post as a draft
      try {
        await createBlogPost(mappedInput);
        logger.info('Blog post created', { slug });
      } catch (createError) {
        const message = createError instanceof Error ? createError.message : String(createError);
        logger.error('Failed to create blog post', { slug, error: message });
        errors.push(slug);
        continue;
      }

      // Publish the newly created post
      try {
        await publishBlogPost(slug);
        logger.info('Blog post published', { slug });
      } catch (publishError) {
        const message = publishError instanceof Error ? publishError.message : String(publishError);
        logger.warn('Failed to publish blog post after creation — post remains as draft', {
          slug,
          error: message,
        });
        // Still count as processed; the post was created even if publish failed
      }

      processed.push(slug);

      // Trigger on-demand revalidation so the post is visible immediately
      try {
        revalidatePath('/blog');
        revalidatePath(`/blog/${slug}`);
        logger.info('Revalidated blog paths', { slug });
      } catch (revalidateError) {
        logger.warn('Failed to revalidate blog paths', { slug, error: revalidateError });
      }
    }

    logger.info('Outrank webhook processing complete', {
      processed: processed.length,
      skipped: skipped.length,
      errors: errors.length,
    });

    return NextResponse.json({ success: true, processed, skipped, errors }, { status: 200 });
  } finally {
    await logger.flush();
  }
}
