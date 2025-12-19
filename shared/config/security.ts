/**
 * Security configuration for the application
 * Contains CSP policies and other security-related settings
 */

/**
 * Content Security Policy configuration
 * This policy defines what resources the application can load
 */
export const CSP_POLICY = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    'https://*.googletagmanager.com',
    'https://js.stripe.com',
  ],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'blob:', 'data:', 'https:'],
  'font-src': ["'self'"],
  'connect-src': [
    "'self'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://*.amplitude.com',
    'https://*.google-analytics.com',
    'https://*.googletagmanager.com',
    'https://rum.baselime.io',
    'https://api.stripe.com',
  ],
  'frame-src': ['https://js.stripe.com'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [],
} as const;

/**
 * Build CSP header string from policy object
 */
export function buildCspHeader(): string {
  return Object.entries(CSP_POLICY)
    .map(([directive, values]) => {
      if (values.length === 0) {
        return directive;
      }
      return `${directive} ${values.join(' ')}`;
    })
    .join('; ');
}

/**
 * Standard security headers for all responses
 */
export const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
} as const;

/**
 * Public API routes that don't require authentication
 * Supports wildcard patterns with * suffix
 */
export const PUBLIC_API_ROUTES = [
  '/api/health',
  '/api/webhooks/*', // All webhook routes are public (they use their own auth mechanisms)
  '/api/analytics/*', // Analytics events support both anonymous and authenticated tracking
  '/api/cron/*', // Cron routes use x-cron-secret header auth, not JWT
  '/api/proxy-image', // Download proxy for CORS bypass (validates allowed domains internally)
] as const;
