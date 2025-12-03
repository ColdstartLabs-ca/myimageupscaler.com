import { test, expect } from '@playwright/test';
import { TestContext } from '../helpers';

/**
 * Integration Tests for Credit Management System
 *
 * These tests verify the critical credit management RPC functions and database operations.
 * They test the complete credit lifecycle including atomic operations, transaction logging,
 * and security constraints.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe('Credit Management Integration Tests', () => {
  let ctx: TestContext;

  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test.describe('increment_credits_with_log', () => {
    test('should increment credits and log transaction', async () => {
      const testUser = await ctx.data.createTestUser();
      const initialProfile = await ctx.data.getUserProfile(testUser.id);
      const initialBalance = initialProfile.credits_balance as number;

      // Call increment_credits_with_log directly via service role
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      const { data: newBalance, error } = await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUser.id,
        amount: 25,
        transaction_type: 'purchase',
        ref_id: 'test_purchase_123',
        description: 'Test credit purchase'
      });

      expect(error).toBeNull();
      expect(newBalance).toBe(initialBalance + 25);

      // Verify the transaction was logged
      const { data: transactions, error: transError } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUser.id)
        .eq('reference_id', 'test_purchase_123')
        .single();

      expect(transError).toBeNull();
      expect(transactions).toMatchObject({
        user_id: testUser.id,
        amount: 25,
        type: 'purchase',
        reference_id: 'test_purchase_123',
        description: 'Test credit purchase'
      });

      await ctx.data.cleanupUser(testUser.id);
    });

    test('should handle multiple increments correctly', async () => {
      const testUser = await ctx.data.createTestUser();
      const initialProfile = await ctx.data.getUserProfile(testUser.id);
      const initialBalance = initialProfile.credits_balance as number;

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      // First increment
      const { data: balance1 } = await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUser.id,
        amount: 10,
        transaction_type: 'bonus',
        description: 'First bonus'
      });

      // Second increment
      const { data: balance2 } = await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUser.id,
        amount: 15,
        transaction_type: 'bonus',
        description: 'Second bonus'
      });

      expect(balance1).toBe(initialBalance + 10);
      expect(balance2).toBe(initialBalance + 25);

      await ctx.data.cleanupUser(testUser.id);
    });

    test('should throw error for non-existent user', async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      const { data, error } = await supabase.rpc('increment_credits_with_log', {
        target_user_id: '00000000-0000-0000-0000-000000000000',
        amount: 10,
        transaction_type: 'purchase'
      });

      expect(data).toBeNull();
      expect(error?.message).toContain('User not found');
    });
  });

  test.describe('decrement_credits_with_log', () => {
    test('should decrement credits and log transaction', async () => {
      const testUser = await ctx.data.createTestUser();

      // Add credits first
      await ctx.data.addCredits(testUser.id, 50);
      const profile = await ctx.data.getUserProfile(testUser.id);
      const initialBalance = profile.credits_balance as number;

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      const { data: newBalance, error } = await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUser.id,
        amount: 5,
        transaction_type: 'usage',
        ref_id: 'job_123',
        description: 'Image processing'
      });

      expect(error).toBeNull();
      expect(newBalance).toBe(initialBalance - 5);

      // Verify the transaction was logged (negative amount for deduction)
      const { data: transactions, error: transError } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUser.id)
        .eq('reference_id', 'job_123')
        .single();

      expect(transError).toBeNull();
      expect(transactions).toMatchObject({
        user_id: testUser.id,
        amount: -5, // Negative for deduction
        type: 'usage',
        reference_id: 'job_123',
        description: 'Image processing'
      });

      await ctx.data.cleanupUser(testUser.id);
    });

    test('should throw error for insufficient credits', async () => {
      const testUser = await ctx.data.createTestUser();

      // Don't add credits, user should only have initial 10
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      const { data, error } = await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUser.id,
        amount: 20, // More than initial balance
        transaction_type: 'usage'
      });

      expect(data).toBeNull();
      expect(error?.message).toContain('Insufficient credits');
      expect(error?.message).toContain('Required: 20');

      await ctx.data.cleanupUser(testUser.id);
    });

    test('should handle edge case of exact balance', async () => {
      const testUser = await ctx.data.createTestUser();

      // Add exact amount for testing
      await ctx.data.addCredits(testUser.id, 5); // User now has 15 total

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      const { data: newBalance, error } = await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUser.id,
        amount: 15, // Exact balance
        transaction_type: 'usage'
      });

      expect(error).toBeNull();
      expect(newBalance).toBe(0);

      await ctx.data.cleanupUser(testUser.id);
    });

    test('should be atomic and prevent race conditions', async () => {
      const testUser = await ctx.data.createTestUser();
      await ctx.data.addCredits(testUser.id, 10); // User has 20 total

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      // Attempt multiple concurrent decrements that would exceed balance
      const promises = Array(5).fill(null).map((_, i) =>
        supabase.rpc('decrement_credits_with_log', {
          target_user_id: testUser.id,
          amount: 10,
          transaction_type: 'usage',
          ref_id: `job_${i}`
        })
      );

      const results = await Promise.all(promises);

      // Only first two should succeed (20 credits available)
      const successful = results.filter(r => r.data !== null);
      const failed = results.filter(r => r.error !== null);

      expect(successful).toHaveLength(2);
      expect(failed).toHaveLength(3);

      // Verify final balance is 0
      const finalProfile = await ctx.data.getUserProfile(testUser.id);
      expect(finalProfile.credits_balance).toBe(0);

      await ctx.data.cleanupUser(testUser.id);
    });
  });

  test.describe('refund_credits', () => {
    test('should refund credits via increment with refund type', async () => {
      const testUser = await ctx.data.createTestUser();
      await ctx.data.addCredits(testUser.id, 20);

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      // First, consume credits
      await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUser.id,
        amount: 5,
        transaction_type: 'usage',
        ref_id: 'job_refund_test',
        description: 'Original processing'
      });

      const profileAfterDeduction = await ctx.data.getUserProfile(testUser.id);
      const balanceAfterDeduction = profileAfterDeduction.credits_balance as number;

      // Now refund
      const { data: refundBalance, error: refundError } = await supabase.rpc('refund_credits', {
        target_user_id: testUser.id,
        amount: 5,
        job_id: 'job_refund_test'
      });

      expect(refundError).toBeNull();
      expect(refundBalance).toBe(balanceAfterDeduction + 5);

      // Verify refund transaction was logged
      const { data: refundTransactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUser.id)
        .eq('reference_id', 'job_refund_test')
        .eq('type', 'refund');

      expect(refundTransactions).toHaveLength(1);
      expect(refundTransactions![0]).toMatchObject({
        user_id: testUser.id,
        amount: 5,
        type: 'refund',
        reference_id: 'job_refund_test',
        description: 'Processing refund'
      });

      await ctx.data.cleanupUser(testUser.id);
    });

    test('should work without job_id', async () => {
      const testUser = await ctx.data.createTestUser();

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      const { data: refundBalance, error } = await supabase.rpc('refund_credits', {
        target_user_id: testUser.id,
        amount: 10
        // No job_id provided
      });

      expect(error).toBeNull();
      expect(refundBalance).toBeGreaterThan(10); // Should be initial 10 + refund 10

      await ctx.data.cleanupUser(testUser.id);
    });
  });

  test.describe('Security and Constraints', () => {
    test('should prevent direct credits_balance updates via trigger', async () => {
      const testUser = await ctx.data.createTestUser();
      const initialProfile = await ctx.data.getUserProfile(testUser.id);

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      // Attempt direct update (should be blocked by trigger)
      const { error } = await supabase
        .from('profiles')
        .update({ credits_balance: 999 })
        .eq('id', testUser.id);

      expect(error?.message).toContain('Cannot update credits_balance directly');

      // Verify balance unchanged
      const unchangedProfile = await ctx.data.getUserProfile(testUser.id);
      expect(unchangedProfile.credits_balance).toBe(initialProfile.credits_balance);

      await ctx.data.cleanupUser(testUser.id);
    });

    test('should allow RPC functions to bypass trigger', async () => {
      const testUser = await ctx.data.createTestUser();
      const initialProfile = await ctx.data.getUserProfile(testUser.id);

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      // RPC function should work despite trigger
      const { data: newBalance, error } = await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUser.id,
        amount: 5,
        transaction_type: 'bonus'
      });

      expect(error).toBeNull();
      expect(newBalance).toBe((initialProfile.credits_balance as number) + 5);

      await ctx.data.cleanupUser(testUser.id);
    });

    test('should validate transaction_type constraints', async () => {
      const testUser = await ctx.data.createTestUser();

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      // Test valid transaction types
      const validTypes = ['purchase', 'subscription', 'usage', 'refund', 'bonus'];

      for (const type of validTypes) {
        const { error } = await supabase.rpc('increment_credits_with_log', {
          target_user_id: testUser.id,
          amount: 1,
          transaction_type: type
        });
        expect(error).toBeNull();
      }

      await ctx.data.cleanupUser(testUser.id);
    });
  });

  test.describe('Transaction Audit Trail', () => {
    test('should maintain complete audit trail', async () => {
      const testUser = await ctx.data.createTestUser();

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      // Perform multiple operations
      await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUser.id,
        amount: 20,
        transaction_type: 'purchase',
        ref_id: 'stripe_session_123',
        description: 'Credit pack purchase'
      });

      await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUser.id,
        amount: 1,
        transaction_type: 'usage',
        ref_id: 'job_001',
        description: 'Image upscale'
      });

      await supabase.rpc('decrement_credits_with_log', {
        target_user_id: testUser.id,
        amount: 1,
        transaction_type: 'usage',
        ref_id: 'job_002',
        description: 'Image enhance'
      });

      await supabase.rpc('refund_credits', {
        target_user_id: testUser.id,
        amount: 1,
        job_id: 'job_002'
      });

      // Verify complete transaction history
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUser.id)
        .order('created_at', { ascending: true });

      expect(transactions).toHaveLength(5); // Initial bonus + purchase + 2 usages + refund

      // Verify transaction details
      const purchaseTransaction = transactions!.find(t => t.reference_id === 'stripe_session_123');
      expect(purchaseTransaction).toMatchObject({
        amount: 20,
        type: 'purchase',
        description: 'Credit pack purchase'
      });

      const usageTransaction1 = transactions!.find(t => t.reference_id === 'job_001');
      expect(usageTransaction1).toMatchObject({
        amount: -1,
        type: 'usage',
        description: 'Image upscale'
      });

      const refundTransaction = transactions!.find(t => t.type === 'refund');
      expect(refundTransaction).toMatchObject({
        amount: 1,
        type: 'refund',
        reference_id: 'job_002',
        description: 'Processing refund'
      });

      await ctx.data.cleanupUser(testUser.id);
    });

    test('should handle null reference_id correctly', async () => {
      const testUser = await ctx.data.createTestUser();

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      // Perform operation without reference_id
      await supabase.rpc('increment_credits_with_log', {
        target_user_id: testUser.id,
        amount: 5,
        transaction_type: 'bonus'
        // No ref_id or description
      });

      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', testUser.id)
        .eq('type', 'bonus');

      expect(transactions).toHaveLength(1);
      expect(transactions![0].reference_id).toBeNull();
      expect(transactions![0].description).toBeNull();

      await ctx.data.cleanupUser(testUser.id);
    });
  });

  test.describe('Data Integrity', () => {
    test('should maintain balance consistency across operations', async () => {
      const testUser = await ctx.data.createTestUser();
      const initialProfile = await ctx.data.getUserProfile(testUser.id);

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

      // Calculate expected final balance
      let expectedBalance = initialProfile.credits_balance as number;
      const operations = [
        { type: 'increment', amount: 25, transaction_type: 'purchase' },
        { type: 'decrement', amount: 3, transaction_type: 'usage' },
        { type: 'decrement', amount: 2, transaction_type: 'usage' },
        { type: 'increment', amount: 10, transaction_type: 'bonus' },
        { type: 'decrement', amount: 5, transaction_type: 'usage' },
        { type: 'refund', amount: 2, transaction_type: 'refund' },
      ];

      // Execute operations
      for (const op of operations) {
        if (op.type === 'increment') {
          const { data } = await supabase.rpc('increment_credits_with_log', {
            target_user_id: testUser.id,
            amount: op.amount,
            transaction_type: op.transaction_type,
            ref_id: `test_${Math.random()}`
          });
          expectedBalance = data!;
        } else if (op.type === 'decrement') {
          const { data } = await supabase.rpc('decrement_credits_with_log', {
            target_user_id: testUser.id,
            amount: op.amount,
            transaction_type: op.transaction_type,
            ref_id: `job_${Math.random()}`
          });
          expectedBalance = data!;
        } else if (op.type === 'refund') {
          const { data } = await supabase.rpc('refund_credits', {
            target_user_id: testUser.id,
            amount: op.amount,
            job_id: `refund_${Math.random()}`
          });
          expectedBalance = data!;
        }
      }

      // Verify final balance matches calculations
      const finalProfile = await ctx.data.getUserProfile(testUser.id);
      expect(finalProfile.credits_balance).toBe(expectedBalance);

      // Verify transaction sum matches balance change
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('amount')
        .eq('user_id', testUser.id);

      const transactionSum = transactions!.reduce((sum, t) => sum + t.amount, 0);
      const expectedChange = expectedBalance - (initialProfile.credits_balance as number);
      expect(transactionSum).toBe(expectedChange);

      await ctx.data.cleanupUser(testUser.id);
    });
  });
});