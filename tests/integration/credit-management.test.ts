import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { resetTestUser } from '../helpers/test-user-reset';

describe('Credit Management System Integration Tests', () => {
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

  describe('increment_credits_with_log', () => {
    test('should increment credits and log transaction', async () => {
      // Get initial balance
      const { data: initialProfile } = await supabase
        .from('profiles')
        .select('credits_balance')
        .eq('id', testUserId)
        .single();

      const initialBalance = initialProfile?.credits_balance || 0;
      const incrementAmount = 50;
      const refId = 'test_purchase_123';
      const description = 'Test credit purchase';

      // Call the RPC function
      const { data: newBalance, error } = await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUserId,
        amount: incrementAmount,
        transaction_type: 'purchase',
        ref_id: refId,
        description: description,
      });

      expect(error).toBeNull();
      expect(newBalance).toBe(initialBalance + incrementAmount);

      // Verify the balance was updated
      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('credits_balance')
        .eq('id', testUserId)
        .single();

      expect(updatedProfile?.credits_balance).toBe(initialBalance + incrementAmount);

      // Verify the transaction was logged
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUserId)
        .eq('amount', incrementAmount)
        .eq('type', 'purchase')
        .eq('reference_id', refId)
        .eq('description', description);

      expect(transactions).toHaveLength(1);
      expect(transactions![0].amount).toBe(incrementAmount);
      expect(transactions![0].type).toBe('purchase');
      expect(transactions![0].reference_id).toBe(refId);
      expect(transactions![0].description).toBe(description);
    });

    test('should handle negative amounts as valid deductions', async () => {
      const initialBalance = 10;

      // Set up initial balance
      await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUserId,
        amount: initialBalance,
        transaction_type: 'bonus',
        description: 'Initial balance setup',
      });

      // Deduct credits using negative amount
      const deductionAmount = -3;
      const { data: newBalance, error } = await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUserId,
        amount: deductionAmount,
        transaction_type: 'usage',
        ref_id: 'test_usage_123',
        description: 'Test usage deduction',
      });

      expect(error).toBeNull();
      expect(newBalance).toBe(initialBalance + deductionAmount); // 10 + (-3) = 7

      // Verify transaction was logged with negative amount
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUserId)
        .eq('amount', deductionAmount)
        .eq('type', 'usage');

      expect(transactions).toHaveLength(1);
      expect(transactions![0].amount).toBe(deductionAmount);
    });

    test('should throw error for non-existent user', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000';

      const { data, error } = await supabase.rpc('increment_credits_with_log', {
        target_user_id: nonExistentUserId,
        amount: 10,
        transaction_type: 'purchase',
      });

      expect(data).toBeNull();
      expect(error).toBeTruthy();
      expect(error?.message).toContain('User not found');
    });
  });

  describe('decrement_credits_with_log', () => {
    test('should decrement credits atomically and log transaction', async () => {
      // Set up initial balance
      const initialBalance = 20;
      await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUserId,
        amount: initialBalance,
        transaction_type: 'bonus',
        description: 'Initial balance setup',
      });

      // Decrement credits
      const decrementAmount = 5;
      const { data: newBalance, error } = await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUserId,
        amount: decrementAmount,
        transaction_type: 'usage',
        ref_id: 'test_job_123',
        description: 'Image processing job',
      });

      expect(error).toBeNull();
      expect(newBalance).toBe(initialBalance - decrementAmount); // 20 - 5 = 15

      // Verify the balance was updated
      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('credits_balance')
        .eq('id', testUserId)
        .single();

      expect(updatedProfile?.credits_balance).toBe(initialBalance - decrementAmount);

      // Verify the transaction was logged with negative amount
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUserId)
        .eq('amount', -decrementAmount)
        .eq('type', 'usage')
        .eq('reference_id', 'test_job_123');

      expect(transactions).toHaveLength(1);
      expect(transactions![0].amount).toBe(-decrementAmount);
      expect(transactions![0].type).toBe('usage');
      expect(transactions![0].description).toBe('Image processing job');
    });

    test('should throw error when insufficient credits', async () => {
      // Set up low initial balance
      await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUserId,
        amount: 3,
        transaction_type: 'bonus',
        description: 'Low initial balance',
      });

      // Try to decrement more than available
      const { data, error } = await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUserId,
        amount: 5, // More than available
        transaction_type: 'usage',
      });

      expect(data).toBeNull();
      expect(error).toBeTruthy();
      expect(error?.message).toContain('Insufficient credits');
      expect(error?.message).toContain('Required: 5, Available: 3');

      // Verify no transaction was logged
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUserId)
        .eq('type', 'usage');

      expect(transactions).toHaveLength(0);
    });

    test('should handle zero amount gracefully', async () => {
      const initialBalance = 10;
      await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUserId,
        amount: initialBalance,
        transaction_type: 'bonus',
        description: 'Initial balance',
      });

      // Try to decrement zero
      const { data: newBalance, error } = await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUserId,
        amount: 0,
        transaction_type: 'usage',
      });

      expect(error).toBeNull();
      expect(newBalance).toBe(initialBalance);

      // Verify no usage transaction was logged (should not log zero amount operations)
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUserId)
        .eq('type', 'usage')
        .eq('amount', 0);

      expect(transactions).toHaveLength(0);
    });

    test('should throw error for non-existent user', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000';

      const { data, error } = await supabase.rpc('decrement_credits_with_log', {
        target_user_id: nonExistentUserId,
        amount: 1,
        transaction_type: 'usage',
      });

      expect(data).toBeNull();
      expect(error).toBeTruthy();
      expect(error?.message).toContain('User not found');
    });
  });

  describe('refund_credits', () => {
    test('should refund credits and log transaction', async () => {
      // First, set up initial balance and deduct some credits
      await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUserId,
        amount: 20,
        transaction_type: 'purchase',
        description: 'Initial purchase',
      });

      await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUserId,
        amount: 5,
        transaction_type: 'usage',
        ref_id: 'job_failed_123',
        description: 'Failed processing job',
      });

      const balanceBeforeRefund =
        (await supabase.from('profiles').select('credits_balance').eq('id', testUserId).single())
          .data?.credits_balance || 0;

      // Now refund the credits
      const refundAmount = 5;
      const { data: newBalance, error } = await supabase.rpc('refund_credits', {
        target_user_id: testUserId,
        amount: refundAmount,
        job_id: 'job_failed_123',
      });

      expect(error).toBeNull();
      expect(newBalance).toBe(balanceBeforeRefund + refundAmount);

      // Verify the refund transaction was logged
      const { data: refundTransactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUserId)
        .eq('amount', refundAmount)
        .eq('type', 'refund')
        .eq('reference_id', 'job_failed_123');

      expect(refundTransactions).toHaveLength(1);
      expect(refundTransactions![0].amount).toBe(refundAmount);
      expect(refundTransactions![0].type).toBe('refund');
      expect(refundTransactions![0].description).toBe('Processing refund');
    });

    test('should handle refund without job ID', async () => {
      await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUserId,
        amount: 10,
        transaction_type: 'purchase',
        description: 'Initial purchase',
      });

      const balanceBeforeRefund =
        (await supabase.from('profiles').select('credits_balance').eq('id', testUserId).single())
          .data?.credits_balance || 0;

      // Refund without job ID
      const { data: newBalance, error } = await supabase.rpc('refund_credits', {
        target_user_id: testUserId,
        amount: 3,
      });

      expect(error).toBeNull();
      expect(newBalance).toBe(balanceBeforeRefund + 3);

      // Verify the refund transaction was logged with null reference_id
      const { data: refundTransactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUserId)
        .eq('amount', 3)
        .eq('type', 'refund')
        .is('reference_id', null);

      expect(refundTransactions).toHaveLength(1);
    });
  });

  describe('has_sufficient_credits', () => {
    test('should return true when user has sufficient credits', async () => {
      // Give user some credits
      await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUserId,
        amount: 10,
        transaction_type: 'bonus',
      });

      const { data: hasCredits, error } = await supabase.rpc('has_sufficient_credits', {
        target_user_id: testUserId,
        required_amount: 5,
      });

      expect(error).toBeNull();
      expect(hasCredits).toBe(true);
    });

    test('should return false when user has insufficient credits', async () => {
      // Give user some credits
      await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUserId,
        amount: 3,
        transaction_type: 'bonus',
      });

      const { data: hasCredits, error } = await supabase.rpc('has_sufficient_credits', {
        target_user_id: testUserId,
        required_amount: 5,
      });

      expect(error).toBeNull();
      expect(hasCredits).toBe(false);
    });

    test('should return true for zero requirement regardless of balance', async () => {
      const { data: hasCredits, error } = await supabase.rpc('has_sufficient_credits', {
        target_user_id: testUserId,
        required_amount: 0,
      });

      expect(error).toBeNull();
      expect(hasCredits).toBe(true);
    });

    test('should handle non-existent user', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000';

      const { data, error } = await supabase.rpc('has_sufficient_credits', {
        target_user_id: nonExistentUserId,
        required_amount: 1,
      });

      // This function should return null or false for non-existent users
      expect(data).toBe(null);
      expect(error).toBeTruthy();
    });
  });

  describe('transaction audit trail', () => {
    test('should maintain complete audit trail for all operations', async () => {
      // Perform a series of operations
      await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUserId,
        amount: 50,
        transaction_type: 'purchase',
        ref_id: 'stripe_session_123',
        description: 'Initial credit purchase',
      });

      await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUserId,
        amount: 1,
        transaction_type: 'usage',
        ref_id: 'job_001',
        description: 'Image processing job 1',
      });

      await supabase.rpc('refund_credits', {
        target_user_id: testUserId,
        amount: 1,
        job_id: 'job_001',
      });

      // Get all transactions for the user
      const { data: transactions, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUserId)
        .order('created_at', { ascending: true });

      expect(error).toBeNull();
      expect(transactions).toHaveLength(3);

      // Verify purchase transaction
      expect(transactions![0].amount).toBe(50);
      expect(transactions![0].type).toBe('purchase');
      expect(transactions![0].reference_id).toBe('stripe_session_123');
      expect(transactions![0].description).toBe('Initial credit purchase');

      // Verify usage transaction
      expect(transactions![1].amount).toBe(-1);
      expect(transactions![1].type).toBe('usage');
      expect(transactions![1].reference_id).toBe('job_001');
      expect(transactions![1].description).toBe('Image processing job 1');

      // Verify refund transaction
      expect(transactions![2].amount).toBe(1);
      expect(transactions![2].type).toBe('refund');
      expect(transactions![2].reference_id).toBe('job_001');
      expect(transactions![2].description).toBe('Processing refund');

      // Verify final balance matches transaction sum
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits_balance')
        .eq('id', testUserId)
        .single();

      const transactionSum = transactions!.reduce((sum, tx) => sum + tx.amount, 0);
      expect(profile?.credits_balance).toBe(transactionSum);
    });

    test('should prevent credit leaks with atomic operations', async () => {
      // Set up initial balance
      const initialBalance = 10;
      await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUserId,
        amount: initialBalance,
        transaction_type: 'bonus',
      });

      // Atomic operations are tested by the database function itself

      // Perform multiple operations that should preserve total credits
      // Simulate failed job with refund
      await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUserId,
        amount: 3,
        transaction_type: 'usage',
        ref_id: 'failed_job',
      });

      await supabase.rpc('refund_credits', {
        target_user_id: testUserId,
        amount: 3,
        job_id: 'failed_job',
      });

      // Add some successful usage
      await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUserId,
        amount: 2,
        transaction_type: 'usage',
        ref_id: 'successful_job',
      });

      const balanceAfter =
        (await supabase.from('profiles').select('credits_balance').eq('id', testUserId).single())
          .data?.credits_balance || 0;

      // Balance should be: initial - 3 (usage) + 3 (refund) - 2 (usage) = 8
      expect(balanceAfter).toBe(8);

      // Verify transaction sum matches balance change
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('amount')
        .eq('user_id', testUserId);

      const transactionSum = transactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0;
      expect(transactionSum).toBe(8); // Should equal final balance for new user
    });
  });

  describe('concurrent operations', () => {
    test('should handle concurrent credit operations safely', async () => {
      // Set up initial balance
      await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUserId,
        amount: 100,
        transaction_type: 'bonus',
      });

      // Simulate concurrent decrement operations
      const concurrentOperations = Array.from({ length: 5 }, (_, i) =>
        supabase.rpc('decrement_credits_with_log', {
          target_user_id: testUserId,
          amount: 10,
          transaction_type: 'usage',
          ref_id: `concurrent_job_${i}`,
        })
      );

      // Execute all operations concurrently
      const results = await Promise.allSettled(concurrentOperations);

      // All operations should succeed
      const successfulOperations = results.filter(
        result => result.status === 'fulfilled' && result.value.error === null
      );

      expect(successfulOperations).toHaveLength(5);

      // Final balance should be 100 - (5 * 10) = 50
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits_balance')
        .eq('id', testUserId)
        .single();

      expect(profile?.credits_balance).toBe(50);

      // All transactions should be logged
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUserId)
        .eq('type', 'usage')
        .ilike('reference_id', 'concurrent_job_%');

      expect(transactions).toHaveLength(5);
    });

    test('should prevent double-spending with proper locking', async () => {
      // Set up limited balance
      await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUserId,
        amount: 15,
        transaction_type: 'bonus',
      });

      // Try to perform operations that would exceed balance if not properly locked
      const concurrentOperations = Array.from({ length: 3 }, (_, i) =>
        supabase.rpc('decrement_credits_with_log', {
          target_user_id: testUserId,
          amount: 10, // Each tries to take 10, total 30 > 15 available
          transaction_type: 'usage',
          ref_id: `overspend_attempt_${i}`,
        })
      );

      const results = await Promise.allSettled(concurrentOperations);

      // Only one operation should succeed
      const successfulOperations = results.filter(
        result => result.status === 'fulfilled' && result.value.error === null
      );

      const failedOperations = results.filter(
        result => result.status === 'fulfilled' && result.value.error !== null
      );

      expect(successfulOperations).toHaveLength(1);
      expect(failedOperations).toHaveLength(2);

      // Balance should be 15 - 10 = 5 (only one successful operation)
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits_balance')
        .eq('id', testUserId)
        .single();

      expect(profile?.credits_balance).toBe(5);
    });
  });

  describe('Row Level Security (RLS)', () => {
    test('should enforce RLS policies for credit transactions', async () => {
      // Create a regular (non-service-role) client for testing RLS
      const regularClient = createClient(SUPABASE_URL, 'test-anon-key');

      // Try to access another user's transactions (should fail)
      const { data: otherUserTransactions, error: otherUserError } = await regularClient
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUserId);

      // Should be empty or error due to RLS
      expect(otherUserTransactions).toBe(null);
      expect(otherUserError).toBeTruthy();

      // Service role should be able to access all transactions
      const { data: serviceTransactions, error: serviceError } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUserId);

      expect(serviceError).toBeNull();
      expect(serviceTransactions).toBeDefined();
    });
  });
});
