import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PUBLIC_API_ROUTES } from '@shared/config/security';
import { serverEnv } from '@shared/config/env';
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
import { DEFAULT_LOCALE, isValidLocale, LOCALE_COOKIE, type Locale } from '@/i18n/config';
import { getLocaleFromCountry } from '@lib/i18n/country-locale-map';

/**
 * Handle WWW to non-WWW redirect for SEO consistency
 * Redirects www.myimageupscaler.com to myimageupscaler.com
 */
function handleWWWRedirect(req: NextRequest): NextResponse | null {
  const hostname = req.nextUrl.hostname;

  // If hostname starts with www., redirect to non-www version
  if (hostname.startsWith('www.')) {
    const url = req.nextUrl.clone();
    url.protocol = req.nextUrl.protocol;
    url.hostname = hostname.slice(4); // Remove 'www.' prefix
    return NextResponse.redirect(url, 301); // Permanent redirect for SEO
  }

  return null;
}

/**
 * Detect and validate locale from request
 *
 * Priority order:
 * 1. URL path prefix (highest - explicit user navigation)
 * 2. Cookie (manual language selector override)
 * 3. CF-IPCountry header (Cloudflare geolocation - auto-redirect)
 * 4. Accept-Language header (browser preference)
 * 5. Default locale (fallback)
 */
function detectLocale(req: NextRequest): Locale {
  const pathname = req.nextUrl.pathname;
  const segments = pathname.split('/').filter(Boolean);

  // 1. Check URL path for locale prefix (explicit user navigation)
  if (segments.length > 0 && isValidLocale(segments[0])) {
    return segments[0] as Locale;
  }

  // 2. Check cookie (manual language selector override)
  const cookieLocale = req.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale && isValidLocale(cookieLocale)) {
    return cookieLocale;
  }

  // 3. Check CF-IPCountry header (Cloudflare geolocation - auto-redirect)
  // Cloudflare adds this header automatically on all requests
  const country = req.headers.get('CF-IPCountry');
  if (country) {
    const geoLocale = getLocaleFromCountry(country);
    // Only use geo-detected locale if it's supported
    if (geoLocale && isValidLocale(geoLocale)) {
      return geoLocale;
    }
  }

  // 4. Check Accept-Language header (browser preference)
  const acceptLanguage = req.headers.get('Accept-Language');
  if (acceptLanguage) {
    const preferredLocales = acceptLanguage
      .split(',')
      .map(lang => {
        const [locale, qValue] = lang.trim().split(';q=');
        const quality = qValue ? parseFloat(qValue) : 1;
        return { locale: locale.split('-')[0], quality };
      })
      .sort((a, b) => b.quality - a.quality);

    for (const { locale } of preferredLocales) {
      if (isValidLocale(locale)) {
        return locale as Locale;
      }
    }
  }

  // 5. Fallback to default
  return DEFAULT_LOCALE;
}

/**
 * Handle locale routing
 * - Redirects root to locale-prefixed path if needed
 * - Sets locale cookie for persistence
 * - Skips API routes, static files, and other special routes
 */
function handleLocaleRouting(req: NextRequest): NextResponse | null {
  const pathname = req.nextUrl.pathname;

  // Skip API routes
  if (pathname.startsWith('/api/')) {
    return null;
  }

  // Skip static files and Next.js internals
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.includes('.') // Files with extensions
  ) {
    return null;
  }

  // Skip sitemap, robots.txt, etc.
  if (
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt' ||
    pathname.startsWith('/sitemap-')
  ) {
    return null;
  }

  // Extract path segments to check for locale prefix
  const segments = pathname.split('/').filter(Boolean);

  // Skip pSEO (programmatic SEO) paths WITHOUT locale prefix
  // These serve default English content from app/(pseo)/ without locale prefix for SEO purposes
  // Localized versions (e.g., /es/tools/) are handled by app/[locale]/(pseo)/
  const hasLocalePrefix = segments.length > 0 && isValidLocale(segments[0]);
  const isPSEOPath =
    pathname.startsWith('/tools/') ||
    pathname.startsWith('/formats/') ||
    pathname.startsWith('/scale/') ||
    pathname.startsWith('/guides/') ||
    pathname.startsWith('/free/') ||
    pathname.startsWith('/alternatives/') ||
    pathname.startsWith('/compare/') ||
    pathname.startsWith('/platforms/') ||
    pathname.startsWith('/use-cases/') ||
    pathname.startsWith('/device-use/') ||
    pathname.startsWith('/format-scale/') ||
    pathname.startsWith('/platform-format/');

  // Only skip locale routing for pSEO paths that DON'T have a locale prefix
  if (isPSEOPath && !hasLocalePrefix) {
    return null;
  }

  const detectedLocale = detectLocale(req);

  // If path has no locale prefix, handle locale routing
  if (segments.length === 0 || !isValidLocale(segments[0])) {
    const url = req.nextUrl.clone();

    // For default locale (en), rewrite to /en/... internally (keeps URL clean)
    if (detectedLocale === DEFAULT_LOCALE) {
      url.pathname = `/en${pathname === '/' ? '' : pathname}`;
      return NextResponse.rewrite(url);
    }

    // For non-default locales, redirect to show locale in URL
    url.pathname = `/${detectedLocale}${pathname}`;
    const response = NextResponse.redirect(url);

    // Set locale cookie
    response.cookies.set(LOCALE_COOKIE, detectedLocale, {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
    });

    return response;
  }

  // Path has locale prefix, ensure cookie is set
  const pathLocale = segments[0] as Locale;
  if (isValidLocale(pathLocale)) {
    const response = NextResponse.next();

    // Update cookie if needed
    if (req.cookies.get(LOCALE_COOKIE)?.value !== pathLocale) {
      response.cookies.set(LOCALE_COOKIE, pathLocale, {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        sameSite: 'lax',
      });
    }

    return response;
  }

  return null;
}

/**
 * Legacy URL redirects for SEO
 * Maps old/incorrect URLs to their new canonical locations
 *
 * Handles paths both with and without locale prefix:
 * - /tools/bulk-image-resizer → /tools/resize/bulk-image-resizer
 * - /en/tools/bulk-image-resizer → /en/tools/resize/bulk-image-resizer
 */
function handleLegacyRedirects(req: NextRequest): NextResponse | null {
  let pathname = req.nextUrl.pathname;
  const trailingSlashRemoved =
    pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;

  // Extract locale prefix if present
  const segments = trailingSlashRemoved.split('/').filter(Boolean);
  let localePrefix = '';
  let pathWithoutLocale = trailingSlashRemoved;

  if (segments.length > 0 && isValidLocale(segments[0])) {
    localePrefix = `/${segments[0]}`;
    pathWithoutLocale = '/' + segments.slice(1).join('/');
  }

  // Define redirects without locale prefix (trailing slashes will be added by Next.js)
  const redirectMap: Record<string, string> = {
    '/tools/bulk-image-resizer': '/tools/resize/bulk-image-resizer/',
    '/tools/bulk-image-compressor': '/tools/compress/bulk-image-compressor/',
  };

  // Check if path (without locale) matches a redirect
  const newRedirectPath = redirectMap[pathWithoutLocale];

  if (newRedirectPath) {
    const url = req.nextUrl.clone();
    // Preserve locale prefix in the redirect
    url.pathname = `${localePrefix}${newRedirectPath}`;
    return NextResponse.redirect(url, 301); // Permanent redirect for SEO
  }

  return null;
}

/**
 * Check if a route matches any public API route pattern
 * Handles both with and without trailing slashes
 */
function isPublicApiRoute(pathname: string): boolean {
  // Normalize pathname by removing trailing slash for comparison
  const normalizedName =
    pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;

  const result = PUBLIC_API_ROUTES.some(route => {
    if (route.endsWith('/*')) {
      const prefix = route.slice(0, -2);
      return pathname.startsWith(prefix);
    }
    // Check both exact match and match with trailing slash
    return pathname === route || normalizedName === route;
  });

  return result;
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

  // Debug logging for test environment
  if (serverEnv.ENV === 'test' && pathname === '/api/health') {
    console.log(`[middleware] /api/health - isPublic: ${isPublic}, pathname: ${pathname}`);
  }

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

  // In test environment, skip auth redirects for dashboard access
  // This allows E2E tests to navigate directly to /dashboard without authentication
  const isTestEnv = serverEnv.ENV === 'test';

  // Check for test headers sent by Playwright tests
  const hasTestHeader =
    req.headers.get('x-test-env') === 'true' || req.headers.get('x-playwright-test') === 'true';

  // Authenticated user on root domain -> redirect to dashboard
  if (user && pathname === '/' && !isTestEnv && !hasTestHeader) {
    // Check if there are any query parameters that suggest other intent (like login prompts)
    const loginRequired = req.nextUrl.searchParams.get('login');

    // Only redirect if there's no login prompt to avoid conflicts with existing flow
    if (!loginRequired) {
      const url = req.nextUrl.clone();
      url.pathname = '/dashboard';
      // Clear any existing search params for clean redirect
      url.searchParams.delete('login');
      url.searchParams.delete('next');
      return NextResponse.redirect(url);
    }
  }

  // Unauthenticated user on protected dashboard routes -> redirect to landing with login prompt
  // Skip this check in test environment or when test headers are present
  if (!user && pathname.startsWith('/dashboard') && !isTestEnv && !hasTestHeader) {
    const url = req.nextUrl.clone();
    url.pathname = '/';

    // Add query parameters to indicate login is needed and where to return after
    url.searchParams.set('login', '1');
    url.searchParams.set('next', pathname);

    return NextResponse.redirect(url);
  }

  return response;
}

/**
 * Next.js Middleware
 *
 * Responsibilities:
 * 1. Locale detection and routing (must be first for page routes)
 * 2. WWW to non-WWW redirect for SEO
 * 3. Legacy URL redirects for SEO (must come before locale routing to catch old URLs)
 * 4. Page routes: Session refresh via cookies, auth-based redirects
 * 5. API routes: JWT verification via Authorization header, rate limiting
 * 6. Security headers on all responses
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;

  // Handle WWW to non-WWW redirect for SEO (must be first)
  const wwwRedirect = handleWWWRedirect(req);
  if (wwwRedirect) {
    return wwwRedirect;
  }

  // Handle legacy redirects for SEO (before locale routing to catch old URLs)
  const legacyRedirect = handleLegacyRedirects(req);
  if (legacyRedirect) {
    return legacyRedirect;
  }

  // Handle locale routing for page routes
  const localeRouting = handleLocaleRouting(req);
  if (localeRouting) {
    return localeRouting;
  }

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
