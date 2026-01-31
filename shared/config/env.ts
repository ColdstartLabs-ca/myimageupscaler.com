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
  APP_NAME: z.string().default('MyImageUpscaler'),
  ENV: z.string().default('development'),
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
  AHREFS_ANALYTICS_KEY: z.string().default(''),
  // OAuth Provider Toggles
  ENABLE_GOOGLE_OAUTH: z.string().default('true'),
  ENABLE_AZURE_OAUTH: z.string().default('false'),
  // Contact
  ADMIN_EMAIL: z.string().email().default('admin@myimageupscaler.com'),
  SUPPORT_EMAIL: z.string().email().default('support@myimageupscaler.com'),
  LEGAL_EMAIL: z.string().email().default('legal@myimageupscaler.com'),
  PRIVACY_EMAIL: z.string().email().default('privacy@myimageupscaler.com'),
  SALES_EMAIL: z.string().email().default('sales@myimageupscaler.com'),
  TWITTER_HANDLE: z.string().default('myimageupscaler'),
  // App Configuration
  APP_SLUG: z.string().default('myimageupscaler'),
  DOWNLOAD_PREFIX: z.string().default('myimageupscaler'),
  BATCH_FOLDER_NAME: z.string().default('myimageupscaler_batch'),
  CACHE_USER_KEY_PREFIX: z.string().default('myimageupscaler'),
  WEB_SERVICE_NAME: z.string().default('myimageupscaler-web'),
  CRON_SERVICE_NAME: z.string().default('myimageupscaler-cron'),
  // GitHub
  GITHUB_USER: z.string().default('joaoferro42'),
  GITHUB_REPO: z.string().default('myimageupscaler'),
  // Legal
  LAST_UPDATED_DATE: z.string().default('November 26, 2025'),
  // Domains and URLs
  PRIMARY_DOMAIN: z.string().default('myimageupscaler.com'),
  APP_DOMAIN: z.string().default('myimageupscaler.com'),
  // Stripe
  STRIPE_PUBLISHABLE_KEY: z.string().default(''),
  // Stripe Credit Pack Price IDs
  NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL: z.string().default('price_credits_small'),
  NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM: z.string().default('price_credits_medium'),
  NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LARGE: z.string().default('price_credits_large'),
});

export type IClientEnv = z.infer<typeof clientEnvSchema>;

function loadClientEnv(): IClientEnv {
  const env = {
    APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'MyImageUpscaler',
    ENV: process.env.NEXT_PUBLIC_ENV || 'development',
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
    AHREFS_ANALYTICS_KEY: process.env.NEXT_PUBLIC_AHREFS_ANALYTICS_KEY || '',
    // OAuth Provider Toggles
    ENABLE_GOOGLE_OAUTH: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_OAUTH || 'true',
    ENABLE_AZURE_OAUTH: process.env.NEXT_PUBLIC_ENABLE_AZURE_OAUTH || 'false',
    // Contact
    ADMIN_EMAIL: process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'admin@myimageupscaler.com',
    SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@myimageupscaler.com',
    LEGAL_EMAIL: process.env.NEXT_PUBLIC_LEGAL_EMAIL || 'legal@myimageupscaler.com',
    PRIVACY_EMAIL: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || 'privacy@myimageupscaler.com',
    SALES_EMAIL: process.env.NEXT_PUBLIC_SALES_EMAIL || 'sales@myimageupscaler.com',
    TWITTER_HANDLE: process.env.NEXT_PUBLIC_TWITTER_HANDLE || 'myimageupscaler',
    // App Configuration
    APP_SLUG: process.env.NEXT_PUBLIC_APP_SLUG || 'myimageupscaler',
    DOWNLOAD_PREFIX: process.env.NEXT_PUBLIC_DOWNLOAD_PREFIX || 'myimageupscaler',
    BATCH_FOLDER_NAME: process.env.NEXT_PUBLIC_BATCH_FOLDER_NAME || 'myimageupscaler_batch',
    CACHE_USER_KEY_PREFIX: process.env.NEXT_PUBLIC_CACHE_USER_KEY_PREFIX || 'myimageupscaler',
    WEB_SERVICE_NAME: process.env.NEXT_PUBLIC_WEB_SERVICE_NAME || 'myimageupscaler-web',
    CRON_SERVICE_NAME: process.env.NEXT_PUBLIC_CRON_SERVICE_NAME || 'myimageupscaler-cron',
    // GitHub
    GITHUB_USER: process.env.NEXT_PUBLIC_GITHUB_USER || 'joaoferro42',
    GITHUB_REPO: process.env.NEXT_PUBLIC_GITHUB_REPO || 'myimageupscaler',
    // Legal
    LAST_UPDATED_DATE: process.env.NEXT_PUBLIC_LAST_UPDATED_DATE || 'November 26, 2025',
    // Domains and URLs
    PRIMARY_DOMAIN: process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'myimageupscaler.com',
    APP_DOMAIN: process.env.NEXT_PUBLIC_APP_DOMAIN || 'myimageupscaler.com',
    // Stripe
    STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
    // Stripe Credit Pack Price IDs
    NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL:
      process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL || 'price_credits_small',
    NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM:
      process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM || 'price_credits_medium',
    NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LARGE:
      process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LARGE || 'price_credits_large',
  };

  return clientEnvSchema.parse(env);
}

/**
 * Generate logo abbreviation from app name.
 * Takes the first letter of each word, up to 2 characters.
 */
export function getAppLogoAbbr(appName?: string): string {
  const name = appName || clientEnv.APP_NAME;
  const words = name.trim().split(/\s+/);
  if (words.length === 0) return '';
  if (words.length === 1) {
    // For single word, take first 2 letters
    return words[0].substring(0, 2).toUpperCase();
  }
  // For multiple words, take first letter of each word, up to 2 letters
  return words
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join('');
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
  // App Name
  APP_NAME: z.string().default('MyImageUpscaler'),
  // Node environment
  NODE_ENV: z.string().optional(),
  // Test flags
  PLAYWRIGHT_TEST: z.string().optional(),
  // Public URLs (for server-side use)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
  // Supabase
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  // Stripe
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  // SEO APIs
  SERPER_DEV: z.string().default(''),
  SERPER_API_URL: z.string().default('https://google.serper.dev/search'),
  SERPER_RATE_LIMIT_MS: z.string().default('1000'),
  PAGESPEED_API_KEY: z.string().default(''),
  // Stripe Price IDs
  STRIPE_STARTER_MONTHLYLY_PRICE_ID: z.string().default('price_1Sq14eALMLhQocpf5CXIwYSv'),
  STRIPE_HOBBY_MONTHLYLY_PRICE_ID: z.string().default('price_1SZmVyALMLhQocpf0H7n5ls8'),
  STRIPE_PRO_MONTHLYLY_PRICE_ID: z.string().default('price_1SZmVzALMLhQocpfPyRX2W8D'),
  STRIPE_BUSINESS_MONTHLYLY_PRICE_ID: z.string().default('price_1SZmVzALMLhQocpfqPk9spg4'),
  // Gemini AI
  GEMINI_API_KEY: z.string().default(''),
  // Replicate AI (Image Upscaling)
  REPLICATE_API_TOKEN: z.string().default(''),
  REPLICATE_MODEL_VERSION: z
    .string()
    .default(
      'nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa'
    ),
  // Qwen VL for LLM-based image analysis
  /** @deprecated Use OPENROUTER_API_KEY and OPENROUTER_VL_MODEL instead */
  QWEN_VL_MODEL_VERSION: z
    .string()
    .default(
      'lucataco/qwen3-vl-8b-instruct:39e893666996acf464cff75688ad49ac95ef54e9f1c688fbc677330acc478e11'
    ),
  // OpenRouter for VL analysis (replaces Qwen VL on Replicate)
  OPENROUTER_API_KEY: z.string().default(''),
  OPENROUTER_VL_MODEL: z.string().default('bytedance-seed/seed-1.6-flash'),
  // Baselime monitoring (server-side)
  BASELIME_API_KEY: z.string().default(''),
  // Analytics (server-side HTTP API)
  AMPLITUDE_API_KEY: z.string().default(''),
  // CORS
  ALLOWED_ORIGIN: z.string().default('*'),
  // Cloudflare
  CF_PAGES_URL: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().default(''),
  CLOUDFLARE_ACCOUNT_ID: z.string().default(''),
  CLOUDFLARE_ZONE_ID: z.string().default(''),
  DOMAIN_NAME: z.string().default('myimageupscaler.com'),
  WORKER_NAME: z.string().default('myimageupscaler'),
  // Cron Job Authentication
  CRON_SECRET: z.string().default(''),
  // Test Authentication
  TEST_AUTH_TOKEN: z.string().optional(),

  // ==========================================
  // MODEL ASSIGNMENTS BY USE CASE
  // ==========================================
  MODEL_FOR_GENERAL_UPSCALE: z.string().default('real-esrgan'),
  MODEL_FOR_PORTRAITS: z.string().default('gfpgan'),
  MODEL_FOR_DAMAGED_PHOTOS: z.string().default('nano-banana-pro'),
  MODEL_FOR_TEXT_LOGOS: z.string().default('nano-banana'),
  MODEL_FOR_MAX_QUALITY: z.string().default('clarity-upscaler'),

  // ==========================================
  // FEATURE FLAGS
  // ==========================================
  ENABLE_AUTO_MODEL_SELECTION: z.coerce.boolean().default(true),
  ENABLE_PREMIUM_MODELS: z.coerce.boolean().default(true),

  // ==========================================
  // EMAIL PROVIDERS
  // ==========================================
  // Brevo (Primary) - 9,000 free emails/month
  BREVO_API_KEY: z.string().default(''),
  // Resend (Fallback) - 3,000 free emails/month
  RESEND_API_KEY: z.string().default(''),
  // Common email settings
  EMAIL_FROM_ADDRESS: z.string().email().default('noreply@myimageupscaler.com'),
  SUPPORT_EMAIL: z.string().email().default('support@myimageupscaler.com'),
  BASE_URL: z.string().url().default('http://localhost:3000'),
  // Allow sending transactional emails in development (for testing)
  ALLOW_TRANSACTIONAL_EMAILS_IN_DEV: z.coerce.boolean().default(false),

  // ==========================================
  // BLOG API
  // ==========================================
  BLOG_API_KEY: z.string().default(''),

  // ==========================================
  // MODEL VERSION OVERRIDES (optional)
  // Only set these if you need non-default versions
  // Defaults are defined in model-registry.ts
  // ==========================================
  MODEL_VERSION_REAL_ESRGAN: z.string().optional(),
  MODEL_VERSION_GFPGAN: z.string().optional(),
  MODEL_VERSION_NANO_BANANA: z.string().optional(),
  MODEL_VERSION_CLARITY_UPSCALER: z.string().optional(),
  MODEL_VERSION_FLUX_2_PRO: z.string().optional(),
  MODEL_VERSION_NANO_BANANA_PRO: z.string().optional(),
  MODEL_VERSION_QWEN_IMAGE_EDIT: z.string().optional(),
  MODEL_VERSION_SEEDREAM: z.string().optional(),
  MODEL_VERSION_REALESRGAN_ANIME: z.string().optional(),
  MODEL_VERSION_P_IMAGE_EDIT: z.string().optional(),
  MODEL_VERSION_FLUX_KONTEXT_FAST: z.string().optional(),
});

export type IServerEnv = z.infer<typeof serverEnvSchema>;

function loadServerEnv(): IServerEnv {
  const env = {
    ENV: process.env.ENV || process.env.NODE_ENV || 'development',
    // App Name
    APP_NAME: process.env.APP_NAME || process.env.NEXT_PUBLIC_APP_NAME || 'MyImageUpscaler',
    // Node environment
    NODE_ENV: process.env.NODE_ENV,
    // Test flags
    PLAYWRIGHT_TEST: process.env.PLAYWRIGHT_TEST,
    // Public URLs
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    // Supabase
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    // Stripe
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
    // SEO APIs
    SERPER_DEV: process.env.SERPER_DEV || '',
    SERPER_API_URL: process.env.SERPER_API_URL || 'https://google.serper.dev/search',
    SERPER_RATE_LIMIT_MS: process.env.SERPER_RATE_LIMIT_MS || '1000',
    PAGESPEED_API_KEY: process.env.PAGESPEED_API_KEY || '',
    // Stripe Price IDs
    STRIPE_STARTER_MONTHLYLY_PRICE_ID:
      process.env.STRIPE_STARTER_MONTHLYLY_PRICE_ID || 'price_1Sq14eALMLhQocpf5CXIwYSv',
    STRIPE_HOBBY_MONTHLYLY_PRICE_ID:
      process.env.STRIPE_HOBBY_MONTHLYLY_PRICE_ID || 'price_1SZmVyALMLhQocpf0H7n5ls8',
    STRIPE_PRO_MONTHLYLY_PRICE_ID:
      process.env.STRIPE_PRO_MONTHLYLY_PRICE_ID || 'price_1SZmVzALMLhQocpfPyRX2W8D',
    STRIPE_BUSINESS_MONTHLYLY_PRICE_ID:
      process.env.STRIPE_BUSINESS_MONTHLYLY_PRICE_ID || 'price_1SZmVzALMLhQocpfqPk9spg4',
    // Gemini AI
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    // Replicate AI
    REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN || '',
    REPLICATE_MODEL_VERSION:
      process.env.REPLICATE_MODEL_VERSION ||
      'nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
    QWEN_VL_MODEL_VERSION:
      process.env.QWEN_VL_MODEL_VERSION ||
      'lucataco/qwen3-vl-8b-instruct:39e893666996acf464cff75688ad49ac95ef54e9f1c688fbc677330acc478e11',
    // OpenRouter for VL analysis
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
    OPENROUTER_VL_MODEL: process.env.OPENROUTER_VL_MODEL || 'bytedance-seed/seed-1.6-flash',
    // Baselime monitoring
    BASELIME_API_KEY: process.env.BASELIME_API_KEY || '',
    // Analytics (server-side HTTP API)
    AMPLITUDE_API_KEY: process.env.AMPLITUDE_API_KEY || '',
    // CORS
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '*',
    // Cloudflare
    CF_PAGES_URL: process.env.CF_PAGES_URL,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || '',
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    CLOUDFLARE_ZONE_ID: process.env.CLOUDFLARE_ZONE_ID || '',
    DOMAIN_NAME: process.env.DOMAIN_NAME || 'myimageupscaler.com',
    WORKER_NAME: process.env.WORKER_NAME || 'myimageupscaler',
    // Cron Job Authentication
    CRON_SECRET: process.env.CRON_SECRET || '',
    // Test Authentication
    TEST_AUTH_TOKEN: process.env.TEST_AUTH_TOKEN,

    // Model Assignments by Use Case
    MODEL_FOR_GENERAL_UPSCALE: process.env.MODEL_FOR_GENERAL_UPSCALE || 'real-esrgan',
    MODEL_FOR_PORTRAITS: process.env.MODEL_FOR_PORTRAITS || 'gfpgan',
    MODEL_FOR_DAMAGED_PHOTOS: process.env.MODEL_FOR_DAMAGED_PHOTOS || 'nano-banana-pro',
    MODEL_FOR_TEXT_LOGOS: process.env.MODEL_FOR_TEXT_LOGOS || 'nano-banana',
    MODEL_FOR_MAX_QUALITY: process.env.MODEL_FOR_MAX_QUALITY || 'clarity-upscaler',

    // Feature Flags
    ENABLE_AUTO_MODEL_SELECTION: process.env.ENABLE_AUTO_MODEL_SELECTION ?? 'true',
    ENABLE_PREMIUM_MODELS: process.env.ENABLE_PREMIUM_MODELS ?? 'true',

    // Email Providers
    BREVO_API_KEY: process.env.BREVO_API_KEY || '',
    RESEND_API_KEY: process.env.RESEND_API_KEY || '',
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS || 'noreply@myimageupscaler.com',
    SUPPORT_EMAIL:
      process.env.SUPPORT_EMAIL ||
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL ||
      'support@myimageupscaler.com',
    BASE_URL: process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    ALLOW_TRANSACTIONAL_EMAILS_IN_DEV: process.env.ALLOW_TRANSACTIONAL_EMAILS_IN_DEV ?? 'false',

    // Blog API
    BLOG_API_KEY: process.env.BLOG_API_KEY || '',

    // Model Version Overrides (optional)
    MODEL_VERSION_REAL_ESRGAN: process.env.MODEL_VERSION_REAL_ESRGAN,
    MODEL_VERSION_GFPGAN: process.env.MODEL_VERSION_GFPGAN,
    MODEL_VERSION_NANO_BANANA: process.env.MODEL_VERSION_NANO_BANANA,
    MODEL_VERSION_CLARITY_UPSCALER: process.env.MODEL_VERSION_CLARITY_UPSCALER,
    MODEL_VERSION_FLUX_2_PRO: process.env.MODEL_VERSION_FLUX_2_PRO,
    MODEL_VERSION_NANO_BANANA_PRO: process.env.MODEL_VERSION_NANO_BANANA_PRO,
    MODEL_VERSION_QWEN_IMAGE_EDIT: process.env.MODEL_VERSION_QWEN_IMAGE_EDIT,
    MODEL_VERSION_SEEDREAM: process.env.MODEL_VERSION_SEEDREAM,
    MODEL_VERSION_REALESRGAN_ANIME: process.env.MODEL_VERSION_REALESRGAN_ANIME,
    MODEL_VERSION_P_IMAGE_EDIT: process.env.MODEL_VERSION_P_IMAGE_EDIT,
    MODEL_VERSION_FLUX_KONTEXT_FAST: process.env.MODEL_VERSION_FLUX_KONTEXT_FAST,
  };

  return serverEnvSchema.parse(env);
}

/**
 * Server-side environment variables.
 * Only use in server components, API routes, and middleware.
 * These values are NEVER sent to the client.
 */
export const serverEnv = loadServerEnv();

/**
 * SEO API configuration
 * Separate export for cleaner imports in SEO-related modules
 */
export const seoConfig = {
  pagespeed: {
    apiKey: serverEnv.PAGESPEED_API_KEY,
  },
  serper: {
    apiKey: serverEnv.SERPER_DEV,
    apiUrl: serverEnv.SERPER_API_URL,
    rateLimitDelayMs: parseInt(serverEnv.SERPER_RATE_LIMIT_MS, 10),
  },
} as const;

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
 * NOTE: Checks process.env directly to handle dynamic environment changes during tests
 */
export function isTest(): boolean {
  // Check both the cached serverEnv and the raw process.env for dynamic test detection
  return (
    serverEnv.ENV === 'test' || process.env.ENV === 'test' || process.env.PLAYWRIGHT_TEST === 'true'
  );
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
