'use client';

import { Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import { canShowPrompt, markPromptShown } from '@client/utils/promptFrequency';
import { useRegionTier } from '@client/hooks/useRegionTier';

const AFTER_UPSCALE_SESSION_KEY = 'upgrade_prompt_shown_after_upscale';
const AFTER_UPSCALE_THRESHOLD = 3;
const AFTER_UPSCALE_LS_KEY = 'prompt_freq_after_upscale';

export interface IAfterUpscaleBannerProps {
  completedCount: number;
  isFreeUser: boolean;
}

/**
 * A dismissible banner shown to free users after they complete their 3rd upscale in a session.
 * Fires upgrade_prompt_shown once per session with trigger: 'after_upscale'.
 */
export const AfterUpscaleBanner = ({
  completedCount,
  isFreeUser,
}: IAfterUpscaleBannerProps): JSX.Element | null => {
  const [visible, setVisible] = useState(false);
  const { pricingRegion } = useRegionTier();

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
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
    });
  }, [completedCount, isFreeUser, pricingRegion]);

  if (!visible) return null;

  const handleDismiss = () => {
    analytics.track('upgrade_prompt_dismissed', {
      trigger: 'after_upscale',
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
    });
    setVisible(false);
  };

  const handleUpgradeClick = () => {
    analytics.track('upgrade_prompt_clicked', {
      trigger: 'after_upscale',
      destination: '/pricing',
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
    });
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3 flex items-center gap-3">
      <Sparkles className="w-4 h-4 text-secondary shrink-0" />
      <p className="text-sm text-white flex-1">
        You&apos;ve upscaled {AFTER_UPSCALE_THRESHOLD} images.{' '}
        <Link
          href="/pricing"
          className="font-semibold text-secondary underline underline-offset-2 hover:text-secondary/80 transition-colors"
          onClick={handleUpgradeClick}
        >
          Upgrade for unlimited.
        </Link>
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
