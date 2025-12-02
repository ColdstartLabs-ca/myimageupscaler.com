import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, publicRateLimit } from '@server/rateLimit';
import { clientEnv, serverEnv } from '@shared/config/env';
import { updateSession } from '@shared/utils/supabase/middleware';

/**
 * Get the client IP address from the request, prioritizing Cloudflare headers
 */
function getClientIp(req: NextRequest): string {
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
function createRateLimitHeaders(
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
 * Public API routes that don't require authentication
 * Supports wildcard patterns with * suffix
 */
const PUBLIC_API_ROUTES = [
  '/api/health',
  '/api/webhooks/*', // All webhook routes are public (they use their own auth mechanisms)
  '/api/analytics/*', // Analytics events support both anonymous and authenticated tracking
];

/**
 * Check if a route matches any public API route pattern
 */
function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some(route => {
    if (route.endsWith('/*')) {
      const prefix = route.slice(0, -2);
      return pathname.startsWith(prefix);
    }
    return pathname === route;
  });
}

/**
 * Apply security headers to response
 */
function applySecurityHeaders(res: NextResponse): void {
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-XSS-Protection', '1; mode=block');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googletagmanager.com https://js.stripe.com;
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https:;
    font-src 'self';
    connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.amplitude.com https://*.google-analytics.com https://*.googletagmanager.com https://rum.baselime.io https://api.stripe.com;
    frame-src https://js.stripe.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, ' ')
    .trim();

  res.headers.set('Content-Security-Policy', cspHeader);
}

/**
 * Handle API route authentication and rate limiting
 */
async function handleApiRoute(req: NextRequest, pathname: string): Promise<NextResponse> {
  // Check if route is public
  const isPublic = isPublicApiRoute(pathname);

  // Handle public routes - they don't require authentication
  if (isPublic) {
    const res = NextResponse.next();
    applySecurityHeaders(res);

    // Skip rate limiting in test environment to avoid test failures
    const isTestEnv =
      serverEnv.ENV === 'test' ||
      serverEnv.AMPLITUDE_API_KEY?.startsWith('test_amplitude_api_key');

    if (!isTestEnv) {
      const ip = getClientIp(req);
      const { success, remaining, reset } = await publicRateLimit.limit(ip);
      const rateLimitHeaders = createRateLimitHeaders(10, remaining, reset);

      if (!success) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many requests. Please try again later.',
              details: {
                retryAfter: Math.ceil((reset - Date.now()) / 1000),
              },
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
    }

    return res;
  }

  // Verify JWT for protected API routes
  if (!clientEnv.SUPABASE_URL || !clientEnv.SUPABASE_ANON_KEY) {
    console.error('Missing Supabase environment variables');
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Server configuration error',
        },
      },
      { status: 500 }
    );
  }

  // Create Supabase client for API auth (uses Authorization header)
  const supabase = createClient(clientEnv.SUPABASE_URL, clientEnv.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: req.headers.get('Authorization') ?? '',
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Valid authentication token required',
        },
      },
      { status: 401 }
    );
  }

  // Apply user-based rate limiting
  const { success, remaining, reset } = await rateLimit.limit(user.id);
  const rateLimitHeaders = createRateLimitHeaders(50, remaining, reset);

  if (!success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Rate limit exceeded. Please try again later.',
          details: {
            retryAfter: Math.ceil((reset - Date.now()) / 1000),
          },
        },
      },
      {
        status: 429,
        headers: rateLimitHeaders,
      }
    );
  }

  // Clone the request headers and add user context for downstream route handlers
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('X-User-Id', user.id);
  requestHeaders.set('X-User-Email', user.email ?? '');

  // Create response with modified request headers that will be passed to route handlers
  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  applySecurityHeaders(res);

  // Add rate limit headers to response
  Object.entries(rateLimitHeaders).forEach(([key, value]) => {
    if (key !== 'Retry-After') {
      res.headers.set(key, value);
    }
  });

  return res;
}

/**
 * Handle page route authentication redirects
 */
async function handlePageRoute(req: NextRequest, pathname: string): Promise<NextResponse> {
  const { user, supabaseResponse } = await updateSession(req);

  // Apply security headers
  applySecurityHeaders(supabaseResponse);

  // Authenticated user on landing page -> redirect to dashboard
  if (user && pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Unauthenticated user on protected dashboard routes -> redirect to landing
  if (!user && pathname.startsWith('/dashboard')) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

/**
 * Next.js Middleware
 *
 * Responsibilities:
 * 1. Page routes: Session refresh via cookies, auth-based redirects
 * 2. API routes: JWT verification via Authorization header, rate limiting
 * 3. Security headers on all responses
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;

  // API routes use existing JWT-based auth
  if (pathname.startsWith('/api')) {
    return handleApiRoute(req, pathname);
  }

  // Page routes use cookie-based auth with SSR
  return handlePageRoute(req, pathname);
}

/**
 * Middleware configuration
 * Run on all routes except static assets
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Static assets (svg, png, jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
