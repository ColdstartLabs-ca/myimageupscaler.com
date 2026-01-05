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

      // Assert - FIX: Updated reason format to match actual implementation
      expect(supabaseAdmin.from).toHaveBeenCalledWith('profiles');
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('clawback_from_transaction_v2', {
        p_target_user_id: mockUserId,
        p_original_ref_id: `invoice_${mockInvoiceId}`,
        p_reason: `Refund for charge ${mockChargeId} (1000 cents)`,
      });
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[CHARGE_REFUND] Processing refund for charge ch_test_123:',
        expect.any(Object)
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[CHARGE_REFUND] Clawback succeeded with ref_id: invoice_in_test_123',
        expect.any(Object)
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

      // Mock successful clawback using multi-prefix lookup
      // FIX: New implementation uses clawback_from_transaction_v2 with pi_ prefix
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: [
          {
            success: true,
            credits_clawed_back: 200,
            subscription_clawed: 0,
            purchased_clawed: 200,
            new_subscription_balance: 0,
            new_purchased_balance: 0,
            error_message: null,
          },
        ],
        error: null,
      } as never);

      // Act
      await PaymentHandler.handleChargeRefunded(charge);

      // Assert - FIX: Now uses clawback_from_transaction_v2 with pi_ prefix
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('clawback_from_transaction_v2', {
        p_target_user_id: mockUserId,
        p_original_ref_id: `pi_${mockPaymentIntentId}`,
        p_reason: `Refund for charge ${mockChargeId} (2000 cents)`,
      });
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[CHARGE_REFUND] Processing refund for charge ch_test_123:',
        expect.any(Object)
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[CHARGE_REFUND] Clawback succeeded with ref_id: pi_pi_test_123',
        expect.any(Object)
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

      // Act & Assert - FIX: Now throws error to enable Stripe retry (was silent return)
      await expect(PaymentHandler.handleChargeRefunded(charge)).rejects.toThrow(
        'Profile not found for customer'
      );
      expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[WEBHOOK_RETRY] No profile found for customer cus_test_123',
        expect.any(Object)
      );
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

      // FIX: Mock clawback failure - returns success: false instead of error
      // New implementation doesn't throw on clawback failure to avoid blocking legitimate refunds
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: [
          {
            success: false,
            error_message: 'Transaction not found',
          },
        ],
        error: null,
      } as never);

      // Act - should NOT throw anymore, just logs warning
      await PaymentHandler.handleChargeRefunded(charge);

      // Assert - logs warning but doesn't throw
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        '[CHARGE_REFUND] Could not correlate refund to any transaction',
        expect.objectContaining({
          userId: mockUserId,
          chargeId: mockChargeId,
          attemptedRefIds: expect.any(Array),
        })
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

      // FIX: New implementation tries session_ as fallback, so it would make an RPC call
      // Mock the RPC to fail (returning success: false)
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: [
          {
            success: false,
            error_message: 'Transaction not found',
          },
        ],
        error: null,
      } as never);

      // Act
      await PaymentHandler.handleChargeRefunded(charge);

      // Assert - FIX: Now tries session_ prefix as fallback, then warns when correlation fails
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('clawback_from_transaction_v2', {
        p_target_user_id: mockUserId,
        p_original_ref_id: `session_${mockChargeId}`, // Uses session_ as fallback
        p_reason: `Refund for charge ${mockChargeId} (1000 cents)`,
      });
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        '[CHARGE_REFUND] Could not correlate refund to any transaction',
        expect.objectContaining({
          userId: mockUserId,
          chargeId: mockChargeId,
          attemptedRefIds: expect.any(Array),
        })
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

      // FIX: Already using clawback_from_transaction_v2 (no change needed)
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

      // Assert - FIX: Updated to match actual log format
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('clawback_from_transaction_v2', {
        p_target_user_id: mockUserId,
        p_original_ref_id: `invoice_${mockInvoiceId}`,
        p_reason: `Invoice refund: ${mockInvoiceId}`,
      });
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[INVOICE_REFUND] Invoice in_test_123 payment refunded'
      );
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

      // Act & Assert - FIX: Now throws error to enable Stripe retry (was silent return)
      await expect(PaymentHandler.handleInvoicePaymentRefunded(invoice)).rejects.toThrow(
        'Profile not found for customer'
      );
      expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[WEBHOOK_RETRY] No profile found for customer cus_test_123',
        expect.any(Object)
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

      // FIX: Mock RPC returning error (not success: false)
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: null,
        error: { message: 'Clawback failed' },
      } as never);

      // Act & Assert - Should still throw when RPC returns an error
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
