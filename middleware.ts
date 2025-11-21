import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, publicRateLimit } from '@/lib/rateLimit';

/**
 * Public routes that don't require authentication
 * Supports wildcard patterns with * suffix
 */
const PUBLIC_ROUTES = [
  '/api/health',
  '/api/webhooks/*', // All webhook routes are public (they use their own auth mechanisms)
];

/**
 * Check if a route matches any public route pattern
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => {
    if (route.endsWith('/*')) {
      const prefix = route.slice(0, -2);
      return pathname.startsWith(prefix);
    }
    return pathname === route;
  });
}

/**
 * Next.js Middleware for API route protection
 *
 * Responsibilities:
 * 1. Add security headers to all responses
 * 2. Verify Supabase JWT for protected routes
 * 3. Apply rate limiting (per-user for auth'd, per-IP for public)
 * 4. Set user context headers for downstream route handlers
 *
 * Runs on Cloudflare Edge Runtime before API route handlers execute.
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const pathname = req.nextUrl.pathname;

  // 1. Apply security headers to all responses
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-XSS-Protection', '1; mode=block');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );

  // Content Security Policy - adjust based on your app's needs
  // This is a strict baseline; you may need to relax it for third-party scripts
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval';
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, ' ')
    .trim();

  res.headers.set('Content-Security-Policy', cspHeader);

  // 2. Check if route is public
  const isPublic = isPublicRoute(pathname);

  // 3. Handle public routes with IP-based rate limiting
  if (isPublic) {
    // For public routes, rate limit by IP address
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
    const { success, remaining, reset } = await publicRateLimit.limit(ip);

    if (!success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': new Date(reset).toISOString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    res.headers.set('X-RateLimit-Remaining', remaining.toString());
    return res;
  }

  // 4. Verify JWT for protected routes
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  // Create Supabase client for middleware
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: req.headers.get('Authorization') ?? '',
      },
    },
  });

  // Get session from Authorization header
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Valid authentication token required',
      },
      { status: 401 }
    );
  }

  // 5. Apply user-based rate limiting for authenticated routes
  const { success, remaining, reset } = await rateLimit.limit(user.id);

  if (!success) {
    return NextResponse.json(
      {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': '50',
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': new Date(reset).toISOString(),
          'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  // 6. Set user context headers for downstream route handlers
  // Route handlers can use getAuthenticatedUser() to retrieve this
  res.headers.set('X-User-Id', user.id);
  res.headers.set('X-User-Email', user.email ?? '');
  res.headers.set('X-RateLimit-Remaining', remaining.toString());

  return res;
}

/**
 * Middleware configuration
 * Only run on API routes to avoid unnecessary processing of static assets
 */
export const config = {
  matcher: '/api/:path*',
};
