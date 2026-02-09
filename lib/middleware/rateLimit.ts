import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, publicRateLimit } from '@server/rateLimit';
import { serverEnv } from '@shared/config/env';

/**
 * Rate limit configuration
 */
const PUBLIC_RATE_LIMIT = 10;
const USER_RATE_LIMIT = 50;

/**
 * Get the client IP address from the request, prioritizing Cloudflare headers
 */
export function getClientIp(req: NextRequest): string {
  // Cloudflare-specific header (most reliable on Cloudflare)
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;

  // Standard forwarded header
  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  // Alternative header
  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp) return xRealIp;

  return 'unknown';
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(
  limit: number,
  remaining: number,
  reset: number
): Record<string, string> {
  return {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': new Date(reset).toISOString(),
    'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
  };
}

/**
 * Check if rate limiting should be skipped (test environment)
 * MEDIUM-21 FIX: Only use explicit test flags, not inferred from service keys
 * This prevents staging environments with test Stripe keys from having no rate limiting
 */
export function isTestEnvironment(): boolean {
  // Only use explicit test environment indicators
  // DO NOT infer test mode from service keys like STRIPE_SECRET_KEY
  return (
    serverEnv.ENV === 'test' ||
    serverEnv.NODE_ENV === 'test' ||
    // Check for Playwright test environment marker
    serverEnv.PLAYWRIGHT_TEST === '1'
  );
  // REMOVED: Stripe key check - staging environments use test keys but need rate limiting
  // REMOVED: Supabase URL check - not reliable indicator of test environment
  // REMOVED: Amplitude key check - not reliable indicator of test environment
}

/**
 * Apply public (IP-based) rate limiting
 * Returns null if the request should proceed, or a response if rate limited
 */
export async function applyPublicRateLimit(
  req: NextRequest,
  res: NextResponse
): Promise<NextResponse | null> {
  // Skip rate limiting in test environment
  if (isTestEnvironment()) {
    return null;
  }

  // Skip rate limiting for webhook routes - they authenticate via signature verification
  // and Stripe can fire 6-8+ events in rapid succession during checkout
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith('/api/webhooks/')) {
    return null;
  }

  const ip = getClientIp(req);
  const { success, remaining, reset } = await publicRateLimit.limit(ip);
  const rateLimitHeaders = createRateLimitHeaders(PUBLIC_RATE_LIMIT, remaining, reset);

  if (!success) {
    return NextResponse.json(
      {
        error: 'Too many requests',
        details: {
          retryAfter: Math.ceil((reset - Date.now()) / 1000),
        },
      },
      {
        status: 429,
        headers: rateLimitHeaders,
      }
    );
  }

  // Add rate limit headers to successful responses
  Object.entries(rateLimitHeaders).forEach(([key, value]) => {
    if (key !== 'Retry-After') {
      res.headers.set(key, value);
    }
  });

  return null;
}

/**
 * Apply user-based rate limiting
 * Returns null if the request should proceed, or a response if rate limited
 */
export async function applyUserRateLimit(
  userId: string,
  res: NextResponse
): Promise<NextResponse | null> {
  let success, remaining, reset;

  // Skip rate limiting in test environment but still add headers
  if (isTestEnvironment()) {
    success = true;
    remaining = USER_RATE_LIMIT;
    reset = Date.now() + 10000; // 10 seconds from now
  } else {
    const result = await rateLimit.limit(userId);
    success = result.success;
    remaining = result.remaining;
    reset = result.reset;
  }

  const rateLimitHeaders = createRateLimitHeaders(USER_RATE_LIMIT, remaining, reset);

  if (!success) {
    return NextResponse.json(
      {
        error: 'Too many requests',
        details: {
          retryAfter: Math.ceil((reset - Date.now()) / 1000),
        },
      },
      {
        status: 429,
        headers: rateLimitHeaders,
      }
    );
  }

  // Add rate limit headers to successful responses
  Object.entries(rateLimitHeaders).forEach(([key, value]) => {
    if (key !== 'Retry-After') {
      res.headers.set(key, value);
    }
  });

  return null;
}
