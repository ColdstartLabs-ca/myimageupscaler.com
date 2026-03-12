'use client';

import { useCallback } from 'react';
import {
  ICheckoutLocalStorage,
  PENDING_CHECKOUT_KEY,
  CHECKOUT_EXPIRATION_MS,
} from '@shared/types/cart.types';

/**
 * Hook for managing cart/checkout persistence in localStorage.
 * Provides methods to save, retrieve, and clear pending checkout data.
 *
 * @example
 * ```tsx
 * const { savePendingCheckout, getPendingCheckout, clearPendingCheckout, hasExpiredCheckout } = useCartPersistence();
 *
 * // Save checkout when user starts checkout flow
 * savePendingCheckout({
 *   priceId: 'price_123',
 *   purchaseType: 'subscription',
 *   planKey: 'pro',
 *   pricingRegion: 'standard',
 *   discountPercent: 0,
 *   timestamp: Date.now(),
 * });
 *
 * // Check for expired checkout
 * if (hasExpiredCheckout()) {
 *   clearPendingCheckout();
 * }
 * ```
 */
export function useCartPersistence(): {
  savePendingCheckout: (
    checkout: Omit<ICheckoutLocalStorage, 'timestamp'> & { timestamp?: number }
  ) => void;
  getPendingCheckout: () => ICheckoutLocalStorage | null;
  clearPendingCheckout: () => void;
  hasExpiredCheckout: () => boolean;
  setRecoveryCode: (recoveryCode: string) => void;
} {
  /**
   * Save pending checkout data to localStorage.
   * Automatically adds timestamp if not provided.
   */
  const savePendingCheckout = useCallback(
    (checkout: Omit<ICheckoutLocalStorage, 'timestamp'> & { timestamp?: number }): void => {
      if (typeof window === 'undefined') return;

      try {
        const data: ICheckoutLocalStorage = {
          ...checkout,
          timestamp: checkout.timestamp ?? Date.now(),
        };
        localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(data));
      } catch (error) {
        console.warn('[useCartPersistence] Failed to save pending checkout:', error);
      }
    },
    []
  );

  /**
   * Get pending checkout data from localStorage.
   * Returns null if no data exists or if it has expired.
   */
  const getPendingCheckout = useCallback((): ICheckoutLocalStorage | null => {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(PENDING_CHECKOUT_KEY);
      if (!stored) return null;

      const data = JSON.parse(stored) as ICheckoutLocalStorage;

      // Check if expired
      if (Date.now() - data.timestamp > CHECKOUT_EXPIRATION_MS) {
        localStorage.removeItem(PENDING_CHECKOUT_KEY);
        return null;
      }

      return data;
    } catch (error) {
      console.warn('[useCartPersistence] Failed to get pending checkout:', error);
      return null;
    }
  }, []);

  /**
   * Clear pending checkout data from localStorage.
   */
  const clearPendingCheckout = useCallback((): void => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(PENDING_CHECKOUT_KEY);
    } catch (error) {
      console.warn('[useCartPersistence] Failed to clear pending checkout:', error);
    }
  }, []);

  /**
   * Check if there is an expired checkout in localStorage.
   * Does NOT clear it automatically - call clearPendingCheckout if needed.
   */
  const hasExpiredCheckout = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;

    try {
      const stored = localStorage.getItem(PENDING_CHECKOUT_KEY);
      if (!stored) return false;

      const data = JSON.parse(stored) as ICheckoutLocalStorage;
      return Date.now() - data.timestamp > CHECKOUT_EXPIRATION_MS;
    } catch {
      return false;
    }
  }, []);

  /**
   * Update pending checkout with recovery code from email link.
   * Preserves existing data, just adds the recovery code.
   */
  const setRecoveryCode = useCallback((recoveryCode: string): void => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(PENDING_CHECKOUT_KEY);
      if (!stored) return;

      const data = JSON.parse(stored) as ICheckoutLocalStorage;
      data.recoveryCode = recoveryCode;
      localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('[useCartPersistence] Failed to set recovery code:', error);
    }
  }, []);

  return {
    savePendingCheckout,
    getPendingCheckout,
    clearPendingCheckout,
    hasExpiredCheckout,
    setRecoveryCode,
  };
}
