/**
 * Timeout configuration
 * Centralized constants for all timeout-related magic numbers (in milliseconds)
 */

export const TIMEOUTS = {
  // API timeouts
  API_DEFAULT_TIMEOUT: 30000,
  API_SHORT_TIMEOUT: 5000,
  API_UPLOAD_TIMEOUT: 60000,
  API_ANALYSIS_TIMEOUT: 10000,

  // Processing timeouts (from model-registry.ts)
  REAL_ESRGAN_PROCESSING_TIME: 2000,
  GFPGAN_PROCESSING_TIME: 5000,
  NANO_BANANA_PROCESSING_TIME: 3000,
  CLARITY_UPSCALER_PROCESSING_TIME: 15000,
  CLARITY_PRO_UPSCALER_PROCESSING_TIME: 20000,
  RECRAFT_CRISP_UPSCALE_PROCESSING_TIME: 5000,
  NANO_BANANA_2_PROCESSING_TIME: 8000,
  NANO_BANANA_PRO_PROCESSING_TIME: 30000,

  // Retry delays
  RETRY_DELAY_SHORT: 1000,
  RETRY_DELAY_MEDIUM: 3000,
  RETRY_DELAY_LONG: 5000,

  // Database timeouts
  DB_QUERY_TIMEOUT: 10000,
  DB_CONNECTION_TIMEOUT: 5000,

  // Cache timeouts
  CACHE_SHORT_TTL: 300000, // 5 minutes
  CACHE_MEDIUM_TTL: 1800000, // 30 minutes
  CACHE_LONG_TTL: 3600000, // 1 hour

  // Webhook timeouts
  WEBHOOK_TIMEOUT: 10000,
  WEBHOOK_RETRY_DELAY: 2000,

  // Rate limiting windows
  RATE_LIMIT_WINDOW: 60000, // 1 minute
  RATE_LIMIT_STRICT_WINDOW: 300000, // 5 minutes

  // Cron job timeouts
  CRON_JOB_TIMEOUT: 300000, // 5 minutes
  CRON_BATCH_PROCESSING_TIMEOUT: 600000, // 10 minutes

  // UI timeouts
  TOAST_AUTO_CLOSE_DELAY: 3000,
  TOAST_LONG_AUTO_CLOSE_DELAY: 5000,
  LOADING_TIMEOUT: 10000,
  DEBOUNCE_DELAY: 300,
  THROTTLE_DELAY: 1000,

  // Session timeouts
  SESSION_TIMEOUT: 3600000, // 1 hour
  IDLE_TIMEOUT: 900000, // 15 minutes
  TOKEN_REFRESH_TIMEOUT: 10000,

  // File operation timeouts
  FILE_UPLOAD_TIMEOUT: 120000, // 2 minutes
  FILE_PROCESSING_TIMEOUT: 180000, // 3 minutes
  FILE_DOWNLOAD_TIMEOUT: 60000, // 1 minute

  // Analytics timeouts
  ANALYTICS_BATCH_TIMEOUT: 5000,
  ANALYTICS_FLUSH_INTERVAL: 30000,

  // Third-party service timeouts
  STRIPE_TIMEOUT: 10000,
  REPLICATE_TIMEOUT: 300000, // 5 minutes
  GEMINI_TIMEOUT: 60000,
  SUPABASE_TIMEOUT: 10000,

  // Misc utility timeouts
  PING_TIMEOUT: 3000,
  HEALTH_CHECK_TIMEOUT: 5000,
  DNS_RESOLUTION_TIMEOUT: 10000,

  // Batch processing delays
  BATCH_REQUEST_DELAY: 12000, // 12 seconds between requests to avoid rate limits
  RATE_LIMIT_DELAY: 60000, // 1 minute for rate limit reset
} as const;

export type TimeoutConfig = typeof TIMEOUTS;

// Helper functions for converting to seconds/minutes
export const TIMEOUTS_IN_SECONDS = {
  ...Object.fromEntries(Object.entries(TIMEOUTS).map(([key, value]) => [key, value / 1000])),
} as const;

export const TIMEOUTS_IN_MINUTES = {
  ...Object.fromEntries(Object.entries(TIMEOUTS).map(([key, value]) => [key, value / 60000])),
} as const;
