import Stripe from 'stripe';
import { PaymentHandler } from '@app/api/webhooks/stripe/handlers/payment.handler';
import { SubscriptionHandler } from '@app/api/webhooks/stripe/handlers/subscription.handler';
import { InvoiceHandler } from '@app/api/webhooks/stripe/handlers/invoice.handler';
import { DisputeHandler } from '@app/api/webhooks/stripe/handlers/dispute.handler';

type StripeWebhookEventType =
  | 'checkout.session.completed'
  | 'checkout.session.async_payment_succeeded'
  | 'checkout.session.async_payment_failed'
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
  | 'charge.failed'
  | 'charge.refunded'
  | 'charge.dispute.created'
  | 'charge.dispute.updated'
  | 'charge.dispute.closed'
  | 'invoice.payment_refunded'
  | 'subscription_schedule.completed';

export interface IWebhookProcessResult {
  handled: boolean;
}

export function extractPreviousPriceId(
  previousAttributes: Record<string, unknown> | null | undefined
): string | null {
  if (!previousAttributes || typeof previousAttributes !== 'object') {
    return null;
  }

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
  const candidates: Array<
    Array<{
      price?: { id?: string } | string;
      plan?: { id?: string } | string;
    }>
  > = [];

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

export async function processStripeWebhookEvent(
  event: Stripe.Event
): Promise<IWebhookProcessResult> {
  switch (event.type as StripeWebhookEventType) {
    case 'checkout.session.completed':
      await PaymentHandler.handleCheckoutSessionCompleted(
        event.data.object as Stripe.Checkout.Session
      );
      return { handled: true };

    case 'checkout.session.async_payment_succeeded':
      await PaymentHandler.handleAsyncPaymentSucceeded(
        event.data.object as Stripe.Checkout.Session
      );
      return { handled: true };

    case 'checkout.session.async_payment_failed':
      await PaymentHandler.handleAsyncPaymentFailed(event.data.object as Stripe.Checkout.Session);
      return { handled: true };

    case 'customer.created':
      await SubscriptionHandler.handleCustomerCreated(event.data.object as Stripe.Customer);
      return { handled: true };

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await SubscriptionHandler.handleSubscriptionUpdate(event.data.object as Stripe.Subscription, {
        previousPriceId: extractPreviousPriceId(event.data.previous_attributes),
      });
      return { handled: true };

    case 'customer.subscription.deleted':
      await SubscriptionHandler.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      return { handled: true };

    case 'customer.subscription.trial_will_end':
      await SubscriptionHandler.handleTrialWillEnd(event.data.object as Stripe.Subscription);
      return { handled: true };

    case 'invoice.payment_succeeded':
    case 'invoice.paid':
    case 'invoice_payment.paid':
      await InvoiceHandler.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
      return { handled: true };

    case 'invoice.payment_failed':
    case 'invoice_payment.failed':
      await InvoiceHandler.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      return { handled: true };

    case 'charge.failed':
      await PaymentHandler.handleChargeFailed(event.data.object as Stripe.Charge);
      return { handled: true };

    case 'charge.refunded':
      await PaymentHandler.handleChargeRefunded(event.data.object as Stripe.Charge);
      return { handled: true };

    case 'charge.dispute.created':
      await DisputeHandler.handleChargeDisputeCreated(event.data.object as Stripe.Dispute);
      return { handled: true };

    case 'charge.dispute.updated':
      await DisputeHandler.handleChargeDisputeUpdated(event.data.object as Stripe.Dispute);
      return { handled: true };

    case 'charge.dispute.closed':
      await DisputeHandler.handleChargeDisputeClosed(event.data.object as Stripe.Dispute);
      return { handled: true };

    case 'invoice.payment_refunded':
      await PaymentHandler.handleInvoicePaymentRefunded(event.data.object as Stripe.Invoice);
      return { handled: true };

    case 'subscription_schedule.completed':
      await SubscriptionHandler.handleSubscriptionScheduleCompleted(
        event.data.object as Stripe.SubscriptionSchedule
      );
      return { handled: true };

    default:
      return { handled: false };
  }
}
