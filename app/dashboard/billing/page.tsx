'use client';

import type { ISubscription, IUserProfile } from '@/shared/types/stripe.types';
import { CancelSubscriptionModal } from '@client/components/stripe/CancelSubscriptionModal';
import { CreditPackSelector } from '@client/components/stripe/CreditPackSelector';
import { StripeService } from '@client/services/stripeService';
import { useToastStore } from '@client/store/toastStore';
import { getPlanDisplayName, getPlanForPriceId } from '@shared/config/stripe';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  ArrowRight,
  Calendar,
  CreditCard,
  ExternalLink,
  Loader2,
  Package,
  Plus,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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
      active: 'bg-success/20 text-success',
      trialing: 'bg-accent/20 text-accent',
      past_due: 'bg-warning/20 text-warning',
      canceled: 'bg-error/20 text-error',
    };
    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-surface-light text-muted-foreground'}`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto mb-3" />
          <p className="text-muted-foreground">Loading billing information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-error/10 border border-error/20 rounded-xl p-6 text-center">
          <p className="text-error mb-4">{error}</p>
          <button
            onClick={loadBillingData}
            className="px-4 py-2 bg-error text-white rounded-lg text-sm font-medium hover:bg-error/80 transition-colors"
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
          <h1 className="text-2xl font-bold text-white">Billing</h1>
          <p className="text-muted-foreground mt-1">Manage your subscription and payment methods</p>
        </div>
        <button
          onClick={loadBillingData}
          className="flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-white hover:bg-surface/10 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} />
          <span className="text-sm">Refresh</span>
        </button>
      </div>

      {/* Current Plan */}
      <div className="bg-surface rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
            <Package size={20} className="text-accent" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-white">Current Plan</h2>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{planName}</p>
              {subscription && getSubscriptionStatusBadge(subscription.status)}
            </div>
          </div>
        </div>

        <div className="bg-surface-light rounded-lg p-4 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-muted-foreground">Credits balance</p>
              <p className="text-2xl font-bold text-white">
                {(profile?.subscription_credits_balance ?? 0) +
                  (profile?.purchased_credits_balance ?? 0)}
              </p>
            </div>
            <button
              onClick={handleUpgrade}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              {subscription ? 'Change Plan' : 'Choose Plan'}
            </button>
          </div>

          {/* Cancel Subscription Button */}
          {subscription && !subscription.cancel_at_period_end && (
            <div className="pt-4 border-t border-white/10">
              <button
                onClick={() => setShowCancelModal(true)}
                className="text-sm text-red-400 hover:text-red-300 font-medium transition-colors"
              >
                Cancel Subscription
              </button>
            </div>
          )}
        </div>

        {/* Subscription Details */}
        {subscription && (
          <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {subscription.status === 'trialing' ? 'Trial Ends' : 'Current Period Ends'}
              </span>
              <span className="text-white font-medium">
                {formatDate(
                  subscription.status === 'trialing' && subscription.trial_end
                    ? subscription.trial_end
                    : subscription.current_period_end
                )}
              </span>
            </div>

            {/* Trial Information */}
            {subscription.status === 'trialing' && subscription.trial_end && (
              <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 mt-3">
                <p className="text-sm text-accent/80">
                  <strong>Trial Active:</strong> Your trial ends{' '}
                  {dayjs(subscription.trial_end).fromNow()}. Your card will be charged the regular
                  subscription price after the trial ends.
                </p>
              </div>
            )}

            {subscription.cancel_at_period_end && (
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 mt-3">
                <p className="text-sm text-warning/80">
                  Your subscription will be canceled at the end of the current period.
                </p>
              </div>
            )}

            {/* Scheduled Downgrade Alert */}
            {subscription.scheduled_price_id && subscription.scheduled_change_date && (
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 mt-3">
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-medium text-white mb-1">Scheduled Plan Change</h4>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <span className="font-medium">{planName}</span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-warning">
                        {getPlanForPriceId(subscription.scheduled_price_id)?.name || 'New Plan'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Your plan will change on{' '}
                      <strong>{formatDate(subscription.scheduled_change_date)}</strong>. You&apos;ll
                      keep all {planName} benefits until then.
                    </p>
                    <button
                      onClick={() => router.push('/pricing')}
                      className="mt-2 text-sm text-warning hover:text-warning/80 font-medium"
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
      <div className="bg-surface rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
            <Plus size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Buy Credits</h2>
            <p className="text-sm text-muted-foreground">One-time credit packs that never expire</p>
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

        <div className="mt-4 p-3 bg-accent/10 border border-accent/20 rounded-lg">
          <p className="text-sm text-accent/80">
            💡 <strong>Tip:</strong>{' '}
            {subscription
              ? 'Subscriptions offer better value (up to 58% cheaper per credit)'
              : 'Subscribe for better value - get up to 58% cheaper credits'}
          </p>
        </div>
      </div>

      {/* Payment Methods / Manage Subscription */}
      <div className="bg-surface rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center">
            <CreditCard size={20} className="text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Payment Methods</h2>
            <p className="text-sm text-muted-foreground">
              Manage your payment methods and subscriptions
            </p>
          </div>
        </div>

        {profile?.stripe_customer_id ? (
          <div className="flex items-center justify-between p-4 bg-surface-light rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">
                Manage your payment methods, view invoices, and update your subscription through the
                Stripe Customer Portal.
              </p>
            </div>
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="flex items-center gap-2 px-4 py-2 bg-surface text-base rounded-lg text-sm font-medium hover:bg-surface/90 transition-colors disabled:opacity-50"
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
          <div className="text-center py-8 text-muted-foreground">
            <p>No payment methods added yet</p>
            <p className="text-sm mt-2">Choose a subscription plan to set up a payment method.</p>
            <button
              onClick={handleUpgrade}
              className="mt-4 px-4 py-2 border border-white/10 text-white rounded-lg text-sm font-medium hover:bg-surface/10 transition-colors"
            >
              View Pricing
            </button>
          </div>
        )}
      </div>

      {/* Billing History */}
      <div className="bg-surface rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center">
            <Receipt size={20} className="text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Billing History</h2>
            <p className="text-sm text-muted-foreground">View your past invoices and receipts</p>
          </div>
        </div>

        {profile?.stripe_customer_id ? (
          <div className="text-center py-6">
            <p className="text-muted-foreground text-sm mb-4">
              View and download your invoices from the Stripe Customer Portal.
            </p>
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="px-4 py-2 border border-white/10 text-white rounded-lg text-sm font-medium hover:bg-surface/10 transition-colors inline-flex items-center gap-2"
            >
              <Receipt size={16} />
              View Invoices
            </button>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
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
