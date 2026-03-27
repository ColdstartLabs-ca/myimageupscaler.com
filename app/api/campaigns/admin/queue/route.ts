/**
 * Admin Campaign Queue API Endpoint
 *
 * Queues emails for a specific campaign segment.
 * Requires admin authentication.
 *
 * POST /api/campaigns/admin/queue
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { queueCampaignSchema, type IQueueCampaignResult } from '@shared/validation/campaign.schema';
import { getCampaignService } from '@server/services/campaign.service';
import { createLogger } from '@server/monitoring/logger';
import { ErrorCodes, createErrorResponse } from '@shared/utils/errors';
import { type UserSegment, type ICampaignQueueParams } from '@shared/types/campaign.types';

/**
 * Request interface for admin queue endpoint
 */
interface IQueueRequest {
  campaignId: string;
  segment: UserSegment;
  batchSize?: number;
}

/**
 * POST handler for queuing campaign emails
 *
 * @param request - The incoming request
 * @returns JSON response with queue result
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const logger = createLogger(request, 'campaign-admin-queue');

  try {
    // 1. Extract authenticated user ID from middleware header
    const userId = request.headers.get('X-User-Id');
    if (!userId) {
      const { body, status } = createErrorResponse(
        ErrorCodes.UNAUTHORIZED,
        'Authentication required',
        401
      );
      return NextResponse.json(body, { status });
    }

    // 2. Check for admin role (using custom header set by middleware)
    const userRole = request.headers.get('X-User-Role');
    if (userRole !== 'admin') {
      const { body, status } = createErrorResponse(
        ErrorCodes.FORBIDDEN,
        'Admin access required',
        403
      );
      return NextResponse.json(body, { status });
    }

    // 3. Parse and validate request body
    const body = await request.json();
    const validatedInput = queueCampaignSchema.parse(body) as IQueueRequest;

    logger.info('Queueing campaign emails', {
      campaignId: validatedInput.campaignId,
      segment: validatedInput.segment,
      batchSize: validatedInput.batchSize,
      adminUserId: userId,
    });

    // 4. Get campaign service and queue emails
    const campaignService = getCampaignService();

    const queueParams: ICampaignQueueParams = {
      campaignId: validatedInput.campaignId,
      limit: validatedInput.batchSize || 100,
    };

    const result = await campaignService.queueCampaign(queueParams);

    // 5. Build response
    const response: IQueueCampaignResult = {
      queued: result.queued,
      skipped: result.skipped,
      errors: result.error ? [result.error] : [],
    };

    logger.info('Campaign queue completed', {
      campaignId: validatedInput.campaignId,
      queued: response.queued,
      skipped: response.skipped,
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

    // Handle campaign service errors
    if (error instanceof Error && error.name === 'CampaignError') {
      const campaignError = error as unknown as { code: string; message: string };
      logger.warn('Campaign error', {
        code: campaignError.code,
        message: campaignError.message,
      });

      const statusCode = campaignError.code === 'CAMPAIGN_NOT_FOUND' ? 404 : 400;
      const { body, status } = createErrorResponse(
        campaignError.code,
        campaignError.message,
        statusCode
      );
      return NextResponse.json(body, { status });
    }

    // Handle unexpected errors
    logger.error('Unexpected error in campaign queue', { error });
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
