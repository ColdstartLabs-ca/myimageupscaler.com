'use client';

import { useRouter } from 'next/navigation';
import { useUserStore } from '@client/store/userStore';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
import { prepareAuthRedirect } from '@client/utils/authRedirectManager';

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
}: IPricingCardProps): JSX.Element {
  const router = useRouter();
  const { isAuthenticated } = useUserStore();
  const { openAuthModal } = useModalStore();
  const { showToast } = useToastStore();

  const handleSubscribe = () => {
    if (disabled) return;

    if (onSelect) {
      onSelect();
      return;
    }

    const checkoutUrl = `/checkout?priceId=${encodeURIComponent(priceId)}&plan=${encodeURIComponent(name)}`;

    // If not authenticated, show auth modal and store redirect URL
    if (!isAuthenticated) {
      prepareAuthRedirect('checkout', {
        returnTo: checkoutUrl,
        context: { priceId, planName: name },
      });
      openAuthModal('login');
      showToast({
        message: 'Please sign in to complete your purchase',
        type: 'info',
      });
      return;
    }

    // User is authenticated, redirect to checkout
    router.push(checkoutUrl);
  };

  // Determine if this is the current plan (disabled but not scheduled)
  const isCurrentPlan = disabled && !scheduled;

  return (
    <div
      className={`relative bg-white rounded-2xl shadow-lg border-2 ${
        scheduled
          ? 'border-orange-500 ring-2 ring-orange-500 ring-opacity-20 opacity-90'
          : isCurrentPlan
            ? 'border-green-500 ring-2 ring-green-500 ring-opacity-20 opacity-90'
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
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-1 rounded-full text-sm font-medium">
          {disabledReason}
        </div>
      )}
      {!disabled && !scheduled && recommended && !trial?.enabled && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white px-4 py-1 rounded-full text-sm font-medium">
          Recommended
        </div>
      )}
      {!disabled && !scheduled && trial?.enabled && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-1 rounded-full text-sm font-medium">
          {trial.durationDays}-day free trial
        </div>
      )}
      <div className="p-8">
        <h2 className="text-2xl font-bold text-center text-slate-900 mb-2">{name}</h2>
        {description && <p className="text-center text-sm text-slate-600 mb-6">{description}</p>}

        <div className="text-center my-6">
          <div className="text-4xl font-bold text-slate-900">
            {currency === 'USD' ? '$' : currency}
            {price}
          </div>
          {interval && <div className="text-sm text-slate-600 mt-1">per {interval}</div>}
        </div>

        <div className="border-t border-slate-200 pt-6 mb-6"></div>

        <ul className="space-y-3 mb-8">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5"
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
              <span className="text-sm text-slate-700">{feature}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-2">
          <button
            onClick={handleSubscribe}
            disabled={disabled}
            className={`w-full py-3 px-6 rounded-lg font-medium transition-all duration-200 shadow-md ${
              scheduled
                ? 'bg-orange-200 text-orange-700 cursor-not-allowed'
                : isCurrentPlan
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-lg'
            }`}
          >
            {scheduled
              ? 'Scheduled'
              : isCurrentPlan
                ? 'Current Plan'
                : trial?.enabled
                  ? `Start ${trial.durationDays}-Day Trial`
                  : onSelect && currentSubscriptionPrice != null
                    ? price > currentSubscriptionPrice
                      ? 'Upgrade'
                      : 'Downgrade'
                    : 'Get Started'}
          </button>
          {scheduled && onCancelScheduled && (
            <button
              onClick={onCancelScheduled}
              disabled={cancelingScheduled}
              className="w-full py-2 px-6 rounded-lg font-medium text-sm text-orange-600 hover:text-orange-700 hover:bg-orange-50 border border-orange-200 transition-colors disabled:opacity-50"
            >
              {cancelingScheduled ? 'Canceling...' : 'Cancel Scheduled Change'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
