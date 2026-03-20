'use client';

import { useState, useEffect, useCallback } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import { useCartPersistence } from './useCartPersistence';
import { ICheckoutLocalStorage, RESTORE_BANNER_SHOWN_KEY } from '@shared/types/cart.types';

interface IUseRestoreCartOptions {
  /** Callback when user clicks restore - receives the pending checkout data */
  onRestore?: (checkout: ICheckoutLocalStorage) => void;
  /** URL to navigate to when restoring (default: '/dashboard/billing') */
  restoreUrl?: string;
}

interface IUseRestoreCartReturn {
  /** Whether to show the restore banner */
  showRestoreBanner: boolean;
  /** The pending checkout data, if any */
  pendingCart: ICheckoutLocalStorage | null;
  /** Handle restore button click */
  handleRestore: () => void;
  /** Handle dismiss button click */
  handleDismiss: () => void;
  /** Force check for pending checkout (useful after page navigation) */
  checkForPendingCheckout: () => void;
}

/**
 * Hook for managing cart restoration UI and logic.
 *
 * On pricing page load, checks localStorage for pending checkout.
 * Shows restoration banner if found, not expired (7 days), and not already shown this session.
 *
 * @example
 * ```tsx
 * const { showRestoreBanner, pendingCart, handleRestore, handleDismiss } = useRestoreCart({
 *   onRestore: (checkout) => {
 *     // Navigate to checkout with the saved data
 *     router.push(`/checkout?priceId=${checkout.priceId}`);
 *   },
 * });
 *
 * if (showRestoreBanner && pendingCart) {
 *   return <CompletePurchaseBanner checkout={pendingCart} onRestore={handleRestore} onDismiss={handleDismiss} />;
 * }
 * ```
 */
export function useRestoreCart(options: IUseRestoreCartOptions = {}): IUseRestoreCartReturn {
  const { onRestore, restoreUrl = '/dashboard/billing' } = options;
  const { getPendingCheckout, clearPendingCheckout } = useCartPersistence();

  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [pendingCart, setPendingCart] = useState<ICheckoutLocalStorage | null>(null);

  const checkForPendingCheckout = useCallback(() => {
    if (typeof window === 'undefined') return;

    // Check if banner was already shown this session
    const alreadyShownThisSession = sessionStorage.getItem(RESTORE_BANNER_SHOWN_KEY);
    if (alreadyShownThisSession) {
      return;
    }

    // Check for pending checkout
    const checkout = getPendingCheckout();
    if (!checkout) {
      return;
    }

    // Mark as shown this session
    sessionStorage.setItem(RESTORE_BANNER_SHOWN_KEY, 'true');

    // Show the banner
    setPendingCart(checkout);
    setShowRestoreBanner(true);

    // Track analytics
    analytics.track('recovery_banner_shown', {
      planKey: checkout.planKey,
      packKey: checkout.packKey,
      hasDiscountCode: Boolean(checkout.recoveryCode),
    });
  }, [getPendingCheckout]);

  // Check on mount
  useEffect(() => {
    checkForPendingCheckout();
  }, [checkForPendingCheckout]);

  const handleRestore = useCallback(() => {
    if (!pendingCart) return;

    // Track analytics
    analytics.track('recovery_banner_clicked', {
      planKey: pendingCart.planKey,
      packKey: pendingCart.packKey,
      hasDiscountCode: Boolean(pendingCart.recoveryCode),
    });

    // Clear the pending checkout (it will be re-saved if user abandons again)
    clearPendingCheckout();

    // Hide the banner
    setShowRestoreBanner(false);

    // Call callback or navigate
    if (onRestore) {
      onRestore(pendingCart);
    } else {
      // Build URL with checkout context
      const url = new URL(restoreUrl, window.location.origin);
      url.searchParams.set('priceId', pendingCart.priceId);
      if (pendingCart.recoveryCode) {
        url.searchParams.set('recoveryCode', pendingCart.recoveryCode);
      }
      window.location.href = url.toString();
    }
  }, [pendingCart, onRestore, clearPendingCheckout, restoreUrl]);

  const handleDismiss = useCallback(() => {
    // Track dismissal
    analytics.track('recovery_banner_dismissed', {
      planKey: pendingCart?.planKey,
      packKey: pendingCart?.packKey,
      hasDiscountCode: Boolean(pendingCart?.recoveryCode),
    });

    // Clear the pending checkout
    clearPendingCheckout();

    // Hide the banner
    setShowRestoreBanner(false);
    setPendingCart(null);
  }, [pendingCart, clearPendingCheckout]);

  return {
    showRestoreBanner,
    pendingCart,
    handleRestore,
    handleDismiss,
    checkForPendingCheckout,
  };
}
