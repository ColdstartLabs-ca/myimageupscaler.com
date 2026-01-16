'use client';

import { Loader2 } from 'lucide-react';
import { CheckoutModal } from './CheckoutModal';
import { useCheckoutFlow } from '@client/hooks/useCheckoutFlow';

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

// --- Helper Functions (SRP: separate logic from rendering) ---

interface IBadgeConfig {
  show: boolean;
  text: string;
  colorClass: string;
}

function getBadgeConfig(
  disabled: boolean,
  scheduled: boolean,
  recommended: boolean,
  disabledReason: string,
  trial?: { enabled: boolean; durationDays: number }
): IBadgeConfig {
  const isCurrentPlan = disabled && !scheduled;

  if (scheduled) {
    return { show: true, text: 'Scheduled', colorClass: 'bg-warning' };
  }
  if (isCurrentPlan) {
    return { show: true, text: disabledReason, colorClass: 'bg-success' };
  }
  if (trial?.enabled) {
    return { show: true, text: `${trial.durationDays}-day free trial`, colorClass: 'bg-success' };
  }
  if (recommended) {
    return { show: true, text: 'Recommended', colorClass: 'bg-accent' };
  }
  return { show: false, text: '', colorClass: '' };
}

function getButtonText(
  isProcessing: boolean,
  loading: boolean,
  hasError: boolean,
  retryCount: number,
  scheduled: boolean,
  isCurrentPlan: boolean,
  trial?: { enabled: boolean; durationDays: number },
  onSelect?: () => void,
  currentSubscriptionPrice?: number | null,
  price?: number
): string | JSX.Element {
  if (isProcessing || loading) {
    return (
      <>
        <Loader2 size={16} className="animate-spin" />
        {'Processing...'}
      </>
    );
  }
  if (hasError) {
    if (retryCount >= 3) return 'Maximum Attempts Reached';
    if (retryCount === 2) return 'Retry (2/3)';
    return 'Try Again';
  }
  if (scheduled) return 'Scheduled';
  if (isCurrentPlan) return 'Current Plan';
  if (trial?.enabled) return `Start ${trial.durationDays}-Day Trial`;
  if (onSelect && currentSubscriptionPrice != null && price != null) {
    return price > currentSubscriptionPrice ? 'Upgrade' : 'Downgrade';
  }
  return 'Get Started';
}

function getCardBorderClasses(
  scheduled: boolean,
  isCurrentPlan: boolean,
  recommended: boolean
): string {
  if (scheduled) {
    return 'border-warning ring-2 ring-warning ring-opacity-20 opacity-90';
  }
  if (isCurrentPlan) {
    return 'border-success ring-2 ring-success ring-opacity-20 opacity-90';
  }
  if (recommended) {
    return 'border-accent ring-2 ring-accent ring-opacity-20';
  }
  return 'border-surface-light';
}

function getButtonClasses(
  scheduled: boolean,
  isCurrentPlan: boolean,
  hasError: boolean,
  isProcessing: boolean,
  loading: boolean
): string {
  const baseClasses = 'w-full py-3 px-6 rounded-lg font-medium transition-all duration-200';

  if (scheduled) {
    return `${baseClasses} bg-warning/20 text-warning cursor-not-allowed`;
  }
  if (isCurrentPlan) {
    return `${baseClasses} bg-surface-light text-text-muted cursor-not-allowed`;
  }
  if (hasError) {
    return `${baseClasses} bg-error/80 hover:bg-error/90 text-white`;
  }
  if (isProcessing || loading) {
    return `${baseClasses} bg-surface-light text-text-muted cursor-not-allowed`;
  }
  return `${baseClasses} bg-accent hover:bg-accent-hover text-white shadow-md hover:shadow-lg`;
}

// --- Component ---

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
  const {
    handleCheckout,
    isProcessing,
    hasError,
    retryCount,
    showCheckoutModal,
    closeCheckoutModal,
    handleCheckoutSuccess,
  } = useCheckoutFlow({
    priceId,
    onSelect,
    disabled,
  });

  const isCurrentPlan = disabled && !scheduled;
  const badge = getBadgeConfig(disabled, scheduled, recommended, disabledReason, trial);
  const buttonText = getButtonText(
    isProcessing,
    loading,
    hasError,
    retryCount,
    scheduled,
    isCurrentPlan,
    trial,
    onSelect,
    currentSubscriptionPrice,
    price
  );

  return (
    <div
      className={`relative bg-surface rounded-2xl shadow-lg border-2 ${getCardBorderClasses(scheduled, isCurrentPlan, recommended)}`}
    >
      {/* Badge */}
      {badge.show && (
        <div
          className={`absolute -top-3 left-1/2 -translate-x-1/2 ${badge.colorClass} text-white px-4 py-1 rounded-full text-sm font-medium`}
        >
          {badge.text}
        </div>
      )}

      <div className="p-8">
        <h2 className="text-2xl font-bold text-center text-text-primary mb-2">{name}</h2>
        {description && (
          <p className="text-center text-sm text-text-secondary mb-6">{description}</p>
        )}

        <div className="text-center my-6">
          <div className="text-4xl font-bold text-text-primary">
            {currency === 'USD' ? '$' : currency}
            {price}
          </div>
          {interval && <div className="text-sm text-text-secondary mt-1">per {interval}</div>}
        </div>

        <div className="border-t border-surface-light pt-6 mb-6"></div>

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
              <span className="text-sm text-text-primary">{feature}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-2">
          <button
            onClick={handleCheckout}
            disabled={disabled || isProcessing || loading || retryCount >= 3}
            className={getButtonClasses(scheduled, isCurrentPlan, hasError, isProcessing, loading)}
          >
            {buttonText}
          </button>
          {scheduled && onCancelScheduled && (
            <button
              onClick={onCancelScheduled}
              disabled={cancelingScheduled}
              className="w-full py-2 px-6 rounded-lg font-medium text-sm text-warning hover:text-warning/90 hover:bg-warning/20 border border-warning/30 transition-colors disabled:opacity-50"
            >
              {cancelingScheduled ? 'Canceling...' : 'Cancel Scheduled Change'}
            </button>
          )}
        </div>
      </div>

      {/* Checkout Modal */}
      {showCheckoutModal && (
        <CheckoutModal
          priceId={priceId}
          onClose={closeCheckoutModal}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </div>
  );
}
