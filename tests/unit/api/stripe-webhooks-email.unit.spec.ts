import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PaymentHandler } from '@/app/api/webhooks/stripe/handlers/payment.handler';
import Stripe from 'stripe';
import { getEmailService } from '@server/services/email.service';

// Mock dependencies
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({
              data: null,
              error: { code: 'PGRST116' },
            })
          ),
          maybeSingle: vi.fn(() =>
            Promise.resolve({
              data: { id: 'user-123', stripe_customer_id: 'cus_test' },
              error: null,
            })
          ),
          limit: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null })),
          })),
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ error: null })),
  },
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    AMPLITUDE_API_KEY: 'test-key',
  },
}));

vi.mock('@shared/config/stripe', () => ({
  assertKnownPriceId: vi.fn(() => ({ type: 'plan' as const })),
  getPlanForPriceId: vi.fn(() => ({ creditsPerMonth: 100, name: 'Pro' })),
  resolvePlanOrPack: vi.fn(() => ({ type: 'plan' as const, key: 'pro_monthly' })),
}));

vi.mock('@server/stripe', () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(() =>
        Promise.resolve({
          items: { data: [{ price: { id: 'price_test' } }] },
        })
      ),
    },
  },
}));

// Mock email service
vi.mock('@server/services/email.service', () => ({
  getEmailService: vi.fn(() => ({
    send: vi.fn(() =>
      Promise.resolve({
        success: true,
        messageId: 'test-email-id',
      })
    ),
  })),
}));

describe('Stripe Webhooks - Email Integration', () => {
  const mockSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset email service mock
    (getEmailService as ReturnType<typeof vi.fn>).mockReturnValue({
      send: mockSend.mockResolvedValue({
        success: true,
        messageId: 'test-email-id',
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Checkout Session Completed - Subscription', () => {
    it('should send payment success email for subscription', async () => {
      const session: Stripe.Checkout.Session = {
        id: 'cs_test',
        mode: 'subscription',
        customer: 'cus_test',
        customer_email: 'customer@example.com',
        customer_details: {
          name: 'John Doe',
          email: 'customer@example.com',
        },
        amount_total: 4900,
        subscription: 'sub_1234567890',
        invoice: 'in_test_123',
        metadata: {
          user_id: 'user-123',
        },
        receipt_url: 'https://stripe.com/receipt/test',
      } as unknown as Stripe.Checkout.Session;

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(mockSend).toHaveBeenCalledWith({
        to: 'customer@example.com',
        template: 'payment-success',
        data: expect.objectContaining({
          userName: 'John Doe',
          amount: '$49',
          receiptUrl: 'https://stripe.com/receipt/test',
        }),
        userId: 'user-123',
      });
    });

    it('should use "there" as fallback when customer name is missing', async () => {
      const session: Stripe.Checkout.Session = {
        id: 'cs_test',
        mode: 'subscription',
        customer: 'cus_test',
        customer_email: 'customer@example.com',
        customer_details: {
          email: 'customer@example.com',
          // name is missing
        },
        amount_total: 4900,
        subscription: 'sub_1234567890',
        invoice: 'in_test_123',
        metadata: {
          user_id: 'user-123',
        },
      } as unknown as Stripe.Checkout.Session;

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userName: 'there',
          }),
        })
      );
    });

    it('should fall back to customer_details.email when customer_email is missing', async () => {
      const session: Stripe.Checkout.Session = {
        id: 'cs_test',
        mode: 'subscription',
        customer: 'cus_test',
        // customer_email is missing
        customer_details: {
          name: 'John Doe',
          email: 'customer@example.com',
        },
        amount_total: 4900,
        subscription: 'sub_1234567890',
        invoice: 'in_test_123',
        metadata: {
          user_id: 'user-123',
        },
      } as unknown as Stripe.Checkout.Session;

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'customer@example.com',
        })
      );
    });

    it('should skip email when no email is available at all', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const session: Stripe.Checkout.Session = {
        id: 'cs_test',
        mode: 'subscription',
        customer: 'cus_test',
        // no customer_email, no customer_details.email
        customer_details: {
          name: 'John Doe',
        },
        amount_total: 4900,
        subscription: 'sub_1234567890',
        invoice: 'in_test_123',
        metadata: {
          user_id: 'user-123',
        },
      } as unknown as Stripe.Checkout.Session;

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(mockSend).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'No customer email available for subscription payment email'
      );
      consoleWarnSpy.mockRestore();
    });

    it('should not fail webhook when email sending fails', async () => {
      // Mock email send to fail
      mockSend.mockRejectedValue(new Error('Email service unavailable'));

      const session: Stripe.Checkout.Session = {
        id: 'cs_test',
        mode: 'subscription',
        customer: 'cus_test',
        customer_email: 'customer@example.com',
        customer_details: {
          name: 'John Doe',
          email: 'customer@example.com',
        },
        amount_total: 4900,
        subscription: 'sub_1234567890',
        invoice: 'in_test_123',
        metadata: {
          user_id: 'user-123',
        },
      } as unknown as Stripe.Checkout.Session;

      // Should not throw
      await expect(PaymentHandler.handleCheckoutSessionCompleted(session)).resolves.not.toThrow();
    });

    it('should log email error but continue webhook processing', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSend.mockRejectedValue(new Error('Failed to send email'));

      const session: Stripe.Checkout.Session = {
        id: 'cs_test',
        mode: 'subscription',
        customer: 'cus_test',
        customer_email: 'customer@example.com',
        customer_details: {
          name: 'John Doe',
          email: 'customer@example.com',
        },
        amount_total: 4900,
        subscription: 'sub_1234567890',
        metadata: {
          user_id: 'user-123',
        },
      } as unknown as Stripe.Checkout.Session;

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to send subscription payment email:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Checkout Session Completed - Credit Pack', () => {
    it('should send payment success email for credit pack', async () => {
      const session: Stripe.Checkout.Session = {
        id: 'cs_test',
        mode: 'payment',
        customer: 'cus_test',
        customer_email: 'buyer@example.com',
        customer_details: {
          name: 'Jane Buyer',
          email: 'buyer@example.com',
        },
        amount_total: 9900,
        payment_intent: 'pi_test_123',
        line_items: {
          data: [
            {
              price: { id: 'price_credit_pack' },
            },
          ],
        },
        metadata: {
          user_id: 'user-456',
          pack_key: 'pack_100',
          price_id: 'price_credit_pack',
          credits: '100',
        },
        receipt_url: 'https://stripe.com/receipt/credit',
      } as unknown as Stripe.Checkout.Session;

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(mockSend).toHaveBeenCalledWith({
        to: 'buyer@example.com',
        template: 'payment-success',
        data: expect.objectContaining({
          userName: 'Jane Buyer',
          amount: '$99',
          credits: 100,
          receiptUrl: 'https://stripe.com/receipt/credit',
        }),
        userId: 'user-456',
      });
    });

    it('should include credits in email data', async () => {
      const session: Stripe.Checkout.Session = {
        id: 'cs_test',
        mode: 'payment',
        customer: 'cus_test',
        customer_email: 'buyer@example.com',
        customer_details: {
          name: 'Credit Buyer',
          email: 'buyer@example.com',
        },
        amount_total: 1999,
        payment_intent: 'pi_test_456',
        line_items: {
          data: [
            {
              price: { id: 'price_pack_25' },
            },
          ],
        },
        metadata: {
          user_id: 'user-789',
          pack_key: 'pack_25',
          price_id: 'price_pack_25',
          credits: '25',
        },
        receipt_url: 'https://stripe.com/receipt/pack25',
      } as unknown as Stripe.Checkout.Session;

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            credits: 25,
          }),
        })
      );
    });

    it('should handle credit pack email errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSend.mockRejectedValueOnce(new Error('Rate limited'));

      const session: Stripe.Checkout.Session = {
        id: 'cs_test',
        mode: 'payment',
        customer: 'cus_test',
        customer_email: 'buyer@example.com',
        customer_details: {
          name: 'Buyer',
          email: 'buyer@example.com',
        },
        amount_total: 9900,
        payment_intent: 'pi_test',
        line_items: {
          data: [{ price: { id: 'price_pack' } }],
        },
        metadata: {
          user_id: 'user-test',
          pack_key: 'pack_100',
          price_id: 'price_pack',
          credits: '100',
        },
      } as unknown as Stripe.Checkout.Session;

      // Should not throw
      await expect(PaymentHandler.handleCheckoutSessionCompleted(session)).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to send credit pack payment email:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Email Data Validation', () => {
    it('should format amount correctly from cents', async () => {
      const session: Stripe.Checkout.Session = {
        id: 'cs_test',
        mode: 'subscription',
        customer: 'cus_test',
        customer_email: 'user@example.com',
        customer_details: {
          name: 'User',
          email: 'user@example.com',
        },
        amount_total: 2999, // $29.99
        subscription: 'sub_test',
        metadata: {
          user_id: 'user-test',
        },
      } as unknown as Stripe.Checkout.Session;

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: '$29.99',
          }),
        })
      );
    });

    it('should handle zero amount', async () => {
      const session: Stripe.Checkout.Session = {
        id: 'cs_test',
        mode: 'subscription',
        customer: 'cus_test',
        customer_email: 'user@example.com',
        customer_details: {
          name: 'Free User',
          email: 'user@example.com',
        },
        amount_total: 0,
        subscription: 'sub_test',
        metadata: {
          user_id: 'user-free',
        },
      } as unknown as Stripe.Checkout.Session;

      await PaymentHandler.handleCheckoutSessionCompleted(session);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: '$0',
          }),
        })
      );
    });
  });
});
