/**
 * Email Webhook API Endpoint
 *
 * Handles webhooks from email providers (Brevo, Resend).
 * Processes events like opens, clicks, bounces, and unsubscribes.
 *
 * POST /api/webhooks/email
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  emailWebhookPayloadSchema,
  type IEmailWebhookEventPayload,
  type IEmailWebhookResult,
  type IEmailWebhookEvent,
} from '@shared/validation/campaign.schema';
import { getCampaignService } from '@server/services/campaign.service';
import { createLogger } from '@server/monitoring/logger';
import { ErrorCodes, createErrorResponse } from '@shared/utils/errors';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { type CampaignEventType } from '@shared/types/campaign.types';
import { getCampaignAnalyticsService } from '@server/services/analytics/campaign-analytics.service';

/**
 * Webhook event mapping from provider formats to internal event types
 */
const EVENT_TYPE_MAP: Record<string, CampaignEventType | null> = {
  delivered: 'sent',
  opened: 'opened',
  clicked: 'clicked',
  bounced: 'bounced',
  unsubscribed: 'unsubscribed',
  complained: 'bounced',
  returned: 'returned',
};

/**
 * Verify Brevo webhook signature
 *
 * @param payload - Raw request body
 * @param signature - X-Brevo-Signature header value
 * @returns True if signature is valid
 */
function verifyBrevoSignature(payload: string, signature: string): boolean {
  const webhookKey = serverEnv.BREVO_API_KEY;
  if (!webhookKey) {
    return false;
  }

  try {
    const expectedSignature = createHmac('sha256', webhookKey).update(payload).digest('hex');

    // Timing-safe comparison to prevent timing attacks
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Verify Resend webhook signature
 *
 * @param payload - Raw request body
 * @param signature - svix-signature header value
 * @param timestamp - svix-timestamp header value
 * @returns True if signature is valid
 */
function verifyResendSignature(payload: string, signature: string, timestamp: string): boolean {
  const webhookSecret = serverEnv.RESEND_API_KEY;
  if (!webhookSecret) {
    return false;
  }

  try {
    // Resend uses Svix for webhook signatures
    const signedContent = `${timestamp}.${payload}`;
    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(signedContent)
      .digest('base64');

    // The signature may contain multiple versions, take the first one
    const signatures = signature.split(' ');
    const signatureParts = signatures[0].split(',');

    for (const part of signatureParts) {
      if (part.startsWith('s=')) {
        const actualSignature = part.substring(2);
        return timingSafeEqual(
          Buffer.from(actualSignature, 'base64'),
          Buffer.from(expectedSignature, 'base64')
        );
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Extract email and event type from webhook payload
 * Handles both Brevo and Resend formats
 */
function extractEventInfo(event: IEmailWebhookEventPayload): {
  email: string | null;
  eventType: IEmailWebhookEvent | null;
} {
  // Brevo format
  if (event.event && event.email) {
    return {
      email: event.email,
      eventType: event.event as IEmailWebhookEvent,
    };
  }

  // Resend format
  if (event.type && event.data?.to) {
    return {
      email: event.data.to,
      eventType: event.type as IEmailWebhookEvent,
    };
  }

  return { email: null, eventType: null };
}

/**
 * Find queue entry by email or message ID
 */
async function findQueueEntry(email: string, messageId?: string): Promise<{ id: string } | null> {
  // Try to find by message ID first (more accurate)
  if (messageId) {
    const { data, error } = await supabaseAdmin
      .from('email_campaign_queue')
      .select('id')
      .eq('metadata->>messageId', messageId)
      .single();

    if (!error && data) {
      return data;
    }
  }

  // Fall back to email lookup for most recent pending/sent entry
  const { data, error } = await supabaseAdmin
    .from('email_campaign_queue')
    .select('id')
    .eq('email', email)
    .in('status', ['pending', 'sent'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    return null;
  }

  return data;
}

/**
 * Handle unsubscribe event - update email preferences and track analytics
 */
async function handleUnsubscribe(
  queueEntry: { id: string },
  campaignId: string,
  userId: string,
  campaignName: string,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  // Update email preferences to disable marketing emails
  const { error: updateError } = await supabaseAdmin
    .from('email_preferences')
    .update({
      marketing_emails: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    logger.error('Failed to update email preferences on unsubscribe', {
      error: updateError,
      queueId: queueEntry.id,
    });
  }

  // Track unsubscribe analytics event (fire-and-forget)
  const analyticsService = getCampaignAnalyticsService();
  analyticsService
    .trackEmailUnsubscribed({
      userId,
      campaignId,
      campaign: campaignName,
    })
    .catch(err => {
      logger.error('Failed to track email_unsubscribed event:', { error: err });
    });
}

/**
 * Valid event types that can be recorded via campaignService.recordEvent
 */
type RecordableEventType = 'opened' | 'clicked' | 'bounced' | 'returned';

const RECORDABLE_EVENT_TYPES: readonly RecordableEventType[] = [
  'opened',
  'clicked',
  'bounced',
  'returned',
] as const;

/**
 * Process a single webhook event
 */
async function processEvent(
  event: IEmailWebhookEventPayload,
  logger: ReturnType<typeof createLogger>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { email, eventType } = extractEventInfo(event);

    if (!email || !eventType) {
      return { success: false, error: 'Missing email or event type' };
    }

    // Map to internal event type
    const internalEventType = EVENT_TYPE_MAP[eventType];
    if (!internalEventType) {
      logger.debug('Ignoring unmapped event type', { eventType });
      return { success: true };
    }

    // Find the corresponding queue entry
    const messageId = event.messageId || event['message-id'] || event.data?.email_id;
    const queueEntry = await findQueueEntry(email, messageId);

    if (!queueEntry) {
      logger.debug('No queue entry found for event', { email, eventType });
      return { success: true }; // Not an error - might be non-campaign email
    }

    // Get queue details for analytics tracking
    const { data: queueDetails, error: queueDetailsError } = await supabaseAdmin
      .from('email_campaign_queue')
      .select('user_id, campaign_id')
      .eq('id', queueEntry.id)
      .single();

    if (queueDetailsError || !queueDetails) {
      logger.warn('Failed to fetch queue details', {
        queueId: queueEntry.id,
        error: queueDetailsError,
      });
      return { success: true }; // Still return success - we found the queue entry
    }

    // Get campaign name for analytics tracking
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('email_campaigns')
      .select('name')
      .eq('id', queueDetails.campaign_id)
      .single();

    if (campaignError || !campaign) {
      logger.warn('Failed to fetch campaign details', {
        campaignId: queueDetails.campaign_id,
        error: campaignError,
      });
    }

    const campaignName = campaign?.name ?? 'Unknown Campaign';
    const campaignService = getCampaignService();

    // Record event in database and track analytics based on event type
    if (RECORDABLE_EVENT_TYPES.includes(internalEventType as RecordableEventType)) {
      // Record the event in database
      await campaignService.recordEvent(queueEntry.id, internalEventType as RecordableEventType, {
        providerEvent: eventType,
        timestamp:
          typeof event.timestamp === 'number'
            ? new Date(event.timestamp * 1000).toISOString()
            : event.timestamp || new Date().toISOString(),
        clickedLink: event.data?.clicked_link,
      });

      // Track analytics events (fire-and-forget)
      const analyticsService = getCampaignAnalyticsService();
      const analyticsParams = {
        userId: queueDetails.user_id,
        campaignId: queueDetails.campaign_id,
        campaign: campaignName,
        messageId: messageId || queueEntry.id,
      };

      if (internalEventType === 'opened') {
        analyticsService.trackEmailOpened(analyticsParams).catch(err => {
          logger.error('Failed to track email_opened event:', { error: err });
        });
      } else if (internalEventType === 'clicked') {
        analyticsService
          .trackEmailClicked({
            ...analyticsParams,
            link: event.data?.clicked_link || 'unknown',
          })
          .catch(err => {
            logger.error('Failed to track email_clicked event:', { error: err });
          });
      }
    } else if (internalEventType === 'unsubscribed') {
      // Handle unsubscribe specially
      await handleUnsubscribe(
        queueEntry,
        queueDetails.campaign_id,
        queueDetails.user_id,
        campaignName,
        logger
      );
    }
    // Note: 'sent' events are NOT recorded here - they're already tracked in the queue

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * POST handler for email webhooks
 *
 * @param request - The incoming request
 * @returns JSON response with processing result
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const logger = createLogger(request, 'email-webhook');

  try {
    // 1. Get raw body for signature verification
    const rawBody = await request.text();

    // 2. Verify webhook signature
    const brevoSignature = request.headers.get('X-Brevo-Signature');
    const resendSignature = request.headers.get('svix-signature');
    const resendTimestamp = request.headers.get('svix-timestamp');

    let isSignatureValid = false;

    if (brevoSignature) {
      isSignatureValid = verifyBrevoSignature(rawBody, brevoSignature);
      logger.debug('Brevo signature verification', { valid: isSignatureValid });
    } else if (resendSignature && resendTimestamp) {
      isSignatureValid = verifyResendSignature(rawBody, resendSignature, resendTimestamp);
      logger.debug('Resend signature verification', { valid: isSignatureValid });
    } else {
      // In development and test, allow unsigned webhooks
      if (serverEnv.ENV !== 'development' && serverEnv.ENV !== 'test') {
        const { body, status } = createErrorResponse(
          ErrorCodes.UNAUTHORIZED,
          'Missing webhook signature',
          401
        );
        return NextResponse.json(body, { status });
      }
      logger.warn('No webhook signature provided (development/test mode)');
      isSignatureValid = true;
    }

    if (!isSignatureValid) {
      const { body, status } = createErrorResponse(
        ErrorCodes.UNAUTHORIZED,
        'Invalid webhook signature',
        401
      );
      return NextResponse.json(body, { status });
    }

    // 3. Parse and validate payload
    const payload = JSON.parse(rawBody);

    // Handle both single event and array of events
    const events: IEmailWebhookEventPayload[] = Array.isArray(payload) ? payload : [payload];

    // Validate each event (loosely - we don't want to reject valid webhooks)
    const validEvents: IEmailWebhookEventPayload[] = [];
    for (const event of events) {
      try {
        const validated = emailWebhookPayloadSchema.parse(event);
        validEvents.push(validated as IEmailWebhookEventPayload);
      } catch {
        logger.warn('Skipping invalid event', { event });
      }
    }

    logger.info('Processing webhook events', { count: validEvents.length });

    // 4. Process each event
    const errors: string[] = [];
    let processed = 0;

    for (const event of validEvents) {
      const result = await processEvent(event, logger);
      if (result.success) {
        processed++;
      } else if (result.error) {
        errors.push(result.error);
      }
    }

    // 5. Return result
    const response: IEmailWebhookResult = {
      received: true,
      processed,
      errors: errors.length > 0 ? errors : undefined,
    };

    return NextResponse.json(response);
  } catch (error) {
    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      const { body, status } = createErrorResponse(
        ErrorCodes.INVALID_REQUEST,
        'Invalid JSON payload',
        400
      );
      return NextResponse.json(body, { status });
    }

    // Handle validation errors
    if (error instanceof ZodError) {
      const { body, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid webhook payload',
        400,
        { validationErrors: error.errors }
      );
      return NextResponse.json(body, { status });
    }

    // Handle unexpected errors
    logger.error('Unexpected error in email webhook', { error });
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
