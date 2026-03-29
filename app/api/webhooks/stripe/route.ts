import { NextRequest, NextResponse } from 'next/server';
import { WebhookVerificationService } from './services/webhook-verification.service';
import { IdempotencyService } from './services/idempotency.service';
import {
  extractPreviousPriceId,
  processStripeWebhookEvent,
} from '@server/services/stripe-webhook-event-processor';

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[WEBHOOK_POST_HANDLER_CALLED]', { timestamp: new Date().toISOString() });

  try {
    // 1. Verify webhook signature and construct event
    const { event } = await WebhookVerificationService.verifyWebhook(request);

    // 2. Idempotency check - prevent duplicate processing
    let idempotencyResult = null;
    let idempotencyEnabled = true;

    try {
      idempotencyResult = await IdempotencyService.checkAndClaimEvent(event.id, event.type, event);
    } catch (idempotencyError) {
      idempotencyEnabled = false;
      console.error(
        'Webhook idempotency table unavailable - processing without DB tracking:',
        idempotencyError
      );
    }

    if (idempotencyEnabled && idempotencyResult && !idempotencyResult.isNew) {
      console.log('[WEBHOOK_DUPLICATE_SKIPPED]', {
        eventId: event.id,
        eventType: event.type,
        existingStatus: idempotencyResult.existingStatus,
      });
      return NextResponse.json({
        received: true,
        skipped: true,
        reason: `Event already ${idempotencyResult.existingStatus}`,
      });
    }

    // 3. Handle the event
    console.log('[WEBHOOK_EVENT_RECEIVED]', {
      eventId: event.id,
      eventType: event.type,
      timestamp: new Date().toISOString(),
      previousAttributes: event.data.previous_attributes,
      extractedPreviousPriceId: extractPreviousPriceId(event.data.previous_attributes),
    });

    try {
      const processResult = await processStripeWebhookEvent(event);

      if (!processResult.handled) {
        // MEDIUM-2 FIX: Mark unhandled events as unrecoverable instead of completed
        console.warn(`UNHANDLED WEBHOOK TYPE: ${event.type} - this may require code update`);
        if (idempotencyEnabled) {
          await IdempotencyService.markEventUnrecoverable(event.id, event.type);
        } else {
          console.warn(
            'Skipping webhook_events logging because idempotency is disabled for this event.'
          );
        }

        // Return success to prevent Stripe retries, but event is marked for investigation
        return NextResponse.json({
          received: true,
          warning: `Unhandled event type: ${event.type}`,
        });
      }

      // Mark event as completed after successful processing
      if (idempotencyEnabled) {
        await IdempotencyService.markEventCompleted(event.id);
      }

      return NextResponse.json({ received: true });
    } catch (processingError) {
      // Mark event as failed and re-throw
      const errorMessage =
        processingError instanceof Error ? processingError.message : 'Unknown error';
      if (idempotencyEnabled) {
        await IdempotencyService.markEventFailed(event.id, errorMessage);
      }
      throw processingError;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Webhook handler failed';
    console.error('Webhook error:', error);

    // Client errors (signature/body issues) return 400 - don't retry
    // Server errors return 500 - Stripe will retry
    const lowerMessage = message.toLowerCase();
    const isClientError =
      lowerMessage.includes('signature') ||
      lowerMessage.includes('invalid webhook body') ||
      lowerMessage.includes('missing stripe-signature');
    const status = isClientError ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
