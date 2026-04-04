'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { analytics } from '@client/analytics/analyticsClient';
import { useCartPersistence } from './useCartPersistence';

const RECOVER_PARAM = 'recover';

interface IUseRecoveryCheckoutReturn {
  /** Whether recovery is in progress */
  isLoading: boolean;
  /** Whether recovery was successful */
  isSuccess: boolean;
  /** Recovery error if any */
  error: string | null;
  /** Recovered cart data */
  cartData: {
    priceId: string;
    purchaseType: 'subscription' | 'credit_pack';
    planKey?: string;
    packKey?: string;
    pricingRegion: string;
    discountPercent: number;
    originalAmountCents: number;
    currency: string;
  } | null;
  /** Discount code from recovery email */
  discountCode: string | null;
  /** Whether the recovery link was valid */
  isValid: boolean;
}

/**
 * Hook for handling recovery checkout flow.
 *
 * When a user clicks a recovery link from an email, they land on
 * the pricing or billing page with `?recover={checkoutId}` in the URL.
 * This hook fetches the checkout data, restores cart state, and applies discount.
 *
 * @example
 * ```tsx
 * const recovery = useRecoveryCheckout();
 *
 * if (recovery.isSuccess) {
 *   console.log('Cart restored:', recovery.cartData);
 *   if (recovery.discountCode) {
 *     console.log('Discount code:', recovery.discountCode);
 *   }
 * }
 * ```
 */
export function useRecoveryCheckout(): IUseRecoveryCheckoutReturn {
  const searchParams = useSearchParams();
  const { savePendingCheckout } = useCartPersistence();

  const [state, setState] = useState<{
    isLoading: boolean;
    isSuccess: boolean;
    error: string | null;
    cartData: IUseRecoveryCheckoutReturn['cartData'];
    discountCode: string | null;
    isValid: boolean;
  }>({
    isLoading: true,
    isSuccess: false,
    error: null,
    cartData: null,
    discountCode: null,
    isValid: false,
  });

  const checkoutId = searchParams?.get(RECOVER_PARAM);

  const recoverCheckout = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/checkout/recover/${id}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          setState(prev => ({
            ...prev,
            isLoading: false,
            isSuccess: false,
            error: data.error?.message || 'Failed to recover checkout',
            isValid: false,
          }));
          return;
        }

        // Restore cart state to localStorage
        if (data.data?.cartData) {
          savePendingCheckout({
            priceId: data.data.cartData.priceId,
            purchaseType: data.data.cartData.purchaseType,
            planKey: data.data.cartData.planKey,
            packKey: data.data.cartData.packKey,
            pricingRegion: data.data.cartData.pricingRegion,
            discountPercent: data.data.cartData.discountPercent,
            recoveryCode: data.data.discountCode,
            timestamp: Date.now(),
          });
        }

        // Track recovery
        analytics.track('checkout_recovered', {
          checkoutId: id,
          hasDiscount: Boolean(data.data.discountCode),
          isValid: data.data.isValid,
        });

        setState(prev => ({
          ...prev,
          isLoading: false,
          isSuccess: true,
          cartData: data.data.cartData,
          discountCode: data.data.discountCode,
          isValid: data.data.isValid,
        }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setState(prev => ({
          ...prev,
          isLoading: false,
          isSuccess: false,
          error: errorMessage,
          isValid: false,
        }));
      }
    },
    [savePendingCheckout]
  );

  useEffect(() => {
    if (checkoutId) {
      recoverCheckout(checkoutId);
    } else {
      setState(prev => ({
        ...prev,
        isLoading: false,
        isSuccess: false,
        isValid: false,
      }));
    }
  }, [checkoutId, recoverCheckout]);

  return {
    isLoading: state.isLoading,
    isSuccess: state.isSuccess,
    error: state.error,
    cartData: state.cartData,
    discountCode: state.discountCode,
    isValid: state.isValid,
  };
}
