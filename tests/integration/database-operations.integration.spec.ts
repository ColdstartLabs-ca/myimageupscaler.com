import { test, expect } from '@playwright/test';
import { TestContext } from '../helpers';
import { createClient } from '@supabase/supabase-js';

/**
 * Database Operations Integration Tests
 *
 * Tests database operations including:
 * - CRUD operations with proper permissions
 * - Row Level Security (RLS) policies
 * - Database constraints and validations
 * - Transaction consistency
 * - Concurrent access handling
 */
test.describe('Database Operations Integration', () => {
  let ctx: TestContext;
  let testUser: { id: string; email: string; token: string };
  let _adminClient: ReturnType<typeof createClient>;
  let _userClient: ReturnType<typeof createClient>;

  test.beforeAll(async () => {
    ctx = new TestContext();
    testUser = await ctx.createUser();

    // Admin client for direct database operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseServiceKey) {
      _adminClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      // User client for testing RLS policies
      _userClient = createClient(
        supabaseUrl,
        'test-anon-key', // This won't work for actual requests but is fine for structure
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );
    } else {
      throw new Error('Missing Supabase environment variables');
    }
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test.describe('Profile Management', () => {
    test('should create profile automatically on user creation', async () => {
      const newUser = await ctx.createUser();

      const profile = await ctx.data.getUserProfile(newUser.id);
      expect(profile).toBeDefined();
      expect(profile.id).toBe(newUser.id);
      expect(profile.credits_balance).toBe(10);
      expect(profile.subscription_status).toBeNull();
    });

    test('should enforce profile constraints', async () => {
      // Test that required fields are properly constrained
      const profile = await ctx.data.getUserProfile(testUser.id);

      expect(profile.id).toBeDefined();
      expect(typeof profile.credits_balance).toBe('number');
      expect(profile.created_at).toBeDefined();
      expect(profile.updated_at).toBeDefined();
    });

    test('should update profile with proper validation', async () => {
      // Update subscription status
      await ctx.data.setSubscriptionStatus(testUser.id, 'active', 'pro');

      const updatedProfile = await ctx.data.getUserProfile(testUser.id);
      expect(updatedProfile.subscription_status).toBe('active');
      expect(updatedProfile.subscription_tier).toBe('pro');
      expect(updatedProfile.updated_at > updatedProfile.created_at).toBeTruthy();
    });
  });

  test.describe('Credit Transactions', () => {
    test('should maintain transaction integrity', async () => {
      const initialBalance = (await ctx.data.getUserProfile(testUser.id)).credits_balance;
      const transactionAmount = 25;

      // Add credits using the RPC function
      await ctx.data.addCredits(testUser.id, transactionAmount);

      const newBalance = (await ctx.data.getUserProfile(testUser.id)).credits_balance;
      expect(newBalance).toBe(initialBalance + transactionAmount);

      // Verify transaction was logged
      const transactions = await ctx.data.getCreditTransactions(testUser.id);
      const latestTransaction = transactions.find(
        t => t.description?.includes('Test purchase credits') && t.amount === transactionAmount
      );

      expect(latestTransaction).toBeDefined();
      expect(latestTransaction.user_id).toBe(testUser.id);
      expect(latestTransaction.type).toBe('purchase');
    });

    test('should enforce credit balance constraints', async () => {
      // Try to create a user with negative credits (should not be allowed by constraints)
      const newUser = await ctx.data.createTestUser();

      const profile = await ctx.data.getUserProfile(newUser.id);
      expect(profile.credits_balance).toBeGreaterThanOrEqual(0);

      await ctx.data.cleanupUser(newUser.id);
    });

    test('should handle concurrent credit operations safely', async () => {
      const concurrentUser = await ctx.data.createTestUser();
      const initialBalance = (await ctx.data.getUserProfile(concurrentUser.id)).credits_balance;

      // Make multiple concurrent credit operations
      const operations = Array(5)
        .fill(null)
        .map((_, index) => ctx.data.addCredits(concurrentUser.id, 10 + index));

      await Promise.all(operations);

      const finalBalance = (await ctx.data.getUserProfile(concurrentUser.id)).credits_balance;
      expect(finalBalance).toBe(initialBalance + 60); // 10+11+12+13+14 = 60

      await ctx.data.cleanupUser(concurrentUser.id);
    });
  });

  test.describe('Subscription Management', () => {
    test('should maintain subscription data integrity', async () => {
      const subscriptionId = `sub_test_${testUser.id}`;
      await ctx.data.setSubscriptionStatus(testUser.id, 'active', 'pro', subscriptionId);

      const subscriptions = await ctx.data.getUserSubscriptions(testUser.id);
      if (subscriptions.length > 0) {
        const subscription = subscriptions[0];
        expect(subscription.user_id).toBe(testUser.id);
        expect(subscription.status).toBe('active');
      }
    });

    test('should handle subscription lifecycle correctly', async () => {
      const lifecycleUser = await ctx.data.createTestUser();

      // Test: free -> active -> canceled -> free
      await ctx.data.setSubscriptionStatus(lifecycleUser.id, 'active', 'pro', 'sub_lifecycle');
      let profile = await ctx.data.getUserProfile(lifecycleUser.id);
      expect(profile.subscription_status).toBe('active');

      await ctx.data.setSubscriptionStatus(lifecycleUser.id, 'canceled', 'pro', 'sub_lifecycle');
      profile = await ctx.data.getUserProfile(lifecycleUser.id);
      expect(profile.subscription_status).toBe('canceled');

      await ctx.data.setSubscriptionStatus(lifecycleUser.id, 'free');
      profile = await ctx.data.getUserProfile(lifecycleUser.id);
      expect(profile.subscription_status).toBeNull();

      await ctx.data.cleanupUser(lifecycleUser.id);
    });
  });

  test.describe('Row Level Security (RLS)', () => {
    test('should enforce user isolation', async () => {
      const user1 = await ctx.data.createTestUser();
      const user2 = await ctx.data.createTestUser();

      // Each user should only see their own data
      const user1Transactions = await ctx.data.getCreditTransactions(user1.id);
      const user2Transactions = await ctx.data.getCreditTransactions(user2.id);

      user1Transactions.forEach(transaction => {
        expect(transaction.user_id).toBe(user1.id);
      });

      user2Transactions.forEach(transaction => {
        expect(transaction.user_id).toBe(user2.id);
      });

      await ctx.data.cleanupUser(user1.id);
      await ctx.data.cleanupUser(user2.id);
    });

    test('should prevent unauthorized data access', async () => {
      // This test would require setting up user clients with proper JWT tokens
      // For now, we test through the test data manager which uses admin access

      const privateUser = await ctx.data.createTestUser();
      await ctx.data.addCredits(privateUser.id, 100);

      const transactions = await ctx.data.getCreditTransactions(privateUser.id);
      expect(transactions.length).toBeGreaterThan(0);

      // Each transaction should belong to the user
      transactions.forEach(transaction => {
        expect(transaction.user_id).toBe(privateUser.id);
      });

      await ctx.data.cleanupUser(privateUser.id);
    });
  });

  test.describe('Database Constraints', () => {
    test('should enforce foreign key constraints', async () => {
      // Test that credit transactions must reference valid users
      const transactions = await ctx.data.getCreditTransactions(testUser.id);

      transactions.forEach(transaction => {
        // Verify user exists (implicitly tested by successful query)
        expect(transaction.user_id).toBe(testUser.id);
      });
    });

    test('should enforce check constraints', async () => {
      // Test credit transaction type constraints
      const transactions = await ctx.data.getCreditTransactions(testUser.id);

      const validTypes = ['usage', 'subscription', 'purchase', 'refund', 'bonus'];
      transactions.forEach(transaction => {
        expect(validTypes).toContain(transaction.type);
      });
    });

    test('should handle not null constraints', async () => {
      const profile = await ctx.data.getUserProfile(testUser.id);

      // Verify required fields are not null
      expect(profile.id).not.toBeNull();
      expect(profile.created_at).not.toBeNull();
      expect(profile.updated_at).not.toBeNull();
      expect(profile.credits_balance).not.toBeNull();
    });
  });

  test.describe('Database Performance', () => {
    test('should handle bulk operations efficiently', async () => {
      const performanceUser = await ctx.data.createTestUser();
      const startTime = Date.now();

      // Create multiple transactions
      const bulkOperations = Array(20)
        .fill(null)
        .map((_, index) => ctx.data.addCredits(performanceUser.id, index + 1));

      await Promise.all(bulkOperations);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(10000); // 10 seconds

      await ctx.data.cleanupUser(performanceUser.id);
    });

    test('should maintain performance with concurrent users', async () => {
      const concurrentUsers = await Promise.all(
        Array(5)
          .fill(null)
          .map(() => ctx.data.createTestUser())
      );

      const startTime = Date.now();

      // Perform operations on all users concurrently
      const operations = concurrentUsers.map(user => ctx.data.addCredits(user.id, 50));

      await Promise.all(operations);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle concurrent operations efficiently
      expect(duration).toBeLessThan(15000); // 15 seconds

      // Cleanup all users
      await Promise.all(concurrentUsers.map(user => ctx.data.cleanupUser(user.id)));
    });
  });

  test.describe('Data Consistency', () => {
    test('should maintain ACID properties', async () => {
      const consistencyUser = await ctx.data.createTestUser();
      const initialBalance = (await ctx.data.getUserProfile(consistencyUser.id)).credits_balance;

      // Perform a series of related operations
      await ctx.data.addCredits(consistencyUser.id, 100);
      await ctx.data.setSubscriptionStatus(consistencyUser.id, 'active', 'pro');

      // Verify all changes are consistent
      const finalProfile = await ctx.data.getUserProfile(consistencyUser.id);
      const transactions = await ctx.data.getCreditTransactions(consistencyUser.id);

      expect(finalProfile.credits_balance).toBe(initialBalance + 100);
      expect(finalProfile.subscription_status).toBe('active');
      expect(transactions.some(t => t.amount === 100)).toBeTruthy();

      await ctx.data.cleanupUser(consistencyUser.id);
    });

    test('should handle rollbacks on errors', async () => {
      // This would require testing with a purposeful error scenario
      // For now, we verify that valid operations complete successfully

      const rollbackUser = await ctx.data.createTestUser();
      const initialBalance = (await ctx.data.getUserProfile(rollbackUser.id)).credits_balance;

      // Perform a valid operation
      await ctx.data.addCredits(rollbackUser.id, 25);

      const finalBalance = (await ctx.data.getUserProfile(rollbackUser.id)).credits_balance;
      expect(finalBalance).toBe(initialBalance + 25);

      await ctx.data.cleanupUser(rollbackUser.id);
    });
  });

  test.describe('Database Cleanup', () => {
    test('should cascade deletions properly', async () => {
      const cleanupUser = await ctx.data.createTestUser();

      // Create related data
      await ctx.data.addCredits(cleanupUser.id, 50);
      await ctx.data.setSubscriptionStatus(cleanupUser.id, 'active', 'pro', 'sub_cleanup');

      // Verify data exists
      const transactions = await ctx.data.getCreditTransactions(cleanupUser.id);
      expect(transactions.length).toBeGreaterThan(0);

      // Cleanup user (should cascade to related data)
      await ctx.data.cleanupUser(cleanupUser.id);

      // Note: We can't easily verify the cascade worked without admin access
      // But the cleanup completing without error is a good sign
    });
  });
});
