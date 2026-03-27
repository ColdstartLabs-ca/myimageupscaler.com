'use client';

import type { UserSegment } from '@/shared/types/stripe.types';
import { Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import { Modal } from '@client/components/ui/Modal';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { canShowPrompt, markPromptShown } from '@client/utils/promptFrequency';

export interface IPostDownloadPromptProps {
  userSegment: UserSegment;
  downloadCount: number;
  onUpgrade: () => void;
}

/**
 * A dismissible modal shown to free and credit_purchaser users after download clicks.
 * Shows deterministically on the 2nd download (not random).
 * Respects 24h cooldown via promptFrequency utility.
 * Fires upgrade_prompt_shown/clicked/dismissed with trigger: 'after_download'.
 * Segment-aware: credit_purchaser sees subscription messaging.
 */
export const PostDownloadPrompt = ({
  userSegment,
  downloadCount,
  onUpgrade,
}: IPostDownloadPromptProps): JSX.Element | null => {
  const [visible, setVisible] = useState(false);
  const lastEvaluatedDownloadCountRef = useRef(0);
  const { pricingRegion } = useRegionTier();
  const isCreditPurchaser = userSegment === 'credit_purchaser';
  const showPrompt = userSegment !== 'subscriber';

  // Check prompt frequency throttling (24h cooldown)
  const canShow = canShowPrompt({
    key: 'prompt_freq_post_download',
    cooldownMs: 24 * 60 * 60 * 1000, // 24 hours
  });

  useEffect(() => {
    if (!showPrompt) return;
    if (downloadCount < 1) return;
    if (downloadCount === lastEvaluatedDownloadCountRef.current) return;
    lastEvaluatedDownloadCountRef.current = downloadCount;

    // Changed: Show deterministically on 2nd download, not random 50%
    if (downloadCount !== 2) return;
    if (!canShow) return;

    // Mark prompt as shown when it is displayed
    markPromptShown({
      key: 'prompt_freq_post_download',
      cooldownMs: 24 * 60 * 60 * 1000,
    });

    setVisible(true);
    analytics.track('upgrade_prompt_shown', {
      trigger: 'after_download',
      currentPlan: userSegment,
      userSegment,
      pricingRegion: pricingRegion || 'standard',
    });
  }, [showPrompt, userSegment, downloadCount, pricingRegion, canShow]);

  if (!visible) return null;

  const handleDismiss = () => {
    analytics.track('upgrade_prompt_dismissed', {
      trigger: 'after_download',
      currentPlan: userSegment,
      userSegment,
      pricingRegion: pricingRegion || 'standard',
    });
    setVisible(false);
  };

  const handleUpgradeClick = () => {
    analytics.track('upgrade_prompt_clicked', {
      trigger: 'after_download',
      destination: isCreditPurchaser ? 'billing_subscription_tab' : 'purchase_modal',
      currentPlan: userSegment,
      userSegment,
      pricingRegion: pricingRegion || 'standard',
    });
    setVisible(false);
    onUpgrade();
  };

  // Segment-aware copy
  const title = isCreditPurchaser
    ? 'Want consistent quality every month?'
    : 'Want sharper, cleaner output?';
  const description = isCreditPurchaser
    ? 'Love the result? '
    : 'Love the result? ';
  const linkText = isCreditPurchaser
    ? 'Get 100 credits/mo with a subscription.'
    : 'Get 10x sharper with Premium models.';
  const ctaText = isCreditPurchaser ? 'View Subscriptions' : 'Upgrade Now';

  // Segment-aware button text
  const continueText = isCreditPurchaser ? 'Continue' : 'Continue Free';

  return (
    <Modal isOpen={visible} onClose={handleDismiss} size="sm" showCloseButton={false}>
      <div className="relative">
        <button
          onClick={handleDismiss}
          className="absolute top-0 right-0 text-text-muted hover:text-white transition-colors p-1 rounded-full hover:bg-white/5"
          aria-label="Dismiss upgrade prompt"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="pr-8">
          <div className="mb-3 inline-flex items-center justify-center rounded-full bg-secondary/20 p-2">
            <Sparkles className="w-4 h-4 text-secondary shrink-0" />
          </div>

          <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
          <p className="text-sm text-text-muted mb-5">
            {description}
            <button
              onClick={handleUpgradeClick}
              className="font-semibold text-secondary underline underline-offset-2 hover:text-secondary/80 transition-colors"
            >
              {linkText}
            </button>
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={handleUpgradeClick}
              className="inline-flex items-center justify-center rounded-lg bg-secondary text-black font-semibold px-4 py-2 hover:bg-secondary/90 transition-colors"
            >
              {ctaText}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:text-white hover:border-white/20 transition-colors"
            >
              {continueText}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
