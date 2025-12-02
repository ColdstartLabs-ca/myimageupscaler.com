import { z } from 'zod';

/**
 * Centralized environment variable configuration.
 *
 * All environment variables should be accessed through this module.
 * Direct usage of process.env is prohibited by ESLint rules.
 *
 * Usage:
 * - Client-side: import { clientEnv } from '@shared/config/env'
 * - Server-side: import { serverEnv } from '@shared/config/env'
 */

// =============================================================================
// Client-side environment variables (NEXT_PUBLIC_*)
// These are safe to expose to the browser
// =============================================================================

const clientEnvSchema = z.object({
  APP_NAME: z.string().default('PixelPerfect'),
  BASE_URL: z.string().url().default('http://localhost:3000'),
  SUPABASE_URL: z.string().url().default('https://example.supabase.co'),
  SUPABASE_ANON_KEY: z.string().default(''),
  GOOGLE_CLIENT_ID: z.string().default(''),
  FACEBOOK_CLIENT_ID: z.string().default(''),
  AZURE_CLIENT_ID: z.string().default(''),
  BASELIME_KEY: z.string().default(''),
  // Analytics
  AMPLITUDE_API_KEY: z.string().default(''),
  GA_MEASUREMENT_ID: z.string().default(''),
  // OAuth Provider Toggles
  ENABLE_GOOGLE_OAUTH: z.string().default('true'),
  ENABLE_AZURE_OAUTH: z.string().default('false'),
  // Contact
  ADMIN_EMAIL: z.string().email().default('admin@pixelperfect.com'),
  SUPPORT_EMAIL: z.string().email().default('support@pixelperfect.app'),
  LEGAL_EMAIL: z.string().email().default('legal@pixelperfect.app'),
  PRIVACY_EMAIL: z.string().email().default('privacy@pixelperfect.app'),
  // Stripe
  STRIPE_PUBLISHABLE_KEY: z.string().default(''),
});

export type IClientEnv = z.infer<typeof clientEnvSchema>;

function loadClientEnv(): IClientEnv {
  const env = {
    APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'PixelPerfect',
    BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
    FACEBOOK_CLIENT_ID: process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID || '',
    AZURE_CLIENT_ID: process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || '',
    BASELIME_KEY: process.env.NEXT_PUBLIC_BASELIME_KEY || '',
    // Analytics
    AMPLITUDE_API_KEY: process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY || '',
    GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '',
    // OAuth Provider Toggles
    ENABLE_GOOGLE_OAUTH: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_OAUTH || 'true',
    ENABLE_AZURE_OAUTH: process.env.NEXT_PUBLIC_ENABLE_AZURE_OAUTH || 'false',
    // Contact
    ADMIN_EMAIL: process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'admin@pixelperfect.com',
    SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@pixelperfect.app',
    LEGAL_EMAIL: process.env.NEXT_PUBLIC_LEGAL_EMAIL || 'legal@pixelperfect.app',
    PRIVACY_EMAIL: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || 'privacy@pixelperfect.app',
    // Stripe
    STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
  };

  return clientEnvSchema.parse(env);
}

/**
 * Client-side environment variables.
 * Safe to use in both client and server components.
 */
export const clientEnv = loadClientEnv();

// =============================================================================
// Server-side environment variables (secrets)
// These are NEVER exposed to the browser
// =============================================================================

const serverEnvSchema = z.object({
  ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Supabase
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  // Stripe
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  // Gemini AI
  GEMINI_API_KEY: z.string().default(''),
  // Baselime monitoring (server-side)
  BASELIME_API_KEY: z.string().default(''),
  // Analytics (server-side HTTP API)
  AMPLITUDE_API_KEY: z.string().default(''),
  // CORS
  ALLOWED_ORIGIN: z.string().default('*'),
  // Cloudflare
  CF_PAGES_URL: z.string().optional(),
  // Testing
  TEST_AUTH_TOKEN: z.string().optional(),
});

export type IServerEnv = z.infer<typeof serverEnvSchema>;

function loadServerEnv(): IServerEnv {
  const env = {
    ENV: process.env.ENV || process.env.NODE_ENV || 'development',
    // Supabase
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    // Stripe
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
    // Gemini AI
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    // Baselime monitoring
    BASELIME_API_KEY: process.env.BASELIME_API_KEY || '',
    // Analytics (server-side HTTP API)
    AMPLITUDE_API_KEY: process.env.AMPLITUDE_API_KEY || '',
    // CORS
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '*',
    // Cloudflare
    CF_PAGES_URL: process.env.CF_PAGES_URL,
    // Testing
    TEST_AUTH_TOKEN: process.env.TEST_AUTH_TOKEN,
  };

  return serverEnvSchema.parse(env);
}

/**
 * Server-side environment variables.
 * Only use in server components, API routes, and middleware.
 * These values are NEVER sent to the client.
 */
export const serverEnv = loadServerEnv();

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Check if running in production environment
 */
export function isProduction(): boolean {
  return serverEnv.ENV === 'production';
}

/**
 * Check if running in development environment
 */
export function isDevelopment(): boolean {
  return serverEnv.ENV === 'development';
}

/**
 * Check if running in test environment
 */
export function isTest(): boolean {
  return serverEnv.ENV === 'test';
}

// =============================================================================
// Legacy support - deprecated, use clientEnv instead
// =============================================================================

/** @deprecated Use clientEnv instead */
export type Env = IClientEnv;

/** @deprecated Use clientEnv instead */
export function loadEnv(): IClientEnv {
  return clientEnv;
}
