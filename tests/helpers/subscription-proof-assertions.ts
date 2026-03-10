import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Subscription proof assertion helpers for stateful integration tests
 *
 * Provides utilities for verifying complete subscription state across
 * profiles and subscriptions tables, ensuring that webhook events
 * result in correct persisted database state.
 */

export interface ISubscriptionStateAssertion {
  tier?: 'starter' | 'hobby' | 'pro' | 'business' | null;
  status?: 'active' | 'trialing' | 'past_due' | 'canceled' | null;
  subscriptionCredits?: number;
  purchasedCredits?: number;
  latestPriceId?: string;
}

/**
 * Asserts complete subscription state across profiles and subscriptions tables
 *
 * Verifies that both the profiles table (user profile state) and subscriptions table
 * (Stripe subscription records) match the expected state. This is critical for
 * proving that webhook events result in correct persisted state.
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID to check
 * @param expected - Expected state values (undefined values are not checked)
 * @throws Error with descriptive message if any field doesn't match
 *
 * @example
 * ```typescript
 * await assertSubscriptionState(supabase, userId, {
 *   tier: 'pro',
 *   status: 'active',
 *   subscriptionCredits: 1000,
 *   purchasedCredits: 0,
 *   latestPriceId: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
 * });
 * ```
 */
export async function assertSubscriptionState(
  supabase: SupabaseClient,
  userId: string,
  expected: ISubscriptionStateAssertion
): Promise<void> {
  // Fetch profile state
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(
      'subscription_tier, subscription_status, subscription_credits_balance, purchased_credits_balance'
    )
    .eq('id', userId)
    .single();

  if (profileError) {
    throw new Error(`Failed to fetch profile for user ${userId}: ${profileError.message}`);
  }

  if (!profile) {
    throw new Error(`Profile not found for user ${userId}`);
  }

  // Fetch subscription record (most recent)
  const { data: subscriptions, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('status, price_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (subscriptionError) {
    throw new Error(
      `Failed to fetch subscriptions for user ${userId}: ${subscriptionError.message}`
    );
  }

  const latestSubscription = subscriptions && subscriptions.length > 0 ? subscriptions[0] : null;

  // Collect mismatches for detailed error reporting
  const mismatches: string[] = [];

  // Check tier
  if (expected.tier !== undefined) {
    const actualTier = profile.subscription_tier;
    if (actualTier !== expected.tier) {
      mismatches.push(
        `tier mismatch: expected "${expected.tier}", got "${actualTier ?? 'null'}"`
      );
    }
  }

  // Check status in profile
  if (expected.status !== undefined) {
    const actualStatus = profile.subscription_status;
    if (actualStatus !== expected.status) {
      mismatches.push(
        `status mismatch: expected "${expected.status}", got "${actualStatus ?? 'null'}"`
      );
    }
  }

  // Verify subscription record status matches profile status
  if (expected.status !== undefined && latestSubscription) {
    if (latestSubscription.status !== expected.status) {
      mismatches.push(
        `subscription record status mismatch: expected "${expected.status}", got "${latestSubscription.status}"`
      );
    }
  }

  // Check subscription credits
  if (expected.subscriptionCredits !== undefined) {
    const actualCredits = profile.subscription_credits_balance;
    if (actualCredits !== expected.subscriptionCredits) {
      mismatches.push(
        `subscription credits mismatch: expected ${expected.subscriptionCredits}, got ${actualCredits}`
      );
    }
  }

  // Check purchased credits
  if (expected.purchasedCredits !== undefined) {
    const actualCredits = profile.purchased_credits_balance;
    if (actualCredits !== expected.purchasedCredits) {
      mismatches.push(
        `purchased credits mismatch: expected ${expected.purchasedCredits}, got ${actualCredits}`
      );
    }
  }

  // Check latest price ID
  if (expected.latestPriceId !== undefined) {
    if (!latestSubscription) {
      mismatches.push(`latestPriceId expected "${expected.latestPriceId}" but no subscription found`);
    } else if (latestSubscription.price_id !== expected.latestPriceId) {
      mismatches.push(
        `price_id mismatch: expected "${expected.latestPriceId}", got "${latestSubscription.price_id}"`
      );
    }
  }

  // Throw with detailed message if any mismatches found
  if (mismatches.length > 0) {
    throw new Error(
      `Subscription state assertion failed for user ${userId}:\n  - ${mismatches.join('\n  - ')}`
    );
  }
}

/**
 * Asserts exactly one credit transaction exists for a reference
 *
 * Ensures that a webhook event resulted in exactly one credit allocation,
 * not zero (missing credits) or multiple (double allocation bug).
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID to check
 * @param referenceId - Reference ID (e.g., Stripe subscription or invoice ID)
 * @param expectedAmount - Expected credit amount
 * @param type - Transaction type ('subscription' | 'purchase')
 * @throws Error if zero or multiple transactions found, or if amount mismatch
 *
 * @example
 * ```typescript
 * await assertSingleCreditAllocation(
 *   supabase,
 *   userId,
 *   'sub_1234567890',
 *   1000,
 *   'subscription'
 * );
 * ```
 */
export async function assertSingleCreditAllocation(
  supabase: SupabaseClient,
  userId: string,
  referenceId: string,
  expectedAmount: number,
  type: 'subscription' | 'purchase' = 'subscription'
): Promise<void> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('ref_id', referenceId)
    .eq('type', type);

  if (error) {
    throw new Error(
      `Failed to query credit_transactions for user ${userId}, ref_id ${referenceId}: ${error.message}`
    );
  }

  if (!data || data.length === 0) {
    throw new Error(
      `Expected 1 transaction for ref_id=${referenceId}, type=${type}, found 0. Credit allocation may not have occurred.`
    );
  }

  if (data.length > 1) {
    throw new Error(
      `Expected 1 transaction for ref_id=${referenceId}, type=${type}, found ${data.length}. Double allocation bug detected!`
    );
  }

  const transaction = data[0];

  if (transaction.amount !== expectedAmount) {
    throw new Error(
      `Expected amount ${expectedAmount} for ref_id=${referenceId}, type=${type}, got ${transaction.amount}. Credit amount mismatch.`
    );
  }
}

/**
 * Asserts no duplicate credit allocations exist for a user
 *
 * Checks for duplicate ref_id values in credit_transactions, which would
 * indicate that webhook events are being processed multiple times.
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID to check
 * @throws Error if duplicate ref_id values are found
 *
 * @example
 * ```typescript
 * await assertNoDuplicateAllocations(supabase, userId);
 * ```
 */
export async function assertNoDuplicateAllocations(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('ref_id, type')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to query credit_transactions for user ${userId}: ${error.message}`);
  }

  if (!data || data.length === 0) {
    // No transactions is acceptable (user hasn't purchased anything yet)
    return;
  }

  // Track seen reference IDs
  const seenRefs = new Map<string, { count: number; type: string }>();

  for (const transaction of data) {
    const refId = transaction.ref_id;
    if (!refId) continue; // Skip transactions without reference IDs

    const existing = seenRefs.get(refId);
    if (existing) {
      existing.count++;
    } else {
      seenRefs.set(refId, { count: 1, type: transaction.type });
    }
  }

  // Find duplicates
  const duplicates: Array<{ refId: string; count: number; type: string }> = [];

  for (const [refId, { count, type }] of seenRefs.entries()) {
    if (count > 1) {
      duplicates.push({ refId, count, type });
    }
  }

  if (duplicates.length > 0) {
    const duplicateList = duplicates
      .map(d => `  - ref_id="${d.refId}", type="${d.type}", count=${d.count}`)
      .join('\n');

    throw new Error(
      `Duplicate credit allocations found for user ${userId}:\n${duplicateList}\nThis indicates webhook events are being processed multiple times.`
    );
  }
}
