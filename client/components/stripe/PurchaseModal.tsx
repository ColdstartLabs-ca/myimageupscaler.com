'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { CreditPackSelector } from './CreditPackSelector';
import { SubscriptionPlanGrid } from './SubscriptionPlanGrid';
import { Zap, X } from 'lucide-react';
import { analytics } from '@client/analytics';
import { useRegionTier } from '@client/hooks/useRegionTier';

export interface IPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchaseComplete: () => void;
  outOfCredits?: boolean;
}

export function PurchaseModal({
  isOpen,
  onClose,
  onPurchaseComplete,
  outOfCredits = false,
}: IPurchaseModalProps): JSX.Element | null {
  const title = outOfCredits ? "You're Out of Credits" : 'Get More Credits';
  const description = outOfCredits
    ? 'Purchase credits to continue processing images, or subscribe for better value.'
    : 'Buy a one-time credit pack or subscribe for better value.';
  const [showSubscriptionCTA, setShowSubscriptionCTA] = useState(false);
  const t = useTranslations('stripe.outOfCredits');
  const { pricingRegion, discountPercent } = useRegionTier();

  useEffect(() => {
    if (isOpen) {
      analytics.track('upgrade_prompt_shown', {
        trigger: 'purchase_modal',
        currentPlan: 'free',
        pricingRegion: pricingRegion || 'standard',
      });
    }
  }, [isOpen, pricingRegion]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-end sm:items-center justify-center p-2 sm:p-4">
        <div className="relative w-full max-w-4xl bg-surface rounded-lg shadow-xl flex flex-col max-h-[95vh] sm:max-h-[90vh]">
          {/* Close button */}
          <button
            onClick={onClose}
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
                onClick={() => setShowSubscriptionCTA(false)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  !showSubscriptionCTA
                    ? 'bg-accent text-white shadow-md scale-[1.02]'
                    : 'text-muted-foreground hover:text-primary hover:bg-surface-light'
                }`}
              >
                {t('buyCredits')}
              </button>
              <button
                onClick={() => setShowSubscriptionCTA(true)}
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
                      trigger: 'purchase_modal',
                      destination: 'credits',
                      currentPlan: 'free',
                      pricingRegion: pricingRegion || 'standard',
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
                className="grid md:grid-cols-3 gap-3 pt-3"
              />
            )}

            {/* Footer */}
            <div className="mt-4 text-center">
              <button
                onClick={onClose}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                {t('notNow')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
