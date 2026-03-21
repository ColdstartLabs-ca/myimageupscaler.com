/**
 * Queue Campaigns Cron Endpoint
 *
 * Runs daily to queue pending campaign emails based on user segmentation.
 * Finds enabled campaigns and queues emails for users in their target segments.
 *
 * Triggered by: Cloudflare Cron Triggers (daily at 00:00 UTC)
 *
 * POST /api/cron/queue-campaigns
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@server/monitoring/logger';
import { ErrorCodes, createErrorResponse } from '@shared/utils/errors';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { getCampaignService } from '@server/services/campaign.service';
import type { UserSegment, IEmailCampaign } from '@shared/types/campaign.types';
import { campaignRowToInterface, type IEmailCampaignRow } from '@shared/types/campaign.types';

/**
 * Result for a single campaign queue operation
 */
interface ICampaignQueueResult {
  campaignId: string;
  campaignName: string;
  segment: UserSegment;
  queued: number;
  skipped: number;
  error?: string;
}

/**
 * Response interface for queue-campaigns endpoint
 */
export interface IQueueCampaignsResult {
  campaigns: number;
  queued: number;
  skipped: number;
  errors: string[];
  results?: ICampaignQueueResult[];
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
 * Get all enabled campaigns from the database
 */
async function getEnabledCampaigns(): Promise<IEmailCampaign[]> {
  const { data, error } = await supabaseAdmin
    .from('email_campaigns')
    .select('*')
    .eq('enabled', true)
    .order('send_day', { ascending: true })
    .order('priority', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch campaigns: ${error.message}`);
  }

  return (data as IEmailCampaignRow[]).map(campaignRowToInterface);
}

/**
 * POST handler for queueing campaign emails
 *
 * @param request - The incoming request
 * @returns JSON response with queue results
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const logger = createLogger(request, 'cron-queue-campaigns');

  try {
    // 1. Verify cron secret authentication
    if (!verifyCronAuth(request, logger)) {
      const { body, status } = createErrorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized', 401);
      return NextResponse.json(body, { status });
    }

    logger.info('Starting campaign queue process');

    // 2. Get all enabled campaigns
    const campaigns = await getEnabledCampaigns();

    if (campaigns.length === 0) {
      logger.info('No enabled campaigns to process');
      const response: IQueueCampaignsResult = {
        campaigns: 0,
        queued: 0,
        skipped: 0,
        errors: [],
      };
      return NextResponse.json(response);
    }

    logger.info('Found enabled campaigns', { count: campaigns.length });

    // 3. Queue emails for each campaign using CampaignService
    const campaignService = getCampaignService();
    const results: ICampaignQueueResult[] = [];
    let totalQueued = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    for (const campaign of campaigns) {
      try {
        // Use the CampaignService to queue users for this campaign
        // The service handles segment user retrieval and queue insertion
        const result = await campaignService.queueCampaign({
          campaignId: campaign.id,
          limit: 100, // Default batch size per campaign
        });

        results.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          segment: campaign.segment,
          queued: result.queued,
          skipped: result.skipped,
        });

        totalQueued += result.queued;
        totalSkipped += result.skipped;

        logger.info('Queued campaign', {
          campaign: campaign.name,
          segment: campaign.segment,
          queued: result.queued,
          skipped: result.skipped,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${campaign.name}: ${errorMessage}`);

        results.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          segment: campaign.segment,
          queued: 0,
          skipped: 0,
          error: errorMessage,
        });

        logger.error('Failed to queue campaign', {
          campaign: campaign.name,
          error: errorMessage,
        });
      }
    }

    logger.info('Campaign queue process completed', {
      campaignsProcessed: campaigns.length,
      totalQueued,
      totalSkipped,
      errorCount: errors.length,
    });

    const response: IQueueCampaignsResult = {
      campaigns: campaigns.length,
      queued: totalQueued,
      skipped: totalSkipped,
      errors,
      results,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Unexpected error in campaign queue cron', { error });
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
