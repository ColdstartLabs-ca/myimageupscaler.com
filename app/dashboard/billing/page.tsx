'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  CreditCard,
  Package,
  Receipt,
  ExternalLink,
  Loader2,
  RefreshCw,
  Calendar,
  ArrowRight,
  X,
} from 'lucide-react';
import { StripeService } from '@client/services/stripeService';
import { useToastStore } from '@client/store/toastStore';
import { getPlanDisplayName, getPlanForPriceId } from '@shared/config/stripe';
import { CancelSubscriptionModal } from '@client/components/stripe/CancelSubscriptionModal';
import { CreditPackSelector } from '@client/components/stripe/CreditPackSelector';
import type { IUserProfile, ISubscription } from '@shared/types/stripe';
import { Plus } from 'lucide-react';

// Extend dayjs with relativeTime plugin
dayjs.extend(relativeTime);

export default function BillingPage() {
  const router = useRouter();
  const { showToast } = useToastStore();
  const [profile, setProfile] = useState<IUserProfile | null>(null);
  const [subscription, setSubscription] = useState<ISubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

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

  const handleCancelSubscription = async (reason?: string) => {
    try {
      await StripeService.cancelSubscription(reason);
      showToast({
        message: 'Subscription canceled successfully. Access continues until period end.',
        type: 'success',
      });
      // Reload billing data to show updated status
      await loadBillingData();
    } catch (err) {
      console.error('Error canceling subscription:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel subscription';
      showToast({
        message: errorMessage,
        type: 'error',
      });
      throw err; // Re-throw so modal can handle loading state
    }
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

  const planName = subscription
    ? getPlanDisplayName({
        priceId: subscription.price_id,
        subscriptionTier: profile?.subscription_tier,
      })
    : 'Free Plan';

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

        <div className="bg-slate-50 rounded-lg p-4 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-slate-600">Credits balance</p>
              <p className="text-2xl font-bold text-slate-900">{profile?.credits_balance ?? 0}</p>
            </div>
            <button
              onClick={handleUpgrade}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              {subscription ? 'Change Plan' : 'Choose Plan'}
            </button>
          </div>

          {/* Cancel Subscription Button */}
          {subscription && !subscription.cancel_at_period_end && (
            <div className="pt-4 border-t border-slate-200">
              <button
                onClick={() => setShowCancelModal(true)}
                className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
              >
                Cancel Subscription
              </button>
            </div>
          )}
        </div>

        {/* Subscription Details */}
        {subscription && (
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">
                {subscription.status === 'trialing' ? 'Trial Ends' : 'Current Period Ends'}
              </span>
              <span className="text-slate-900 font-medium">
                {formatDate(
                  subscription.status === 'trialing' && subscription.trial_end
                    ? subscription.trial_end
                    : subscription.current_period_end
                )}
              </span>
            </div>

            {/* Trial Information */}
            {subscription.status === 'trialing' && subscription.trial_end && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                <p className="text-sm text-blue-800">
                  <strong>Trial Active:</strong> Your trial ends {dayjs(subscription.trial_end).fromNow()}.
                  Your card will be charged the regular subscription price after the trial ends.
                </p>
              </div>
            )}

            {subscription.cancel_at_period_end && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
                <p className="text-sm text-yellow-800">
                  Your subscription will be canceled at the end of the current period.
                </p>
              </div>
            )}

            {/* Scheduled Downgrade Alert */}
            {subscription.scheduled_price_id && subscription.scheduled_change_date && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-3">
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-medium text-slate-900 mb-1">Scheduled Plan Change</h4>
                    <div className="flex items-center gap-2 text-sm text-slate-700 mb-2">
                      <span className="font-medium">{planName}</span>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                      <span className="font-medium text-orange-600">
                        {getPlanForPriceId(subscription.scheduled_price_id)?.name || 'New Plan'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">
                      Your plan will change on{' '}
                      <strong>{formatDate(subscription.scheduled_change_date)}</strong>. You&apos;ll
                      keep all {planName} benefits until then.
                    </p>
                    <button
                      onClick={() => router.push('/pricing')}
                      className="mt-2 text-sm text-orange-600 hover:text-orange-700 font-medium"
                    >
                      Change or cancel this
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Credit Top-Up Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
            <Plus size={20} className="text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Buy Credits</h2>
            <p className="text-sm text-slate-500">One-time credit packs that never expire</p>
          </div>
        </div>

        <CreditPackSelector
          onPurchaseStart={() => {}}
          onPurchaseComplete={() => loadBillingData()}
          onError={error =>
            showToast({
              message: error.message,
              type: 'error',
            })
          }
        />

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            💡 <strong>Tip:</strong>{' '}
            {subscription
              ? 'Subscriptions offer better value (up to 58% cheaper per credit)'
              : 'Subscribe for better value - get up to 58% cheaper credits'}
          </p>
        </div>
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
            <p className="text-sm mt-2">Choose a subscription plan to set up a payment method.</p>
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

      {/* Cancel Subscription Modal */}
      {subscription && (
        <CancelSubscriptionModal
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          onConfirm={handleCancelSubscription}
          planName={planName}
          periodEnd={subscription.current_period_end}
        />
      )}
    </div>
  );
}
