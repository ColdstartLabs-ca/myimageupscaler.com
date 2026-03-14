/**
 * Campaign Send API Endpoint (Cron-triggered)
 *
 * Processes the email campaign queue and sends pending emails.
 * Triggered by Cloudflare Cron Triggers or internal scheduling.
 *
 * POST /api/campaigns/send
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { sendCampaignSchema, type ISendCampaignResult } from '@shared/validation/campaign.schema';
import { getCampaignService } from '@server/services/campaign.service';
import { createLogger } from '@server/monitoring/logger';
import { ErrorCodes, createErrorResponse } from '@shared/utils/errors';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

/**
 * POST handler for processing campaign queue
 *
 * @param request - The incoming request
 * @returns JSON response with send result
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const logger = createLogger(request, 'campaign-send');

  try {
    // 1. Verify cron secret for authentication
    const cronSecret = request.headers.get('x-cron-secret');
    if (cronSecret !== serverEnv.CRON_SECRET) {
      logger.warn('Unauthorized cron request - invalid CRON_SECRET');
      const { body, status } = createErrorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized', 401);
      return NextResponse.json(body, { status });
    }

    // 2. Parse and validate request body (optional limit parameter)
    let limit = 100; // Default batch size
    try {
      const body = await request.json();
      const validatedInput = sendCampaignSchema.parse(body);
      limit = validatedInput.limit || 100;
    } catch {
      // Body is optional, use defaults
    }

    logger.info('Starting campaign queue processing', { limit });

    // 3. Get pending count before processing (for logging)
    const { count: _pendingBefore, error: countError } = await supabaseAdmin
      .from('email_campaign_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString());

    if (countError) {
      logger.error('Failed to get pending count', { error: countError });
    }

    // 4. Process the queue
    const campaignService = getCampaignService();
    const result = await campaignService.processQueue(limit);

    // 5. Get remaining count after processing
    const { count: pendingAfter } = await supabaseAdmin
      .from('email_campaign_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString());

    const remaining = pendingAfter || 0;

    // 6. Build response
    const response: ISendCampaignResult = {
      sent: result.sent,
      failed: result.failed,
      remaining,
    };

    logger.info('Campaign queue processing completed', {
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      remaining,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });

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
    logger.error('Unexpected error in campaign send', { error });
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
