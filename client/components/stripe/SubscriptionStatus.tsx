'use client';

import { useEffect, useState } from 'react';
import { StripeService } from '@server/stripe';
import type { ISubscription, IUserProfile } from '@server/stripe/types';

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
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex items-center gap-2">
            <span className="loading loading-spinner"></span>
            <span>Loading subscription...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">No Active Subscription</h2>
          <p className="text-base-content/70">
            You don&apos;t have an active subscription. Browse our plans to get started!
          </p>
          <div className="card-actions justify-end">
            <a href="/pricing" className="btn btn-primary">
              View Plans
            </a>
          </div>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <div className="badge badge-success">Active</div>;
      case 'trialing':
        return <div className="badge badge-info">Trial</div>;
      case 'past_due':
        return <div className="badge badge-warning">Past Due</div>;
      case 'canceled':
        return <div className="badge badge-error">Canceled</div>;
      default:
        return <div className="badge">{status}</div>;
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
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Subscription Status</h2>
          {getStatusBadge(subscription.status)}
        </div>

        <div className="divider"></div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-base-content/70">Plan:</span>
            <span className="font-semibold">{profile?.subscription_tier || 'Unknown'}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-base-content/70">Current Period Ends:</span>
            <span className="font-semibold">{formatDate(subscription.current_period_end)}</span>
          </div>

          {subscription.cancel_at_period_end && (
            <div className="alert alert-warning">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="stroke-current shrink-0 h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>Your subscription will be canceled at the end of the period.</span>
            </div>
          )}
        </div>

        <div className="card-actions justify-end mt-4">
          <button onClick={loadSubscriptionData} className="btn btn-ghost btn-sm">
            Refresh
          </button>
          <a href="/account/billing" className="btn btn-primary btn-sm">
            Manage Subscription
          </a>
        </div>
      </div>
    </div>
  );
}
