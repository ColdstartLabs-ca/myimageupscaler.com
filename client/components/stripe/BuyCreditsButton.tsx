'use client';

import { useState } from 'react';
import { StripeService } from '@server/stripe';
import { useToastStore } from '@client/store/toastStore';
import { useModalStore } from '@client/store/modalStore';

interface IBuyCreditsButtonProps {
  priceId: string;
  creditsAmount: number;
  price: number;
  currency?: string;
  className?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Button component to initiate credit purchase
 *
 * Usage:
 * ```tsx
 * <BuyCreditsButton
 *   priceId="price_XXX"
 *   creditsAmount={100}
 *   price={9.99}
 *   currency="USD"
 * />
 * ```
 */
export function BuyCreditsButton({
  priceId,
  creditsAmount,
  price,
  currency = 'USD',
  className = '',
  onSuccess,
  onError,
}: IBuyCreditsButtonProps): JSX.Element {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToastStore();
  const { openAuthModal } = useModalStore();

  const handlePurchase = async () => {
    try {
      setLoading(true);
      await StripeService.redirectToCheckout(priceId, {
        metadata: {
          credits_amount: creditsAmount.toString(),
        },
        successUrl: `${window.location.origin}/success?credits=${creditsAmount}`,
        cancelUrl: window.location.href,
      });
      onSuccess?.();
    } catch (error: unknown) {
      console.error('Purchase error:', error);
      const err = error instanceof Error ? error : new Error('Failed to initiate purchase');
      onError?.(err);

      // Handle authentication errors
      if (err.message.includes('not authenticated')) {
        openAuthModal('register');
        return;
      }

      // Show user-friendly error toast
      showToast({
        message: err.message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePurchase}
      disabled={loading}
      className={`inline-flex items-center justify-center px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {loading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          Processing...
        </>
      ) : (
        <>
          Buy {creditsAmount} Credits - {currency} ${price.toFixed(2)}
        </>
      )}
    </button>
  );
}
