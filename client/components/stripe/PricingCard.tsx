'use client';

import { useState } from 'react';
import { StripeService } from '@server/stripe';

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

  const handleSubscribe = async () => {
    try {
      setLoading(true);
      await StripeService.redirectToCheckout(priceId, {
        metadata: creditsAmount ? { credits_amount: creditsAmount.toString() } : {},
        successUrl: `${window.location.origin}/success`,
        cancelUrl: window.location.href,
      });
    } catch (error: unknown) {
      console.error('Checkout error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to initiate checkout';
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`card bg-base-100 shadow-xl ${recommended ? 'border-2 border-primary' : ''}`}>
      {recommended && (
        <div className="badge badge-primary absolute -top-3 left-1/2 -translate-x-1/2">
          Recommended
        </div>
      )}
      <div className="card-body">
        <h2 className="card-title justify-center text-2xl">{name}</h2>
        {description && <p className="text-center text-sm text-base-content/70">{description}</p>}

        <div className="text-center my-4">
          <div className="text-4xl font-bold">
            {currency === 'USD' ? '$' : currency}
            {price}
          </div>
          {interval && <div className="text-sm text-base-content/70">per {interval}</div>}
          {creditsAmount && (
            <div className="text-sm text-base-content/70 mt-1">{creditsAmount} credits</div>
          )}
        </div>

        <div className="divider"></div>

        <ul className="space-y-2 mb-4">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-success flex-shrink-0 mt-0.5"
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
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>

        <div className="card-actions justify-center">
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className={`btn btn-primary w-full ${loading ? 'loading' : ''}`}
          >
            {loading ? 'Processing...' : interval ? 'Subscribe Now' : 'Buy Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
