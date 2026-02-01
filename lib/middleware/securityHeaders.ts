/* eslint-disable no-restricted-syntax */
import { NextResponse, NextRequest } from 'next/server';
import { getSecurityHeaders, buildCspHeader } from '@shared/config/security';
import { serverEnv } from '@shared/config/env';

/**
 * Allowed origins for CORS
 * In test mode, includes the test server port (random port like 3100-4000)
 */
function getAllowedOrigins(): string[] {
  const origins = ['http://localhost:3000', 'https://localhost:3000', serverEnv.BASE_URL];

  // In test environment, add the test server port
  if (serverEnv.ENV === 'test' && process.env.TEST_PORT) {
    origins.push(`http://localhost:${process.env.TEST_PORT}`);
  }

  return origins.filter(Boolean) as string[];
}

let ALLOWED_ORIGINS: string[] = [];
export function refreshAllowedOrigins(): void {
  ALLOWED_ORIGINS = getAllowedOrigins();
}
// Initialize on load
refreshAllowedOrigins();

/**
 * Apply security headers to a NextResponse
 * Includes standard security headers and Content Security Policy
 */
export function applySecurityHeaders(res: NextResponse): void {
  // Apply standard security headers (environment-aware)
  Object.entries(getSecurityHeaders()).forEach(([key, value]) => {
    res.headers.set(key, value);
  });

  // Apply Content Security Policy
  res.headers.set('Content-Security-Policy', buildCspHeader());
}

/**
 * Apply CORS headers to API responses
 * SECURITY FIX: Don't allow wildcard for missing Origin
 * Browsers always send Origin header. No header means non-browser request (e.g., webhook) which doesn't need CORS.
 */
export function applyCorsHeaders(res: NextResponse, origin?: string): void {
  // Only set CORS headers if origin is provided and allowed
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With'
    );
    res.headers.set('Access-Control-Allow-Credentials', 'true');
    res.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
  }
  // REMOVED: Wildcard fallback for missing origin
  // Non-browser clients (webhooks, APIs) don't need CORS headers
}

/**
 * Handle OPTIONS preflight requests
 */
export function handleOptionsRequest(req: NextRequest): NextResponse | null {
  if (req.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 200 });
    applyCorsHeaders(res, req.headers.get('origin') || undefined);
    return res;
  }
  return null;
}
