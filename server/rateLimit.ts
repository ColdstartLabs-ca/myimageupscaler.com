/**
 * Simple in-memory rate limiter
 * No external dependencies, no paid services
 *
 * Uses sliding window algorithm with in-memory storage.
 * Note: This works for single-instance deployments. For multi-instance
 * deployments (e.g., Cloudflare with multiple edge locations), consider
 * using Cloudflare KV or Durable Objects.
 */

interface IRateLimitEntry {
  timestamps: number[];
}

// In-memory storage for rate limit tracking
const rateLimitStore = new Map<string, IRateLimitEntry>();

// Cleanup old entries every 5 minutes to prevent memory leaks
setInterval(
  () => {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    for (const [key, entry] of rateLimitStore.entries()) {
      // Remove timestamps older than 5 minutes
      entry.timestamps = entry.timestamps.filter(t => t > fiveMinutesAgo);

      // Remove entry if no recent timestamps
      if (entry.timestamps.length === 0) {
        rateLimitStore.delete(key);
      }
    }
  },
  5 * 60 * 1000
); // Every 5 minutes

interface IRateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

/**
 * Rate limit function using sliding window algorithm
 *
 * @param identifier - Unique identifier (user ID or IP address)
 * @param limit - Maximum number of requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns Rate limit result with success status, remaining count, and reset time
 */
function createRateLimiter(limit: number, windowMs: number) {
  return async (identifier: string): Promise<IRateLimitResult> => {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create entry for this identifier
    let entry = rateLimitStore.get(identifier);
    if (!entry) {
      entry = { timestamps: [] };
      rateLimitStore.set(identifier, entry);
    }

    // Remove timestamps outside the current window
    entry.timestamps = entry.timestamps.filter(t => t > windowStart);

    // Check if limit exceeded
    if (entry.timestamps.length >= limit) {
      const oldestTimestamp = entry.timestamps[0];
      const resetTime = oldestTimestamp + windowMs;

      return {
        success: false,
        remaining: 0,
        reset: resetTime,
      };
    }

    // Add current timestamp
    entry.timestamps.push(now);

    return {
      success: true,
      remaining: limit - entry.timestamps.length,
      reset: now + windowMs,
    };
  };
}

/**
 * Rate limiter for authenticated users
 * 50 requests per 10 seconds
 */
export const rateLimit = {
  limit: createRateLimiter(50, 10 * 1000),
};

/**
 * Rate limiter for public/unauthenticated routes
 * 10 requests per 10 seconds (more restrictive)
 */
export const publicRateLimit = {
  limit: createRateLimiter(10, 10 * 1000),
};

/**
 * Rate limiter for image processing (upscale) routes
 * 5 requests per 60 seconds (stricter to prevent abuse)
 */
export const upscaleRateLimit = {
  limit: createRateLimiter(5, 60 * 1000),
};
