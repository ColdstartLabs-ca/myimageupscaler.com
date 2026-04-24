'use client';

import { Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { setCheckoutTrackingContext } from '@client/utils/checkoutTrackingContext';
import { resolveCheapestRegionalPlan } from '@shared/config/subscription.config';
import type { PricingRegion } from '@shared/config/pricing-regions';
import type { IUpgradeDirectParams } from './ModelGalleryModal';

const MOBILE_PREVIEW_SESSION_KEY = 'upgrade_prompt_shown_mobile_preview';

export interface IMobileUpgradePromptProps {
  /** Whether the prompt should be visible (caller controls show logic) */
  isVisible: boolean;
  isFreeUser: boolean;
  /** Direct checkout handler — opens CheckoutModal with cheapest plan pre-selected */
  onUpgradeDirect?: (params: IUpgradeDirectParams) => void;
  /** Fallback upgrade handler for when onUpgradeDirect is not provided */
  onUpgrade?: () => void;
  onDismiss?: () => void;
}

/**
 * A dismissible upgrade prompt shown on mobile viewports after the user has
 * been interacting with the preview area. The highest-impression trigger
 * (`mobile_preview_prompt`) converts at only 1.5% because it routes through
 * the multi-step PurchaseModal. This component uses the same direct-checkout
 * pattern introduced for model_gate (Phase 1) to skip intermediate steps.
 */
export const MobileUpgradePrompt = ({
  isVisible,
  isFreeUser,
  onUpgradeDirect,
  onUpgrade,
  onDismiss,
}: IMobileUpgradePromptProps): JSX.Element | null => {
  const [visible, setVisible] = useState(false);
  const { pricingRegion } = useRegionTier();

  useEffect(() => {
    if (!isVisible || !isFreeUser) return;
    if (typeof window === 'undefined') return;

    const alreadyShown = sessionStorage.getItem(MOBILE_PREVIEW_SESSION_KEY);
    if (alreadyShown) return;

    sessionStorage.setItem(MOBILE_PREVIEW_SESSION_KEY, 'true');
    setVisible(true);

    analytics.track('upgrade_prompt_shown', {
      trigger: 'mobile_preview_prompt',
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
    });
  }, [isVisible, isFreeUser, pricingRegion]);

  if (!visible) return null;

  const handleDismiss = () => {
    analytics.track('upgrade_prompt_dismissed', {
      trigger: 'mobile_preview_prompt',
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
    });
    setVisible(false);
    onDismiss?.();
  };

  const handleUpgradeClick = () => {
    const planId = resolveCheapestRegionalPlan((pricingRegion as PricingRegion) || 'standard');

    setCheckoutTrackingContext({ trigger: 'mobile_preview_prompt' });

    analytics.track('upgrade_prompt_clicked', {
      trigger: 'mobile_preview_prompt',
      destination: onUpgradeDirect ? 'checkout_direct' : 'upgrade_plan_modal',
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
    });

    setVisible(false);

    if (onUpgradeDirect) {
      onUpgradeDirect({ trigger: 'mobile_preview_prompt', planId });
    } else {
      onUpgrade?.();
    }
  };

  return (
    <div
      data-testid="mobile-upgrade-prompt"
      className="md:hidden mx-3 mb-2 rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3 flex items-center gap-3"
    >
      <Sparkles className="w-4 h-4 text-secondary shrink-0" />
      <p className="text-sm text-white flex-1">
        Unlock premium quality.{' '}
        <button
          data-testid="mobile-upgrade-prompt-cta"
          onClick={handleUpgradeClick}
          className="font-semibold text-secondary underline underline-offset-2 hover:text-secondary/80 transition-colors min-h-[44px] inline-flex items-center touch-manipulation"
        >
          Upgrade from $4.99
        </button>
      </p>
      <button
        onClick={handleDismiss}
        className="text-text-muted hover:text-white transition-colors p-2 rounded-full hover:bg-white/5 shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
        aria-label="Dismiss upgrade prompt"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
