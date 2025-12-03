'use client';

import { useEffect, useState } from 'react';
import { StripeService } from '@client/services/stripeService';
import { getPlanByPriceId, shouldSendExpirationWarning } from '@shared/config/subscription.utils';
import type { IUserProfile, ISubscription } from '@shared/types/stripe';
import { differenceInDays, format } from 'date-fns';
import Link from 'next/link';

interface IExpirationWarningBannerProps {
  /**
   * Threshold in days before expiration to show warning
   * Defaults to 7 days
   */
  warningDays?: number;
}

/**
 * Component to display a warning banner when credits will expire soon
 * Only shows for plans with expiration enabled (mode !== 'never')
 *
 * Usage:
 * ```tsx
 * <ExpirationWarningBanner />
 * <ExpirationWarningBanner warningDays={5} />
 * ```
 */
export function ExpirationWarningBanner({ warningDays = 7 }: IExpirationWarningBannerProps): JSX.Element | null {
  const [profile, setProfile] = useState<IUserProfile | null>(null);
  const [subscription, setSubscription] = useState<ISubscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [profileData, subscriptionData] = await Promise.all([
        StripeService.getUserProfile(),
        StripeService.getActiveSubscription(),
      ]);
      setProfile(profileData);
      setSubscription(subscriptionData);
    } catch (error) {
      console.error('Failed to load expiration data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Don't show anything while loading
  if (loading) {
    return null;
  }

  const creditBalance = profile?.credits_balance || 0;
  const priceId = subscription?.price_id;
  const expiresAt = subscription?.current_period_end;

  // Don't show if no credits or no subscription
  if (creditBalance === 0 || !priceId || !expiresAt) {
    return null;
  }

  // Check if credits expire for this plan
  const planConfig = getPlanByPriceId(priceId);
  const creditsExpire = planConfig?.creditsExpiration?.mode !== 'never';

  if (!creditsExpire) {
    return null;
  }

  // Calculate days until expiration
  const expirationDate = new Date(expiresAt);
  const daysUntilExpiration = differenceInDays(expirationDate, new Date());

  // Check if we should show warning based on config
  const showWarning = shouldSendExpirationWarning({
    priceId,
    daysUntilExpiration,
  });

  // Also show if within the component's warning threshold
  const withinThreshold = daysUntilExpiration <= warningDays && daysUntilExpiration >= 0;

  if (!showWarning && !withinThreshold) {
    return null;
  }

  // Format expiration date
  const formattedDate = format(expirationDate, 'MMMM d, yyyy');

  // Determine urgency level
  const isUrgent = daysUntilExpiration <= 3;
  const isModerate = daysUntilExpiration <= 7;

  return (
    <div
      className={`rounded-lg p-4 mb-6 ${
        isUrgent
          ? 'bg-red-50 border border-red-200'
          : isModerate
            ? 'bg-amber-50 border border-amber-200'
            : 'bg-blue-50 border border-blue-200'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0">
          <svg
            className={`h-5 w-5 ${
              isUrgent ? 'text-red-600' : isModerate ? 'text-amber-600' : 'text-blue-600'
            }`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3
            className={`text-sm font-semibold mb-1 ${
              isUrgent ? 'text-red-900' : isModerate ? 'text-amber-900' : 'text-blue-900'
            }`}
          >
            {isUrgent ? 'Credits Expiring Soon!' : 'Credits Will Expire'}
          </h3>
          <p
            className={`text-sm ${
              isUrgent ? 'text-red-800' : isModerate ? 'text-amber-800' : 'text-blue-800'
            }`}
          >
            Your <strong>{creditBalance} credit{creditBalance !== 1 ? 's' : ''}</strong> will
            expire on <strong>{formattedDate}</strong>
            {daysUntilExpiration === 0
              ? ' (today)'
              : daysUntilExpiration === 1
                ? ' (tomorrow)'
                : ` (in ${daysUntilExpiration} days)`}
            . Use them before they&apos;re gone!
          </p>
          <div className="mt-2">
            <Link
              href="/upscaler"
              className={`text-sm font-medium inline-flex items-center gap-1 hover:underline ${
                isUrgent ? 'text-red-700' : isModerate ? 'text-amber-700' : 'text-blue-700'
              }`}
            >
              Start upscaling now
              <svg
                className="h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
          </div>
        </div>

        {/* Dismiss button (optional) */}
        <button
          onClick={() => {
            // Could store in localStorage to hide for session
            const banner = document.querySelector('[data-expiration-banner]');
            if (banner) {
              (banner as HTMLElement).style.display = 'none';
            }
          }}
          className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path
              d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
