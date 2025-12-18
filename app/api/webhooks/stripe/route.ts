import { NextRequest, NextResponse } from 'next/server';
import { WebhookVerificationService } from './services/webhook-verification.service';
import { IdempotencyService } from './services/idempotency.service';
import { PaymentHandler } from './handlers/payment.handler';
import { SubscriptionHandler } from './handlers/subscription.handler';
import { InvoiceHandler } from './handlers/invoice.handler';
import { DisputeHandler } from './handlers/dispute.handler';
import Stripe from 'stripe';

type StripeWebhookEventType =
  | 'checkout.session.completed'
  | 'customer.created'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'customer.subscription.trial_will_end'
  | 'invoice.payment_succeeded'
  | 'invoice.paid'
  | 'invoice_payment.paid'
  | 'invoice.payment_failed'
  | 'invoice_payment.failed'
  | 'charge.refunded'
  | 'charge.dispute.created'
  | 'invoice.payment_refunded'
  | 'subscription_schedule.completed';

function extractPreviousPriceId(
  previousAttributes: Record<string, unknown> | null | undefined
): string | null {
  if (!previousAttributes || typeof previousAttributes !== 'object') {
    return null;
  }

  // Define proper types for previous attributes structure
  interface IPreviousAttributesItems {
    data?: Array<{
      price?: { id?: string } | string;
      plan?: { id?: string } | string;
    }>;
  }

  interface IPreviousAttributesDirect {
    items?:
      | IPreviousAttributesItems
      | Array<{
          price?: { id?: string } | string;
          plan?: { id?: string } | string;
        }>;
    price?: { id?: string } | string;
    plan?: { id?: string } | string;
  }

  const prevUnknown = previousAttributes as IPreviousAttributesDirect;
  const items = prevUnknown.items;
  const candidates: Array<{
    price?: { id?: string } | string;
    plan?: { id?: string } | string;
  }>[] = [];

  if (Array.isArray(items)) {
    candidates.push(items);
  } else if (items && Array.isArray(items.data)) {
    candidates.push(items.data);
  }

  for (const list of candidates) {
    const firstItem = list?.[0];
    const priceId =
      (typeof firstItem?.price === 'object' ? firstItem.price.id : firstItem?.price) ??
      (typeof firstItem?.plan === 'object' ? firstItem.plan.id : firstItem?.plan);

    if (typeof priceId === 'string') {
      return priceId;
    }
  }

  const directPrice =
    (typeof prevUnknown.price === 'object' ? prevUnknown.price?.id : prevUnknown.price) ??
    (typeof prevUnknown.plan === 'object' ? prevUnknown.plan?.id : prevUnknown.plan);

  return typeof directPrice === 'string' ? directPrice : null;
}

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
      switch (event.type as StripeWebhookEventType) {
        case 'checkout.session.completed':
          await PaymentHandler.handleCheckoutSessionCompleted(
            event.data.object as Stripe.Checkout.Session
          );
          break;

        case 'customer.created':
          await SubscriptionHandler.handleCustomerCreated(event.data.object as Stripe.Customer);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await SubscriptionHandler.handleSubscriptionUpdate(
            event.data.object as Stripe.Subscription,
            {
              previousPriceId: extractPreviousPriceId(event.data.previous_attributes),
            }
          );
          break;

        case 'customer.subscription.deleted':
          await SubscriptionHandler.handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription
          );
          break;

        case 'customer.subscription.trial_will_end':
          await SubscriptionHandler.handleTrialWillEnd(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_succeeded':
        case 'invoice.paid': // Stripe sometimes sends this alias
        case 'invoice_payment.paid': // Observed in logs; treat same as payment_succeeded
          await InvoiceHandler.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
        case 'invoice_payment.failed': // Alias guard
          await InvoiceHandler.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case 'charge.refunded':
          await PaymentHandler.handleChargeRefunded(event.data.object as Stripe.Charge);
          break;

        case 'charge.dispute.created':
          await DisputeHandler.handleChargeDisputeCreated(event.data.object as Stripe.Dispute);
          break;

        case 'invoice.payment_refunded':
          await PaymentHandler.handleInvoicePaymentRefunded(event.data.object as Stripe.Invoice);
          break;

        case 'subscription_schedule.completed':
          await SubscriptionHandler.handleSubscriptionScheduleCompleted(
            event.data.object as Stripe.SubscriptionSchedule
          );
          break;

        default:
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
