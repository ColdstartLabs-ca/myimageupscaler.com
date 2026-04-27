/**
 * Cron Job API Validation Schemas
 *
 * Zod schemas for validating cron endpoint requests.
 */

import { z } from 'zod';

/**
 * Queue campaigns input schema (for daily cron)
 * No parameters required - automatically processes all enabled campaigns
 */
export const queueCampaignsSchema = z.object({});

export type IQueueCampaignsInput = z.infer<typeof queueCampaignsSchema>;

/**
 * Queue campaigns result schema
 */
export const queueCampaignsResultSchema = z.object({
  campaigns: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.array(z.string()),
  results: z
    .array(
      z.object({
        campaignId: z.string(),
        campaignName: z.string(),
        segment: z.enum(['non_converter', 'non_uploader', 'trial_user']),
        queued: z.number().int().nonnegative(),
        skipped: z.number().int().nonnegative(),
        error: z.string().optional(),
      })
    )
    .optional(),
});

export type IQueueCampaignsResult = z.infer<typeof queueCampaignsResultSchema>;

/**
 * Send campaigns input schema (for hourly cron)
 */
export const sendCampaignsSchema = z.object({
  limit: z.number().int('Limit must be an integer').min(1).max(500).optional(),
});

export type ISendCampaignsInput = z.infer<typeof sendCampaignsSchema>;

/**
 * Send campaigns result schema
 */
export const sendCampaignsResultSchema = z.object({
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});

export type ISendCampaignsResult = z.infer<typeof sendCampaignsResultSchema>;
