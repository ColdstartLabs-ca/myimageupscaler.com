/**
 * Distributed Rate Limiting Service
 *
 * Provides distributed rate limiting using Upstash Redis for scalability
 * across multiple edge locations. This replaces the in-memory rate limiting
 * which doesn't work in distributed environments.
 *
 * Key features:
 * - Distributed state using Upstash Redis (consistent across all edge locations)
 * - Sliding window algorithm for smooth rate limiting
 * - Atomic operations using Redis INCR + EXPIRE in pipeline
 * - Graceful error handling (fails open if Redis is unavailable)
 * - Time-based key partitioning for efficient cleanup
 */

import { Redis } from '@upstash/redis';
import { serverEnv } from '@shared/config/env';

// Singleton Redis instance
let redis: Redis | null = null;

/**
 * Get or create the Redis singleton instance
 * Follows the exact pattern from guest-rate-limiter.ts
 */
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: serverEnv.UPSTASH_REDIS_REST_URL,
      token: serverEnv.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

/**
 * Rate limit result interface
 * Matches the existing IRateLimitResult from server/rateLimit.ts
 */
export interface IRateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

/**
 * Generate a time-based window key for efficient partitioning
 *
 * Uses millisecond-based partitioning to correctly handle all window sizes,
 * including sub-minute windows (e.g., 10 seconds).
 *
 * @param windowMs - Time window in milliseconds
 * @returns Current window identifier (e.g., "w1234567890")
 */
function getWindowKey(windowMs: number): string {
  const now = Date.now();
  const windowNumber = Math.floor(now / windowMs);
  return `w${windowNumber}`;
}

/**
 * Generate the Redis key for rate limit tracking
 *
 * Pattern: ratelimit:{identifier}:{window}
 * Example: ratelimit:user_123:w123456789 (for 10-second window)
 * Example: ratelimit:192.168.1.1:w1234567 (for 60-second window)
 *
 * @param identifier - Unique identifier (user ID, IP address, etc.)
 * @param windowMs - Time window in milliseconds
 * @returns Redis key string
 */
function getRedisKey(identifier: string, windowMs: number): string {
  const windowKey = getWindowKey(windowMs);
  return `ratelimit:${identifier}:${windowKey}`;
}

/**
 * Check rate limit using distributed Redis storage
 *
 * This function implements a sliding window algorithm using Redis INCR + EXPIRE
 * operations in a pipeline for atomicity and efficiency.
 *
 * Algorithm:
 * 1. Increment the request counter for the identifier
 * 2. Set expiration on the key (only if it's new, via conditional logic)
 * 3. Check if the count exceeds the limit
 * 4. Return appropriate result with remaining count and reset time
 *
 * Error handling:
 * - If Redis connection fails, the function fails open (allows the request)
 * - This prevents service disruptions when Redis is temporarily unavailable
 *
 * @param identifier - Unique identifier (user ID, IP address, etc.)
 * @param limit - Maximum number of requests allowed in the time window
 * @param windowMs - Time window in milliseconds
 * @returns Rate limit result with success status, remaining count, and reset time
 *
 * @example
 * ```typescript
 * // Check rate limit for authenticated user (50 requests per 10 seconds)
 * const result = await checkRateLimit('user_123', 50, 10000);
 * if (!result.success) {
 *   return new Response('Too many requests', { status: 429 });
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Check rate limit for public API (10 requests per 10 seconds)
 * const result = await checkRateLimit('192.168.1.1', 10, 10000);
 * if (!result.success) {
 *   return new Response('Rate limit exceeded', {
 *     status: 429,
 *     headers: {
 *       'X-RateLimit-Remaining': result.remaining.toString(),
 *       'X-RateLimit-Reset': result.reset.toString(),
 *     },
 *   });
 * }
 * ```
 */
export async function checkRateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): Promise<IRateLimitResult> {
  const now = Date.now();
  const redisKey = getRedisKey(identifier, windowMs);

  try {
    const redis = getRedis();

    // Use pipeline for atomic operations
    const pipeline = redis.pipeline();

    // Increment the request counter
    pipeline.incr(redisKey);

    // Set expiration if this is a new key (first request in window)
    // We check if the incremented value is 1, which means it's a new key
    pipeline.expire(redisKey, Math.ceil(windowMs / 1000)); // Convert to seconds

    // Execute the pipeline
    const results = await pipeline.exec();

    if (!results || results.length < 2) {
      // Pipeline failed, fail open
      return {
        success: true,
        remaining: limit - 1,
        reset: now + windowMs,
      };
    }

    // Get the incremented count - Upstash pipeline returns raw values
    const currentCount = (results[0] as number) || 1;

    // Check if limit exceeded
    if (currentCount > limit) {
      // Calculate reset time based on window boundary
      const windowNumber = Math.floor(now / windowMs);
      const resetTime = (windowNumber + 1) * windowMs;

      return {
        success: false,
        remaining: 0,
        reset: resetTime,
      };
    }

    // Request allowed
    const remaining = Math.max(0, limit - currentCount);
    const resetTime = now + windowMs;

    return {
      success: true,
      remaining,
      reset: resetTime,
    };
  } catch (error) {
    // Redis connection failed - fail open to prevent service disruption
    // This ensures the application remains functional even if Redis is down
    if (error instanceof Error) {
      // Log the error but don't throw
      console.error('[DistributedRateLimiter] Redis error, failing open:', {
        error: error.message,
        identifier,
        limit,
        windowMs,
      });
    }

    return {
      success: true,
      remaining: limit - 1,
      reset: now + windowMs,
    };
  }
}

/**
 * Reset rate limit for a specific identifier
 * Useful for testing or administrative purposes
 *
 * @param identifier - Unique identifier to reset
 * @param windowMs - Time window in milliseconds
 * @returns true if reset was successful, false otherwise
 */
export async function resetRateLimit(identifier: string, windowMs: number): Promise<boolean> {
  const redisKey = getRedisKey(identifier, windowMs);

  try {
    const redis = getRedis();
    await redis.del(redisKey);
    return true;
  } catch (error) {
    console.error('[DistributedRateLimiter] Failed to reset rate limit:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      identifier,
      windowMs,
    });
    return false;
  }
}

/**
 * Get current rate limit statistics for an identifier
 * Useful for monitoring and display purposes
 *
 * @param identifier - Unique identifier to check
 * @param windowMs - Time window in milliseconds
 * @returns Object with current count and limit, or null if Redis is unavailable
 */
export async function getRateLimitStats(
  identifier: string,
  windowMs: number
): Promise<{ count: number; limit: number; windowMs: number } | null> {
  const redisKey = getRedisKey(identifier, windowMs);

  try {
    const redis = getRedis();
    const count = (await redis.get<number>(redisKey)) || 0;

    return {
      count,
      limit: 0, // Caller needs to provide the limit
      windowMs,
    };
  } catch (error) {
    console.error('[DistributedRateLimiter] Failed to get rate limit stats:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      identifier,
      windowMs,
    });
    return null;
  }
}
