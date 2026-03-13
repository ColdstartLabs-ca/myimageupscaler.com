'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '@client/store/userStore';

export type TCheckoutVariant = 'modal' | 'page';

interface IUseCheckoutVariantReturn {
  variant: TCheckoutVariant;
  isLoading: boolean;
}

const CHECKOUT_VARIANT_STORAGE_KEY = 'checkout_variant';

/**
 * Simple hash function that produces consistent results for the same input.
 * Uses a djb2-like algorithm for good distribution.
 */
function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash * 33) ^ char;
  }
  return Math.abs(hash >>> 0); // Convert to unsigned 32-bit integer
}

/**
 * Determines checkout variant for A/B testing.
 *
 * Allocation strategy:
 * - Uses user ID if available (authenticated users)
 * - Falls back to anonymous ID from localStorage
 * - Generates a stable ID if neither exists
 * - 50/50 split based on user ID hash (stable per user)
 * - Stored in localStorage for consistency across sessions
 *
 * @returns Object with variant ('modal' or 'page') and loading state
 */
export function useCheckoutVariant(): IUseCheckoutVariantReturn {
  const userId = useUserStore(state => state.user?.id);
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  const authLoading = useUserStore(state => state.isLoading);

  const [variant, setVariant] = useState<TCheckoutVariant>('modal');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Wait for auth to finish loading to ensure we have user ID if available
    if (authLoading) {
      return;
    }

    // Check localStorage for existing variant assignment (consistent across sessions)
    try {
      const storedVariant = localStorage.getItem(CHECKOUT_VARIANT_STORAGE_KEY);
      if (storedVariant === 'modal' || storedVariant === 'page') {
        setVariant(storedVariant);
        setIsLoading(false);
        return;
      }
    } catch {
      // localStorage not available, continue with allocation
    }

    // Determine the identifier to use for hash-based allocation
    let identifier: string;

    if (userId) {
      // Use authenticated user ID
      identifier = userId;
    } else {
      // Try to get or create an anonymous ID
      try {
        let anonymousId = localStorage.getItem('anonymous_id');
        if (!anonymousId) {
          // Generate a stable anonymous ID
          anonymousId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
          localStorage.setItem('anonymous_id', anonymousId);
        }
        identifier = anonymousId;
      } catch {
        // Fallback to session-based identifier if localStorage unavailable
        identifier = `session_${Date.now()}`;
      }
    }

    // Hash the identifier and assign variant based on even/odd
    const hash = simpleHash(identifier);
    const assignedVariant: TCheckoutVariant = hash % 2 === 0 ? 'modal' : 'page';

    // Store the variant for consistency
    try {
      localStorage.setItem(CHECKOUT_VARIANT_STORAGE_KEY, assignedVariant);
    } catch {
      // Storage not available, variant won't persist but will be recalculated consistently
    }

    setVariant(assignedVariant);
    setIsLoading(false);
  }, [userId, isAuthenticated, authLoading]);

  return { variant, isLoading };
}
