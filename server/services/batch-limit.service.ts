/**
 * Batch limit tracking using database-backed atomic counters
 *
 * HIGH-8 & HIGH-9 FIX:
 * - Issue #8: Batch limit check and increment are now atomic (prevents TOCTOU race)
 * - Issue #9: Batch limits stored in database (persisted across restarts/instances)
 *
 * Uses Supabase RPC functions for atomic operations.
 */

import { getBatchLimit } from '@shared/config/subscription.utils';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';

/**
 * Check if we're in test environment
 */
function isTestEnvironment(): boolean {
  return (
    serverEnv.ENV === 'test' || serverEnv.NODE_ENV === 'test' || serverEnv.PLAYWRIGHT_TEST === '1'
  );
}

interface IBatchLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  resetAt: Date;
}

interface IDbBatchResult {
  allowed: boolean;
  current_count: number;
  batch_limit: number;
  reset_at: string;
}

interface IDbUsageResult {
  current_count: number;
  batch_limit: number;
  remaining: number;
  reset_at: string;
}

export const batchLimitCheck = {
  /**
   * Atomically check AND increment batch limit in a single database operation
   * HIGH-8 FIX: This is now atomic - no TOCTOU race condition
   * HIGH-9 FIX: This is now database-backed - persisted across restarts
   *
   * @param userId - User ID to check
   * @param tier - Subscription tier (to determine limit)
   * @returns Result with allowed status, current count, limit, and reset time
   */
  async checkAndIncrement(userId: string, tier: string | null): Promise<IBatchLimitResult> {
    const limit = getBatchLimit(tier);

    // Skip batch limit in test environment
    if (isTestEnvironment()) {
      return {
        allowed: true,
        current: 0,
        limit,
        resetAt: new Date(Date.now() + 3600000),
      };
    }

    try {
      const { data, error } = await supabaseAdmin.rpc('check_and_increment_batch_limit', {
        p_user_id: userId,
        p_limit: limit,
        p_window_hours: 1,
      });

      if (error) {
        console.error('[BATCH_LIMIT] Database error:', error);
        // On error, fail closed (deny the request) for security
        return {
          allowed: false,
          current: limit,
          limit,
          resetAt: new Date(Date.now() + 3600000), // 1 hour from now
        };
      }

      // Data is returned as array with single row
      const result = (Array.isArray(data) ? data[0] : data) as IDbBatchResult;

      if (!result) {
        console.error('[BATCH_LIMIT] No result from database');
        return {
          allowed: false,
          current: limit,
          limit,
          resetAt: new Date(Date.now() + 3600000),
        };
      }

      return {
        allowed: result.allowed,
        current: result.current_count,
        limit: result.batch_limit,
        resetAt: new Date(result.reset_at),
      };
    } catch (err) {
      console.error('[BATCH_LIMIT] Unexpected error:', err);
      // On error, fail closed (deny the request) for security
      return {
        allowed: false,
        current: limit,
        limit,
        resetAt: new Date(Date.now() + 3600000),
      };
    }
  },

  /**
   * Legacy check method - now just calls checkAndIncrement
   * @deprecated Use checkAndIncrement for atomic operations
   */
  async check(userId: string, tier: string | null): Promise<IBatchLimitResult> {
    // For backwards compatibility, check calls checkAndIncrement
    // This means calling check() will also increment
    // If you need to check without incrementing, use getUsage()
    console.warn(
      '[BATCH_LIMIT] Deprecated: check() is now atomic. Use checkAndIncrement() explicitly.'
    );
    return this.checkAndIncrement(userId, tier);
  },

  /**
   * Legacy increment method - now a no-op since checkAndIncrement is atomic
   * @deprecated No longer needed - checkAndIncrement handles both operations
   */
  increment(userId: string): void {
    // No-op: increment is now handled atomically in checkAndIncrement
    console.warn(`[BATCH_LIMIT] Deprecated: increment() for user ${userId} is no longer needed.`);
  },

  /**
   * Get current usage for a user (without incrementing)
   */
  async getUsage(
    userId: string,
    tier: string | null
  ): Promise<{
    current: number;
    limit: number;
    remaining: number;
    resetAt: Date;
  }> {
    const limit = getBatchLimit(tier);

    // Skip batch limit in test environment
    if (isTestEnvironment()) {
      return {
        current: 0,
        limit,
        remaining: limit,
        resetAt: new Date(Date.now() + 3600000),
      };
    }

    try {
      const { data, error } = await supabaseAdmin.rpc('get_batch_usage', {
        p_user_id: userId,
        p_limit: limit,
        p_window_hours: 1,
      });

      if (error) {
        console.error('[BATCH_LIMIT] Database error in getUsage:', error);
        return {
          current: 0,
          limit,
          remaining: limit,
          resetAt: new Date(Date.now() + 3600000),
        };
      }

      // Data is returned as array with single row
      const result = (Array.isArray(data) ? data[0] : data) as IDbUsageResult;

      if (!result) {
        return {
          current: 0,
          limit,
          remaining: limit,
          resetAt: new Date(Date.now() + 3600000),
        };
      }

      return {
        current: result.current_count,
        limit: result.batch_limit,
        remaining: result.remaining,
        resetAt: new Date(result.reset_at),
      };
    } catch (err) {
      console.error('[BATCH_LIMIT] Unexpected error in getUsage:', err);
      return {
        current: 0,
        limit,
        remaining: limit,
        resetAt: new Date(Date.now() + 3600000),
      };
    }
  },
};
