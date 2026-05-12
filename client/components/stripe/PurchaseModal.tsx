'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { PlanChangeModal } from './PlanChangeModal';
import { CheckoutModal } from './CheckoutModal';
import { X, ShoppingCart, ArrowRight, Star, Check, Coins, Zap } from 'lucide-react';
import { analytics } from '@client/analytics';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { useCurrentPlan } from '@client/hooks/useCurrentPlan';
import { useUserStore } from '@client/store/userStore';
import { useModalStore } from '@client/store/modalStore';
import { prepareAuthRedirect } from '@client/utils/authRedirectManager';
import {
  clearCheckoutTrackingContext,
  getCheckoutTrackingContext,
  setCheckoutTrackingContext,
} from '@client/utils/checkoutTrackingContext';
import { getEnabledCreditPacks, getEnabledPlans } from '@shared/config/subscription.utils';
import type { ICreditPack, IPlanConfig } from '@shared/config/subscription.types';

export interface IPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchaseComplete: () => void;
  outOfCredits?: boolean;
  /** Where in the UI this modal was triggered from */
  trigger?: string;
}

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

function formatPrice(cents: number, discountPercent = 0) {
  const finalCents = discountPercent > 0 ? Math.round(cents * (1 - discountPercent / 100)) : cents;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(finalCents / 100);
}

function formatPriceRaw(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function getPricePerCredit(pack: ICreditPack, discountPercent = 0) {
  const finalCents =
    discountPercent > 0
      ? Math.round(pack.priceInCents * (1 - discountPercent / 100))
      : pack.priceInCents;
  return (finalCents / pack.credits / 100).toFixed(2);
}

function getSavingsPercent(pack: ICreditPack, basePack: ICreditPack | undefined) {
  if (!basePack || pack.key === basePack.key) return 0;
  const basePerCredit = basePack.priceInCents / basePack.credits;
  const packPerCredit = pack.priceInCents / pack.credits;
  return Math.round(((basePerCredit - packPerCredit) / basePerCredit) * 100);
}

// ------------------------------------------------------------------------------
// Coin stack icon (small, for credit pack rows)
// ------------------------------------------------------------------------------

function CoinStackIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="12" cy="7" rx="7" ry="3" fill="#F59E0B" stroke="#F59E0B" strokeWidth="1.5" />
      <path d="M5 7v3c0 1.66 3.13 3 7 3s7-1.34 7-3V7" stroke="#F59E0B" strokeWidth="1.5" />
      <ellipse cx="12" cy="10" rx="7" ry="3" fill="#FBBF24" stroke="#F59E0B" strokeWidth="1.5" />
      <path d="M5 10v3c0 1.66 3.13 3 7 3s7-1.34 7-3v-3" stroke="#F59E0B" strokeWidth="1.5" />
      <ellipse cx="12" cy="13" rx="7" ry="3" fill="#FCD34D" stroke="#F59E0B" strokeWidth="1.5" />
    </svg>
  );
}

// ------------------------------------------------------------------------------
// Custom radio button
// ------------------------------------------------------------------------------

function RadioCircle({ checked }: { checked: boolean }) {
  return (
    <div
      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
        checked ? 'border-accent' : 'border-text-muted/50'
      }`}
    >
      {checked && <div className="w-2 h-2 rounded-full bg-accent" />}
    </div>
  );
}

// ------------------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------------------

export function PurchaseModal({
  isOpen,
  onClose,
  onPurchaseComplete,
  outOfCredits = false,
  trigger = 'unknown',
}: IPurchaseModalProps): JSX.Element | null {
  const t = useTranslations('stripe.outOfCredits');
  const { pricingRegion, discountPercent } = useRegionTier();
  const openTimeRef = useRef<number>(0);
  const { isAuthenticated } = useUserStore();
  const { openAuthRequiredModal } = useModalStore();

  const { planKey: currentPlan, priceId: currentPriceId, isPaidUser } = useCurrentPlan();

  // Selection state
  const [selectedPack, setSelectedPack] = useState<ICreditPack | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<IPlanConfig | null>(null);
  const [purchaseMode, setPurchaseMode] = useState<'credits' | 'subscribe'>('credits');

  // Checkout state
  const [checkoutPriceId, setCheckoutPriceId] = useState<string | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [planChangePriceId, setPlanChangePriceId] = useState<string | null>(null);
  const [isPlanChangeModalOpen, setIsPlanChangeModalOpen] = useState(false);

  // Data (memoized to avoid re-renders)
  const creditPacks = useMemo(() => getEnabledCreditPacks(), []);
  const subscriptionPlans = useMemo(
    () =>
      getEnabledPlans()
        .filter(p => p.interval === 'month')
        .sort((a, b) => a.displayOrder - b.displayOrder),
    []
  );

  const basePack = creditPacks[0];

  // Default selection on open
  useEffect(() => {
    if (isOpen) {
      openTimeRef.current = Date.now();
      if (!getCheckoutTrackingContext()?.trigger) {
        setCheckoutTrackingContext({ trigger });
      }

      // Default to popular credit pack
      const popularPack = creditPacks.find(p => p.popular) || creditPacks[1] || creditPacks[0];
      if (popularPack) {
        setSelectedPack(popularPack);
        setSelectedPlan(null);
        setPurchaseMode('credits');
      }

      analytics.track('upgrade_prompt_shown', {
        trigger,
        outOfCredits,
        currentPlan,
        pricingRegion: pricingRegion || 'standard',
        initialTab: 'credits',
      });
    }
  }, [isOpen, trigger, outOfCredits, pricingRegion, currentPlan, creditPacks]);

  const handleDismiss = useCallback(
    (method: 'backdrop' | 'close_button' | 'not_now') => {
      analytics.track('upgrade_prompt_dismissed', {
        trigger,
        method,
        activeTab: purchaseMode,
        outOfCredits,
        pricingRegion: pricingRegion || 'standard',
        timeOpenMs: Date.now() - openTimeRef.current,
      });
      clearCheckoutTrackingContext();
      onClose();
    },
    [trigger, purchaseMode, outOfCredits, pricingRegion, onClose]
  );

  const handleSelectPack = useCallback((pack: ICreditPack) => {
    setSelectedPack(pack);
    setSelectedPlan(null);
    setPurchaseMode('credits');
    analytics.track('pricing_plan_viewed', {
      planName: pack.key,
      priceId: pack.stripePriceId,
    });
  }, []);

  const handleSelectPlan = useCallback((plan: IPlanConfig) => {
    setSelectedPlan(plan);
    setSelectedPack(null);
    setPurchaseMode('subscribe');
    analytics.track('pricing_plan_viewed', {
      planName: plan.key,
      priceId: plan.stripePriceId,
    });
  }, []);

  const handleCheckoutSuccess = useCallback(() => {
    setShowCheckoutModal(false);
    setCheckoutPriceId(null);
    onPurchaseComplete();
    onClose();
  }, [onPurchaseComplete, onClose]);

  const handlePlanChangeComplete = useCallback(() => {
    setIsPlanChangeModalOpen(false);
    setPlanChangePriceId(null);
    onPurchaseComplete();
    onClose();
  }, [onPurchaseComplete, onClose]);

  const handleCTA = useCallback(() => {
    const item = selectedPlan || selectedPack;
    if (!item?.stripePriceId) return;

    const priceId = item.stripePriceId;
    const destination = selectedPlan ? 'subscribe' : 'credits';

    analytics.track('upgrade_prompt_clicked', {
      trigger,
      destination,
      currentPlan,
      outOfCredits,
      pricingRegion: pricingRegion || 'standard',
      timeOpenMs: Date.now() - openTimeRef.current,
    });

    // Existing subscriber changing plans
    if (selectedPlan && isPaidUser && currentPriceId && priceId !== currentPriceId) {
      setPlanChangePriceId(priceId);
      setIsPlanChangeModalOpen(true);
      return;
    }

    // Cannot re-subscribe to current plan
    if (selectedPlan && currentPriceId === priceId) {
      return;
    }

    const checkoutContext = getCheckoutTrackingContext();
    const effectiveOriginModel =
      checkoutContext?.originatingModel ||
      (typeof window !== 'undefined'
        ? sessionStorage.getItem('checkout_originating_model') || undefined
        : undefined);
    const effectiveTrigger = checkoutContext?.trigger;

    if (effectiveOriginModel || effectiveTrigger) {
      setCheckoutTrackingContext({
        trigger: effectiveTrigger,
        originatingModel: effectiveOriginModel,
      });
    }

    // Auth wall
    if (!isAuthenticated) {
      const currentSearchParams = new URLSearchParams(window.location.search);
      currentSearchParams.set('checkout', priceId);
      const returnTo = `${window.location.pathname}?${currentSearchParams.toString()}`;
      prepareAuthRedirect('checkout', {
        returnTo,
        context: { priceId, trigger: effectiveTrigger, originatingModel: effectiveOriginModel },
      });
      analytics.track('checkout_auth_required', {
        priceId,
        ...(effectiveTrigger ? { trigger: effectiveTrigger } : {}),
        originatingModel: effectiveOriginModel,
      });
      openAuthRequiredModal();
      return;
    }

    analytics.track('checkout_opened', {
      priceId,
      source: 'embedded_modal',
      ...(effectiveTrigger ? { trigger: effectiveTrigger } : {}),
      originatingModel: effectiveOriginModel,
      ...(checkoutContext?.originatingTrigger
        ? { originatingTrigger: checkoutContext.originatingTrigger }
        : {}),
      ...(checkoutContext?.attributionChain?.length
        ? { attributionChain: checkoutContext.attributionChain }
        : {}),
    });

    setCheckoutPriceId(priceId);
    setShowCheckoutModal(true);
  }, [
    selectedPlan,
    selectedPack,
    trigger,
    currentPlan,
    outOfCredits,
    pricingRegion,
    isPaidUser,
    currentPriceId,
    isAuthenticated,
    openAuthRequiredModal,
  ]);

  const getCTALabel = useCallback(() => {
    if (selectedPlan) {
      return `Subscribe to ${selectedPlan.name}`;
    }
    if (selectedPack) {
      return `Buy ${selectedPack.credits} credits`;
    }
    return 'Select an option';
  }, [selectedPlan, selectedPack]);

  const getCTAPrice = useCallback(() => {
    if (selectedPlan) {
      return formatPrice(selectedPlan.priceInCents, discountPercent);
    }
    if (selectedPack) {
      return formatPrice(selectedPack.priceInCents, discountPercent);
    }
    return '';
  }, [selectedPlan, selectedPack, discountPercent]);

  if (!isOpen) return null;

  const title = outOfCredits ? "You're Out of Credits" : 'Get More Credits';
  const subtitle = outOfCredits
    ? 'Purchase credits to continue, or subscribe for better value.'
    : 'Most users buy credits. Subscribe to save if you use premium models often.';

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={() => handleDismiss('backdrop')}
        />

        {/* Modal */}
        <div className="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="relative w-full max-w-lg bg-surface rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden">
            {/* Scrollable content */}
            <div className="overflow-y-auto flex-grow">
              {/* Header */}
              <div className="relative px-4 pt-4 pb-3 sm:px-5 sm:pt-5 sm:pb-3">
                {/* Logo + close */}
                <div className="flex items-center justify-between mb-3">
                  <Image
                    src="/logo/horizontal-logo-compact.png"
                    alt="MyImageUpscaler"
                    width={88}
                    height={28}
                    className="h-6 w-auto object-contain"
                  />
                  <button
                    onClick={() => handleDismiss('close_button')}
                    className="w-8 h-8 rounded-full border border-text-muted/30 flex items-center justify-center text-text-muted hover:text-text-primary hover:border-text-muted/50 transition-colors"
                    aria-label={t('notNow')}
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Title row with coin image */}
                <div className="flex items-start gap-3">
                  <div className="flex-grow min-w-0">
                    <h2 className="text-xl sm:text-2xl font-bold text-text-primary leading-tight tracking-tight">
                      {title}
                    </h2>
                    <p className="text-xs sm:text-sm text-text-secondary mt-1 leading-relaxed">
                      {subtitle}
                    </p>
                  </div>
                  <div className="flex-shrink-0 -mt-2 sm:-mt-3 -mr-1">
                    <Image
                      src="/checkout/checkout-coin.webp"
                      alt="Credits"
                      width={100}
                      height={80}
                      className="w-20 sm:w-24 h-auto object-contain drop-shadow-xl"
                    />
                  </div>
                </div>

                {/* Trust badges */}
                <div className="flex items-center justify-center gap-1.5 mt-3 text-text-muted">
                  <Check className="w-3.5 h-3.5" />
                  <span className="text-[10px]">
                    Instant delivery • Credits never expire • Secure checkout
                  </span>
                </div>
              </div>

              {/* ─── Credits Section ─── */}
              <div className="mx-4 sm:mx-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] overflow-hidden">
                {/* Section header */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-500/10 bg-amber-500/[0.04]">
                  <Coins className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <h3 className="text-sm font-bold text-text-primary">Credit Packs</h3>
                  <span className="ml-auto text-[10px] text-amber-600/80 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">
                    Buy once, use anytime
                  </span>
                </div>

                {/* Credit pack rows */}
                <div className="px-3 py-2 space-y-1.5">
                  {creditPacks.map(pack => {
                    const isSelected = selectedPack?.key === pack.key;
                    const savings = getSavingsPercent(pack, basePack);
                    return (
                      <div
                        key={pack.key}
                        onClick={() => handleSelectPack(pack)}
                        className={`relative flex flex-col rounded-xl border cursor-pointer transition-all duration-150 ${
                          isSelected
                            ? 'border-accent bg-accent/[0.04] ring-1 ring-accent/15'
                            : 'border-transparent bg-surface hover:border-surface-light/60'
                        }`}
                      >
                        {/* Main row */}
                        <div className="flex items-center gap-2 sm:gap-2.5 p-2 sm:p-2.5">
                          <RadioCircle checked={isSelected} />

                          <CoinStackIcon className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />

                          {/* Credits info */}
                          <div className="min-w-0 flex-grow">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-base sm:text-lg font-bold text-text-primary leading-none">
                                {pack.credits}
                              </span>
                              <span className="text-xs text-text-secondary">credits</span>
                              {pack.badge && (
                                <span
                                  className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                    pack.badge === 'Best Value'
                                      ? 'bg-success/15 text-success'
                                      : 'bg-secondary/15 text-secondary-light'
                                  }`}
                                >
                                  {pack.badge}
                                </span>
                              )}
                            </div>
                            {savings > 0 && (
                              <p className="text-[10px] text-success mt-0.5 font-medium whitespace-nowrap">
                                Save {savings}%
                              </p>
                            )}
                          </div>

                          {/* Pricing */}
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                            <span className="text-[10px] text-text-muted whitespace-nowrap hidden sm:inline">
                              ${getPricePerCredit(pack, discountPercent)}/cr
                            </span>
                            <span className="text-base sm:text-lg font-bold text-text-primary tabular-nums whitespace-nowrap min-w-[3rem] text-right">
                              {formatPrice(pack.priceInCents, discountPercent)}
                            </span>
                          </div>
                        </div>

                        {/* Expanded metadata */}
                        {isSelected && (
                          <div className="px-2 pb-2 sm:px-2.5 sm:pb-2.5 -mt-0.5">
                            <div className="border-t border-accent/10 pt-2">
                              <ul className="space-y-1">
                                {[
                                  'Credits never expire',
                                  'Use on any tool',
                                  'Stackable with subscriptions',
                                ].map((feature, idx) => (
                                  <li key={idx} className="flex items-start gap-1.5">
                                    <Check className="w-3 h-3 text-success flex-shrink-0 mt-0.5" />
                                    <span className="text-[11px] text-text-secondary leading-tight">
                                      {feature}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Divider */}
              <div className="px-4 sm:px-5 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex-grow h-px bg-surface-light/40" />
                  <span className="text-[10px] text-text-muted/70 font-medium tracking-wide">
                    or
                  </span>
                  <div className="flex-grow h-px bg-surface-light/40" />
                </div>
              </div>

              {/* ─── Subscription Section ─── */}
              <div className="mx-4 sm:mx-5 mb-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.03] overflow-hidden">
                {/* Section header */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-violet-500/10 bg-violet-500/[0.04]">
                  <Zap className="w-4 h-4 text-violet-400 flex-shrink-0" />
                  <h3 className="text-sm font-bold text-text-primary">Monthly Subscription</h3>
                  <span className="ml-auto text-[10px] text-violet-300/80 bg-violet-500/10 px-2 py-0.5 rounded-full font-medium">
                    Save more
                  </span>
                </div>

                <p className="px-3 pt-2 text-[11px] text-text-secondary">
                  Get monthly credits + lower cost per credit.
                </p>

                {/* Subscription plan rows */}
                <div className="px-3 py-2 space-y-1.5">
                  {subscriptionPlans.map(plan => {
                    const isSelected = selectedPlan?.key === plan.key;
                    const isCurrentPlan = currentPriceId === plan.stripePriceId;
                    const displayPrice =
                      discountPercent > 0
                        ? Math.round(plan.priceInCents * (1 - discountPercent / 100))
                        : plan.priceInCents;

                    return (
                      <div
                        key={plan.key}
                        onClick={() => !isCurrentPlan && handleSelectPlan(plan)}
                        className={`relative flex flex-col rounded-xl border transition-all duration-150 ${
                          isCurrentPlan
                            ? 'border-success/25 bg-success/[0.03] opacity-70 cursor-default'
                            : isSelected
                              ? 'border-accent bg-accent/[0.04] ring-1 ring-accent/15 cursor-pointer'
                              : 'border-transparent bg-surface hover:border-surface-light/60 cursor-pointer'
                        }`}
                      >
                        {/* Main row */}
                        <div className="flex items-center gap-2 sm:gap-2.5 p-2 sm:p-2.5">
                          <RadioCircle checked={isSelected || isCurrentPlan} />

                          <div
                            className={`flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center ${
                              isCurrentPlan ? 'bg-success/15' : 'bg-yellow-500/10'
                            }`}
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${isCurrentPlan ? 'text-success' : 'text-yellow-400'}`}
                              fill="none"
                              strokeWidth={2}
                            />
                          </div>

                          {/* Plan info */}
                          <div className="flex-grow min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-bold text-text-primary">
                                {plan.name}
                              </span>
                              <span className="text-[11px] text-text-secondary">
                                {plan.creditsPerCycle.toLocaleString()} cr/mo
                              </span>
                              {discountPercent > 0 && (
                                <span className="text-[9px] font-bold text-white bg-error/70 px-1 py-0.5 rounded">
                                  -{discountPercent}%
                                </span>
                              )}
                              {plan.recommended && !isCurrentPlan && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-success/15 text-success border border-success/20">
                                  Best value
                                </span>
                              )}
                              {isCurrentPlan && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-success/15 text-success border border-success/20">
                                  Current
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Price */}
                          <div className="text-right flex-shrink-0">
                            <div className="flex items-baseline justify-end gap-1">
                              <span className="text-base sm:text-lg font-bold text-text-primary tabular-nums leading-none">
                                {formatPriceRaw(displayPrice)}
                              </span>
                              <span className="text-[10px] text-text-muted">/mo</span>
                              {discountPercent > 0 && (
                                <span className="text-[10px] text-text-muted line-through ml-0.5">
                                  {formatPriceRaw(plan.priceInCents)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded metadata */}
                        {isSelected && (
                          <div className="px-2 pb-2 sm:px-2.5 sm:pb-2.5 -mt-0.5">
                            <div className="border-t border-accent/10 pt-2">
                              <ul className="space-y-1">
                                {plan.features.map((feature, idx) => (
                                  <li key={idx} className="flex items-start gap-1.5">
                                    <Check className="w-3 h-3 text-success flex-shrink-0 mt-0.5" />
                                    <span className="text-[11px] text-text-secondary leading-tight">
                                      {feature}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="px-4 sm:px-5 pt-1 pb-1 text-right">
                <a
                  href="/contact"
                  className="text-[11px] text-accent hover:text-accent-hover transition-colors"
                  onClick={e => {
                    e.stopPropagation();
                    handleDismiss('not_now');
                  }}
                >
                  Questions? Contact support
                </a>
              </div>
            </div>

            {/* Fixed CTA at bottom */}
            <div className="flex-shrink-0 px-4 sm:px-5 pt-2.5 pb-5 sm:pb-6 bg-surface border-t border-surface-light/30">
              <button
                onClick={handleCTA}
                disabled={!selectedPack && !selectedPlan}
                className="w-full py-3 px-5 rounded-xl font-bold text-white transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 shadow-lg shadow-secondary/25 hover:shadow-secondary/40"
                style={{
                  background:
                    'linear-gradient(135deg, rgb(59, 130, 246) 0%, rgb(139, 92, 246) 100%)',
                }}
              >
                <div className="flex items-center justify-center gap-2 w-full">
                  <ShoppingCart className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-bold">
                    {getCTALabel()} — {getCTAPrice()}
                  </span>
                  <ArrowRight className="w-4 h-4 flex-shrink-0" />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout Modal */}
      {showCheckoutModal && checkoutPriceId && (
        <CheckoutModal
          priceId={checkoutPriceId}
          onClose={() => {
            setShowCheckoutModal(false);
            setCheckoutPriceId(null);
          }}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      {/* Plan Change Modal */}
      {planChangePriceId && currentPriceId && (
        <PlanChangeModal
          isOpen={isPlanChangeModalOpen}
          onClose={() => {
            setIsPlanChangeModalOpen(false);
            setPlanChangePriceId(null);
          }}
          targetPriceId={planChangePriceId}
          currentPriceId={currentPriceId}
          onComplete={handlePlanChangeComplete}
        />
      )}
    </>
  );
}
