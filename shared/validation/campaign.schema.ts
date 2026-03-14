/**
 * Campaign API Validation Schemas
 *
 * Zod schemas for validating campaign-related API requests.
 */

import { z } from 'zod';

/**
 * User segment values for validation
 */
export const USER_SEGMENTS = ['non_converter', 'non_uploader', 'trial_user'] as const;

/**
 * Admin queue campaign input schema
 */
export const queueCampaignSchema = z.object({
  campaignId: z.string().uuid('Campaign ID must be a valid UUID'),
  segment: z.enum(['non_converter', 'non_uploader', 'trial_user'] as const, {
    errorMap: () => ({
      message: 'Segment must be one of: non_converter, non_uploader, trial_user',
    }),
  }),
  batchSize: z.number().int('Batch size must be an integer').min(1).max(1000).optional(),
});

export type IQueueCampaignInput = z.infer<typeof queueCampaignSchema>;

/**
 * Queue campaign result schema
 */
export const queueCampaignResultSchema = z.object({
  queued: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.array(z.string()),
});

export type IQueueCampaignResult = z.infer<typeof queueCampaignResultSchema>;

/**
 * Send campaign input schema (for cron endpoint)
 */
export const sendCampaignSchema = z.object({
  limit: z.number().int('Limit must be an integer').min(1).max(500).optional(),
});

export type ISendCampaignInput = z.infer<typeof sendCampaignSchema>;

/**
 * Send campaign result schema
 */
export const sendCampaignResultSchema = z.object({
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});

export type ISendCampaignResult = z.infer<typeof sendCampaignResultSchema>;

/**
 * Unsubscribe input schema
 */
export const unsubscribeSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export type IUnsubscribeInput = z.infer<typeof unsubscribeSchema>;

/**
 * Unsubscribe result schema
 */
export const unsubscribeResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export type IUnsubscribeResult = z.infer<typeof unsubscribeResultSchema>;

/**
 * Email webhook event types
 */
export const EMAIL_WEBHOOK_EVENTS = [
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'unsubscribed',
  'complained',
  'returned',
] as const;

export type IEmailWebhookEvent = (typeof EMAIL_WEBHOOK_EVENTS)[number];

/**
 * Email webhook event schema
 * Supports Brevo and Resend webhook formats
 */
export const emailWebhookEventSchema = z.object({
  // Brevo format
  event: z.enum(EMAIL_WEBHOOK_EVENTS).optional(),
  email: z.string().email().optional(),
  messageId: z.string().optional(),
  subject: z.string().optional(),
  tag: z.string().optional(),
  // Resend format
  type: z.enum(EMAIL_WEBHOOK_EVENTS).optional(),
  data: z
    .object({
      email_id: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      subject: z.string().optional(),
      created_at: z.string().optional(),
      clicked_link: z.string().optional(),
    })
    .optional(),
  // Common fields
  timestamp: z.union([z.string(), z.number()]).optional(),
  'message-id': z.string().optional(),
});

export type IEmailWebhookEventPayload = z.infer<typeof emailWebhookEventSchema>;

/**
 * Email webhook payload schema (array of events)
 */
export const emailWebhookPayloadSchema = z.union([
  z.array(emailWebhookEventSchema),
  emailWebhookEventSchema,
]);

export type IEmailWebhookPayload = z.infer<typeof emailWebhookPayloadSchema>;

/**
 * Email webhook result schema
 */
export const emailWebhookResultSchema = z.object({
  received: z.boolean(),
  processed: z.number().optional(),
  errors: z.array(z.string()).optional(),
});

export type IEmailWebhookResult = z.infer<typeof emailWebhookResultSchema>;
