import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaymentHandler } from '../../../app/api/webhooks/stripe/handlers/payment.handler';
import { DisputeHandler } from '../../../app/api/webhooks/stripe/handlers/dispute.handler';
import Stripe from 'stripe';

// Mock dependencies
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@server/stripe', () => ({
  stripe: {
    charges: {
      retrieve: vi.fn(),
    },
  },
}));

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { stripe } from '@server/stripe';

// Type for charge with invoice property
interface IStripeChargeExtended extends Stripe.Charge {
  invoice?: string | null;
}

describe('Credit Refund Webhook Handlers', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  const mockCustomerId = 'cus_test_123';
  const mockUserId = 'user_test_123';
  const mockChargeId = 'ch_test_123';
  const mockInvoiceId = 'in_test_123';
  const mockPaymentIntentId = 'pi_test_123';

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  describe('PaymentHandler.handleChargeRefunded', () => {
    test('should clawback credits from subscription pool for invoice-based refunds', async () => {
      // Arrange
      const charge: IStripeChargeExtended = {
        id: mockChargeId,
        customer: mockCustomerId as string,
        amount_refunded: 1000, // $10.00
        invoice: mockInvoiceId,
        payment_intent: mockPaymentIntentId as string | Stripe.PaymentIntent,
      } as IStripeChargeExtended;

      // Mock profile lookup
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: mockUserId },
              error: null,
            }),
          }),
        }),
      } as never);

      // Mock successful clawback from transaction v2
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: [
          {
            success: true,
            credits_clawed_back: 100, // Credits originally added
            subscription_clawed: 100,
            purchased_clawed: 0,
            new_subscription_balance: 0,
            new_purchased_balance: 0,
            error_message: null,
          },
        ],
        error: null,
      } as never);

      // Act
      await PaymentHandler.handleChargeRefunded(charge);

      // Assert
      expect(supabaseAdmin.from).toHaveBeenCalledWith('profiles');
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('clawback_from_transaction_v2', {
        p_target_user_id: mockUserId,
        p_original_ref_id: `invoice_${mockInvoiceId}`,
        p_reason: `Charge refund: ${mockChargeId} (1000 cents)`,
      });
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('[CHARGE_REFUND]'));
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Clawed back 100 credits')
      );
    });

    test('should clawback credits from purchased pool for credit pack refunds', async () => {
      // Arrange
      const charge: IStripeChargeExtended = {
        id: mockChargeId,
        customer: mockCustomerId as string,
        amount_refunded: 2000, // $20.00
        invoice: null, // No invoice = credit pack
        payment_intent: mockPaymentIntentId as string | Stripe.PaymentIntent,
      } as IStripeChargeExtended;

      // Mock profile lookup
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: mockUserId },
              error: null,
            }),
          }),
        }),
      } as never);

      // Mock successful clawback of purchased credits
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: [
          {
            success: true,
            credits_clawed_back: 200,
            new_balance: 0,
            error_message: null,
          },
        ],
        error: null,
      } as never);

      // Act
      await PaymentHandler.handleChargeRefunded(charge);

      // Assert
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('clawback_purchased_credits', {
        p_target_user_id: mockUserId,
        p_payment_intent_id: `pi_${mockPaymentIntentId}`,
        p_reason: `Credit pack refund: ${mockChargeId} (2000 cents)`,
      });
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('[CHARGE_REFUND]'));
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Clawed back 200 purchased credits')
      );
    });

    test('should skip when no refund amount', async () => {
      // Arrange
      const charge: IStripeChargeExtended = {
        id: mockChargeId,
        customer: mockCustomerId as string,
        amount_refunded: 0,
        invoice: mockInvoiceId,
      } as IStripeChargeExtended;

      // Act
      await PaymentHandler.handleChargeRefunded(charge);

      // Assert - should not call any RPC
      expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('has no refund amount, skipping')
      );
    });

    test('should return early when profile not found', async () => {
      // Arrange
      const charge: IStripeChargeExtended = {
        id: mockChargeId,
        customer: mockCustomerId as string,
        amount_refunded: 1000,
        invoice: mockInvoiceId,
      } as IStripeChargeExtended;

      // Mock profile not found
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      } as never);

      // Act
      await PaymentHandler.handleChargeRefunded(charge);

      // Assert - should not call clawback
      expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('No profile found'));
    });

    test('should throw error when clawback fails', async () => {
      // Arrange
      const charge: IStripeChargeExtended = {
        id: mockChargeId,
        customer: mockCustomerId as string,
        amount_refunded: 1000,
        invoice: mockInvoiceId,
      } as IStripeChargeExtended;

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: mockUserId },
              error: null,
            }),
          }),
        }),
      } as never);

      // Mock clawback failure
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      } as never);

      // Act & Assert
      await expect(PaymentHandler.handleChargeRefunded(charge)).rejects.toThrow();
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[CHARGE_REFUND]'),
        expect.any(Object)
      );
    });

    test('should warn when charge has no invoice and no payment intent', async () => {
      // Arrange
      const charge: IStripeChargeExtended = {
        id: mockChargeId,
        customer: mockCustomerId as string,
        amount_refunded: 1000,
        invoice: null,
        payment_intent: null,
      } as IStripeChargeExtended;

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: mockUserId },
              error: null,
            }),
          }),
        }),
      } as never);

      // Act
      await PaymentHandler.handleChargeRefunded(charge);

      // Assert
      expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('has no invoice or payment_intent')
      );
    });
  });

  describe('PaymentHandler.handleInvoicePaymentRefunded', () => {
    test('should clawback credits using invoice reference', async () => {
      // Arrange
      const invoice = {
        id: mockInvoiceId,
        customer: mockCustomerId as string,
      } as Stripe.Invoice;

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: mockUserId },
              error: null,
            }),
          }),
        }),
      } as never);

      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: [
          {
            success: true,
            credits_clawed_back: 200,
            subscription_clawed: 200,
            purchased_clawed: 0,
            new_subscription_balance: 0,
            new_purchased_balance: 0,
            error_message: null,
          },
        ],
        error: null,
      } as never);

      // Act
      await PaymentHandler.handleInvoicePaymentRefunded(invoice);

      // Assert
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('clawback_from_transaction_v2', {
        p_target_user_id: mockUserId,
        p_original_ref_id: `invoice_${mockInvoiceId}`,
        p_reason: `Invoice refund: ${mockInvoiceId}`,
      });
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('[INVOICE_REFUND]'));
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Clawed back 200 credits')
      );
    });

    test('should return early when profile not found', async () => {
      // Arrange
      const invoice = {
        id: mockInvoiceId,
        customer: mockCustomerId as string,
      } as Stripe.Invoice;

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      } as never);

      // Act
      await PaymentHandler.handleInvoicePaymentRefunded(invoice);

      // Assert
      expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[INVOICE_REFUND] No profile found')
      );
    });

    test('should throw error when clawback fails', async () => {
      // Arrange
      const invoice = {
        id: mockInvoiceId,
        customer: mockCustomerId as string,
      } as Stripe.Invoice;

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: mockUserId },
              error: null,
            }),
          }),
        }),
      } as never);

      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: null,
        error: { message: 'Clawback failed' },
      } as never);

      // Act & Assert
      await expect(PaymentHandler.handleInvoicePaymentRefunded(invoice)).rejects.toThrow();
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[INVOICE_REFUND]'),
        expect.any(Object)
      );
    });
  });
});

describe('Dispute Webhook Handlers', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  const mockDisputeId = 'dp_test_123';
  const mockChargeId = 'ch_disputed_123';
  const mockCustomerId = 'cus_disputed_123';
  const mockUserId = 'user_disputed_123';
  const mockDisputeAmountCents = 2000; // $20.00
  const mockCreditsToHold = Math.ceil(mockDisputeAmountCents / 10); // 200 credits

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  describe('DisputeHandler.handleChargeDisputeCreated', () => {
    test('should flag account, clawback credits, and log dispute event', async () => {
      // Arrange
      const dispute = {
        id: mockDisputeId,
        charge: mockChargeId as string | Stripe.Charge,
        amount: mockDisputeAmountCents,
        reason: 'product_not_received',
      } as Stripe.Dispute;

      // Mock charge retrieval
      vi.mocked(stripe.charges.retrieve).mockResolvedValue({
        customer: mockCustomerId,
      } as never);

      // Mock profile lookup
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: mockUserId,
                    subscription_credits_balance: 150,
                    purchased_credits_balance: 100,
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          } as never;
        } else if (table === 'dispute_events') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          } as never;
        }
        return {} as never;
      });

      // Mock clawback
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: [
          {
            success: true,
            subscription_clawed: 150,
            purchased_clawed: 50,
            new_subscription_balance: 0,
            new_purchased_balance: 50,
            error_message: null,
          },
        ],
        error: null,
      } as never);

      // Act
      await DisputeHandler.handleChargeDisputeCreated(dispute);

      // Assert
      expect(stripe.charges.retrieve).toHaveBeenCalledWith(mockChargeId);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('profiles');

      // Verify credits clawed back
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('clawback_credits_v2', {
        p_target_user_id: mockUserId,
        p_amount: mockCreditsToHold,
        p_reason: `Dispute hold: ${mockDisputeId}`,
        p_ref_id: `dispute_${mockDisputeId}`,
        p_pool: 'auto',
      });

      // Verify admin alert logged
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('[DISPUTE_ALERT]'));
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining(mockUserId));
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining(mockChargeId));
    });

    test('should throw error when charge has no customer', async () => {
      // Arrange
      const dispute = {
        id: mockDisputeId,
        charge: mockChargeId,
        amount: mockDisputeAmountCents,
      } as Stripe.Dispute;

      vi.mocked(stripe.charges.retrieve).mockResolvedValue({
        customer: null,
      } as never);

      // Act & Assert
      await expect(DisputeHandler.handleChargeDisputeCreated(dispute)).rejects.toThrow(
        'Invalid charge: missing customer ID'
      );
    });

    test('should throw error when profile not found', async () => {
      // Arrange
      const dispute = {
        id: mockDisputeId,
        charge: mockChargeId,
        amount: mockDisputeAmountCents,
      } as Stripe.Dispute;

      vi.mocked(stripe.charges.retrieve).mockResolvedValue({
        customer: mockCustomerId,
      } as never);

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      } as never);

      // Act & Assert
      await expect(DisputeHandler.handleChargeDisputeCreated(dispute)).rejects.toThrow(
        'Profile not found for dispute'
      );
    });

    test('should log error but continue when clawback fails', async () => {
      // Arrange
      const dispute = {
        id: mockDisputeId,
        charge: mockChargeId,
        amount: mockDisputeAmountCents,
      } as Stripe.Dispute;

      vi.mocked(stripe.charges.retrieve).mockResolvedValue({
        customer: mockCustomerId,
      } as never);

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: mockUserId },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          } as never;
        } else if (table === 'dispute_events') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          } as never;
        }
        return {} as never;
      });

      // Mock clawback failure
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: null,
        error: { message: 'Clawback failed' },
      } as never);

      // Act - should not throw
      await DisputeHandler.handleChargeDisputeCreated(dispute);

      // Assert - should log error but continue
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[DISPUTE]'),
        expect.any(Object)
      );
    });
  });

  describe('DisputeHandler.handleChargeDisputeUpdated', () => {
    test('should update dispute event status and restore account if won', async () => {
      // Arrange
      const dispute = {
        id: mockDisputeId,
        status: 'won' as const,
      } as Stripe.Dispute;

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { user_id: mockUserId },
              error: null,
            }),
          }),
        }),
      } as never);

      // Act
      await DisputeHandler.handleChargeDisputeUpdated(dispute);

      // Assert
      expect(supabaseAdmin.from).toHaveBeenCalledWith('dispute_events');
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('[DISPUTE]'));
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('won'));
    });

    test('should handle updated status for ongoing disputes', async () => {
      // Arrange
      const dispute = {
        id: mockDisputeId,
        status: 'needs_response' as const,
      } as Stripe.Dispute;

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as never);

      // Act
      await DisputeHandler.handleChargeDisputeUpdated(dispute);

      // Assert - should not restore account
      expect(consoleSpy.log).not.toHaveBeenCalledWith(expect.stringContaining('restored'));
    });
  });

  describe('DisputeHandler.handleChargeDisputeClosed', () => {
    test('should mark dispute as closed', async () => {
      // Arrange
      const dispute = {
        id: mockDisputeId,
        status: 'lost' as const,
      } as Stripe.Dispute;

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as never);

      // Act
      await DisputeHandler.handleChargeDisputeClosed(dispute);

      // Assert
      expect(supabaseAdmin.from).toHaveBeenCalledWith('dispute_events');
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('[DISPUTE]'));
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('closed'));
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining(mockDisputeId));
    });
  });
});
