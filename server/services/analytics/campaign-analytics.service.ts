/**
 * Campaign Analytics Service
 *
 * Handles analytics tracking for email re-engagement drip campaigns.
 * Uses the existing Amplitude HTTP API pattern for server-side tracking.
 *
 * Events tracked:
 * - email_queued: When a user is queued for a campaign
 * - email_sent: When an email is successfully sent
 * - email_opened: When a user opens an email (via webhook)
 * - email_clicked: When a user clicks a link in an email (via webhook)
 * - email_unsubscribed: When a user unsubscribes
 * - reengagement_returned: When a user returns after receiving a campaign email
 */

import { trackServerEvent } from '@server/analytics/analyticsService';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import type { UserSegment } from '@shared/types/campaign.types';

/**
 * Interface for campaign analytics service
 */
export interface ICampaignAnalyticsService {
  trackEmailQueued(params: {
    userId: string;
    campaignId: string;
    campaign: string;
    segment: UserSegment;
  }): Promise<void>;

  trackEmailSent(params: {
    userId: string;
    campaignId: string;
    campaign: string;
    messageId: string;
    template: string;
  }): Promise<void>;

  trackEmailOpened(params: {
    userId: string;
    campaignId: string;
    campaign: string;
    messageId: string;
  }): Promise<void>;

  trackEmailClicked(params: {
    userId: string;
    campaignId: string;
    campaign: string;
    messageId: string;
    link: string;
  }): Promise<void>;

  trackEmailUnsubscribed(params: {
    userId: string;
    campaignId: string;
    campaign: string;
  }): Promise<void>;

  trackReengagementReturned(params: {
    userId: string;
    campaignId?: string;
    campaign?: string;
    daysSinceLastVisit: number;
  }): Promise<void>;
}

/**
 * Campaign Analytics Service Implementation
 *
 * Provides methods for tracking campaign-related analytics events.
 */
export class CampaignAnalyticsService implements ICampaignAnalyticsService {
  private readonly apiKey: string;

  constructor() {
    this.apiKey = serverEnv.AMPLITUDE_API_KEY;
  }

  /**
   * Track when an email is queued for a user
   */
  async trackEmailQueued(params: {
    userId: string;
    campaignId: string;
    campaign: string;
    segment: UserSegment;
  }): Promise<void> {
    await trackServerEvent(
      'email_queued',
      {
        campaign: params.campaign,
        segment: params.segment,
        userId: params.userId,
        campaignId: params.campaignId,
      },
      { apiKey: this.apiKey, userId: params.userId }
    );
  }

  /**
   * Track when an email is successfully sent
   */
  async trackEmailSent(params: {
    userId: string;
    campaignId: string;
    campaign: string;
    messageId: string;
    template: string;
  }): Promise<void> {
    await trackServerEvent(
      'email_sent',
      {
        campaign: params.campaign,
        messageId: params.messageId,
        template: params.template,
        userId: params.userId,
        campaignId: params.campaignId,
      },
      { apiKey: this.apiKey, userId: params.userId }
    );
  }

  /**
   * Track when an email is opened
   */
  async trackEmailOpened(params: {
    userId: string;
    campaignId: string;
    campaign: string;
    messageId: string;
  }): Promise<void> {
    await trackServerEvent(
      'email_opened',
      {
        campaign: params.campaign,
        messageId: params.messageId,
        userId: params.userId,
        campaignId: params.campaignId,
      },
      { apiKey: this.apiKey, userId: params.userId }
    );
  }

  /**
   * Track when a link in an email is clicked
   */
  async trackEmailClicked(params: {
    userId: string;
    campaignId: string;
    campaign: string;
    messageId: string;
    link: string;
  }): Promise<void> {
    await trackServerEvent(
      'email_clicked',
      {
        campaign: params.campaign,
        link: params.link,
        messageId: params.messageId,
        userId: params.userId,
        campaignId: params.campaignId,
      },
      { apiKey: this.apiKey, userId: params.userId }
    );
  }

  /**
   * Track when a user unsubscribes from emails
   */
  async trackEmailUnsubscribed(params: {
    userId: string;
    campaignId: string;
    campaign: string;
  }): Promise<void> {
    await trackServerEvent(
      'email_unsubscribed',
      {
        campaign: params.campaign,
        userId: params.userId,
        campaignId: params.campaignId,
      },
      { apiKey: this.apiKey, userId: params.userId }
    );
  }

  /**
   * Track when a user returns after receiving a campaign email
   */
  async trackReengagementReturned(params: {
    userId: string;
    campaignId?: string;
    campaign?: string;
    daysSinceLastVisit: number;
  }): Promise<void> {
    await trackServerEvent(
      'reengagement_returned',
      {
        campaign: params.campaign,
        userId: params.userId,
        daysSinceLastVisit: params.daysSinceLastVisit,
        campaignId: params.campaignId,
      },
      { apiKey: this.apiKey, userId: params.userId }
    );
  }
}

// Singleton instance
let campaignAnalyticsInstance: CampaignAnalyticsService | null = null;

/**
 * Get the CampaignAnalyticsService singleton
 */
export function getCampaignAnalyticsService(): CampaignAnalyticsService {
  if (!campaignAnalyticsInstance) {
    campaignAnalyticsInstance = new CampaignAnalyticsService();
  }
  return campaignAnalyticsInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetCampaignAnalyticsService(): void {
  campaignAnalyticsInstance = null;
}

/**
 * Check and track re-engagement for a returning user
 *
 * This function:
 * 1. Checks if the user has any campaign emails sent to them
 * 2. Checks if this is their first session since receiving the email
 * 3. Calculates days since last visit
 * 4. Tracks reengagement_returned event if applicable
 *
 * @param userId - The user ID to check
 * @param daysSinceLastVisit - Number of days since the user's last visit
 * @returns True if re-engagement was tracked, false otherwise
 */
export async function checkAndTrackReengagement(
  userId: string,
  daysSinceLastVisit: number
): Promise<boolean> {
  // Only track if the user has been away for at least 1 day
  if (daysSinceLastVisit < 1) {
    return false;
  }

  // Check if user has any sent campaign emails
  const { data: queueEntries, error } = await supabaseAdmin
    .from('email_campaign_queue')
    .select('id, campaign_id, sent_at, metadata')
    .eq('user_id', userId)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1);

  if (error || !queueEntries || queueEntries.length === 0) {
    return false;
  }

  const queueEntry = queueEntries[0];
  const metadata = queueEntry.metadata as Record<string, unknown>;

  // Check if we've already tracked re-engagement for this user
  // We use metadata to store the re-engagement tracking state
  if (metadata.reengagementTracked === true) {
    return false;
  }

  // Get campaign details
  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from('email_campaigns')
    .select('id, name')
    .eq('id', queueEntry.campaign_id)
    .single();

  if (campaignError || !campaign) {
    return false;
  }

  // Track the re-engagement event
  const analyticsService = getCampaignAnalyticsService();
  await analyticsService.trackReengagementReturned({
    userId,
    campaignId: campaign.id,
    campaign: campaign.name,
    daysSinceLastVisit,
  });

  // Mark re-engagement as tracked in the queue entry metadata
  await supabaseAdmin
    .from('email_campaign_queue')
    .update({
      metadata: {
        ...metadata,
        reengagementTracked: true,
        reengagementTrackedAt: new Date().toISOString(),
      },
    })
    .eq('id', queueEntry.id);

  return true;
}
