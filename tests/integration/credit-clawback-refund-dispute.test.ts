import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { resetTestUser } from '../helpers/test-user-reset';

describe('Credit Clawback, Refund, and Dispute System Integration Tests', () => {
  let supabase: SupabaseClient;
  let testUserId: string;

  // Test configuration
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  beforeAll(async () => {
    // Initialize Supabase client with service role for admin operations
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  });

  beforeEach(async () => {
    // Reset the fixed test user to initial state for each test
    const testUser = await resetTestUser();
    testUserId = testUser.id;
  });

  describe('clawback_credits_v2', () => {
    test('should clawback from subscription pool when p_pool is subscription', async () => {
      // Set up initial balances
      const { error: setupError } = await supabase
        .from('profiles')
        .update({
          subscription_credits_balance: 100,
          purchased_credits_balance: 50,
        })
        .eq('id', testUserId);

      expect(setupError).toBeNull();

      // Clawback from subscription pool
      const clawbackAmount = 30;
      const { data: result, error } = await supabase.rpc('clawback_credits_v2', {
        p_target_user_id: testUserId,
        p_amount: clawbackAmount,
        p_reason: 'Test refund',
        p_ref_id: 'test_refund_123',
        p_pool: 'subscription',
      });

      expect(error).toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].success).toBe(true);
      expect(result![0].subscription_clawed).toBe(30);
      expect(result![0].purchased_clawed).toBe(0);
      expect(result![0].new_subscription_balance).toBe(70);
      expect(result![0].new_purchased_balance).toBe(50);

      // Verify balances updated
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_credits_balance, purchased_credits_balance')
        .eq('id', testUserId)
        .single();

      expect(profile?.subscription_credits_balance).toBe(70);
      expect(profile?.purchased_credits_balance).toBe(50);

      // Verify transaction logged with correct pool
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUserId)
        .eq('reference_id', 'test_refund_123')
        .eq('transaction_type', 'clawback');

      expect(transactions).toHaveLength(1);
      expect(transactions![0].amount).toBe(-30);
      expect(transactions![0].credit_pool).toBe('subscription');
    });

    test('should clawback from purchased pool when p_pool is purchased', async () => {
      // Set up initial balances
      await supabase
        .from('profiles')
        .update({
          subscription_credits_balance: 100,
          purchased_credits_balance: 50,
        })
        .eq('id', testUserId);

      // Clawback from purchased pool
      const clawbackAmount = 20;
      const { data: result, error } = await supabase.rpc('clawback_credits_v2', {
        p_target_user_id: testUserId,
        p_amount: clawbackAmount,
        p_pool: 'purchased',
      });

      expect(error).toBeNull();
      expect(result![0].success).toBe(true);
      expect(result![0].subscription_clawed).toBe(0);
      expect(result![0].purchased_clawed).toBe(20);
      expect(result![0].new_subscription_balance).toBe(100);
      expect(result![0].new_purchased_balance).toBe(30);
    });

    test('should clawback from subscription first when p_pool is auto (FIFO)', async () => {
      // Set up initial balances
      await supabase
        .from('profiles')
        .update({
          subscription_credits_balance: 30,
          purchased_credits_balance: 50,
        })
        .eq('id', testUserId);

      // Clawback more than subscription balance - should use subscription first, then purchased
      const clawbackAmount = 50;
      const { data: result, error } = await supabase.rpc('clawback_credits_v2', {
        p_target_user_id: testUserId,
        p_amount: clawbackAmount,
        p_pool: 'auto',
      });

      expect(error).toBeNull();
      expect(result![0].success).toBe(true);
      expect(result![0].subscription_clawed).toBe(30); // All from subscription first
      expect(result![0].purchased_clawed).toBe(20); // Remainder from purchased
      expect(result![0].new_subscription_balance).toBe(0);
      expect(result![0].new_purchased_balance).toBe(30);
    });

    test('should clawback only available amount when insufficient credits', async () => {
      // Set up low balance
      await supabase
        .from('profiles')
        .update({
          subscription_credits_balance: 10,
          purchased_credits_balance: 5,
        })
        .eq('id', testUserId);

      // Try to clawback more than available
      const clawbackAmount = 50;
      const { data: result, error } = await supabase.rpc('clawback_credits_v2', {
        p_target_user_id: testUserId,
        p_amount: clawbackAmount,
        p_pool: 'auto',
      });

      expect(error).toBeNull();
      expect(result![0].success).toBe(true);
      expect(result![0].subscription_clawed).toBe(10);
      expect(result![0].purchased_clawed).toBe(5);
      expect(result![0].new_subscription_balance).toBe(0);
      expect(result![0].new_purchased_balance).toBe(0);

      // Verify balances never go negative
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_credits_balance, purchased_credits_balance')
        .eq('id', testUserId)
        .single();

      expect(profile?.subscription_credits_balance).toBeGreaterThanOrEqual(0);
      expect(profile?.purchased_credits_balance).toBeGreaterThanOrEqual(0);
    });

    test('should handle non-existent user gracefully', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000';

      const { data } = await supabase.rpc('clawback_credits_v2', {
        p_target_user_id: nonExistentUserId,
        p_amount: 10,
      });

      expect(data).toHaveLength(1);
      expect(data![0].success).toBe(false);
      expect(data![0].error_message).toBe('User not found');
    });

    test('should set credit_pool to mixed when clawing from both pools', async () => {
      // Set up initial balances
      await supabase
        .from('profiles')
        .update({
          subscription_credits_balance: 20,
          purchased_credits_balance: 20,
        })
        .eq('id', testUserId);

      // Clawback from both pools
      const { data: result } = await supabase.rpc('clawback_credits_v2', {
        p_target_user_id: testUserId,
        p_amount: 30,
        p_pool: 'auto',
        p_ref_id: 'mixed_clawback_test',
      });

      expect(result![0].success).toBe(true);

      // Verify transaction has mixed pool designation
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('credit_pool')
        .eq('user_id', testUserId)
        .eq('reference_id', 'mixed_clawback_test')
        .eq('transaction_type', 'clawback')
        .single();

      expect(transactions?.credit_pool).toBe('mixed');
    });
  });

  describe('clawback_from_transaction_v2', () => {
    beforeEach(async () => {
      // Set up initial credit transaction for testing
      await supabase.rpc('add_subscription_credits', {
        target_user_id: testUserId,
        amount: 100,
        ref_id: 'invoice_test_original',
        description: 'Original subscription credits',
      });
    });

    test('should find original transaction and clawback from correct pool', async () => {
      // Verify initial transaction was created with subscription pool
      const { data: originalTx } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('reference_id', 'invoice_test_original')
        .eq('transaction_type', 'subscription')
        .single();

      expect(originalTx?.credit_pool).toBe('subscription');

      // Clawback using transaction reference
      const { data: result, error } = await supabase.rpc('clawback_from_transaction_v2', {
        p_target_user_id: testUserId,
        p_original_ref_id: 'invoice_test_original',
        p_reason: 'Full refund',
      });

      expect(error).toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].success).toBe(true);
      expect(result![0].credits_clawed_back).toBe(100);
      expect(result![0].subscription_clawed).toBe(100);
      expect(result![0].purchased_clawed).toBe(0);
    });

    test('should return error when original transaction not found', async () => {
      const { data: result, error } = await supabase.rpc('clawback_from_transaction_v2', {
        p_target_user_id: testUserId,
        p_original_ref_id: 'invoice_nonexistent',
        p_reason: 'Test refund',
      });

      expect(error).toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].success).toBe(false);
      expect(result![0].error_message).toContain('No credits found to clawback');
    });

    test('should handle purchased credit transaction clawback', async () => {
      // Create a purchased credit transaction
      await supabase.rpc('add_purchased_credits', {
        target_user_id: testUserId,
        amount: 50,
        ref_id: 'pi_test_purchase',
        description: 'Credit pack purchase',
      });

      // Verify it was logged with purchased pool
      const { data: purchaseTx } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('reference_id', 'pi_test_purchase')
        .single();

      expect(purchaseTx?.credit_pool).toBe('purchased');

      // Clawback using transaction reference
      const { data: result } = await supabase.rpc('clawback_from_transaction_v2', {
        p_target_user_id: testUserId,
        p_original_ref_id: 'pi_test_purchase',
        p_reason: 'Credit pack refund',
      });

      expect(result![0].success).toBe(true);
      expect(result![0].credits_clawed_back).toBe(50);
      expect(result![0].subscription_clawed).toBe(0);
      expect(result![0].purchased_clawed).toBe(50);
    });
  });

  describe('clawback_purchased_credits', () => {
    test('should clawback purchased credits using payment intent reference', async () => {
      // Add purchased credits
      const paymentIntentId = 'pi_test_12345';
      await supabase.rpc('add_purchased_credits', {
        target_user_id: testUserId,
        amount: 100,
        ref_id: paymentIntentId,
        description: 'Credit pack',
      });

      // Verify balance
      const { data: beforeProfile } = await supabase
        .from('profiles')
        .select('purchased_credits_balance')
        .eq('id', testUserId)
        .single();

      const beforeBalance = beforeProfile?.purchased_credits_balance || 0;

      // Clawback purchased credits
      const { data: result, error } = await supabase.rpc('clawback_purchased_credits', {
        p_target_user_id: testUserId,
        p_payment_intent_id: paymentIntentId,
        p_reason: 'Credit pack refund',
      });

      expect(error).toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].success).toBe(true);
      expect(result![0].credits_clawed_back).toBe(100);

      // Verify purchased balance decreased
      const { data: afterProfile } = await supabase
        .from('profiles')
        .select('purchased_credits_balance')
        .eq('id', testUserId)
        .single();

      expect(afterProfile?.purchased_credits_balance).toBe(beforeBalance - 100);
    });

    test('should return error when payment intent transaction not found', async () => {
      const { data: result, error } = await supabase.rpc('clawback_purchased_credits', {
        p_target_user_id: testUserId,
        p_payment_intent_id: 'pi_nonexistent',
        p_reason: 'Test refund',
      });

      expect(error).toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].success).toBe(false);
      expect(result![0].error_message).toContain('No purchased credits found');
    });
  });

  describe('refund_credits_to_pool', () => {
    test('should refund credits to subscription pool', async () => {
      // Set up initial balance
      await supabase
        .from('profiles')
        .update({ subscription_credits_balance: 50 })
        .eq('id', testUserId);

      const { data: beforeProfile } = await supabase
        .from('profiles')
        .select('subscription_credits_balance')
        .eq('id', testUserId)
        .single();

      const beforeBalance = beforeProfile?.subscription_credits_balance || 0;

      // Refund to subscription pool
      const { data: newBalance, error } = await supabase.rpc('refund_credits_to_pool', {
        p_target_user_id: testUserId,
        p_amount: 10,
        p_reason: 'Job failed refund',
        p_ref_id: 'job_failed_123',
        p_pool: 'subscription',
      });

      expect(error).toBeNull();
      expect(newBalance).toBe(beforeBalance + 10);

      // Verify transaction logged with subscription pool
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUserId)
        .eq('reference_id', 'job_failed_123')
        .eq('transaction_type', 'refund')
        .single();

      expect(transactions?.amount).toBe(10);
      expect(transactions?.credit_pool).toBe('subscription');
    });

    test('should refund credits to purchased pool', async () => {
      // Set up initial balance
      await supabase
        .from('profiles')
        .update({ purchased_credits_balance: 50 })
        .eq('id', testUserId);

      const { data: beforeProfile } = await supabase
        .from('profiles')
        .select('purchased_credits_balance')
        .eq('id', testUserId)
        .single();

      const beforeBalance = beforeProfile?.purchased_credits_balance || 0;

      // Refund to purchased pool
      const { data: newBalance, error } = await supabase.rpc('refund_credits_to_pool', {
        p_target_user_id: testUserId,
        p_amount: 15,
        p_pool: 'purchased',
      });

      expect(error).toBeNull();
      expect(newBalance).toBe(beforeBalance + 15);

      // Verify transaction logged with purchased pool
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('credit_pool')
        .eq('user_id', testUserId)
        .eq('transaction_type', 'refund')
        .eq('amount', 15)
        .single();

      expect(transactions?.credit_pool).toBe('purchased');
    });
  });

  describe('dispute_events table and dispute_status', () => {
    test('should create dispute event record', async () => {
      const disputeData = {
        dispute_id: 'dp_test_123',
        user_id: testUserId,
        charge_id: 'ch_test_456',
        amount_cents: 1000,
        credits_held: 100,
        status: 'created',
        reason: 'product_not_received',
      };

      const { error } = await supabase.from('dispute_events').insert(disputeData);

      expect(error).toBeNull();

      // Verify dispute event was created
      const { data: events } = await supabase
        .from('dispute_events')
        .select('*')
        .eq('dispute_id', 'dp_test_123')
        .single();

      expect(events).toBeTruthy();
      expect(events?.dispute_id).toBe('dp_test_123');
      expect(events?.user_id).toBe(testUserId);
      expect(events?.amount_cents).toBe(1000);
      expect(events?.credits_held).toBe(100);
      expect(events?.status).toBe('created');
      expect(events?.reason).toBe('product_not_received');
    });

    test('should update dispute status on profile', async () => {
      // Set dispute status to pending
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ dispute_status: 'pending' })
        .eq('id', testUserId);

      expect(updateError).toBeNull();

      // Verify status updated
      const { data: profile } = await supabase
        .from('profiles')
        .select('dispute_status')
        .eq('id', testUserId)
        .single();

      expect(profile?.dispute_status).toBe('pending');

      // Resolve dispute
      await supabase.from('profiles').update({ dispute_status: 'resolved' }).eq('id', testUserId);

      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('dispute_status')
        .eq('id', testUserId)
        .single();

      expect(updatedProfile?.dispute_status).toBe('resolved');
    });

    test('should enforce valid dispute_status values', async () => {
      // Try invalid status
      const { error } = await supabase
        .from('profiles')
        .update({ dispute_status: 'invalid_status' })
        .eq('id', testUserId);

      expect(error).toBeTruthy();
      expect(error?.message).toContain('dispute_status');
    });
  });

  describe('transaction audit trail with credit_pool', () => {
    test('should maintain credit_pool in all transaction types', async () => {
      // Create subscription transaction
      await supabase.rpc('add_subscription_credits', {
        target_user_id: testUserId,
        amount: 100,
        ref_id: 'sub_tx_1',
        description: 'Subscription credits',
      });

      // Create purchased transaction
      await supabase.rpc('add_purchased_credits', {
        target_user_id: testUserId,
        amount: 50,
        ref_id: 'pur_tx_1',
        description: 'Purchased credits',
      });

      // Create usage transaction
      await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUserId,
        amount: 10,
        transaction_type: 'usage',
        ref_id: 'usage_1',
        description: 'Image processing',
      });

      // Verify all transactions have credit_pool set
      const { data: transactions, error } = await supabase
        .from('credit_transactions')
        .select('transaction_type, credit_pool')
        .eq('user_id', testUserId)
        .order('created_at', { ascending: true });

      expect(error).toBeNull();
      expect(transactions).toBeDefined();
      expect(transactions?.length).toBeGreaterThan(0);

      // Check each transaction has a credit_pool
      for (const tx of transactions || []) {
        expect(tx.credit_pool).toBeTruthy();
        expect(['subscription', 'purchased', 'mixed']).toContain(tx.credit_pool);
      }

      // Verify subscription transaction has subscription pool
      const subTx = transactions?.find(t => t.reference_id === 'sub_tx_1');
      expect(subTx?.credit_pool).toBe('subscription');

      // Verify purchased transaction has purchased pool
      const purTx = transactions?.find(t => t.reference_id === 'pur_tx_1');
      expect(purTx?.credit_pool).toBe('purchased');
    });
  });

  describe('end-to-end refund flow simulation', () => {
    test('should simulate complete subscription refund flow', async () => {
      // 1. User subscribes and gets credits
      const invoiceId = 'in_test_subscription_123';
      await supabase.rpc('add_subscription_credits', {
        target_user_id: testUserId,
        amount: 200,
        ref_id: `invoice_${invoiceId}`,
        description: 'Monthly subscription - Pro plan',
      });

      // Verify initial balance
      const { data: initialProfile } = await supabase
        .from('profiles')
        .select('subscription_credits_balance, purchased_credits_balance')
        .eq('id', testUserId)
        .single();

      expect(initialProfile?.subscription_credits_balance).toBe(200);

      // 2. User uses some credits
      await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUserId,
        amount: 50,
        transaction_type: 'usage',
        ref_id: 'job_001',
        description: 'Image processing',
      });

      // 3. User requests refund
      const { data: clawbackResult } = await supabase.rpc('clawback_from_transaction_v2', {
        p_target_user_id: testUserId,
        p_original_ref_id: `invoice_${invoiceId}`,
        p_reason: 'Subscription refund',
      });

      expect(clawbackResult![0].success).toBe(true);
      expect(clawbackResult![0].credits_clawed_back).toBe(200); // Clawback original amount

      // 4. Verify final state
      const { data: finalProfile } = await supabase
        .from('profiles')
        .select('subscription_credits_balance, purchased_credits_balance')
        .eq('id', testUserId)
        .single();

      // Balance should be: 200 - 50 (usage) - 200 (clawback) + 200 (original) = 150
      // Actually, clawback removes credits, so: 200 - 50 - 150 (clawed back) = 0
      // The clawback removes from current balance, not from original
      expect(finalProfile?.subscription_credits_balance).toBe(0); // All remaining credits clawed back

      // 5. Verify audit trail
      const { data: allTransactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUserId)
        .order('created_at', { ascending: true });

      expect(allTransactions).toHaveLength(3); // Addition, usage, clawback
    });

    test('should simulate credit pack refund flow', async () => {
      // 1. User buys credit pack
      const paymentIntentId = 'pi_credit_pack_123';
      const packAmount = 500;

      await supabase.rpc('add_purchased_credits', {
        target_user_id: testUserId,
        amount: packAmount,
        ref_id: paymentIntentId,
        description: 'Credit pack - 500 credits',
      });

      // Verify purchased balance
      const { data: initialProfile } = await supabase
        .from('profiles')
        .select('purchased_credits_balance')
        .eq('id', testUserId)
        .single();

      expect(initialProfile?.purchased_credits_balance).toBe(packAmount);

      // 2. User uses some credits
      await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUserId,
        amount: 100,
        transaction_type: 'usage',
        ref_id: 'job_002',
        description: 'Batch processing',
      });

      // 3. Refund credit pack
      const { data: clawbackResult } = await supabase.rpc('clawback_purchased_credits', {
        p_target_user_id: testUserId,
        p_payment_intent_id: paymentIntentId,
        p_reason: 'Credit pack refund',
      });

      expect(clawbackResult![0].success).toBe(true);
      expect(clawbackResult![0].credits_clawed_back).toBe(packAmount);

      // 4. Verify purchased credits clawed back (remaining balance)
      const { data: finalProfile } = await supabase
        .from('profiles')
        .select('purchased_credits_balance')
        .eq('id', testUserId)
        .single();

      expect(finalProfile?.purchased_credits_balance).toBe(0); // All clawed back
    });
  });

  describe('dispute flow simulation', () => {
    test('should simulate complete dispute workflow', async () => {
      // 1. User has credits
      await supabase
        .from('profiles')
        .update({
          subscription_credits_balance: 150,
          purchased_credits_balance: 100,
        })
        .eq('id', testUserId);

      // 2. Dispute is created
      const disputeId = 'dp_dispute_001';
      const chargeId = 'ch_disputed_001';
      const disputeAmountCents = 2000; // $20.00
      const creditsToHold = Math.ceil(disputeAmountCents / 10); // 200 credits

      // Flag account as disputed
      await supabase.from('profiles').update({ dispute_status: 'pending' }).eq('id', testUserId);

      // Create dispute event record
      await supabase.from('dispute_events').insert({
        dispute_id: disputeId,
        user_id: testUserId,
        charge_id: chargeId,
        amount_cents: disputeAmountCents,
        credits_held: creditsToHold,
        status: 'created',
        reason: 'credit_card_not_working',
      });

      // 3. Clawback credits as hold
      const { data: clawbackResult } = await supabase.rpc('clawback_credits_v2', {
        p_target_user_id: testUserId,
        p_amount: creditsToHold,
        p_reason: `Dispute hold: ${disputeId}`,
        p_ref_id: `dispute_${disputeId}`,
        p_pool: 'auto', // Subscription first (FIFO)
      });

      expect(clawbackResult![0].success).toBe(true);

      // Verify account is flagged
      const { data: disputedProfile } = await supabase
        .from('profiles')
        .select('dispute_status, subscription_credits_balance, purchased_credits_balance')
        .eq('id', testUserId)
        .single();

      expect(disputedProfile?.dispute_status).toBe('pending');
      expect(disputedProfile?.subscription_credits_balance).toBe(0); // All clawed
      expect(disputedProfile?.purchased_credits_balance).toBe(50); // 50 remaining (150+100-200=50)

      // 4. Dispute is won in our favor - restore account
      await supabase.from('profiles').update({ dispute_status: 'resolved' }).eq('id', testUserId);

      await supabase.from('dispute_events').update({ status: 'won' }).eq('dispute_id', disputeId);

      // Verify account restored
      const { data: resolvedProfile } = await supabase
        .from('profiles')
        .select('dispute_status')
        .eq('id', testUserId)
        .single();

      expect(resolvedProfile?.dispute_status).toBe('resolved');

      // Verify dispute event updated
      const { data: resolvedEvent } = await supabase
        .from('dispute_events')
        .select('status')
        .eq('dispute_id', disputeId)
        .single();

      expect(resolvedEvent?.status).toBe('won');
    });
  });
});
