'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { CreditPackSelector } from './CreditPackSelector';
import { SubscriptionPlanGrid } from './SubscriptionPlanGrid';
import { PlanChangeModal } from './PlanChangeModal';
import { Zap, X } from 'lucide-react';
import { analytics } from '@client/analytics';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { useCurrentPlan } from '@client/hooks/useCurrentPlan';
import {
  clearCheckoutTrackingContext,
  getCheckoutTrackingContext,
  setCheckoutTrackingContext,
} from '@client/utils/checkoutTrackingContext';

export interface IPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchaseComplete: () => void;
  outOfCredits?: boolean;
  /** Where in the UI this modal was triggered from */
  trigger?: string;
}

export function PurchaseModal({
  isOpen,
  onClose,
  onPurchaseComplete,
  outOfCredits = false,
  trigger = 'unknown',
}: IPurchaseModalProps): JSX.Element | null {
  const title = outOfCredits ? "You're Out of Credits" : 'Get More Credits';
  const description = outOfCredits
    ? 'Purchase credits to continue processing images, or subscribe for better value.'
    : 'Buy a one-time credit pack or subscribe for better value.';
  const [showSubscriptionCTA, setShowSubscriptionCTA] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isPlanChangeModalOpen, setIsPlanChangeModalOpen] = useState(false);
  const t = useTranslations('stripe.outOfCredits');
  const { pricingRegion, discountPercent } = useRegionTier();
  const openTimeRef = useRef<number>(0);
  const {
    planKey: currentPlan,
    priceId: currentPriceId,
    subscriptionPrice: currentSubscriptionPrice,
  } = useCurrentPlan();

  useEffect(() => {
    if (isOpen) {
      openTimeRef.current = Date.now();
      if (!getCheckoutTrackingContext()?.trigger) {
        setCheckoutTrackingContext({ trigger });
      }
      analytics.track('upgrade_prompt_shown', {
        trigger,
        outOfCredits,
        currentPlan,
        pricingRegion: pricingRegion || 'standard',
        initialTab: 'credits',
      });
    }
  }, [isOpen, trigger, outOfCredits, pricingRegion, currentPlan]);

  const handleTabChange = (tab: 'credits' | 'subscribe') => {
    const currentTab = showSubscriptionCTA ? 'subscribe' : 'credits';
    if (tab === currentTab) return;
    analytics.track('upgrade_prompt_tab_toggled', {
      trigger,
      from: currentTab,
      to: tab,
      pricingRegion: pricingRegion || 'standard',
      timeOpenMs: Date.now() - openTimeRef.current,
    });
    setShowSubscriptionCTA(tab === 'subscribe');
  };

  const handleDismiss = (method: 'backdrop' | 'close_button' | 'not_now') => {
    analytics.track('upgrade_prompt_dismissed', {
      trigger,
      method,
      activeTab: showSubscriptionCTA ? 'subscribe' : 'credits',
      outOfCredits,
      pricingRegion: pricingRegion || 'standard',
      timeOpenMs: Date.now() - openTimeRef.current,
    });
    clearCheckoutTrackingContext();
    onClose();
  };

  const handlePlanSelect = (priceId: string) => {
    setSelectedPlanId(priceId);
    setIsPlanChangeModalOpen(true);
  };

  const handlePlanChangeComplete = () => {
    setIsPlanChangeModalOpen(false);
    setSelectedPlanId(null);
    onPurchaseComplete();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={() => handleDismiss('backdrop')}
        />

        {/* Modal */}
        <div className="flex min-h-full items-end sm:items-center justify-center p-2 sm:p-4">
          <div className="relative w-full max-w-4xl bg-surface rounded-lg shadow-xl flex flex-col max-h-[95vh] sm:max-h-[90vh]">
            {/* Close button */}
            <button
              onClick={() => handleDismiss('close_button')}
              className="absolute top-3 right-3 z-10 text-muted-foreground hover:text-muted-foreground transition-colors"
              aria-label={t('notNow')}
            >
              <X size={20} />
            </button>

            {/* Header */}
            <div className="text-center pt-4 pb-2 px-10">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Zap className="h-5 w-5 text-accent shrink-0" />
                <h2 className="text-xl font-bold text-text-primary">{title}</h2>
              </div>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            {/* Tabs: One-Time vs Subscription */}
            <div className="flex justify-center flex-shrink-0 pt-0.5 pb-2">
              <div className="bg-surface-light/50 p-1 rounded-xl flex gap-1 border border-surface-light">
                <button
                  onClick={() => handleTabChange('credits')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    !showSubscriptionCTA
                      ? 'bg-accent text-white shadow-md scale-[1.02]'
                      : 'text-muted-foreground hover:text-primary hover:bg-surface-light'
                  }`}
                >
                  {t('buyCredits')}
                </button>
                <button
                  onClick={() => handleTabChange('subscribe')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    showSubscriptionCTA
                      ? 'bg-accent text-white shadow-md scale-[1.02]'
                      : 'text-muted-foreground hover:text-primary hover:bg-surface-light'
                  }`}
                >
                  {t('subscribe')}
                  <span className="ml-1.5 text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                    Best Value
                  </span>
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto px-4 sm:px-6 pt-3 pb-4 flex-grow">
              {!showSubscriptionCTA ? (
                <>
                  <CreditPackSelector
                    discountPercent={discountPercent}
                    onPurchaseStart={() => {
                      analytics.track('upgrade_prompt_clicked', {
                        trigger,
                        destination: 'credits',
                        currentPlan,
                        outOfCredits,
                        pricingRegion: pricingRegion || 'standard',
                        timeOpenMs: Date.now() - openTimeRef.current,
                      });
                    }}
                    onPurchaseComplete={() => {
                      onPurchaseComplete();
                      onClose();
                    }}
                    onError={error => console.error(error)}
                  />

                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    {t('subscribeNote')}
                  </p>
                </>
              ) : (
                <SubscriptionPlanGrid
                  discountPercent={discountPercent}
                  currentPriceId={currentPriceId ?? undefined}
                  currentSubscriptionPrice={currentSubscriptionPrice}
                  onSelect={currentPriceId ? handlePlanSelect : undefined}
                  className="grid md:grid-cols-3 gap-3 pt-3"
                />
              )}

              {/* Footer */}
              <div className="mt-4 text-center">
                <button
                  onClick={() => handleDismiss('not_now')}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  {t('notNow')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Plan change flow for existing subscribers — outside z-50 stacking context */}
      {selectedPlanId && currentPriceId && (
        <PlanChangeModal
          isOpen={isPlanChangeModalOpen}
          onClose={() => {
            setIsPlanChangeModalOpen(false);
            setSelectedPlanId(null);
          }}
          targetPriceId={selectedPlanId}
          currentPriceId={currentPriceId}
          onComplete={handlePlanChangeComplete}
        />
      )}
    </>
  );
}
