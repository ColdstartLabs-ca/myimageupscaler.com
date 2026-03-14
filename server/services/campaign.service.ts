/**
 * Campaign Service for Email Re-engagement Drip Campaign System
 *
 * Handles campaign queue management, email processing, and user segmentation.
 * Uses Supabase for database operations and the EmailService for sending.
 */

import { createHmac, randomBytes } from 'crypto';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { getEmailService } from './email.service';
import { serverEnv } from '@shared/config/env';
import {
  type IEmailCampaign,
  type IEmailCampaignQueue,
  type UserSegment,
  type CampaignStatus,
  type ICampaignQueueParams,
  type IQueueResult,
  type IProcessQueueResult,
  type IPendingCampaignEmail,
  type ICampaignEmailProps,
  type ISegmentUser,
  type IEmailCampaignRow,
  type IEmailCampaignQueueRow,
  campaignRowToInterface,
  queueRowToInterface,
} from '@shared/types/campaign.types';
import {
  getCampaignAnalyticsService,
  type CampaignAnalyticsService,
} from './analytics/campaign-analytics.service';

/**
 * Error class for campaign-related errors
 */
export class CampaignError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'CAMPAIGN_ERROR') {
    super(message);
    this.name = 'CampaignError';
    this.code = code;
  }
}

/**
 * Campaign Service
 *
 * Manages email campaign queue and processing for user re-engagement.
 */
export class CampaignService {
  private readonly unsubscribeSecret: string;
  private readonly baseUrl: string;
  private readonly analyticsService: CampaignAnalyticsService;

  constructor() {
    // Use SUPABASE_SERVICE_ROLE_KEY as secret for HMAC tokens
    // In production, consider using a dedicated secret
    this.unsubscribeSecret = serverEnv.SUPABASE_SERVICE_ROLE_KEY || 'campaign-unsubscribe-secret';
    this.baseUrl = serverEnv.BASE_URL;
    this.analyticsService = getCampaignAnalyticsService();
  }

  /**
   * Get all enabled campaigns for a specific segment
   */
  async getCampaignsBySegment(segment: UserSegment): Promise<IEmailCampaign[]> {
    const { data, error } = await supabaseAdmin
      .from('email_campaigns')
      .select('*')
      .eq('segment', segment)
      .eq('enabled', true)
      .order('send_day', { ascending: true })
      .order('priority', { ascending: true });

    if (error) {
      throw new CampaignError(`Failed to fetch campaigns: ${error.message}`, 'FETCH_ERROR');
    }

    return (data as IEmailCampaignRow[]).map(campaignRowToInterface);
  }

  /**
   * Get a campaign by ID
   */
  async getCampaignById(campaignId: string): Promise<IEmailCampaign | null> {
    const { data, error } = await supabaseAdmin
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new CampaignError(`Failed to fetch campaign: ${error.message}`, 'FETCH_ERROR');
    }

    return campaignRowToInterface(data as IEmailCampaignRow);
  }

  /**
   * Queue users from a segment for a specific campaign
   *
   * @param params Campaign queue parameters
   * @returns Result with queued count and user IDs
   */
  async queueCampaign(params: ICampaignQueueParams): Promise<IQueueResult> {
    const { campaignId, limit = 100, scheduledFor } = params;

    // Get campaign details
    const campaign = await this.getCampaignById(campaignId);
    if (!campaign) {
      throw new CampaignError(`Campaign not found: ${campaignId}`, 'CAMPAIGN_NOT_FOUND');
    }

    if (!campaign.enabled) {
      throw new CampaignError(`Campaign is disabled: ${campaign.name}`, 'CAMPAIGN_DISABLED');
    }

    // Get users for the segment
    const users = await this.getSegmentUsers(campaign.segment, limit);

    if (users.length === 0) {
      return { queued: 0, skipped: 0, userIds: [] };
    }

    // Calculate scheduled time based on send_day
    const scheduledDate = scheduledFor
      ? new Date(scheduledFor)
      : new Date(Date.now() + campaign.sendDay * 24 * 60 * 60 * 1000);

    // Queue entries for users
    const queueEntries = users.map(user => ({
      campaign_id: campaignId,
      user_id: user.id,
      email: user.email,
      scheduled_for: scheduledDate.toISOString(),
      status: 'pending' as CampaignStatus,
      metadata: {
        unsubscribeToken: this.generateUnsubscribeToken(user.id, campaignId),
      },
    }));

    // Insert queue entries (use upsert to handle conflicts for users already queued)
    const { data, error } = await supabaseAdmin
      .from('email_campaign_queue')
      .upsert(queueEntries, {
        onConflict: 'campaign_id,user_id',
        ignoreDuplicates: true,
      })
      .select('user_id');

    if (error) {
      throw new CampaignError(`Failed to queue campaign: ${error.message}`, 'QUEUE_ERROR');
    }

    const queuedUserIds = (data as { user_id: string }[]).map(row => row.user_id);
    const skipped = users.length - queuedUserIds.length;

    // Track email_queued events for each queued user (fire-and-forget)
    for (const userId of queuedUserIds) {
      this.analyticsService
        .trackEmailQueued({
          userId,
          campaignId: campaign.id,
          campaign: campaign.name,
          segment: campaign.segment,
        })
        .catch(err => {
          console.error('Failed to track email_queued event:', err);
        });
    }

    return {
      queued: queuedUserIds.length,
      skipped,
      userIds: queuedUserIds,
    };
  }

  /**
   * Process pending emails in the queue
   *
   * @param limit Maximum number of emails to process
   * @returns Result with processed counts
   */
  async processQueue(limit: number = 100): Promise<IProcessQueueResult> {
    const result: IProcessQueueResult = {
      processed: 0,
      sent: 0,
      failed: 0,
      errors: [],
    };

    // Get pending emails
    const pendingEmails = await this.getPendingEmails(limit);

    if (pendingEmails.length === 0) {
      return result;
    }

    const emailService = getEmailService();

    for (const email of pendingEmails) {
      result.processed++;

      try {
        // Prepare email props
        const emailProps: ICampaignEmailProps = {
          email: email.email,
          userId: email.userId,
          campaignName: email.campaignName,
          unsubscribeToken: email.metadata.unsubscribeToken as string,
          unsubscribeUrl: this.generateUnsubscribeUrl(
            email.userId,
            email.campaignId,
            email.metadata.unsubscribeToken as string
          ),
          baseUrl: this.baseUrl,
          ...email.metadata,
        };

        // Send the email
        const sendResult = await emailService.send({
          to: email.email,
          template: email.templateName,
          data: emailProps,
          type: 'marketing',
          userId: email.userId,
        });

        // Mark as sent
        await this.markEmailSent(email.queueId, true);

        // Track email_sent event (fire-and-forget)
        this.analyticsService
          .trackEmailSent({
            userId: email.userId,
            campaignId: email.campaignId,
            campaign: email.campaignName,
            messageId: sendResult.messageId || email.queueId,
            template: email.templateName,
          })
          .catch(err => {
            console.error('Failed to track email_sent event:', err);
          });

        result.sent++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({
          queueId: email.queueId,
          email: email.email,
          error: errorMessage,
        });

        // Mark as failed
        await this.markEmailSent(email.queueId, false, errorMessage);

        result.failed++;
      }
    }

    return result;
  }

  /**
   * Get pending emails ready to be sent
   *
   * @param limit Maximum number of emails to fetch
   * @returns Array of pending emails
   */
  private async getPendingEmails(limit: number): Promise<IPendingCampaignEmail[]> {
    const { data, error } = await supabaseAdmin.rpc('get_pending_campaign_emails', {
      limit_count: limit,
    });

    if (error) {
      throw new CampaignError(`Failed to fetch pending emails: ${error.message}`, 'FETCH_ERROR');
    }

    return (
      data as Array<{
        queue_id: string;
        campaign_id: string;
        campaign_name: string;
        template_name: string;
        subject: string;
        user_id: string;
        email: string;
        metadata: Record<string, unknown>;
      }>
    ).map(row => ({
      queueId: row.queue_id,
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      templateName: row.template_name,
      subject: row.subject,
      userId: row.user_id,
      email: row.email,
      metadata: row.metadata,
    }));
  }

  /**
   * Mark an email as sent or failed
   */
  private async markEmailSent(
    queueId: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    const { error } = await supabaseAdmin.rpc('mark_campaign_sent', {
      p_queue_id: queueId,
      p_success: success,
      p_error_message: errorMessage || null,
    });

    if (error) {
      console.error('Failed to mark email sent:', { queueId, error: error.message });
    }
  }

  /**
   * Get users for a specific segment using RPC functions
   *
   * @param segment User segment
   * @param limit Maximum users to return
   * @returns Array of segment users
   */
  private async getSegmentUsers(segment: UserSegment, limit: number): Promise<ISegmentUser[]> {
    let rpcName: string;

    switch (segment) {
      case 'non_converter':
        rpcName = 'get_non_converter_segment';
        break;
      case 'non_uploader':
        rpcName = 'get_non_uploader_segment';
        break;
      case 'trial_user':
        rpcName = 'get_trial_user_segment';
        break;
      default:
        throw new CampaignError(`Unknown segment: ${segment}`, 'INVALID_SEGMENT');
    }

    const { data, error } = await supabaseAdmin.rpc(rpcName, {
      limit_count: limit,
    });

    if (error) {
      throw new CampaignError(`Failed to get segment users: ${error.message}`, 'SEGMENT_ERROR');
    }

    return (data as Array<{ id: string; email: string; trial_end?: string }>).map(row => ({
      id: row.id,
      email: row.email,
      trialEnd: row.trial_end,
    }));
  }

  /**
   * Generate an unsubscribe token for a user/campaign pair
   *
   * Uses HMAC-SHA256 for secure, verifiable tokens
   */
  private generateUnsubscribeToken(userId: string, campaignId: string): string {
    const payload = `${userId}:${campaignId}`;
    const timestamp = Date.now();
    const nonce = randomBytes(8).toString('hex');

    const signature = createHmac('sha256', this.unsubscribeSecret)
      .update(`${payload}:${timestamp}:${nonce}`)
      .digest('hex');

    return Buffer.from(`${payload}:${timestamp}:${nonce}:${signature}`).toString('base64url');
  }

  /**
   * Verify an unsubscribe token
   *
   * @param token The token to verify
   * @returns The user ID and campaign ID if valid, null otherwise
   */
  verifyUnsubscribeToken(token: string): { userId: string; campaignId: string } | null {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      const parts = decoded.split(':');

      if (parts.length !== 5) {
        return null;
      }

      const [userId, campaignId, timestampStr, nonce, originalSignature] = parts;
      const timestamp = parseInt(timestampStr, 10);

      // Check if token is expired (30 days)
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
      if (Date.now() - timestamp > maxAge) {
        return null;
      }

      // Verify signature
      const payload = `${userId}:${campaignId}`;
      const expectedSignature = createHmac('sha256', this.unsubscribeSecret)
        .update(`${payload}:${timestamp}:${nonce}`)
        .digest('hex');

      if (originalSignature !== expectedSignature) {
        return null;
      }

      return { userId, campaignId };
    } catch {
      return null;
    }
  }

  /**
   * Generate an unsubscribe URL for an email
   */
  private generateUnsubscribeUrl(userId: string, campaignId: string, token: string): string {
    return `${this.baseUrl}/api/campaigns/unsubscribe?token=${token}`;
  }

  /**
   * Process an unsubscribe request
   *
   * @param token The unsubscribe token
   * @returns True if successful, false if token invalid
   */
  async processUnsubscribe(token: string): Promise<boolean> {
    const decoded = this.verifyUnsubscribeToken(token);
    if (!decoded) {
      return false;
    }

    const { userId, campaignId } = decoded;

    // Get the queue entry
    const { data: queueEntry, error: fetchError } = await supabaseAdmin
      .from('email_campaign_queue')
      .select('id')
      .eq('user_id', userId)
      .eq('campaign_id', campaignId)
      .single();

    if (fetchError || !queueEntry) {
      return false;
    }

    // Record the unsubscribe event and cancel the queue entry
    const { error: eventError } = await supabaseAdmin.rpc('record_campaign_event', {
      p_queue_id: queueEntry.id,
      p_event_type: 'unsubscribed',
      p_metadata: {},
    });

    if (eventError) {
      console.error('Failed to record unsubscribe event:', eventError);
    }

    // Update email preferences to opt out of marketing emails
    const { error: prefError } = await supabaseAdmin
      .from('email_preferences')
      .update({ marketing_emails: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (prefError) {
      console.error('Failed to update email preferences:', prefError);
    }

    // Track email_unsubscribed event (fire-and-forget)
    // Get campaign name for tracking
    const { data: campaign } = await supabaseAdmin
      .from('email_campaigns')
      .select('name')
      .eq('id', campaignId)
      .single();

    if (campaign) {
      this.analyticsService
        .trackEmailUnsubscribed({
          userId,
          campaignId,
          campaign: campaign.name,
        })
        .catch(err => {
          console.error('Failed to track email_unsubscribed event:', err);
        });
    }

    return true;
  }

  /**
   * Record an email event (open, click, etc.)
   *
   * @param queueId The queue entry ID
   * @param eventType The type of event
   * @param metadata Additional event metadata
   */
  async recordEvent(
    queueId: string,
    eventType: 'opened' | 'clicked' | 'bounced' | 'returned',
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const { error } = await supabaseAdmin.rpc('record_campaign_event', {
      p_queue_id: queueId,
      p_event_type: eventType,
      p_metadata: metadata,
    });

    if (error) {
      console.error('Failed to record campaign event:', {
        queueId,
        eventType,
        error: error.message,
      });
    }
  }

  /**
   * Get segment statistics
   *
   * @param segment The segment to get stats for
   * @returns Segment statistics
   */
  async getSegmentStats(segment: UserSegment): Promise<{
    totalUsers: number;
    queuedUsers: number;
    availableUsers: number;
  }> {
    const { data: totalUsers, error: totalError } = await supabaseAdmin.rpc('get_segment_count', {
      segment_type: segment,
    });

    if (totalError) {
      throw new CampaignError(`Failed to get segment count: ${totalError.message}`, 'STATS_ERROR');
    }

    // Get campaign IDs for the segment first
    const { data: campaigns, error: campaignsError } = await supabaseAdmin
      .from('email_campaigns')
      .select('id')
      .eq('segment', segment);

    if (campaignsError) {
      throw new CampaignError(`Failed to get campaigns: ${campaignsError.message}`, 'STATS_ERROR');
    }

    // Count queued users (including those already sent)
    const campaignIds = (campaigns || []).map(c => c.id);
    let queuedUsers = 0;

    if (campaignIds.length > 0) {
      const { count, error: queuedError } = await supabaseAdmin
        .from('email_campaign_queue')
        .select('user_id', { count: 'exact', head: true })
        .in('campaign_id', campaignIds);

      if (queuedError) {
        throw new CampaignError(
          `Failed to get queued count: ${queuedError.message}`,
          'STATS_ERROR'
        );
      }

      queuedUsers = count || 0;
    }

    return {
      totalUsers: totalUsers || 0,
      queuedUsers: queuedUsers,
      availableUsers: Math.max(0, (totalUsers || 0) - queuedUsers),
    };
  }

  /**
   * Get queue entries for a user
   *
   * @param userId The user ID
   * @returns Array of queue entries
   */
  async getUserQueueEntries(userId: string): Promise<IEmailCampaignQueue[]> {
    const { data, error } = await supabaseAdmin
      .from('email_campaign_queue')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new CampaignError(`Failed to fetch user queue: ${error.message}`, 'FETCH_ERROR');
    }

    return (data as IEmailCampaignQueueRow[]).map(queueRowToInterface);
  }

  /**
   * Cancel pending queue entries for a user
   *
   * @param userId The user ID
   * @returns Number of entries cancelled
   */
  async cancelUserQueueEntries(userId: string): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from('email_campaign_queue')
      .update({ status: 'cancelled' })
      .eq('user_id', userId)
      .eq('status', 'pending')
      .select('id');

    if (error) {
      throw new CampaignError(`Failed to cancel queue entries: ${error.message}`, 'CANCEL_ERROR');
    }

    return data?.length || 0;
  }
}

// Singleton instance
let campaignServiceInstance: CampaignService | null = null;

/**
 * Get the CampaignService singleton
 */
export function getCampaignService(): CampaignService {
  if (!campaignServiceInstance) {
    campaignServiceInstance = new CampaignService();
  }
  return campaignServiceInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetCampaignService(): void {
  campaignServiceInstance = null;
}
