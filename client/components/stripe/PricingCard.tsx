'use client';

import { useState } from 'react';
import { StripeService } from '@server/stripe';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';

interface IPricingCardProps {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  interval?: 'month' | 'year' | null;
  features: readonly string[];
  priceId: string;
  recommended?: boolean;
  creditsAmount?: number;
}

/**
 * Pricing card component for displaying subscription or credit packages
 *
 * Usage:
 * ```tsx
 * <PricingCard
 *   name="Pro Plan"
 *   description="Perfect for professionals"
 *   price={29}
 *   interval="month"
 *   features={["Unlimited projects", "Priority support"]}
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
  creditsAmount,
}: IPricingCardProps): JSX.Element {
  const [loading, setLoading] = useState(false);
  const { openAuthModal } = useModalStore();
  const { showToast } = useToastStore();

  const handleSubscribe = async () => {
    try {
      setLoading(true);

      // Store intended purchase for post-auth redirect
      sessionStorage.setItem(
        'intendedPurchase',
        JSON.stringify({
          priceId,
          planName: name,
          successUrl: `${window.location.origin}/success`,
          cancelUrl: window.location.href,
        })
      );

      await StripeService.redirectToCheckout(priceId, {
        metadata: creditsAmount ? { credits_amount: creditsAmount.toString() } : {},
        successUrl: `${window.location.origin}/success`,
        cancelUrl: window.location.href,
      });
    } catch (error: unknown) {
      console.error('Checkout error:', error);

      // Handle authentication errors
      if (error instanceof Error && error.message.includes('not authenticated')) {
        openAuthModal('register');
        return;
      }

      // Show user-friendly error
      const errorMessage = error instanceof Error ? error.message : 'Failed to initiate checkout';
      showToast({
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`relative bg-white rounded-2xl shadow-lg border-2 ${recommended ? 'border-indigo-500 ring-2 ring-indigo-500 ring-opacity-20' : 'border-slate-200'}`}
    >
      {recommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white px-4 py-1 rounded-full text-sm font-medium">
          Recommended
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
          {creditsAmount && (
            <div className="text-sm text-slate-600 mt-1">{creditsAmount} credits</div>
          )}
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

        <div className="mt-auto">
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className={`w-full py-3 px-6 rounded-lg font-medium transition-all duration-200 ${
              loading
                ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg'
            }`}
          >
            {loading ? 'Processing...' : interval ? 'Subscribe Now' : 'Buy Credits'}
          </button>
        </div>
      </div>
    </div>
  );
}
