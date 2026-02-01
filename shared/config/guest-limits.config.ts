/**
 * Guest Upscaler Limits Configuration
 *
 * Multi-layer abuse prevention with cost guarantees.
 * See docs/PRDs/guest-upscaler-pseo.md for rationale.
 */

export const GUEST_LIMITS = {
  // Layer 1: Global circuit breaker (CRITICAL - prevents runaway costs)
  // Max 500 guest upscales/day total = $0.85/day max spend
  GLOBAL_DAILY_LIMIT: 500,
  GLOBAL_DAILY_COST_CAP_USD: 0.85,

  // Layer 2: IP-based limits (server-enforced)
  IP_HOURLY_LIMIT: 10,
  IP_DAILY_LIMIT: 20,

  // Layer 3: Bot detection (many fingerprints from same IP)
  FINGERPRINTS_PER_IP_LIMIT: 5,

  // Layer 4: Client-side (UX only, not security)
  FINGERPRINT_DAILY_LIMIT: 3,

  // Processing limits
  MAX_FILE_SIZE_MB: 2,
  SCALE: 2 as const,
  MODEL: 'real-esrgan' as const,
} as const;

export type GuestLimits = typeof GUEST_LIMITS;
