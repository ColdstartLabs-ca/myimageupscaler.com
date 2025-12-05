import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PUBLIC_API_ROUTES } from '@shared/config/security';
import {
  applySecurityHeaders,
  applyCorsHeaders,
  handleOptionsRequest,
  applyPublicRateLimit,
  applyUserRateLimit,
  verifyApiAuth,
  addUserContextHeaders,
  handlePageAuth,
} from '@lib/middleware';

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
 * Handle API route authentication and rate limiting
 */
async function handleApiRoute(req: NextRequest, pathname: string): Promise<NextResponse> {
  // Handle OPTIONS preflight requests
  const optionsResponse = handleOptionsRequest(req);
  if (optionsResponse) {
    applySecurityHeaders(optionsResponse);
    return optionsResponse;
  }

  // Check if route is public
  const isPublic = isPublicApiRoute(pathname);

  // Handle public routes - they don't require authentication
  if (isPublic) {
    const res = NextResponse.next();
    applySecurityHeaders(res);
    applyCorsHeaders(res, req.headers.get('origin') || undefined);

    // Apply public rate limiting
    const rateLimitResponse = await applyPublicRateLimit(req, res);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    return res;
  }

  // Verify JWT for protected API routes
  const authResult = await verifyApiAuth(req);
  if ('error' in authResult) {
    return authResult.error;
  }

  // Create response with user context headers
  const res = addUserContextHeaders(req, authResult.user);
  applySecurityHeaders(res);
  applyCorsHeaders(res, req.headers.get('origin') || undefined);

  // Apply user-based rate limiting
  const rateLimitResponse = await applyUserRateLimit(authResult.user.id, res);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  return res;
}

/**
 * Handle page route authentication redirects
 */
async function handlePageRoute(req: NextRequest, pathname: string): Promise<NextResponse> {
  const { user, response } = await handlePageAuth(req);

  // Apply security headers
  applySecurityHeaders(response);

  // Unauthenticated user on protected dashboard routes -> redirect to landing
  if (!user && pathname.startsWith('/dashboard')) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
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

  // Route to appropriate handler
  if (pathname.startsWith('/api/')) {
    return handleApiRoute(req, pathname);
  }

  // Handle page routes
  return handlePageRoute(req, pathname);
}

/**
 * Middleware configuration
 *
 * Match all routes except:
 * - Static files (_next/static, _next/image, favicon, sitemap, robots)
 * - API routes that don't need auth (handled in middleware logic)
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
};
