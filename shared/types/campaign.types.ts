/**
 * Campaign Types for Email Re-engagement Drip Campaign System
 *
 * Defines TypeScript interfaces for campaign management, queue processing,
 * and event tracking.
 */

/**
 * User segments for email campaigns
 */
export type UserSegment = 'non_converter' | 'non_uploader' | 'trial_user';

/**
 * Campaign queue status
 */
export type CampaignStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

/**
 * Campaign event types
 */
export type CampaignEventType =
  | 'queued'
  | 'sent'
  | 'opened'
  | 'clicked'
  | 'unsubscribed'
  | 'bounced'
  | 'returned';

/**
 * Email campaign definition
 * Represents a single email in a drip campaign sequence
 */
export interface IEmailCampaign {
  /** Unique campaign identifier */
  id: string;
  /** Human-readable campaign name (unique) */
  name: string;
  /** Target user segment */
  segment: UserSegment;
  /** Email template name to use */
  templateName: string;
  /** Day number in the drip sequence (1 = first email) */
  sendDay: number;
  /** Email subject line */
  subject: string;
  /** Whether the campaign is active */
  enabled: boolean;
  /** Priority for ordering within same send_day (lower = higher priority) */
  priority: number;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Email campaign queue entry
 * Represents a queued email waiting to be sent
 */
export interface IEmailCampaignQueue {
  /** Unique queue entry identifier */
  id: string;
  /** Reference to the campaign */
  campaignId: string;
  /** Reference to the user */
  userId: string;
  /** Recipient email address */
  email: string;
  /** When the email should be sent */
  scheduledFor: string;
  /** When the email was actually sent */
  sentAt: string | null;
  /** Current status of the queue entry */
  status: CampaignStatus;
  /** Error message if status is 'failed' */
  errorMessage: string | null;
  /** Creation timestamp */
  createdAt: string;
  /** Additional metadata (unsubscribe token, template variables, etc.) */
  metadata: Record<string, unknown>;
}

/**
 * Email campaign event
 * Represents an event (open, click, etc.) for analytics
 */
export interface IEmailCampaignEvent {
  /** Unique event identifier */
  id: string;
  /** Reference to the queue entry */
  queueId: string;
  /** Type of event */
  eventType: CampaignEventType;
  /** When the event occurred */
  occurredAt: string;
  /** Additional event metadata */
  metadata: Record<string, unknown>;
}

/**
 * User in a segment (returned by segmentation functions)
 */
export interface ISegmentUser {
  /** User ID */
  id: string;
  /** User email */
  email: string;
  /** Trial end date (only for trial_user segment) */
  trialEnd?: string;
}

/**
 * Parameters for queueCampaign method
 */
export interface ICampaignQueueParams {
  /** Campaign ID to queue emails for */
  campaignId: string;
  /** Maximum number of users to queue */
  limit?: number;
  /** Override scheduled time (defaults to now + send_day offset) */
  scheduledFor?: string;
}

/**
 * Result of queueCampaign operation
 */
export interface IQueueResult {
  /** Number of users successfully queued */
  queued: number;
  /** Number of users skipped (already in queue for this segment) */
  skipped: number;
  /** Array of queued user IDs */
  userIds: string[];
  /** Error message if any */
  error?: string;
}

/**
 * Result of processQueue operation
 */
export interface IProcessQueueResult {
  /** Number of emails processed */
  processed: number;
  /** Number of emails successfully sent */
  sent: number;
  /** Number of emails that failed */
  failed: number;
  /** Array of errors encountered */
  errors: Array<{
    queueId: string;
    email: string;
    error: string;
  }>;
}

/**
 * Pending email ready to be sent
 */
export interface IPendingCampaignEmail {
  /** Queue entry ID */
  queueId: string;
  /** Campaign ID */
  campaignId: string;
  /** Campaign name */
  campaignName: string;
  /** Template name to use */
  templateName: string;
  /** Email subject */
  subject: string;
  /** User ID */
  userId: string;
  /** Recipient email */
  email: string;
  /** Queue entry metadata */
  metadata: Record<string, unknown>;
}

/**
 * Email template data for campaign emails
 */
export interface ICampaignEmailProps {
  /** Recipient email */
  email: string;
  /** User ID */
  userId: string;
  /** Campaign name */
  campaignName: string;
  /** Unsubscribe token (JWT) */
  unsubscribeToken: string;
  /** Unsubscribe URL */
  unsubscribeUrl: string;
  /** Base URL for the application */
  baseUrl: string;
  /** Additional template-specific data */
  [key: string]: unknown;
}

/**
 * Campaign statistics
 */
export interface ICampaignStats {
  /** Campaign ID */
  campaignId: string;
  /** Campaign name */
  campaignName: string;
  /** Total emails queued */
  totalQueued: number;
  /** Emails sent successfully */
  sent: number;
  /** Emails that failed */
  failed: number;
  /** Emails pending */
  pending: number;
  /** Emails opened */
  opened: number;
  /** Emails clicked */
  clicked: number;
  /** Emails unsubscribed */
  unsubscribed: number;
  /** Emails bounced */
  bounced: number;
}

/**
 * Segment statistics
 */
export interface ISegmentStats {
  /** Segment type */
  segment: UserSegment;
  /** Total users in segment */
  totalUsers: number;
  /** Users already in queue */
  queuedUsers: number;
  /** Users available for campaigns */
  availableUsers: number;
}

/**
 * Database row types (for Supabase queries)
 */
export interface IEmailCampaignRow {
  id: string;
  name: string;
  segment: UserSegment;
  template_name: string;
  send_day: number;
  subject: string;
  enabled: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface IEmailCampaignQueueRow {
  id: string;
  campaign_id: string;
  user_id: string;
  email: string;
  scheduled_for: string;
  sent_at: string | null;
  status: CampaignStatus;
  error_message: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface IEmailCampaignEventRow {
  id: string;
  queue_id: string;
  event_type: CampaignEventType;
  occurred_at: string;
  metadata: Record<string, unknown>;
}

/**
 * Helper function to convert database row to IEmailCampaign
 */
export function campaignRowToInterface(row: IEmailCampaignRow): IEmailCampaign {
  return {
    id: row.id,
    name: row.name,
    segment: row.segment,
    templateName: row.template_name,
    sendDay: row.send_day,
    subject: row.subject,
    enabled: row.enabled,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Helper function to convert database row to IEmailCampaignQueue
 */
export function queueRowToInterface(row: IEmailCampaignQueueRow): IEmailCampaignQueue {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    userId: row.user_id,
    email: row.email,
    scheduledFor: row.scheduled_for,
    sentAt: row.sent_at,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    metadata: row.metadata,
  };
}

/**
 * Helper function to convert database row to IEmailCampaignEvent
 */
export function eventRowToInterface(row: IEmailCampaignEventRow): IEmailCampaignEvent {
  return {
    id: row.id,
    queueId: row.queue_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    metadata: row.metadata,
  };
}
