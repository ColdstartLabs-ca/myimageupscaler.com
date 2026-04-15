/**
 * Unit Tests: Stripe Webhook Event Processor
 *
 * Tests for the centralized webhook event processor that routes Stripe events
 * to appropriate handlers and extracts previous_price_id from event data.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Stripe from 'stripe';
import {
  extractPreviousPriceId,
  processStripeWebhookEvent,
  type IWebhookProcessResult,
} from '../../../server/services/stripe-webhook-event-processor';

// Mock handlers
vi.mock('../../../app/api/webhooks/stripe/handlers/payment.handler', () => ({
  PaymentHandler: {
    handleCheckoutSessionCompleted: vi.fn(),
    handleAsyncPaymentSucceeded: vi.fn(),
    handleAsyncPaymentFailed: vi.fn(),
    handleChargeRefunded: vi.fn(),
    handleInvoicePaymentRefunded: vi.fn(),
  },
}));

vi.mock('../../../app/api/webhooks/stripe/handlers/subscription.handler', () => ({
  SubscriptionHandler: {
    handleCustomerCreated: vi.fn(),
    handleSubscriptionUpdate: vi.fn(),
    handleSubscriptionDeleted: vi.fn(),
    handleTrialWillEnd: vi.fn(),
    handleSubscriptionScheduleCompleted: vi.fn(),
  },
}));

vi.mock('../../../app/api/webhooks/stripe/handlers/invoice.handler', () => ({
  InvoiceHandler: {
    handleInvoicePaymentSucceeded: vi.fn(),
    handleInvoicePaymentFailed: vi.fn(),
  },
}));

vi.mock('../../../app/api/webhooks/stripe/handlers/dispute.handler', () => ({
  DisputeHandler: {
    handleChargeDisputeCreated: vi.fn(),
    handleChargeDisputeUpdated: vi.fn(),
    handleChargeDisputeClosed: vi.fn(),
  },
}));

import { PaymentHandler } from '../../../app/api/webhooks/stripe/handlers/payment.handler';
import { SubscriptionHandler } from '../../../app/api/webhooks/stripe/handlers/subscription.handler';
import { InvoiceHandler } from '../../../app/api/webhooks/stripe/handlers/invoice.handler';
import { DisputeHandler } from '../../../app/api/webhooks/stripe/handlers/dispute.handler';

// Cast mocked handlers to the correct type for testing
const MockedPaymentHandler = PaymentHandler as {
  handleCheckoutSessionCompleted: ReturnType<typeof vi.fn>;
  handleAsyncPaymentSucceeded: ReturnType<typeof vi.fn>;
  handleAsyncPaymentFailed: ReturnType<typeof vi.fn>;
  handleChargeRefunded: ReturnType<typeof vi.fn>;
  handleInvoicePaymentRefunded: ReturnType<typeof vi.fn>;
};
const MockedSubscriptionHandler = SubscriptionHandler as {
  handleCustomerCreated: ReturnType<typeof vi.fn>;
  handleSubscriptionUpdate: ReturnType<typeof vi.fn>;
  handleSubscriptionDeleted: ReturnType<typeof vi.fn>;
  handleTrialWillEnd: ReturnType<typeof vi.fn>;
  handleSubscriptionScheduleCompleted: ReturnType<typeof vi.fn>;
};
const MockedInvoiceHandler = InvoiceHandler as {
  handleInvoicePaymentSucceeded: ReturnType<typeof vi.fn>;
  handleInvoicePaymentFailed: ReturnType<typeof vi.fn>;
};
const MockedDisputeHandler = DisputeHandler as {
  handleChargeDisputeCreated: ReturnType<typeof vi.fn>;
  handleChargeDisputeUpdated: ReturnType<typeof vi.fn>;
  handleChargeDisputeClosed: ReturnType<typeof vi.fn>;
};

describe('Stripe Webhook Event Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractPreviousPriceId', () => {
    describe('with items.data array format (modern Stripe format)', () => {
      test('should extract price_id from items.data[0].price.id (string)', () => {
        const previousAttributes = {
          items: {
            data: [
              {
                price: {
                  id: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
                },
              },
            ],
          },
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBe('price_1Sz0fOL1vUl00LlZ7bbM2cDs');
      });

      test('should extract price_id from items.data[0].price (object)', () => {
        const previousAttributes = {
          items: {
            data: [
              {
                price: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
              },
            ],
          },
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBe('price_1Sz0fOL1vUl00LlZ7bbM2cDs');
      });

      test('should extract plan_id from items.data[0].plan.id (object)', () => {
        const previousAttributes = {
          items: {
            data: [
              {
                plan: {
                  id: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
                },
              },
            ],
          },
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBe('price_1Sz0fOL1vUl00LlZ7bbM2cDs');
      });

      test('should extract plan_id from items.data[0].plan (string)', () => {
        const previousAttributes = {
          items: {
            data: [
              {
                plan: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
              },
            ],
          },
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBe('price_1Sz0fOL1vUl00LlZ7bbM2cDs');
      });
    });

    describe('with items array format (legacy Stripe format)', () => {
      test('should extract price_id from items[0].price.id (object)', () => {
        const previousAttributes = {
          items: [
            {
              price: {
                id: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
              },
            },
          ],
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBe('price_1Sz0fOL1vUl00LlZ7bbM2cDs');
      });

      test('should extract price_id from items[0].price (string)', () => {
        const previousAttributes = {
          items: [
            {
              price: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
            },
          ],
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBe('price_1Sz0fOL1vUl00LlZ7bbM2cDs');
      });

      test('should extract plan_id from items[0].plan (string)', () => {
        const previousAttributes = {
          items: [
            {
              plan: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
            },
          ],
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBe('price_1Sz0fOL1vUl00LlZ7bbM2cDs');
      });
    });

    describe('with direct price/plan attributes', () => {
      test('should extract direct price.id (object)', () => {
        const previousAttributes = {
          price: {
            id: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
          },
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBe('price_1Sz0fOL1vUl00LlZ7bbM2cDs');
      });

      test('should extract direct price (string)', () => {
        const previousAttributes = {
          price: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBe('price_1Sz0fOL1vUl00LlZ7bbM2cDs');
      });

      test('should extract direct plan.id (object)', () => {
        const previousAttributes = {
          plan: {
            id: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
          },
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBe('price_1Sz0fOL1vUl00LlZ7bbM2cDs');
      });

      test('should extract direct plan (string)', () => {
        const previousAttributes = {
          plan: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBe('price_1Sz0fOL1vUl00LlZ7bbM2cDs');
      });
    });

    describe('edge cases and error handling', () => {
      test('should return null for null previous_attributes', () => {
        const result = extractPreviousPriceId(null);
        expect(result).toBeNull();
      });

      test('should return null for undefined previous_attributes', () => {
        const result = extractPreviousPriceId(undefined);
        expect(result).toBeNull();
      });

      test('should return null for empty object', () => {
        const result = extractPreviousPriceId({});
        expect(result).toBeNull();
      });

      test('should return null for non-object input', () => {
        const result = extractPreviousPriceId('string' as unknown as Record<string, unknown>);
        expect(result).toBeNull();
      });

      test('should handle empty items.data array', () => {
        const previousAttributes = {
          items: {
            data: [],
          },
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBeNull();
      });

      test('should handle empty items array', () => {
        const previousAttributes = {
          items: [],
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBeNull();
      });

      test('should handle items with missing price and plan', () => {
        const previousAttributes = {
          items: {
            data: [
              {
                quantity: 1,
              },
            ],
          },
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBeNull();
      });
    });

    describe('priority order', () => {
      test('should prefer items.data over direct attributes', () => {
        const previousAttributes = {
          items: {
            data: [
              {
                price: 'price_from_items',
              },
            ],
          },
          price: 'price_direct',
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBe('price_from_items');
      });

      test('should prefer price over plan in items.data', () => {
        const previousAttributes = {
          items: {
            data: [
              {
                price: 'price_id',
                plan: 'plan_id',
              },
            ],
          },
        };

        const result = extractPreviousPriceId(previousAttributes);
        expect(result).toBe('price_id');
      });
    });
  });

  describe('processStripeWebhookEvent', () => {
    let consoleSpy: {
      log: ReturnType<typeof vi.spyOn>;
      warn: ReturnType<typeof vi.spyOn>;
    };

    beforeEach(() => {
      consoleSpy = {
        log: vi.spyOn(console, 'log').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      };
    });

    afterEach(() => {
      Object.values(consoleSpy).forEach(spy => spy.mockRestore());
    });

    describe('checkout.session.completed', () => {
      test('should route to PaymentHandler.handleCheckoutSessionCompleted', async () => {
        const event = {
          id: 'evt_test',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test',
            },
          },
        } as Stripe.Event;

        MockedPaymentHandler.handleCheckoutSessionCompleted.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedPaymentHandler.handleCheckoutSessionCompleted).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('checkout.session.async_payment_succeeded', () => {
      test('should route to PaymentHandler.handleAsyncPaymentSucceeded', async () => {
        const event = {
          id: 'evt_test',
          type: 'checkout.session.async_payment_succeeded',
          data: {
            object: { id: 'cs_test', mode: 'payment' },
          },
        } as Stripe.Event;

        MockedPaymentHandler.handleAsyncPaymentSucceeded.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedPaymentHandler.handleAsyncPaymentSucceeded).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('checkout.session.async_payment_failed', () => {
      test('should route to PaymentHandler.handleAsyncPaymentFailed', async () => {
        const event = {
          id: 'evt_test',
          type: 'checkout.session.async_payment_failed',
          data: {
            object: { id: 'cs_test', mode: 'payment' },
          },
        } as Stripe.Event;

        MockedPaymentHandler.handleAsyncPaymentFailed.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedPaymentHandler.handleAsyncPaymentFailed).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('customer.created', () => {
      test('should route to SubscriptionHandler.handleCustomerCreated', async () => {
        const event = {
          id: 'evt_test',
          type: 'customer.created',
          data: {
            object: {
              id: 'cus_test',
            },
          },
        } as Stripe.Event;

        MockedSubscriptionHandler.handleCustomerCreated.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedSubscriptionHandler.handleCustomerCreated).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('customer.subscription.created', () => {
      test('should route to SubscriptionHandler.handleSubscriptionUpdate with previousPriceId', async () => {
        const event = {
          id: 'evt_test',
          type: 'customer.subscription.created',
          data: {
            object: { id: 'sub_test' },
            previous_attributes: {
              items: {
                data: [{ price: 'price_old' }],
              },
            },
          },
        } as Stripe.Event;

        MockedSubscriptionHandler.handleSubscriptionUpdate.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedSubscriptionHandler.handleSubscriptionUpdate).toHaveBeenCalledWith(
          event.data.object,
          { previousPriceId: 'price_old' }
        );
      });

      test('should handle missing previous_attributes gracefully', async () => {
        const event = {
          id: 'evt_test',
          type: 'customer.subscription.created',
          data: {
            object: { id: 'sub_test' },
          },
        } as Stripe.Event;

        MockedSubscriptionHandler.handleSubscriptionUpdate.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedSubscriptionHandler.handleSubscriptionUpdate).toHaveBeenCalledWith(
          event.data.object,
          { previousPriceId: null }
        );
      });
    });

    describe('customer.subscription.updated', () => {
      test('should route to SubscriptionHandler.handleSubscriptionUpdate with previousPriceId', async () => {
        const event = {
          id: 'evt_test',
          type: 'customer.subscription.updated',
          data: {
            object: { id: 'sub_test' },
            previous_attributes: {
              items: {
                data: [{ price: 'price_old' }],
              },
            },
          },
        } as Stripe.Event;

        MockedSubscriptionHandler.handleSubscriptionUpdate.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedSubscriptionHandler.handleSubscriptionUpdate).toHaveBeenCalledWith(
          event.data.object,
          { previousPriceId: 'price_old' }
        );
      });
    });

    describe('customer.subscription.deleted', () => {
      test('should route to SubscriptionHandler.handleSubscriptionDeleted', async () => {
        const event = {
          id: 'evt_test',
          type: 'customer.subscription.deleted',
          data: {
            object: { id: 'sub_test' },
          },
        } as Stripe.Event;

        MockedSubscriptionHandler.handleSubscriptionDeleted.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedSubscriptionHandler.handleSubscriptionDeleted).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('customer.subscription.trial_will_end', () => {
      test('should route to SubscriptionHandler.handleTrialWillEnd', async () => {
        const event = {
          id: 'evt_test',
          type: 'customer.subscription.trial_will_end',
          data: {
            object: { id: 'sub_test' },
          },
        } as Stripe.Event;

        MockedSubscriptionHandler.handleTrialWillEnd.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedSubscriptionHandler.handleTrialWillEnd).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('invoice.payment_succeeded', () => {
      test('should route to InvoiceHandler.handleInvoicePaymentSucceeded', async () => {
        const event = {
          id: 'evt_test',
          type: 'invoice.payment_succeeded',
          data: {
            object: { id: 'in_test' },
          },
        } as Stripe.Event;

        MockedInvoiceHandler.handleInvoicePaymentSucceeded.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedInvoiceHandler.handleInvoicePaymentSucceeded).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('invoice.paid', () => {
      test('should route to InvoiceHandler.handleInvoicePaymentSucceeded', async () => {
        const event = {
          id: 'evt_test',
          type: 'invoice.paid',
          data: {
            object: { id: 'in_test' },
          },
        } as Stripe.Event;

        MockedInvoiceHandler.handleInvoicePaymentSucceeded.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedInvoiceHandler.handleInvoicePaymentSucceeded).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('invoice_payment.paid', () => {
      test('should route to InvoiceHandler.handleInvoicePaymentSucceeded', async () => {
        const event = {
          id: 'evt_test',
          type: 'invoice_payment.paid',
          data: {
            object: { id: 'in_test' },
          },
        } as Stripe.Event;

        MockedInvoiceHandler.handleInvoicePaymentSucceeded.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedInvoiceHandler.handleInvoicePaymentSucceeded).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('invoice.payment_failed', () => {
      test('should route to InvoiceHandler.handleInvoicePaymentFailed', async () => {
        const event = {
          id: 'evt_test',
          type: 'invoice.payment_failed',
          data: {
            object: { id: 'in_test' },
          },
        } as Stripe.Event;

        MockedInvoiceHandler.handleInvoicePaymentFailed.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedInvoiceHandler.handleInvoicePaymentFailed).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('invoice_payment.failed', () => {
      test('should route to InvoiceHandler.handleInvoicePaymentFailed', async () => {
        const event = {
          id: 'evt_test',
          type: 'invoice_payment.failed',
          data: {
            object: { id: 'in_test' },
          },
        } as Stripe.Event;

        MockedInvoiceHandler.handleInvoicePaymentFailed.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedInvoiceHandler.handleInvoicePaymentFailed).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('charge.refunded', () => {
      test('should route to PaymentHandler.handleChargeRefunded', async () => {
        const event = {
          id: 'evt_test',
          type: 'charge.refunded',
          data: {
            object: { id: 'ch_test' },
          },
        } as Stripe.Event;

        MockedPaymentHandler.handleChargeRefunded.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedPaymentHandler.handleChargeRefunded).toHaveBeenCalledWith(event.data.object);
      });
    });

    describe('charge.dispute.created', () => {
      test('should route to DisputeHandler.handleChargeDisputeCreated', async () => {
        const event = {
          id: 'evt_test',
          type: 'charge.dispute.created',
          data: {
            object: { id: 'dp_test' },
          },
        } as Stripe.Event;

        MockedDisputeHandler.handleChargeDisputeCreated.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedDisputeHandler.handleChargeDisputeCreated).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('charge.dispute.updated', () => {
      test('should route to DisputeHandler.handleChargeDisputeUpdated', async () => {
        const event = {
          id: 'evt_test',
          type: 'charge.dispute.updated',
          data: {
            object: { id: 'dp_test' },
          },
        } as Stripe.Event;

        MockedDisputeHandler.handleChargeDisputeUpdated.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedDisputeHandler.handleChargeDisputeUpdated).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('charge.dispute.closed', () => {
      test('should route to DisputeHandler.handleChargeDisputeClosed', async () => {
        const event = {
          id: 'evt_test',
          type: 'charge.dispute.closed',
          data: {
            object: { id: 'dp_test' },
          },
        } as Stripe.Event;

        MockedDisputeHandler.handleChargeDisputeClosed.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedDisputeHandler.handleChargeDisputeClosed).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('invoice.payment_refunded', () => {
      test('should route to PaymentHandler.handleInvoicePaymentRefunded', async () => {
        const event = {
          id: 'evt_test',
          type: 'invoice.payment_refunded',
          data: {
            object: { id: 'in_test' },
          },
        } as Stripe.Event;

        MockedPaymentHandler.handleInvoicePaymentRefunded.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedPaymentHandler.handleInvoicePaymentRefunded).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('subscription_schedule.completed', () => {
      test('should route to SubscriptionHandler.handleSubscriptionScheduleCompleted', async () => {
        const event = {
          id: 'evt_test',
          type: 'subscription_schedule.completed',
          data: {
            object: { id: 'sched_test' },
          },
        } as Stripe.Event;

        MockedSubscriptionHandler.handleSubscriptionScheduleCompleted.mockResolvedValue(undefined);

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(true);
        expect(MockedSubscriptionHandler.handleSubscriptionScheduleCompleted).toHaveBeenCalledWith(
          event.data.object
        );
      });
    });

    describe('unhandled event types', () => {
      test('should return handled: false for unknown event types', async () => {
        const event = {
          id: 'evt_test',
          type: 'account.application.authorized',
          data: {
            object: { id: 'test' },
          },
        } as Stripe.Event;

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(false);
        // Note: The warning is logged by the route handler, not this function
      });

      test('should return handled: false for account.updated', async () => {
        const event = {
          id: 'evt_test',
          type: 'account.updated',
          data: { object: {} },
        } as Stripe.Event;

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(false);
      });

      test('should return handled: false for payment_method.attached', async () => {
        const event = {
          id: 'evt_test',
          type: 'payment_method.attached',
          data: { object: {} },
        } as Stripe.Event;

        const result = await processStripeWebhookEvent(event);

        expect(result.handled).toBe(false);
      });
    });
  });

  describe('IWebhookProcessResult interface', () => {
    test('should accept handled: true result', () => {
      const result: IWebhookProcessResult = { handled: true };
      expect(result.handled).toBe(true);
    });

    test('should accept handled: false result', () => {
      const result: IWebhookProcessResult = { handled: false };
      expect(result.handled).toBe(false);
    });
  });
});
