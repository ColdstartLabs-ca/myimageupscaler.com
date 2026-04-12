/**
 * Send Campaigns Cron Endpoint
 *
 * Runs hourly to process pending campaign emails in the queue.
 * Sends emails that are due based on their scheduled_for timestamp.
 *
 * Triggered by: Cloudflare Cron Triggers (hourly at :05)
 * Schedule: 5 * * * * (every hour at :05)
 *
 * POST /api/cron/send-campaigns
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createLogger } from '@server/monitoring/logger';
import { ErrorCodes, createErrorResponse } from '@shared/utils/errors';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { getCampaignService } from '@server/services/campaign.service';
import { sendCampaignsSchema } from '@shared/validation/cron.schema';

/**
 * Response interface for send campaigns endpoint
 */
export interface ISendCampaignsResponse {
  sent: number;
  failed: number;
  remaining: number;
}

/**
 * Verify cron secret authentication
 */
function verifyCronAuth(request: NextRequest, logger: ReturnType<typeof createLogger>): boolean {
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== serverEnv.CRON_SECRET) {
    logger.warn('Unauthorized cron request - invalid CRON_SECRET');
    return false;
  }
  return true;
}

/**
 * Get count of remaining pending emails
 */
async function getRemainingPendingCount(): Promise<number> {
  const now = new Date().toISOString();

  const { count, error } = await supabaseAdmin
    .from('email_campaign_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lte('scheduled_for', now);

  if (error) {
    console.error('Failed to get remaining count:', error);
    return 0;
  }

  return count || 0;
}

/**
 * POST handler for sending campaign emails
 *
 * @param request - The incoming request
 * @returns JSON response with send results
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const logger = createLogger(request, 'cron-send-campaigns');

  try {
    // 1. Verify authentication
    if (!verifyCronAuth(request, logger)) {
      const { body, status } = createErrorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized', 401);
      return NextResponse.json(body, { status });
    }

    // 2. Parse and validate optional request body
    let limit = 100; // Default batch size

    const rawBody = await request.text();
    if (rawBody.trim()) {
      try {
        const body = JSON.parse(rawBody);
        const validatedInput = sendCampaignsSchema.parse(body);
        limit = validatedInput.limit || 100;
      } catch (parseError) {
        if (parseError instanceof ZodError) {
          const { body, status } = createErrorResponse(
            ErrorCodes.VALIDATION_ERROR,
            'Invalid request data',
            400,
            { validationErrors: parseError.errors }
          );
          return NextResponse.json(body, { status });
        }
        throw parseError; // Re-throw JSON parsing errors
      }
    }

    logger.info('Starting campaign send process', { limit });

    // 3. Get remaining count before processing (for logging)
    const pendingBefore = await getRemainingPendingCount();

    logger.info('Pending emails before processing', { count: pendingBefore });

    // 4. Process the queue
    const campaignService = getCampaignService();
    const result = await campaignService.processQueue(limit);

    // 5. Get remaining count after processing
    const remaining = await getRemainingPendingCount();

    // 6. Build response
    const response: ISendCampaignsResponse = {
      sent: result.sent,
      failed: result.failed,
      remaining,
    };

    logger.info('Campaign send process completed', {
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      remaining,
      errorCount: result.errors.length,
    });

    // Include error details in response if any (but don't fail the request)
    if (result.errors.length > 0) {
      logger.warn('Some emails failed to send', {
        errors: result.errors.slice(0, 10), // Log first 10 errors
      });
    }

    return NextResponse.json(response);
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      const { body, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid request data',
        400,
        { validationErrors: error.errors }
      );
      return NextResponse.json(body, { status });
    }

    // Handle unexpected errors
    logger.error('Unexpected error in campaign send cron', { error });
    const { body, status } = createErrorResponse(
      ErrorCodes.INTERNAL_ERROR,
      'An unexpected error occurred',
      500
    );
    return NextResponse.json(body, { status });
  } finally {
    await logger.flush();
  }
}
