import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  assertSubscriptionState,
  assertSingleCreditAllocation,
  assertNoDuplicateAllocations,
  type ISubscriptionStateAssertion,
} from '../../helpers/subscription-proof-assertions';

// Mock Supabase client
const createMockSupabaseClient = (
  profileData: any = null,
  subscriptionsData: any[] = [],
  transactionsData: any[] = [],
  error: any = null
) => ({
  from: vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({
              data: profileData,
              error: error?.profileError || null,
            })),
          })),
        })),
      };
    }
    if (table === 'subscriptions') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                data: subscriptionsData,
                error: error?.subscriptionError || null,
              })),
            })),
          })),
        })),
      };
    }
    if (table === 'credit_transactions') {
      const mockEq = vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            data: transactionsData,
            error: error?.transactionsError || null,
          })),
        })),
      }));
      return {
        select: vi.fn(() => ({
          eq: mockEq,
        })),
      };
    }
    return { select: vi.fn(), eq: vi.fn() };
  }),
});

describe('subscription-proof-assertions', () => {
  describe('assertSubscriptionState', () => {
    const mockUserId = 'user_test_123';
    const mockProfile = {
      subscription_tier: 'pro',
      subscription_status: 'active',
      subscription_credits_balance: 1000,
      purchased_credits_balance: 0,
    };
    const mockSubscription = {
      status: 'active',
      price_id: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
    };

    test('should pass when all fields match expected values', async () => {
      const supabase = createMockSupabaseClient(mockProfile, [mockSubscription]) as any;

      const expected: ISubscriptionStateAssertion = {
        tier: 'pro',
        status: 'active',
        subscriptionCredits: 1000,
        purchasedCredits: 0,
        latestPriceId: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
      };

      await expect(assertSubscriptionState(supabase, mockUserId, expected)).resolves.not.toThrow();
    });

    test('should pass when only specified fields are checked', async () => {
      const supabase = createMockSupabaseClient(mockProfile, [mockSubscription]) as any;

      const expected: ISubscriptionStateAssertion = {
        tier: 'pro',
        subscriptionCredits: 1000,
      };

      await expect(assertSubscriptionState(supabase, mockUserId, expected)).resolves.not.toThrow();
    });

    test('should throw on tier mismatch', async () => {
      const supabase = createMockSupabaseClient(mockProfile, [mockSubscription]) as any;

      const expected: ISubscriptionStateAssertion = {
        tier: 'hobby',
      };

      await expect(assertSubscriptionState(supabase, mockUserId, expected)).rejects.toThrow(
        'tier mismatch: expected "hobby", got "pro"'
      );
    });

    test('should throw on status mismatch', async () => {
      const supabase = createMockSupabaseClient(mockProfile, [mockSubscription]) as any;

      const expected: ISubscriptionStateAssertion = {
        status: 'canceled',
      };

      await expect(assertSubscriptionState(supabase, mockUserId, expected)).rejects.toThrow(
        'status mismatch: expected "canceled", got "active"'
      );
    });

    test('should throw on subscription credits mismatch', async () => {
      const supabase = createMockSupabaseClient(mockProfile, [mockSubscription]) as any;

      const expected: ISubscriptionStateAssertion = {
        subscriptionCredits: 500,
      };

      await expect(assertSubscriptionState(supabase, mockUserId, expected)).rejects.toThrow(
        'subscription credits mismatch: expected 500, got 1000'
      );
    });

    test('should throw on purchased credits mismatch', async () => {
      const supabase = createMockSupabaseClient(
        { ...mockProfile, purchased_credits_balance: 100 },
        [mockSubscription]
      ) as any;

      const expected: ISubscriptionStateAssertion = {
        purchasedCredits: 0,
      };

      await expect(assertSubscriptionState(supabase, mockUserId, expected)).rejects.toThrow(
        'purchased credits mismatch: expected 0, got 100'
      );
    });

    test('should throw on price_id mismatch', async () => {
      const supabase = createMockSupabaseClient(mockProfile, [mockSubscription]) as any;

      const expected: ISubscriptionStateAssertion = {
        latestPriceId: 'price_different_id',
      };

      await expect(assertSubscriptionState(supabase, mockUserId, expected)).rejects.toThrow(
        'price_id mismatch: expected "price_different_id", got "price_1Sz0fOL1vUl00LlZ7bbM2cDs"'
      );
    });

    test('should throw multiple mismatches in single error', async () => {
      const supabase = createMockSupabaseClient(mockProfile, [mockSubscription]) as any;

      const expected: ISubscriptionStateAssertion = {
        tier: 'hobby',
        status: 'canceled',
        subscriptionCredits: 500,
      };

      await expect(assertSubscriptionState(supabase, mockUserId, expected)).rejects.toThrow(
        'Subscription state assertion failed'
      );
      await expect(assertSubscriptionState(supabase, mockUserId, expected)).rejects.toThrow('tier');
      await expect(assertSubscriptionState(supabase, mockUserId, expected)).rejects.toThrow('status');
      await expect(assertSubscriptionState(supabase, mockUserId, expected)).rejects.toThrow(
        'credits'
      );
    });

    test('should throw when no subscription found and priceId is expected', async () => {
      const supabase = createMockSupabaseClient(mockProfile, []) as any;

      const expected: ISubscriptionStateAssertion = {
        latestPriceId: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
      };

      await expect(assertSubscriptionState(supabase, mockUserId, expected)).rejects.toThrow(
        'latestPriceId expected "price_1Sz0fOL1vUl00LlZ7bbM2cDs" but no subscription found'
      );
    });

    test('should throw when profile fetch fails', async () => {
      const supabase = createMockSupabaseClient(null, [], [], {
        profileError: { message: 'Database connection failed' },
      }) as any;

      const expected: ISubscriptionStateAssertion = {
        tier: 'pro',
      };

      await expect(assertSubscriptionState(supabase, mockUserId, expected)).rejects.toThrow(
        'Failed to fetch profile'
      );
    });
  });

  describe('assertSingleCreditAllocation', () => {
    const mockUserId = 'user_test_123';
    const mockReferenceId = 'sub_test_456';
    const mockAmount = 1000;

    test('should pass with exactly one matching transaction', async () => {
      const mockTransaction = {
        user_id: mockUserId,
        ref_id: mockReferenceId,
        type: 'subscription',
        amount: mockAmount,
      };

      const supabase = createMockSupabaseClient(null, [], [mockTransaction]) as any;

      await expect(
        assertSingleCreditAllocation(supabase, mockUserId, mockReferenceId, mockAmount)
      ).resolves.not.toThrow();
    });

    test('should pass with purchase type transaction', async () => {
      const mockTransaction = {
        user_id: mockUserId,
        ref_id: mockReferenceId,
        type: 'purchase',
        amount: mockAmount,
      };

      const supabase = createMockSupabaseClient(null, [], [mockTransaction]) as any;

      await expect(
        assertSingleCreditAllocation(supabase, mockUserId, mockReferenceId, mockAmount, 'purchase')
      ).resolves.not.toThrow();
    });

    test('should throw with zero transactions found', async () => {
      const supabase = createMockSupabaseClient(null, [], []) as any;

      await expect(
        assertSingleCreditAllocation(supabase, mockUserId, mockReferenceId, mockAmount)
      ).rejects.toThrow('Expected 1 transaction for ref_id=');
    });

    test('should throw with multiple transactions found (double allocation)', async () => {
      const mockTransactions = [
        {
          user_id: mockUserId,
          ref_id: mockReferenceId,
          type: 'subscription',
          amount: mockAmount,
        },
        {
          user_id: mockUserId,
          ref_id: mockReferenceId,
          type: 'subscription',
          amount: mockAmount,
        },
      ];

      const supabase = createMockSupabaseClient(null, [], mockTransactions) as any;

      await expect(
        assertSingleCreditAllocation(supabase, mockUserId, mockReferenceId, mockAmount)
      ).rejects.toThrow('Double allocation bug detected');
    });

    test('should throw with amount mismatch', async () => {
      const mockTransaction = {
        user_id: mockUserId,
        ref_id: mockReferenceId,
        type: 'subscription',
        amount: 500, // Wrong amount
      };

      const supabase = createMockSupabaseClient(null, [], [mockTransaction]) as any;

      await expect(
        assertSingleCreditAllocation(supabase, mockUserId, mockReferenceId, mockAmount)
      ).rejects.toThrow('Expected amount 1000');
    });

    test('should throw when database query fails', async () => {
      const supabase = createMockSupabaseClient(null, [], [], {
        transactionsError: { message: 'Query failed' },
      }) as any;

      await expect(
        assertSingleCreditAllocation(supabase, mockUserId, mockReferenceId, mockAmount)
      ).rejects.toThrow('Failed to query credit_transactions');
    });
  });

  describe('assertNoDuplicateAllocations', () => {
    const mockUserId = 'user_test_123';

    test('should pass with no transactions', async () => {
      const fromMock = vi.fn((table: string) => {
        if (table === 'credit_transactions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [],
                error: null,
              })),
            })),
          };
        }
        return {};
      });

      const supabase = { from: fromMock } as any;

      await expect(assertNoDuplicateAllocations(supabase, mockUserId)).resolves.not.toThrow();
    });

    test('should pass with all unique reference IDs', async () => {
      const mockTransactions = [
        { user_id: mockUserId, ref_id: 'sub_1', type: 'subscription' },
        { user_id: mockUserId, ref_id: 'sub_2', type: 'subscription' },
        { user_id: mockUserId, ref_id: 'invoice_3', type: 'purchase' },
      ];

      const fromMock = vi.fn((table: string) => {
        if (table === 'credit_transactions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: mockTransactions,
                error: null,
              })),
            })),
          };
        }
        return {};
      });

      const supabase = { from: fromMock } as any;

      await expect(assertNoDuplicateAllocations(supabase, mockUserId)).resolves.not.toThrow();
    });

    test('should detect duplicate reference IDs', async () => {
      const mockTransactions = [
        { user_id: mockUserId, ref_id: 'sub_1', type: 'subscription' },
        { user_id: mockUserId, ref_id: 'sub_1', type: 'subscription' }, // Duplicate
        { user_id: mockUserId, ref_id: 'sub_2', type: 'subscription' },
      ];

      // Need to fix the mock to properly handle the chained eq calls for assertNoDuplicateAllocations
      const fromMock = vi.fn((table: string) => {
        if (table === 'credit_transactions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: mockTransactions,
                error: null,
              })),
            })),
          };
        }
        return {};
      });

      const supabase = { from: fromMock } as any;

      await expect(assertNoDuplicateAllocations(supabase, mockUserId)).rejects.toThrow(
        'Duplicate credit allocations found'
      );
    });

    test('should skip transactions without reference IDs', async () => {
      const mockTransactions = [
        { user_id: mockUserId, ref_id: null, type: 'subscription' },
        { user_id: mockUserId, ref_id: undefined, type: 'subscription' },
        { user_id: mockUserId, ref_id: 'sub_1', type: 'subscription' },
      ];

      const fromMock = vi.fn((table: string) => {
        if (table === 'credit_transactions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: mockTransactions,
                error: null,
              })),
            })),
          };
        }
        return {};
      });

      const supabase = { from: fromMock } as any;

      await expect(assertNoDuplicateAllocations(supabase, mockUserId)).resolves.not.toThrow();
    });

    test('should detect multiple duplicates', async () => {
      const mockTransactions = [
        { user_id: mockUserId, ref_id: 'sub_1', type: 'subscription' },
        { user_id: mockUserId, ref_id: 'sub_1', type: 'subscription' },
        { user_id: mockUserId, ref_id: 'sub_2', type: 'subscription' },
        { user_id: mockUserId, ref_id: 'sub_2', type: 'subscription' },
        { user_id: mockUserId, ref_id: 'sub_2', type: 'subscription' },
      ];

      const fromMock = vi.fn((table: string) => {
        if (table === 'credit_transactions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: mockTransactions,
                error: null,
              })),
            })),
          };
        }
        return {};
      });

      const supabase = { from: fromMock } as any;

      await expect(assertNoDuplicateAllocations(supabase, mockUserId)).rejects.toThrow(
        'Duplicate credit allocations found'
      );
    });

    test('should throw when database query fails', async () => {
      const fromMock = vi.fn((table: string) => {
        if (table === 'credit_transactions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: null,
                error: { message: 'Query failed' },
              })),
            })),
          };
        }
        return {};
      });

      const supabase = { from: fromMock } as any;

      await expect(assertNoDuplicateAllocations(supabase, mockUserId)).rejects.toThrow(
        'Failed to query credit_transactions'
      );
    });
  });
});
