'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { PlanChangeModal } from './PlanChangeModal';
import { CheckoutModal } from './CheckoutModal';
import { X, ShoppingCart, ArrowRight, Star, Check, Coins, Zap } from 'lucide-react';
import { analytics } from '@client/analytics';
import { useExperimentArm } from '@client/hooks/useExperimentArm';
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
import { getPurchaseModalInitialSelection } from '@client/utils/purchaseModalDefaults';
import type { IPurchaseModalBanditConfig } from '@client/utils/purchaseModalDefaults';
import { getEnabledCreditPacks, getEnabledPlans } from '@shared/config/subscription.utils';
import type { IExperimentAssignment } from '@shared/types/experiments.types';
import type { ICreditPack, IPlanConfig } from '@shared/config/subscription.types';

export interface IPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchaseComplete: () => void;
  outOfCredits?: boolean;
  requiredCredits?: number;
  currentBalance?: number;
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

function getExperimentAnalyticsProps(assignment: IExperimentAssignment | null) {
  if (!assignment) return {};

  return {
    experimentKey: assignment.experimentKey,
    experimentContextKey: assignment.contextKey,
    experimentArmId: assignment.armId,
    experimentArmKey: assignment.armKey,
    experimentAssignmentKey: assignment.assignmentKey,
  };
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
  requiredCredits,
  currentBalance,
  trigger = 'unknown',
}: IPurchaseModalProps): JSX.Element | null {
  const t = useTranslations('stripe.outOfCredits');
  const { pricingRegion, discountPercent } = useRegionTier();
  const openTimeRef = useRef<number>(0);
  const { isAuthenticated } = useUserStore();
  const { openAuthRequiredModal } = useModalStore();

  const { planKey: currentPlan, priceId: currentPriceId, isPaidUser } = useCurrentPlan();
  const purchaseExperiment = useExperimentArm({
    experimentKey: 'purchase_modal_default_selection',
    contextKey: 'global',
    assignmentScope: 'session',
    surface: 'purchase_modal',
    enabled: isOpen,
    metadata: {
      trigger,
      pricingRegion: pricingRegion || 'standard',
      outOfCredits,
      requiredCredits,
      currentBalance,
    },
    fallbackArm: {
      armKey: 'current_modal_control',
      armConfig: { description: 'Current purchase modal behavior' },
    },
  });
  const purchaseBanditConfig = purchaseExperiment.armConfig as IPurchaseModalBanditConfig;

  // Selection state
  const [selectedPack, setSelectedPack] = useState<ICreditPack | null>(null);
  const [autoTopUpEnabled, setAutoTopUpEnabled] = useState(false);
  const [autoTopUpThreshold, setAutoTopUpThreshold] = useState(25);
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

  const visibleCreditPacks = useMemo(() => {
    if (!purchaseBanditConfig.visiblePacks?.length) return creditPacks;

    const allowedKeys = new Set(purchaseBanditConfig.visiblePacks);
    const filtered = creditPacks.filter(pack => allowedKeys.has(pack.key));
    return filtered.length > 0 ? filtered : creditPacks;
  }, [creditPacks, purchaseBanditConfig.visiblePacks]);

  const basePack = creditPacks[0];
  const starterPack = creditPacks.find(pack => pack.key === 'small') || basePack;

  // Default selection on open
  useEffect(() => {
    if (isOpen && !purchaseExperiment.isLoading) {
      openTimeRef.current = Date.now();
      const existingContext = getCheckoutTrackingContext();
      const experimentProps = getExperimentAnalyticsProps(purchaseExperiment.assignment);
      if (!existingContext?.trigger || !existingContext.experimentKey) {
        setCheckoutTrackingContext({
          ...(existingContext?.trigger ? {} : { trigger }),
          ...(!existingContext?.experimentKey ? experimentProps : {}),
        });
      }

      const initialSelection = getPurchaseModalInitialSelection({
        trigger,
        outOfCredits,
        creditPacks,
        subscriptionPlans,
        banditConfig: purchaseBanditConfig,
      });
      setSelectedPack(initialSelection.selectedPack);
      setSelectedPlan(initialSelection.selectedPlan);
      setPurchaseMode(initialSelection.purchaseMode);

      const initialItem = initialSelection.selectedPlan || initialSelection.selectedPack;

      analytics.track('purchase_modal_opened', {
        trigger,
        outOfCredits,
        requiredCredits,
        currentBalance,
        currentPlan,
        pricingRegion: pricingRegion || 'standard',
        initialTab: initialSelection.purchaseMode,
        selectedType: initialSelection.selectedPlan ? 'subscription' : 'credit_pack',
        selectedKey: initialItem?.key,
        priceId: initialItem?.stripePriceId,
        lockToCredits: initialSelection.lockToCredits,
        ...experimentProps,
      });

      analytics.track('upgrade_prompt_shown', {
        trigger,
        outOfCredits,
        requiredCredits,
        currentBalance,
        currentPlan,
        pricingRegion: pricingRegion || 'standard',
        initialTab: initialSelection.purchaseMode,
        lockToCredits: initialSelection.lockToCredits,
        ...experimentProps,
      });
    }
  }, [
    isOpen,
    trigger,
    outOfCredits,
    requiredCredits,
    currentBalance,
    pricingRegion,
    currentPlan,
    creditPacks,
    subscriptionPlans,
    purchaseBanditConfig,
    purchaseExperiment.assignment,
    purchaseExperiment.isLoading,
  ]);

  const lockToCredits = trigger === 'model_gate';

  const handleDismiss = useCallback(
    (method: 'backdrop' | 'close_button' | 'not_now') => {
      analytics.track('upgrade_prompt_dismissed', {
        trigger,
        method,
        activeTab: purchaseMode,
        outOfCredits,
        pricingRegion: pricingRegion || 'standard',
        timeOpenMs: Date.now() - openTimeRef.current,
        ...getExperimentAnalyticsProps(purchaseExperiment.assignment),
      });

      const selectedItem = selectedPlan || selectedPack;
      if (!showCheckoutModal && selectedItem?.stripePriceId) {
        analytics.track('purchase_modal_abandoned', {
          priceId: selectedItem.stripePriceId,
          step: 'plan_selection',
          timeSpentMs: Date.now() - openTimeRef.current,
          plan: currentPlan,
          pricingRegion: pricingRegion || 'standard',
          source: 'purchase_modal',
          method,
          activeTab: purchaseMode,
          selectedType: selectedPlan ? 'subscription' : 'credit_pack',
          selectedKey: selectedItem.key,
          checkoutOpened: false,
          outOfCredits,
          ...getExperimentAnalyticsProps(purchaseExperiment.assignment),
        });
      }

      clearCheckoutTrackingContext();
      onClose();
    },
    [
      trigger,
      purchaseMode,
      outOfCredits,
      pricingRegion,
      purchaseExperiment.assignment,
      onClose,
      selectedPlan,
      selectedPack,
      showCheckoutModal,
      currentPlan,
    ]
  );

  const handleModeChange = useCallback(
    (mode: 'credits' | 'subscribe') => {
      if (lockToCredits && mode === 'subscribe') return;
      if (mode === purchaseMode) return;

      analytics.track('upgrade_prompt_tab_toggled', {
        trigger,
        from: purchaseMode,
        to: mode,
        pricingRegion: pricingRegion || 'standard',
        timeOpenMs: Date.now() - openTimeRef.current,
        ...getExperimentAnalyticsProps(purchaseExperiment.assignment),
      });

      setPurchaseMode(mode);

      if (mode === 'credits') {
        setSelectedPack(
          current => current || creditPacks.find(p => p.key === 'small') || creditPacks[0] || null
        );
        setSelectedPlan(null);
        return;
      }

      setSelectedPlan(
        current =>
          current || subscriptionPlans.find(p => p.recommended) || subscriptionPlans[0] || null
      );
      setSelectedPack(null);
    },
    [
      creditPacks,
      lockToCredits,
      purchaseMode,
      pricingRegion,
      purchaseExperiment.assignment,
      subscriptionPlans,
      trigger,
    ]
  );

  const handleSelectPack = useCallback((pack: ICreditPack) => {
    setSelectedPack(pack);
    setSelectedPlan(null);
    setPurchaseMode('credits');
    if (!['small', 'medium'].includes(pack.key)) setAutoTopUpEnabled(false);
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
      ...getExperimentAnalyticsProps(purchaseExperiment.assignment),
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
        ...(!checkoutContext?.experimentKey
          ? getExperimentAnalyticsProps(purchaseExperiment.assignment)
          : {}),
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
        pricingRegion: pricingRegion || 'standard',
        originatingModel: effectiveOriginModel,
        ...getExperimentAnalyticsProps(purchaseExperiment.assignment),
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
      ...getExperimentAnalyticsProps(purchaseExperiment.assignment),
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
    purchaseExperiment.assignment,
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

  const title = outOfCredits ? 'Keep enhancing instantly' : 'Get credits for premium models';
  const deficit =
    typeof requiredCredits === 'number' && typeof currentBalance === 'number'
      ? Math.max(requiredCredits - currentBalance, 0)
      : null;
  const starterCredits = starterPack?.credits;
  const subtitle = outOfCredits
    ? starterCredits
      ? `You used your free credits. Get ${starterCredits} more now and continue this upscale.`
      : 'You used your free credits. Get more now and continue this upscale.'
    : starterCredits
      ? `Credits unlock premium models and pay for each upscale or edit. Start with ${starterCredits} credits.`
      : 'Credits unlock premium models and pay for each upscale or edit.';

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
          <div
            data-testid="purchase-modal"
            className="relative w-full max-w-lg bg-surface rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden"
          >
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
                    {outOfCredits && deficit !== null && (
                      <p className="mt-2 text-xs font-semibold text-accent">
                        Need {requiredCredits} {requiredCredits === 1 ? 'credit' : 'credits'}. Your
                        balance: {currentBalance}. Deficit: {deficit}.
                      </p>
                    )}
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

                {!lockToCredits && (
                  <div className="mt-4 flex justify-center">
                    <div className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-xl border border-surface-light bg-surface-light/50 p-1">
                      <button
                        type="button"
                        onClick={() => handleModeChange('credits')}
                        className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                          purchaseMode === 'credits'
                            ? 'bg-accent text-white shadow-md'
                            : 'text-text-muted hover:bg-surface hover:text-text-primary'
                        }`}
                      >
                        <Coins className="h-3.5 w-3.5" />
                        Credits
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModeChange('subscribe')}
                        className={`relative flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                          purchaseMode === 'subscribe'
                            ? 'bg-accent text-white shadow-md'
                            : 'text-text-muted hover:bg-surface hover:text-text-primary'
                        }`}
                      >
                        <span
                          className={`absolute -right-1.5 -top-2 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase leading-none shadow-sm ${
                            purchaseMode === 'subscribe'
                              ? 'bg-success text-white shadow-[0_0_16px_rgba(34,197,94,0.65)]'
                              : 'bg-success/15 text-success shadow-[0_0_14px_rgba(34,197,94,0.35)] ring-1 ring-success/25'
                          }`}
                        >
                          Save
                        </span>
                        <Zap className="h-3.5 w-3.5" />
                        Subscription
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {purchaseMode === 'credits' ? (
                <div className="mx-4 overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/[0.03] sm:mx-5">
                  <div className="flex items-center gap-2 border-b border-amber-500/10 bg-amber-500/[0.04] px-3 py-2">
                    <Coins className="h-4 w-4 flex-shrink-0 text-amber-500" />
                    <h3 className="text-sm font-bold text-text-primary">
                      Credits for image processing
                    </h3>
                    <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600/80">
                      Buy once, use anytime
                    </span>
                  </div>

                  <div className="space-y-1.5 px-3 py-2">
                    {visibleCreditPacks.map(pack => {
                      const isSelected = selectedPack?.key === pack.key;
                      const savings = getSavingsPercent(pack, basePack);
                      return (
                        <div
                          key={pack.key}
                          onClick={() => handleSelectPack(pack)}
                          className={`relative flex cursor-pointer flex-col rounded-xl border transition-all duration-150 ${
                            isSelected
                              ? 'border-accent bg-accent/[0.04] ring-1 ring-accent/15'
                              : 'border-transparent bg-surface hover:border-surface-light/60'
                          }`}
                        >
                          <div className="flex items-center gap-2 p-2 sm:gap-2.5 sm:p-2.5">
                            <RadioCircle checked={isSelected} />
                            <CoinStackIcon className="h-5 w-5 flex-shrink-0 sm:h-6 sm:w-6" />

                            <div className="min-w-0 flex-grow">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-base font-bold leading-none text-text-primary sm:text-lg">
                                  {pack.credits}
                                </span>
                                <span className="text-xs text-text-secondary">credits</span>
                                {pack.key === 'small' && (
                                  <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                                    Starter
                                  </span>
                                )}
                                {pack.badge && (
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
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
                                <p className="mt-0.5 whitespace-nowrap text-[10px] font-medium text-success">
                                  Save {savings}%
                                </p>
                              )}
                            </div>

                            <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
                              <span className="hidden whitespace-nowrap text-[10px] text-text-muted sm:inline">
                                ${getPricePerCredit(pack, discountPercent)}/cr
                              </span>
                              <span className="min-w-[3rem] whitespace-nowrap text-right text-base font-bold tabular-nums text-text-primary sm:text-lg">
                                {formatPrice(pack.priceInCents, discountPercent)}
                              </span>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="-mt-0.5 px-2 pb-2 sm:px-2.5 sm:pb-2.5">
                              <div className="border-t border-accent/10 pt-2">
                                <ul className="space-y-1">
                                  {[
                                    'Credits never expire',
                                    'Use on any tool',
                                    'Stackable with subscriptions',
                                  ].map((feature, idx) => (
                                    <li key={idx} className="flex items-start gap-1.5">
                                      <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-success" />
                                      <span className="text-[11px] leading-tight text-text-secondary">
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
              ) : (
                <div className="mx-4 mb-3 overflow-hidden rounded-xl border border-violet-500/20 bg-violet-500/[0.03] sm:mx-5">
                  <div className="flex items-center gap-2 border-b border-violet-500/10 bg-violet-500/[0.04] px-3 py-2">
                    <Zap className="h-4 w-4 flex-shrink-0 text-violet-400" />
                    <h3 className="text-sm font-bold text-text-primary">Monthly Subscription</h3>
                    <span className="ml-auto rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300/80">
                      Save more
                    </span>
                  </div>

                  <p className="px-3 pt-2 text-[11px] text-text-secondary">
                    Monthly credits renew automatically and lower your cost per image.
                  </p>

                  <div className="space-y-1.5 px-3 py-2">
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
                              ? 'cursor-default border-success/25 bg-success/[0.03] opacity-70'
                              : isSelected
                                ? 'cursor-pointer border-accent bg-accent/[0.04] ring-1 ring-accent/15'
                                : 'cursor-pointer border-transparent bg-surface hover:border-surface-light/60'
                          }`}
                        >
                          <div className="flex items-center gap-2 p-2 sm:gap-2.5 sm:p-2.5">
                            <RadioCircle checked={isSelected || isCurrentPlan} />

                            <div
                              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full sm:h-7 sm:w-7 ${
                                isCurrentPlan ? 'bg-success/15' : 'bg-yellow-500/10'
                              }`}
                            >
                              <Star
                                className={`h-3.5 w-3.5 ${isCurrentPlan ? 'text-success' : 'text-yellow-400'}`}
                                fill="none"
                                strokeWidth={2}
                              />
                            </div>

                            <div className="min-w-0 flex-grow">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-bold text-text-primary">
                                  {plan.name}
                                </span>
                                <span className="text-[11px] text-text-secondary">
                                  {plan.creditsPerCycle.toLocaleString()} cr/mo
                                </span>
                                {discountPercent > 0 && (
                                  <span className="rounded bg-error/70 px-1 py-0.5 text-[9px] font-bold text-white">
                                    -{discountPercent}%
                                  </span>
                                )}
                                {plan.recommended && !isCurrentPlan && (
                                  <span className="rounded border border-success/20 bg-success/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                                    Best value
                                  </span>
                                )}
                                {isCurrentPlan && (
                                  <span className="rounded border border-success/20 bg-success/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                                    Current
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex-shrink-0 text-right">
                              <div className="flex items-baseline justify-end gap-1">
                                <span className="text-base font-bold leading-none tabular-nums text-text-primary sm:text-lg">
                                  {formatPriceRaw(displayPrice)}
                                </span>
                                <span className="text-[10px] text-text-muted">/mo</span>
                                {discountPercent > 0 && (
                                  <span className="ml-0.5 text-[10px] text-text-muted line-through">
                                    {formatPriceRaw(plan.priceInCents)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="-mt-0.5 px-2 pb-2 sm:px-2.5 sm:pb-2.5">
                              <div className="border-t border-accent/10 pt-2">
                                <ul className="space-y-1">
                                  {plan.features.map((feature, idx) => (
                                    <li key={idx} className="flex items-start gap-1.5">
                                      <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-success" />
                                      <span className="text-[11px] leading-tight text-text-secondary">
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
              )}

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
              {selectedPack && ['small', 'medium'].includes(selectedPack.key) && (
                <div className="mb-3 rounded-xl border border-border bg-surface-light/30 p-3 text-left">
                  <label className="flex items-start gap-2 text-sm text-text-primary">
                    <input
                      type="checkbox"
                      checked={autoTopUpEnabled}
                      onChange={event => setAutoTopUpEnabled(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span>Automatically buy this pack when my balance is low</span>
                  </label>
                  {autoTopUpEnabled && (
                    <label className="mt-2 flex items-center justify-between gap-3 text-xs text-text-secondary">
                      Refill below
                      <select
                        value={autoTopUpThreshold}
                        onChange={event => setAutoTopUpThreshold(Number(event.target.value))}
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-text-primary"
                      >
                        {[10, 25, 50].map(value => (
                          <option key={value} value={value}>
                            {value} credits
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
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
                    {getCTALabel()} - {getCTAPrice()}
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
          autoTopUp={
            autoTopUpEnabled ? { enabled: true, thresholdCredits: autoTopUpThreshold } : undefined
          }
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
