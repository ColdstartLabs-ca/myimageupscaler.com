'use client';

import { Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import { canShowPrompt, markPromptShown } from '@client/utils/promptFrequency';
import { getVariant } from '@client/utils/abTest';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { setCheckoutTrackingContext } from '@client/utils/checkoutTrackingContext';
import type { QualityTier } from '@/shared/types/coreflow.types';

const AFTER_UPSCALE_SESSION_KEY = 'upgrade_prompt_shown_after_upscale';
const AFTER_UPSCALE_THRESHOLD = 3;
const AFTER_UPSCALE_LS_KEY = 'prompt_freq_after_upscale';

export interface IAfterUpscaleBannerProps {
  completedCount: number;
  isFreeUser: boolean;
  currentModel?: QualityTier;
  onUpgrade?: () => void;
}

/**
 * A dismissible banner shown to free users after they complete their 3rd upscale in a session.
 * Fires upgrade_prompt_shown once per session with trigger: 'after_upscale'.
 */
export const AfterUpscaleBanner = ({
  completedCount,
  isFreeUser,
  currentModel,
  onUpgrade,
}: IAfterUpscaleBannerProps): JSX.Element | null => {
  const [visible, setVisible] = useState(false);
  const { pricingRegion } = useRegionTier();

  // Get copy variant for A/B testing
  const copyVariant = getVariant('after_upscale_copy', ['value', 'outcome', 'urgency']);

  useEffect(() => {
    if (!isFreeUser) return;
    if (completedCount < AFTER_UPSCALE_THRESHOLD) return;
    if (typeof window === 'undefined') return;

    if (!canShowPrompt({ key: AFTER_UPSCALE_LS_KEY, cooldownMs: 24 * 60 * 60 * 1000 })) return;

    const alreadyShown = sessionStorage.getItem(AFTER_UPSCALE_SESSION_KEY);
    if (alreadyShown) return;

    sessionStorage.setItem(AFTER_UPSCALE_SESSION_KEY, 'true');
    markPromptShown({ key: AFTER_UPSCALE_LS_KEY, cooldownMs: 24 * 60 * 60 * 1000 });
    setVisible(true);
    analytics.track('upgrade_prompt_shown', {
      trigger: 'after_upscale',
      imageVariant: currentModel,
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
      copyVariant,
    });
  }, [completedCount, isFreeUser, currentModel, pricingRegion, copyVariant]);

  if (!visible) return null;

  const handleDismiss = () => {
    analytics.track('upgrade_prompt_dismissed', {
      trigger: 'after_upscale',
      imageVariant: currentModel,
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
      copyVariant,
    });
    setVisible(false);
  };

  const upgradeCtaText =
    currentModel === 'face-restore'
      ? 'Try Portrait Pro for sharper faces.'
      : 'Upgrade for unlimited.';

  const handleUpgradeClick = () => {
    setCheckoutTrackingContext({
      trigger: 'after_upscale',
      originatingModel: currentModel,
    });
    analytics.track('upgrade_prompt_clicked', {
      trigger: 'after_upscale',
      imageVariant: currentModel,
      destination: 'upgrade_plan_modal',
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
      copyVariant,
    });
    onUpgrade?.();
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3 flex items-center gap-3">
      <Sparkles className="w-4 h-4 text-secondary shrink-0" />
      <p className="text-sm text-white flex-1">
        You&apos;ve upscaled {AFTER_UPSCALE_THRESHOLD} images.{' '}
        <button
          className="font-semibold text-secondary underline underline-offset-2 hover:text-secondary/80 transition-colors"
          onClick={handleUpgradeClick}
        >
          {upgradeCtaText}
        </button>
      </p>
      <button
        onClick={handleDismiss}
        className="text-text-muted hover:text-white transition-colors p-1 rounded-full hover:bg-white/5 shrink-0"
        aria-label="Dismiss upgrade prompt"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
