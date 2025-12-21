'use client';

import { Loader2 } from 'lucide-react';
import { useUserStore } from '@client/store/userStore';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
import { StripeService } from '@client/services/stripeService';
import { useState, useCallback, useRef, useEffect } from 'react';

interface IPricingCardProps {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  interval?: 'month' | 'year';
  features: readonly string[];
  priceId: string;
  recommended?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Whether this plan is scheduled (pending downgrade) */
  scheduled?: boolean;
  /** Handler for canceling a scheduled change */
  onCancelScheduled?: () => void;
  /** Whether cancel is in progress */
  cancelingScheduled?: boolean;
  onSelect?: () => void;
  trial?: {
    enabled: boolean;
    durationDays: number;
  };
  /** Current user's subscription price (for Upgrade/Downgrade text) */
  currentSubscriptionPrice?: number | null;
  /** Whether the subscribe button is in loading state */
  loading?: boolean;
}

/**
 * Pricing card component for displaying subscription plans only
 *
 * Usage:
 * ```tsx
 * <PricingCard
 *   name="Pro Plan"
 *   description="Perfect for professionals"
 *   price={29}
 *   interval="month"
 *   features={["1000 credits per month", "Priority support"]}
 *   priceId="price_XXX"
 *   recommended={true}
 * />
 * ```
 */
export function PricingCard({
  name,
  description,
  price,
  currency = 'USD',
  interval,
  features,
  priceId,
  recommended = false,
  disabled = false,
  disabledReason = 'Current Plan',
  scheduled = false,
  onCancelScheduled,
  cancelingScheduled = false,
  onSelect,
  trial,
  currentSubscriptionPrice,
  loading = false,
}: IPricingCardProps): JSX.Element {
  const { isAuthenticated } = useUserStore();
  const { openAuthModal } = useModalStore();
  const { showToast } = useToastStore();

  // Local state for error handling and debouncing
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Enhanced handleSubscribe with proper error handling and debouncing
  const handleSubscribe = useCallback(async () => {
    // Prevent rapid clicking
    if (disabled || isProcessing) return;

    // Debounce rapid clicks - only allow one click per 500ms
    const now = Date.now();
    if (now - lastClickTime < 500) {
      return;
    }
    setLastClickTime(now);

    // Clear any existing timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    setIsProcessing(true);
    setHasError(false);

    try {
      if (onSelect) {
        // Small delay to show loading state, then call onSelect and reset
        await new Promise(resolve => setTimeout(resolve, 100));
        onSelect();
        setIsProcessing(false);
        return;
      }

      // Get current URLs for success/cancel
      const successUrl = `${window.location.origin}/success`;
      const cancelUrl = window.location.href;

      // If not authenticated, handle auth error as expected by tests
      if (!isAuthenticated) {
        // Update URL to show checkout attempt
        window.history.replaceState({}, '', `${cancelUrl}?checkout_price=${priceId}`);
        openAuthModal('login');
        showToast({
          message: 'Please sign in to complete your purchase',
          type: 'info',
        });
        return;
      }

      // User is authenticated, use StripeService to redirect to checkout
      await StripeService.redirectToCheckout(priceId, {
        successUrl,
        cancelUrl,
      });

      // Reset processing state after successful checkout (for tests)
      setIsProcessing(false);
    } catch (error) {
      console.error('Error during subscription process:', error);
      setHasError(true);
      setRetryCount(prev => {
        const newCount = prev + 1;
        // Limit retries to 3 attempts
        if (newCount >= 3) {
          showToast({
            message: 'Multiple failed attempts. Please refresh the page and try again.',
            type: 'error',
          });
        }
        return newCount;
      });

      // Handle authentication errors by opening auth modal
      if (
        error instanceof Error &&
        (error.message.includes('User not authenticated') ||
          error.message.includes('Missing authorization header') ||
          error.message.includes('Invalid authentication token'))
      ) {
        window.history.replaceState({}, '', `${window.location.href}?checkout_price=${priceId}`);
        openAuthModal('login');
        setIsProcessing(false);
        return;
      }

      // Enhanced error handling for different error types
      if (error instanceof Error) {
        if (error.message.includes('fetch') || error.message.includes('network')) {
          showToast({
            message: 'Network error. Please check your connection and try again.',
            type: 'error',
          });
        } else if (error.message.includes('Failed to fetch')) {
          showToast({
            message: 'Unable to connect to server. Please try again later.',
            type: 'error',
          });
        } else {
          showToast({
            message: error.message || 'Failed to initiate checkout',
            type: 'error',
          });
        }
      } else {
        showToast({
          message: 'Failed to initiate checkout',
          type: 'error',
        });
      }

      // Reset processing state after error (longer delay for visibility)
      setTimeout(() => {
        setIsProcessing(false);
      }, 2000);
    }
  }, [
    disabled,
    isProcessing,
    onSelect,
    priceId,
    isAuthenticated,
    openAuthModal,
    showToast,
    lastClickTime,
  ]);

  // Cleanup timeout on unmount
  useEffect(() => {
    const currentTimeout = clickTimeoutRef.current;
    return () => {
      if (currentTimeout) {
        clearTimeout(currentTimeout);
      }
    };
  }, []);

  // Determine if this is the current plan (disabled but not scheduled)
  const isCurrentPlan = disabled && !scheduled;

  return (
    <div
      className={`relative bg-white rounded-2xl shadow-lg border-2 ${
        scheduled
          ? 'border-orange-500 ring-2 ring-orange-500 ring-opacity-20 opacity-90'
          : isCurrentPlan
            ? 'border-emerald-500 ring-2 ring-emerald-500 ring-opacity-20 opacity-90'
            : recommended
              ? 'border-indigo-500 ring-2 ring-indigo-500 ring-opacity-20'
              : 'border-slate-200'
      }`}
    >
      {scheduled && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white px-4 py-1 rounded-full text-sm font-medium">
          Scheduled
        </div>
      )}
      {isCurrentPlan && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-1 rounded-full text-sm font-medium">
          {disabledReason}
        </div>
      )}
      {!disabled && !scheduled && recommended && !trial?.enabled && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white px-4 py-1 rounded-full text-sm font-medium">
          Recommended
        </div>
      )}
      {!disabled && !scheduled && trial?.enabled && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-1 rounded-full text-sm font-medium">
          {trial.durationDays}-day free trial
        </div>
      )}
      <div className="p-8">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">{name}</h2>
        {description && <p className="text-center text-sm text-gray-600 mb-6">{description}</p>}

        <div className="text-center my-6">
          <div className="text-4xl font-bold text-gray-900">
            {currency === 'USD' ? '$' : currency}
            {price}
          </div>
          {interval && <div className="text-sm text-gray-600 mt-1">per {interval}</div>}
        </div>

        <div className="border-t border-gray-200 pt-6 mb-6"></div>

        <ul className="space-y-3 mb-8">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <svg
                data-testid="checkmark-icon"
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-sm text-gray-700">{feature}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-2">
          <button
            onClick={handleSubscribe}
            disabled={disabled || isProcessing || loading || retryCount >= 3}
            className={`w-full py-3 px-6 rounded-lg font-medium transition-all duration-200 ${
              scheduled
                ? 'bg-orange-500/20 text-orange-400 cursor-not-allowed'
                : isCurrentPlan
                  ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                  : hasError
                    ? 'bg-red-500/80 hover:bg-red-600 text-white'
                    : isProcessing || loading
                      ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg'
            }`}
          >
            {isProcessing || loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {hasError ? 'Retrying...' : 'Processing...'}
              </>
            ) : hasError ? (
              retryCount >= 3 ? (
                'Maximum Attempts Reached'
              ) : retryCount > 0 ? (
                `Retry (${retryCount}/3)`
              ) : (
                'Try Again'
              )
            ) : scheduled ? (
              'Scheduled'
            ) : isCurrentPlan ? (
              'Current Plan'
            ) : trial?.enabled ? (
              `Start ${trial.durationDays}-Day Trial`
            ) : onSelect && currentSubscriptionPrice != null ? (
              price > currentSubscriptionPrice ? (
                'Upgrade'
              ) : (
                'Downgrade'
              )
            ) : (
              'Get Started'
            )}
          </button>
          {scheduled && onCancelScheduled && (
            <button
              onClick={onCancelScheduled}
              disabled={cancelingScheduled}
              className="w-full py-2 px-6 rounded-lg font-medium text-sm text-orange-400 hover:text-orange-300 hover:bg-orange-500/20 border border-orange-500/30 transition-colors disabled:opacity-50"
            >
              {cancelingScheduled ? 'Canceling...' : 'Cancel Scheduled Change'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
