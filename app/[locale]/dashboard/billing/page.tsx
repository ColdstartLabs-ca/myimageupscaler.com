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
  History,
  Loader2,
  Package,
  Plus,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

// Extend dayjs with relativeTime plugin
dayjs.extend(relativeTime);

interface ICreditTransaction {
  id: string;
  amount: number;
  type: 'purchase' | 'subscription' | 'usage' | 'refund' | 'bonus';
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export default function BillingPage() {
  const router = useRouter();
  const { showToast } = useToastStore();
  const t = useTranslations('dashboard.billing');
  const [profile, setProfile] = useState<IUserProfile | null>(null);
  const [subscription, setSubscription] = useState<ISubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Credit history state
  const [creditTransactions, setCreditTransactions] = useState<ICreditTransaction[]>([]);
  const [creditHistoryLoading, setCreditHistoryLoading] = useState(true);
  const [creditHistoryError, setCreditHistoryError] = useState<string | null>(null);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);

  useEffect(() => {
    loadBillingData();
    loadCreditHistory();
  }, []);

  const loadCreditHistory = async (append: boolean = false) => {
    try {
      setCreditHistoryLoading(true);
      setCreditHistoryError(null);

      const offset = append ? creditTransactions.length : 0;
      const result = await StripeService.getCreditHistory(50, offset);

      if (append) {
        setCreditTransactions(prev => [...prev, ...result.transactions]);
      } else {
        setCreditTransactions(result.transactions);
      }

      setHasMoreTransactions(result.pagination.total > offset + result.transactions.length);
    } catch (err) {
      console.error('Error loading credit history:', err);
      setCreditHistoryError('Failed to load credit history');
    } finally {
      setCreditHistoryLoading(false);
    }
  };

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
      setError(t('error'));
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
      const errorMessage = err instanceof Error ? err.message : t('errors.failedToOpenPortal');
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
        message: t('success.subscriptionCanceled'),
        type: 'success',
      });
      // Reload billing data to show updated status
      await loadBillingData();
    } catch (err) {
      console.error('Error canceling subscription:', err);
      const errorMessage =
        err instanceof Error ? err.message : t('errors.failedToCancelSubscription');
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
          <p className="text-muted-foreground">{t('loading')}</p>
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
            {t('tryAgain')}
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
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => {
            loadBillingData();
            loadCreditHistory();
          }}
          className="flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-white hover:bg-surface/10 rounded-lg transition-colors"
          title={t('refresh')}
        >
          <RefreshCw size={16} />
          <span className="text-sm">{t('refresh')}</span>
        </button>
      </div>

      {/* Current Plan */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
            <Package size={20} className="text-accent" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-white">{t('currentPlan')}</h2>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{planName}</p>
              {subscription && getSubscriptionStatusBadge(subscription.status)}
            </div>
          </div>
        </div>

        <div className="bg-surface-light rounded-lg p-4 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-muted-foreground">{t('creditsBalance')}</p>
              <p className="text-2xl font-bold text-white">
                {(profile?.subscription_credits_balance ?? 0) +
                  (profile?.purchased_credits_balance ?? 0)}
              </p>
            </div>
            <button
              onClick={handleUpgrade}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              {subscription ? t('changePlan') : t('choosePlan')}
            </button>
          </div>

          {/* Cancel Subscription Button */}
          {subscription && !subscription.cancel_at_period_end && (
            <div className="pt-4 border-t border-border">
              <button
                onClick={() => setShowCancelModal(true)}
                className="text-sm text-red-400 hover:text-red-300 font-medium transition-colors"
              >
                {t('cancelSubscription')}
              </button>
            </div>
          )}
        </div>

        {/* Subscription Details */}
        {subscription && (
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {subscription.status === 'trialing' ? t('trialEnds') : t('currentPeriodEnds')}
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
                  <strong>{t('trialActiveStrong')}</strong>{' '}
                  {t('trialEndsText', {
                    date: dayjs(subscription.trial_end).fromNow(),
                  })}
                </p>
              </div>
            )}

            {subscription.cancel_at_period_end && (
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 mt-3">
                <p className="text-sm text-warning/80">{t('subscriptionCanceled')}</p>
              </div>
            )}

            {/* Scheduled Downgrade Alert */}
            {subscription.scheduled_price_id && subscription.scheduled_change_date && (
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 mt-3">
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-medium text-white mb-1">{t('scheduledPlanChange')}</h4>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <span className="font-medium">{planName}</span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-warning">
                        {getPlanForPriceId(subscription.scheduled_price_id)?.name || 'New Plan'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('planChangesOn', { date: formatDate(subscription.scheduled_change_date) })}{' '}
                      {t('keepBenefitsUntil', { plan: planName })}
                    </p>
                    <button
                      onClick={() => router.push('/pricing')}
                      className="mt-2 text-sm text-warning hover:text-warning/80 font-medium"
                    >
                      {t('changeOrCancel')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Credit Top-Up Section */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
            <Plus size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="font-semibold text-white">{t('buyCredits')}</h2>
            <p className="text-sm text-muted-foreground">{t('buyCreditsSubtitle')}</p>
          </div>
        </div>

        <CreditPackSelector
          onPurchaseStart={() => {}}
          onPurchaseComplete={() => {
            loadBillingData();
            loadCreditHistory();
          }}
          onError={error =>
            showToast({
              message: error.message,
              type: 'error',
            })
          }
        />

        <div className="mt-4 p-3 bg-accent/10 border border-accent/20 rounded-lg">
          <p className="text-sm text-accent/80">
            💡 <strong>{t('tip')}</strong>{' '}
            {subscription ? t('subscriptionBetterValue') : t('subscribeBetterValue')}
          </p>
        </div>
      </div>

      {/* Credit History */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center">
            <History size={20} className="text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-white">{t('creditHistory.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('creditHistory.subtitle')}</p>
          </div>
        </div>

        {creditHistoryLoading && creditTransactions.length === 0 ? (
          <div className="text-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t('creditHistory.loading')}</p>
          </div>
        ) : creditHistoryError ? (
          <div className="bg-error/10 border border-error/20 rounded-lg p-4 text-center">
            <p className="text-sm text-error">{creditHistoryError}</p>
          </div>
        ) : creditTransactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t('creditHistory.noTransactions')}</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {creditTransactions.map(transaction => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-3 bg-surface-light rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {t(`creditHistory.type.${transaction.type}`)}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-surface text-muted-foreground">
                        {transaction.type}
                      </span>
                    </div>
                    {transaction.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {transaction.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p
                        className={`text-sm font-medium ${
                          transaction.amount >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {transaction.amount >= 0 ? '+' : ''}
                        {transaction.amount}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(transaction.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {hasMoreTransactions && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => loadCreditHistory(true)}
                  disabled={creditHistoryLoading}
                  className="px-4 py-2 border border-border text-white rounded-lg text-sm font-medium hover:bg-surface/10 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {creditHistoryLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                  {t('creditHistory.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Payment Methods / Manage Subscription */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center">
            <CreditCard size={20} className="text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-white">{t('paymentMethods')}</h2>
            <p className="text-sm text-muted-foreground">{t('paymentMethodsSubtitle')}</p>
          </div>
        </div>

        {profile?.stripe_customer_id ? (
          <div className="flex items-center justify-between p-4 bg-surface-light rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">{t('managePortal')}</p>
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
              {portalLoading ? t('opening') : t('manageSubscription')}
            </button>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t('noPaymentMethods')}</p>
            <p className="text-sm mt-2">{t('choosePlanToSetup')}</p>
            <button
              onClick={handleUpgrade}
              className="mt-4 px-4 py-2 border border-border text-white rounded-lg text-sm font-medium hover:bg-surface/10 transition-colors"
            >
              {t('viewPricing')}
            </button>
          </div>
        )}
      </div>

      {/* Billing History */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center">
            <Receipt size={20} className="text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-white">{t('billingHistory')}</h2>
            <p className="text-sm text-muted-foreground">{t('billingHistorySubtitle')}</p>
          </div>
        </div>

        {profile?.stripe_customer_id ? (
          <div className="text-center py-6">
            <p className="text-muted-foreground text-sm mb-4">{t('viewInvoicesPortal')}</p>
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="px-4 py-2 border border-border text-white rounded-lg text-sm font-medium hover:bg-surface/10 transition-colors inline-flex items-center gap-2"
            >
              <Receipt size={16} />
              {t('viewInvoices')}
            </button>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t('noBillingHistory')}</p>
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
