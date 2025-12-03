'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { StripeService } from '@client/services/stripeService';
import type { ISubscription, IUserProfile } from '@shared/types/stripe';
import { getPlanDisplayName } from '@shared/config/stripe';

// Extend dayjs with relativeTime plugin
dayjs.extend(relativeTime);

/**
 * Component to display user's current subscription status
 *
 * Usage:
 * ```tsx
 * <SubscriptionStatus />
 * ```
 */
export function SubscriptionStatus(): JSX.Element {
  const [subscription, setSubscription] = useState<ISubscription | null>(null);
  const [profile, setProfile] = useState<IUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubscriptionData();
  }, []);

  const loadSubscriptionData = async () => {
    try {
      setLoading(true);
      const [subData, profileData] = await Promise.all([
        StripeService.getActiveSubscription(),
        StripeService.getUserProfile(),
      ]);
      setSubscription(subData);
      setProfile(profileData);
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-2">
          <svg
            className="animate-spin h-5 w-5 text-indigo-600"
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
          <span>Loading subscription...</span>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-2">No Active Subscription</h2>
        <p className="text-slate-600 mb-4">
          You don&apos;t have an active subscription. Browse our plans to get started!
        </p>
        <div className="flex justify-end">
          <a
            href="/pricing"
            className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            View Plans
          </a>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
    switch (status) {
      case 'active':
        return <span className={`${baseClasses} bg-green-100 text-green-800`}>Active</span>;
      case 'trialing':
        return <span className={`${baseClasses} bg-blue-100 text-blue-800`}>Trial</span>;
      case 'past_due':
        return <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>Past Due</span>;
      case 'canceled':
        return <span className={`${baseClasses} bg-red-100 text-red-800`}>Canceled</span>;
      default:
        return <span className={`${baseClasses} bg-slate-100 text-slate-800`}>{status}</span>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Subscription Status</h2>
        {getStatusBadge(subscription.status)}
      </div>

      <hr className="border-slate-200 my-4" />

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-slate-600">Plan:</span>
          <span className="font-semibold">
            {getPlanDisplayName({
              priceId: subscription.price_id,
              subscriptionTier: profile?.subscription_tier,
            })}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-600">
            {subscription.status === 'trialing' ? 'Trial Ends:' : 'Current Period Ends:'}
          </span>
          <span className="font-semibold">
            {formatDate(subscription.status === 'trialing' && subscription.trial_end ? subscription.trial_end : subscription.current_period_end)}
          </span>
        </div>

        {/* Trial specific information */}
        {subscription.status === 'trialing' && subscription.trial_end && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="shrink-0 h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-sm">
              <p>
                Your trial ends {dayjs(subscription.trial_end).fromNow()}.
                After the trial, you will be charged the regular subscription price.
              </p>
            </div>
          </div>
        )}

        {subscription.cancel_at_period_end && (
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="shrink-0 h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-sm">
              Your subscription will be canceled at the end of the period.
            </span>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={loadSubscriptionData}
          className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        >
          Refresh
        </button>
        <a
          href="/dashboard/billing"
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Manage Subscription
        </a>
      </div>
    </div>
  );
}
