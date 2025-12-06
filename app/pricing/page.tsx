'use client';

import {
  PlanChangeModal,
  PricingCard,
  CreditPackSelector,
  PricingCardSkeleton,
} from '@client/components/stripe';
import { StripeService } from '@client/services/stripeService';
import {
  STRIPE_PRICES,
  SUBSCRIPTION_PLANS,
  getPlanForPriceId,
  isStripePricesConfigured,
  resolvePlanOrPack,
} from '@shared/config/stripe';
import type { ISubscription, IUserProfile } from '@shared/types/stripe';
import { useEffect, useState, useMemo } from 'react';
import { Calendar, ArrowRight, X, Loader2 } from 'lucide-react';

export default function PricingPage() {
  const pricesConfigured = isStripePricesConfigured();
  const [profile, setProfile] = useState<IUserProfile | null>(null);
  const [subscription, setSubscription] = useState<ISubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cancelingSchedule, setCancelingSchedule] = useState(false);

  const handlePlanSelect = (priceId: string) => {
    // Block if trying to select the already scheduled plan
    if (subscription?.scheduled_price_id === priceId) {
      return;
    }
    setSelectedPlanId(priceId);
    setIsModalOpen(true);
  };

  const handleCancelScheduledChange = async () => {
    try {
      setCancelingSchedule(true);
      await StripeService.cancelScheduledChange();
      // Refresh data
      const [profileData, subData] = await Promise.all([
        StripeService.getUserProfile(),
        StripeService.getActiveSubscription(),
      ]);
      setProfile(profileData);
      setSubscription(subData);
    } catch (error) {
      console.error('Failed to cancel scheduled change:', error);
      alert(error instanceof Error ? error.message : 'Failed to cancel scheduled change');
    } finally {
      setCancelingSchedule(false);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedPlanId(null);
  };

  const handleModalComplete = () => {
    handleModalClose();
    // Refresh page to show updated subscription status
    window.location.reload();
  };

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const [profileData, subData] = await Promise.all([
          StripeService.getUserProfile(),
          StripeService.getActiveSubscription(),
        ]);
        setProfile(profileData);
        setSubscription(subData);
      } catch (error) {
        // User not authenticated - that's fine
        console.log('User not authenticated:', error);
      } finally {
        setLoading(false);
      }
    };
    loadUserData();
  }, []);

  // Compute the current subscription price for upgrade/downgrade display
  const currentSubscriptionPrice = useMemo(() => {
    if (!subscription?.price_id) return null;

    // Find the matching plan to get the price
    if (subscription.price_id === STRIPE_PRICES.HOBBY_MONTHLY) {
      return SUBSCRIPTION_PLANS.HOBBY_MONTHLY.price;
    }
    if (subscription.price_id === STRIPE_PRICES.PRO_MONTHLY) {
      return SUBSCRIPTION_PLANS.PRO_MONTHLY.price;
    }
    if (subscription.price_id === STRIPE_PRICES.BUSINESS_MONTHLY) {
      return SUBSCRIPTION_PLANS.BUSINESS_MONTHLY.price;
    }
    return null;
  }, [subscription?.price_id]);

  return (
    <main className="flex-1 bg-slate-50">
      <div className="container mx-auto py-16 px-6">
        {/* Current credits banner for logged-in users */}
        {!loading && profile && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-8 max-w-3xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-indigo-600 font-medium">Your current balance</p>
                <p className="text-2xl font-bold text-indigo-700">
                  {(profile.subscription_credits_balance ?? 0) +
                    (profile.purchased_credits_balance ?? 0)}{' '}
                  credits
                </p>
              </div>
              {subscription && (
                <div className="text-right">
                  <p className="text-sm text-indigo-600">Active subscription</p>
                  <p className="font-medium text-indigo-700">
                    {getPlanForPriceId(subscription.price_id)?.name || profile.subscription_tier}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scheduled Downgrade Banner */}
        {!loading && subscription?.scheduled_price_id && subscription?.scheduled_change_date && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-8 max-w-3xl mx-auto">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-slate-900">Scheduled Plan Change</h3>
                  <button
                    onClick={handleCancelScheduledChange}
                    disabled={cancelingSchedule}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-orange-600 hover:text-orange-700 hover:bg-orange-100 rounded transition-colors disabled:opacity-50"
                  >
                    {cancelingSchedule ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                    Cancel
                  </button>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-700 mt-1">
                  <span className="font-medium">
                    {getPlanForPriceId(subscription.price_id)?.name}
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                  <span className="font-medium text-orange-600">
                    {getPlanForPriceId(subscription.scheduled_price_id)?.name}
                  </span>
                  <span className="text-slate-500">
                    on{' '}
                    {new Date(subscription.scheduled_change_date).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Configuration Warning (dev only) */}
        {!pricesConfigured && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8 max-w-3xl mx-auto">
            <div className="flex items-center gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-amber-600 flex-shrink-0"
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
              <span className="text-amber-800">
                Stripe Price IDs are not configured. Add them to your .env file to enable purchases.
              </span>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Choose the subscription plan that fits your needs. Get monthly credits with automatic
            rollover.
          </p>
        </div>

        {/* Subscription Plans Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-8">Choose Your Plan</h2>
          <p className="text-center text-slate-600 mb-8">
            Get credits every month with our subscription plans. Cancel anytime.
          </p>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {loading ? (
              // Show skeleton loading cards while fetching subscription data
              <>
                <PricingCardSkeleton />
                <PricingCardSkeleton recommended={true} />
                <PricingCardSkeleton />
              </>
            ) : (
              <>
                <PricingCard
                  name={SUBSCRIPTION_PLANS.HOBBY_MONTHLY.name}
                  description={SUBSCRIPTION_PLANS.HOBBY_MONTHLY.description}
                  price={SUBSCRIPTION_PLANS.HOBBY_MONTHLY.price}
                  interval={SUBSCRIPTION_PLANS.HOBBY_MONTHLY.interval}
                  features={SUBSCRIPTION_PLANS.HOBBY_MONTHLY.features}
                  priceId={STRIPE_PRICES.HOBBY_MONTHLY}
                  disabled={
                    subscription?.price_id === STRIPE_PRICES.HOBBY_MONTHLY ||
                    subscription?.scheduled_price_id === STRIPE_PRICES.HOBBY_MONTHLY
                  }
                  scheduled={subscription?.scheduled_price_id === STRIPE_PRICES.HOBBY_MONTHLY}
                  onCancelScheduled={
                    subscription?.scheduled_price_id === STRIPE_PRICES.HOBBY_MONTHLY
                      ? handleCancelScheduledChange
                      : undefined
                  }
                  cancelingScheduled={cancelingSchedule}
                  onSelect={
                    subscription ? () => handlePlanSelect(STRIPE_PRICES.HOBBY_MONTHLY) : undefined
                  }
                  currentSubscriptionPrice={currentSubscriptionPrice}
                />

                <PricingCard
                  name={SUBSCRIPTION_PLANS.PRO_MONTHLY.name}
                  description={SUBSCRIPTION_PLANS.PRO_MONTHLY.description}
                  price={SUBSCRIPTION_PLANS.PRO_MONTHLY.price}
                  interval={SUBSCRIPTION_PLANS.PRO_MONTHLY.interval}
                  features={SUBSCRIPTION_PLANS.PRO_MONTHLY.features}
                  priceId={STRIPE_PRICES.PRO_MONTHLY}
                  recommended={SUBSCRIPTION_PLANS.PRO_MONTHLY.recommended}
                  disabled={
                    subscription?.price_id === STRIPE_PRICES.PRO_MONTHLY ||
                    subscription?.scheduled_price_id === STRIPE_PRICES.PRO_MONTHLY
                  }
                  scheduled={subscription?.scheduled_price_id === STRIPE_PRICES.PRO_MONTHLY}
                  onCancelScheduled={
                    subscription?.scheduled_price_id === STRIPE_PRICES.PRO_MONTHLY
                      ? handleCancelScheduledChange
                      : undefined
                  }
                  cancelingScheduled={cancelingSchedule}
                  onSelect={
                    subscription ? () => handlePlanSelect(STRIPE_PRICES.PRO_MONTHLY) : undefined
                  }
                  currentSubscriptionPrice={currentSubscriptionPrice}
                />

                <PricingCard
                  name={SUBSCRIPTION_PLANS.BUSINESS_MONTHLY.name}
                  description={SUBSCRIPTION_PLANS.BUSINESS_MONTHLY.description}
                  price={SUBSCRIPTION_PLANS.BUSINESS_MONTHLY.price}
                  interval={SUBSCRIPTION_PLANS.BUSINESS_MONTHLY.interval}
                  features={SUBSCRIPTION_PLANS.BUSINESS_MONTHLY.features}
                  priceId={STRIPE_PRICES.BUSINESS_MONTHLY}
                  disabled={
                    subscription?.price_id === STRIPE_PRICES.BUSINESS_MONTHLY ||
                    subscription?.scheduled_price_id === STRIPE_PRICES.BUSINESS_MONTHLY
                  }
                  scheduled={subscription?.scheduled_price_id === STRIPE_PRICES.BUSINESS_MONTHLY}
                  onCancelScheduled={
                    subscription?.scheduled_price_id === STRIPE_PRICES.BUSINESS_MONTHLY
                      ? handleCancelScheduledChange
                      : undefined
                  }
                  cancelingScheduled={cancelingSchedule}
                  onSelect={
                    subscription
                      ? () => handlePlanSelect(STRIPE_PRICES.BUSINESS_MONTHLY)
                      : undefined
                  }
                  currentSubscriptionPrice={currentSubscriptionPrice}
                />
              </>
            )}
          </div>
        </div>

        {/* Credit Packs Section */}
        <div className="mt-16 border-t border-slate-200 pt-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Need Credits Without a Subscription?
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              One-time credit packs that never expire. Perfect for occasional projects.
            </p>
          </div>

          <div className="max-w-5xl mx-auto">
            <CreditPackSelector
              onPurchaseStart={() => {}}
              onPurchaseComplete={() => window.location.reload()}
              onError={error => console.error(error)}
            />
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-slate-500 mb-2">
              💡 <strong>Value Comparison:</strong> Subscriptions offer 11-58% cheaper credits for
              regular users
            </p>
            <a
              href="#subscriptions"
              className="text-sm text-indigo-600 hover:text-indigo-700 underline"
            >
              Compare subscription plans
            </a>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mt-16">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-8">
            Frequently Asked Questions
          </h2>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                What are credits used for?
              </h3>
              <p className="text-slate-600">
                Credits are used for image processing actions. Each image processed consumes a
                certain number of credits based on the upscaling factor and features used.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Do credits expire?</h3>
              <p className="text-slate-600">
                Subscription credits roll over month-to-month up to your plan's maximum limit as
                long as your subscription is active.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Can I cancel my subscription anytime?
              </h3>
              <p className="text-slate-600">
                Yes! You can cancel your subscription at any time. You'll continue to have access
                until the end of your billing period, and any remaining credits will stay in your
                account.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                What payment methods do you accept?
              </h3>
              <p className="text-slate-600">
                We accept all major credit cards (Visa, Mastercard, American Express) and various
                other payment methods through Stripe.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-16">
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-8 max-w-2xl mx-auto border border-indigo-100">
            <h3 className="text-2xl font-bold text-slate-900 mb-4">Need a custom plan?</h3>
            <p className="text-slate-600 mb-6">
              Contact us for enterprise pricing, bulk discounts, or custom integration requirements.
            </p>
            <div className="flex justify-center">
              <a
                href="mailto:sales@pixelperfect.com"
                className="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
              >
                Contact Sales
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Plan Change Modal */}
      {selectedPlanId && (
        <PlanChangeModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          targetPriceId={selectedPlanId}
          currentPriceId={subscription?.price_id}
          onComplete={handleModalComplete}
        />
      )}
    </main>
  );
}
