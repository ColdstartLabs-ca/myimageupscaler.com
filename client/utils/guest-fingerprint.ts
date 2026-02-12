/**
 * Guest Fingerprinting and Usage Tracking
 *
 * Client-side fingerprinting for UX purposes.
 * Server-side rate limiting provides the actual security.
 */

const STORAGE_KEY = 'miu_guest_usage';
const DAILY_LIMIT = 3;

// Dynamically import FingerprintJS to code-split this heavy library (~45KB)
let FingerprintJS: typeof import('@fingerprintjs/fingerprintjs') | null = null;

export interface IGuestUsage {
  fingerprint: string;
  dailyCount: number;
  lastResetDate: string;
  totalCount: number;
  firstUsedAt: string;
}

let fingerprintPromise: Promise<string> | null = null;

/**
 * Get the visitor ID from FingerprintJS
 * Cached to avoid multiple initializations
 */
export async function getVisitorId(): Promise<string> {
  if (!fingerprintPromise) {
    fingerprintPromise = (async () => {
      try {
        // Dynamic import to code-split FingerprintJS (~45KB)
        if (!FingerprintJS) {
          FingerprintJS = await import('@fingerprintjs/fingerprintjs');
        }
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        return result.visitorId;
      } catch (error) {
        // Fallback to timestamp-based ID if fingerprinting fails
        console.warn('FingerprintJS failed, using fallback:', error);
        return `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
    })();
  }
  return fingerprintPromise;
}

/**
 * Get guest usage from localStorage
 */
export function getGuestUsage(): IGuestUsage | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Check if guest can process (client-side check for UX)
 */
export function canProcessAsGuest(usage: IGuestUsage | null): boolean {
  if (!usage) return true; // First-time user

  const today = new Date().toISOString().split('T')[0];
  if (usage.lastResetDate !== today) return true; // New day

  return usage.dailyCount < DAILY_LIMIT;
}

/**
 * Increment guest usage after successful processing
 */
export function incrementGuestUsage(visitorId: string): IGuestUsage {
  const today = new Date().toISOString().split('T')[0];
  const existing = getGuestUsage();

  const usage: IGuestUsage =
    existing && existing.fingerprint === visitorId
      ? {
          ...existing,
          dailyCount: existing.lastResetDate === today ? existing.dailyCount + 1 : 1,
          lastResetDate: today,
          totalCount: existing.totalCount + 1,
        }
      : {
          fingerprint: visitorId,
          dailyCount: 1,
          lastResetDate: today,
          totalCount: 1,
          firstUsedAt: new Date().toISOString(),
        };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // Ignore localStorage errors (e.g., private browsing)
  }

  return usage;
}

/**
 * Get remaining uses for the day
 */
export function getRemainingUses(usage: IGuestUsage | null): number {
  if (!usage) return DAILY_LIMIT;

  const today = new Date().toISOString().split('T')[0];
  if (usage.lastResetDate !== today) return DAILY_LIMIT;

  return Math.max(0, DAILY_LIMIT - usage.dailyCount);
}
