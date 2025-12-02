'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Package, Receipt, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { StripeService } from '@server/stripe';
import { useToastStore } from '@client/store/toastStore';
import type { IUserProfile, ISubscription } from '@server/stripe/types';

export default function BillingPage() {
  const router = useRouter();
  const { showToast } = useToastStore();
  const [profile, setProfile] = useState<IUserProfile | null>(null);
  const [subscription, setSubscription] = useState<ISubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [profileData, subscriptionData] = await Promise.all([
        StripeService.getUserProfile(),
        StripeService.getActiveSubscription(),
      ]);
      setProfile(profileData);
      setSubscription(subscriptionData);
    } catch (err) {
      console.error('Error loading billing data:', err);
      setError('Failed to load billing information');
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      await StripeService.redirectToPortal();
    } catch (err) {
      console.error('Error opening portal:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to open billing portal';
      showToast({
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setPortalLoading(false);
    }
  };

  const handleUpgrade = () => {
    router.push('/pricing');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getSubscriptionStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      trialing: 'bg-blue-100 text-blue-700',
      past_due: 'bg-yellow-100 text-yellow-700',
      canceled: 'bg-red-100 text-red-700',
    };
    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-slate-100 text-slate-700'}`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-3" />
          <p className="text-slate-500">Loading billing information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={loadBillingData}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const planName = subscription ? profile?.subscription_tier || 'Active Plan' : 'Free Plan';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
          <p className="text-slate-500 mt-1">Manage your subscription and payment methods</p>
        </div>
        <button
          onClick={loadBillingData}
          className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} />
          <span className="text-sm">Refresh</span>
        </button>
      </div>

      {/* Current Plan */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Package size={20} className="text-indigo-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-900">Current Plan</h2>
            <div className="flex items-center gap-2">
              <p className="text-sm text-slate-500">{planName}</p>
              {subscription && getSubscriptionStatusBadge(subscription.status)}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-slate-600">Credits balance</p>
              <p className="text-2xl font-bold text-slate-900">{profile?.credits_balance ?? 0}</p>
            </div>
            <button
              onClick={handleUpgrade}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              {subscription ? 'Buy More Credits' : 'Upgrade Plan'}
            </button>
          </div>
        </div>

        {/* Subscription Details */}
        {subscription && (
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Current Period Ends</span>
              <span className="text-slate-900 font-medium">
                {formatDate(subscription.current_period_end)}
              </span>
            </div>
            {subscription.cancel_at_period_end && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
                <p className="text-sm text-yellow-800">
                  Your subscription will be canceled at the end of the current period.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment Methods / Manage Subscription */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <CreditCard size={20} className="text-slate-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Payment Methods</h2>
            <p className="text-sm text-slate-500">Manage your payment methods and subscriptions</p>
          </div>
        </div>

        {profile?.stripe_customer_id ? (
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="text-sm text-slate-700">
                Manage your payment methods, view invoices, and update your subscription through the
                Stripe Customer Portal.
              </p>
            </div>
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {portalLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ExternalLink size={16} />
              )}
              {portalLoading ? 'Opening...' : 'Manage Subscription'}
            </button>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <p>No payment methods added yet</p>
            <p className="text-sm mt-2">Make your first purchase to set up a payment method.</p>
            <button
              onClick={handleUpgrade}
              className="mt-4 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              View Pricing
            </button>
          </div>
        )}
      </div>

      {/* Billing History */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <Receipt size={20} className="text-slate-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Billing History</h2>
            <p className="text-sm text-slate-500">View your past invoices and receipts</p>
          </div>
        </div>

        {profile?.stripe_customer_id ? (
          <div className="text-center py-6">
            <p className="text-slate-600 text-sm mb-4">
              View and download your invoices from the Stripe Customer Portal.
            </p>
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors inline-flex items-center gap-2"
            >
              <Receipt size={16} />
              View Invoices
            </button>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <p>No billing history yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
