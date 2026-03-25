/**
 * A/B Testing Utility
 *
 * Provides deterministic variant assignment for experiments.
 * Uses a simple hash function to assign users to variants consistently.
 *
 * Key features:
 * - Deterministic: same user + experiment always gets same variant
 * - Stable: user ID persists in localStorage across sessions
 * - Even distribution: hash-based assignment distributes variants evenly
 * - No external dependencies: simple djb2 hash algorithm
 */

const STORAGE_KEY = 'miu_ab_user_id';

/**
 * Simple DJB2 hash function for deterministic variant assignment
 *
 * @param str - String to hash (combination of user ID + experiment name)
 * @returns Numeric hash value
 */
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i); // hash * 33 + char
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Get or create a stable anonymous user ID for A/B testing
 *
 * The ID persists in localStorage across sessions, ensuring consistent
 * variant assignment for the same user across experiments.
 *
 * @returns Stable user ID for A/B testing
 */
export function getUserId(): string {
  // Server-side rendering check
  if (typeof window === 'undefined') {
    return 'server-side';
  }

  try {
    let userId = localStorage.getItem(STORAGE_KEY);

    if (!userId) {
      // Generate new user ID: timestamp + random suffix
      userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(STORAGE_KEY, userId);
    }

    return userId;
  } catch {
    // Fallback if localStorage is unavailable (e.g., private browsing)
    return `fallback_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Get the variant for a given experiment
 *
 * Assignment is deterministic: the same user will always get the same
 * variant for the same experiment. This is achieved by hashing the
 * combination of user ID and experiment name.
 *
 * @param experimentName - Unique identifier for the experiment
 * @param variants - Array of variant names to choose from
 * @returns The assigned variant name
 *
 * @example
 * ```ts
 * const variant = getVariant('upgrade-copy-test', ['control', 'variant_a', 'variant_b']);
 * // Returns 'control', 'variant_a', or 'variant_b' consistently for the same user
 * ```
 */
export function getVariant(experimentName: string, variants: string[]): string {
  if (!variants.length) {
    throw new Error('Variants array must not be empty');
  }

  if (variants.length === 1) {
    return variants[0];
  }

  const userId = getUserId();
  const hashInput = `${userId}:${experimentName}`;
  const hash = djb2Hash(hashInput);

  // Use modulo to map hash to variant index
  const variantIndex = hash % variants.length;

  return variants[variantIndex];
}

/**
 * Check if a user is in a specific variant for an experiment
 *
 * Convenience function for boolean checks in conditionals.
 *
 * @param experimentName - Unique identifier for the experiment
 * @param variants - Array of variant names to choose from
 * @param targetVariant - The variant to check against
 * @returns True if the user is assigned to the target variant
 *
 * @example
 * ```ts
 * if (isVariant('upgrade-copy-test', ['control', 'variant_a'], 'variant_a')) {
 *   // Show variant A content
 * }
 * ```
 */
export function isVariant(
  experimentName: string,
  variants: string[],
  targetVariant: string
): boolean {
  return getVariant(experimentName, variants) === targetVariant;
}
