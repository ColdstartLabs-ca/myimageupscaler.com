'use client';

import type { ISubscription, IUserProfile } from '@/shared/types/stripe.types';
import { useUserData } from '@client/store/userStore';
import { PlanChangeModal, SubscriptionPlanGrid, TrustBadges } from '@client/components/stripe';
import { CancelSubscriptionModal } from '@client/components/stripe/CancelSubscriptionModal';
import { CreditPackSelector } from '@client/components/stripe/CreditPackSelector';
import { ModalHeader } from '@client/components/stripe/ModalHeader';
import { InternalTabs, type ITabItem } from '@client/components/ui/InternalTabs';
import { StripeService, preloadStripe } from '@client/services/stripeService';
import { useToastStore } from '@client/store/toastStore';
import {
  STRIPE_PRICES,
  SUBSCRIPTION_PLANS,
  getPlanDisplayName,
  getPlanForPriceId,
} from '@shared/config/stripe';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { motion } from 'framer-motion';
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
  Wallet,
  Zap,
} from 'lucide-react';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

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
  const searchParams = useSearchParams();
  const { showToast } = useToastStore();
  const t = useTranslations('dashboard.billing');
  const { discountPercent } = useRegionTier();
  const { userSegment } = useUserData();

  // Determine default tab based on user segment and URL param
  // Priority: URL param > segment-based default
  const getDefaultTab = useCallback((): string => {
    const urlTab = searchParams.get('tab');
    if (urlTab && ['credits', 'subscription', 'invoices'].includes(urlTab)) {
      return urlTab;
    }
    // Credit purchasers and subscribers default to subscription tab
    // Free users default to credits tab
    return userSegment === 'free' ? 'credits' : 'subscription';
  }, [searchParams, userSegment]);

  const [activeTab, setActiveTab] = useState(getDefaultTab);
  const [profile, setProfile] = useState<IUserProfile | null>(null);
  const [subscription, setSubscription] = useState<ISubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showPlanOptionsModal, setShowPlanOptionsModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  // Credit history state
  const [creditTransactions, setCreditTransactions] = useState<ICreditTransaction[]>([]);
  const [creditHistoryLoading, setCreditHistoryLoading] = useState(true);
  const [creditHistoryError, setCreditHistoryError] = useState<string | null>(null);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);

  useEffect(() => {
    // Preload Stripe.js to reduce checkout embed load time (Phase 3A optimization)
    preloadStripe();
    loadBillingData();
    loadCreditHistory();
  }, []);

  // Update active tab when userSegment loads (async) or when searchParams change
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    // If URL has an explicit tab param, always honor it
    if (urlTab && ['credits', 'subscription', 'invoices'].includes(urlTab)) {
      setActiveTab(urlTab);
      return;
    }
    // Only update if no URL param and current tab is the initial default (credits)
    // to avoid overriding user's manual tab selection
    if (!urlTab && activeTab === 'credits' && userSegment !== 'free') {
      setActiveTab('subscription');
    }
  }, [userSegment, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setShowPlanOptionsModal(true);
  };

  const handlePlanSelect = (priceId: string) => {
    setShowPlanOptionsModal(false);
    setSelectedPlanId(priceId);
    setIsPlanModalOpen(true);
  };

  const handlePlanModalClose = () => {
    setIsPlanModalOpen(false);
    setSelectedPlanId(null);
  };

  const handlePlanModalComplete = () => {
    handlePlanModalClose();
    loadBillingData();
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

  const planName = subscription
    ? getPlanDisplayName({
        priceId: subscription.price_id,
        subscriptionTier: profile?.subscription_tier,
      })
    : 'Free Plan';

  const currentSubscriptionPrice = subscription?.price_id
    ? (getPlanForPriceId(subscription.price_id)?.price ?? null)
    : null;

  // Subscription Tab Content
  const SubscriptionTab = () => {
    // If no subscription, show plan cards for quick subscribe
    if (!subscription) {
      return (
        <div className="space-y-6">
          {/* Plan Cards Grid */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">{t('choosePlan')}</h3>
            <SubscriptionPlanGrid discountPercent={discountPercent} />
          </div>
        </div>
      );
    }

    // Has subscription - show current plan details
    return (
      <div className="space-y-6">
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
                className="w-full sm:w-auto px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
                data-testid="change-plan-button"
              >
                {t('changePlan')}
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
                        {t('planChangesOn', {
                          date: formatDate(subscription.scheduled_change_date),
                        })}{' '}
                        {t('keepBenefitsUntil', { plan: planName })}
                      </p>
                      <button
                        onClick={() => router.push('/pricing#subscriptions')}
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
      </div>
    );
  };

  // Credits Tab Content
  const CreditsTab = () => {
    const handleTipClick = () => {
      setActiveTab('subscription');
    };

    return (
      <div className="space-y-6">
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

          <motion.div
            onClick={handleTipClick}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="mb-6 p-4 cursor-pointer bg-gradient-to-r from-accent/20 to-accent/5 border-l-4 border-accent rounded-r-lg shadow-lg shadow-accent/5 transition-colors hover:from-accent/30 hover:to-accent/10"
          >
            <div className="flex items-start gap-3">
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="mt-0.5 text-accent"
              >
                <Zap size={18} />
              </motion.div>
              <div>
                <p className="text-sm text-white font-medium">
                  <strong>{t('tip')}</strong>{' '}
                  {subscription ? t('subscriptionBetterValue') : t('subscribeBetterValue')}
                  <ArrowRight size={14} className="inline ml-2 -mt-0.5 text-accent" />
                </p>
              </div>
            </div>
          </motion.div>

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
            discountPercent={discountPercent}
          />

          {/* Security badges */}
          <div className="mt-4 pt-4 border-t border-border">
            <TrustBadges variant="compact" />
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
                    className="w-full sm:w-auto px-4 py-2 border border-border text-white rounded-lg text-sm font-medium hover:bg-surface/10 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    {creditHistoryLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                    {t('creditHistory.loadMore')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  // Invoices & Payment Tab Content
  const InvoicesTab = () => (
    <div className="space-y-6">
      {/* Payment Methods */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center">
            <Wallet size={20} className="text-muted-foreground" />
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
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-surface text-base rounded-lg text-sm font-medium hover:bg-surface/90 transition-colors disabled:opacity-50"
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
              className="mt-4 w-full sm:w-auto px-4 py-2 border border-border text-white rounded-lg text-sm font-medium hover:bg-surface/10 transition-colors"
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
              className="w-full sm:w-auto px-4 py-2 border border-border text-white rounded-lg text-sm font-medium hover:bg-surface/10 transition-colors inline-flex items-center justify-center gap-2"
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
    </div>
  );

  // Tab configuration — credits first (most users buy credits, not subscriptions)
  const tabs: ITabItem[] = [
    {
      id: 'credits',
      label: t('tabs.credits'),
      icon: Plus,
      content: <CreditsTab />,
    },
    {
      id: 'subscription',
      label: t('tabs.subscription'),
      icon: CreditCard,
      content: <SubscriptionTab />,
    },
    {
      id: 'invoices',
      label: t('tabs.invoices'),
      icon: Receipt,
      content: <InvoicesTab />,
    },
  ];

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

      {/* Tabs Section */}
      <InternalTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

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

      {showPlanOptionsModal && subscription && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-5xl overflow-hidden rounded-t-3xl border border-border bg-surface shadow-2xl sm:rounded-3xl">
            <ModalHeader
              title={t('choosePlan')}
              icon={CreditCard}
              iconClassName="text-accent"
              onClose={() => setShowPlanOptionsModal(false)}
            />

            <div className="max-h-[80vh] overflow-y-auto px-4 pb-6 pt-4 sm:px-6 sm:pb-8">
              <div className="mb-5 rounded-2xl border border-accent/20 bg-gradient-to-r from-accent/12 via-accent/5 to-transparent p-4">
                <p className="text-sm font-medium text-white">{t('subscriptionBetterValue')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Compare plans and confirm the change without leaving billing.
                </p>
              </div>

              <SubscriptionPlanGrid
                discountPercent={discountPercent}
                currentSubscriptionPrice={currentSubscriptionPrice}
                currentPriceId={subscription.price_id}
                onSelect={handlePlanSelect}
                className="grid grid-cols-1 gap-4 lg:grid-cols-3"
              />
            </div>
          </div>
        </div>
      )}

      {selectedPlanId && subscription && (
        <PlanChangeModal
          isOpen={isPlanModalOpen}
          onClose={handlePlanModalClose}
          targetPriceId={selectedPlanId}
          currentPriceId={subscription.price_id}
          onComplete={handlePlanModalComplete}
        />
      )}
    </div>
  );
}
