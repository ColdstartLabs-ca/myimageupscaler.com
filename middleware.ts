import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, publicRateLimit } from '@/lib/rateLimit';
import { clientEnv } from '@/config/env';
import { updateSession } from '@/utils/supabase/middleware';

/**
 * Public API routes that don't require authentication
 * Supports wildcard patterns with * suffix
 */
const PUBLIC_API_ROUTES = [
  '/api/health',
  '/api/webhooks/*', // All webhook routes are public (they use their own auth mechanisms)
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
    script-src 'self' 'unsafe-inline' 'unsafe-eval';
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https:;
    font-src 'self';
    connect-src 'self' https://*.supabase.co wss://*.supabase.co;
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
  const res = NextResponse.next();
  applySecurityHeaders(res);

  // Check if route is public
  const isPublic = isPublicApiRoute(pathname);

  // Handle public routes with IP-based rate limiting
  if (isPublic) {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';
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

  // Verify JWT for protected API routes
  if (!clientEnv.SUPABASE_URL || !clientEnv.SUPABASE_ANON_KEY) {
    console.error('Missing Supabase environment variables');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
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
        error: 'Unauthorized',
        message: 'Valid authentication token required',
      },
      { status: 401 }
    );
  }

  // Apply user-based rate limiting
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

  // Set user context headers for downstream route handlers
  res.headers.set('X-User-Id', user.id);
  res.headers.set('X-User-Email', user.email ?? '');
  res.headers.set('X-RateLimit-Remaining', remaining.toString());

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
