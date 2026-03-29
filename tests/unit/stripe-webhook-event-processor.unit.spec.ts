import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import {
  extractPreviousPriceId,
  processStripeWebhookEvent,
} from '@server/services/stripe-webhook-event-processor';
import { PaymentHandler } from '@app/api/webhooks/stripe/handlers/payment.handler';
import { SubscriptionHandler } from '@app/api/webhooks/stripe/handlers/subscription.handler';
import { InvoiceHandler } from '@app/api/webhooks/stripe/handlers/invoice.handler';
import { DisputeHandler } from '@app/api/webhooks/stripe/handlers/dispute.handler';

vi.mock('@app/api/webhooks/stripe/handlers/payment.handler', () => ({
  PaymentHandler: {
    handleCheckoutSessionCompleted: vi.fn(),
    handleChargeRefunded: vi.fn(),
    handleInvoicePaymentRefunded: vi.fn(),
  },
}));

vi.mock('@app/api/webhooks/stripe/handlers/subscription.handler', () => ({
  SubscriptionHandler: {
    handleCustomerCreated: vi.fn(),
    handleSubscriptionUpdate: vi.fn(),
    handleSubscriptionDeleted: vi.fn(),
    handleTrialWillEnd: vi.fn(),
    handleSubscriptionScheduleCompleted: vi.fn(),
  },
}));

vi.mock('@app/api/webhooks/stripe/handlers/invoice.handler', () => ({
  InvoiceHandler: {
    handleInvoicePaymentSucceeded: vi.fn(),
    handleInvoicePaymentFailed: vi.fn(),
  },
}));

vi.mock('@app/api/webhooks/stripe/handlers/dispute.handler', () => ({
  DisputeHandler: {
    handleChargeDisputeCreated: vi.fn(),
    handleChargeDisputeUpdated: vi.fn(),
    handleChargeDisputeClosed: vi.fn(),
  },
}));

describe('stripe-webhook-event-processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractPreviousPriceId', () => {
    it('extracts previous price id from nested items array', () => {
      expect(
        extractPreviousPriceId({
          items: {
            data: [{ price: { id: 'price_previous_hobby' } }],
          },
        })
      ).toBe('price_previous_hobby');
    });

    it('extracts previous price id from direct price field', () => {
      expect(
        extractPreviousPriceId({
          price: { id: 'price_previous_pro' },
        })
      ).toBe('price_previous_pro');
    });

    it('returns null when no previous price is present', () => {
      expect(extractPreviousPriceId({})).toBeNull();
    });
  });

  describe('processStripeWebhookEvent', () => {
    it('routes subscription updates through the real subscription handler with previous price id', async () => {
      const subscription = {
        id: 'sub_123',
        customer: 'cus_123',
      } as unknown as Stripe.Subscription;

      const event = {
        id: 'evt_123',
        type: 'customer.subscription.updated',
        data: {
          object: subscription,
          previous_attributes: {
            items: {
              data: [{ price: { id: 'price_previous_hobby' } }],
            },
          },
        },
      } as unknown as Stripe.Event;

      const result = await processStripeWebhookEvent(event);

      expect(result).toEqual({ handled: true });
      expect(SubscriptionHandler.handleSubscriptionUpdate).toHaveBeenCalledWith(subscription, {
        previousPriceId: 'price_previous_hobby',
      });
    });

    it('routes invoice success events through the invoice handler', async () => {
      const invoice = { id: 'in_123' } as Stripe.Invoice;
      const event = {
        id: 'evt_invoice',
        type: 'invoice.payment_succeeded',
        data: { object: invoice },
      } as unknown as Stripe.Event;

      const result = await processStripeWebhookEvent(event);

      expect(result).toEqual({ handled: true });
      expect(InvoiceHandler.handleInvoicePaymentSucceeded).toHaveBeenCalledWith(invoice);
    });

    it('returns handled false for unknown event types', async () => {
      const event = {
        id: 'evt_unknown',
        type: 'some.unknown.event',
        data: { object: {} },
      } as unknown as Stripe.Event;

      const result = await processStripeWebhookEvent(event);

      expect(result).toEqual({ handled: false });
      expect(PaymentHandler.handleCheckoutSessionCompleted).not.toHaveBeenCalled();
      expect(SubscriptionHandler.handleSubscriptionUpdate).not.toHaveBeenCalled();
      expect(InvoiceHandler.handleInvoicePaymentSucceeded).not.toHaveBeenCalled();
      expect(DisputeHandler.handleChargeDisputeCreated).not.toHaveBeenCalled();
    });
  });
});
