'use client';

import { Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import { Modal } from '@client/components/ui/Modal';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { setCheckoutTrackingContext } from '@client/utils/checkoutTrackingContext';
import { canShowPrompt, markPromptShown } from '@client/utils/promptFrequency';
import { getVariant } from '@client/utils/abTest';

export interface IPostDownloadPromptProps {
  isFreeUser: boolean;
  downloadCount: number;
  currentModel?: string;
  onUpgrade: () => void;
}

/**
 * A dismissible modal shown to free users after download clicks.
 * Shows deterministically on the 2nd download (not random).
 * Respects 24h cooldown via promptFrequency utility.
 * Fires upgrade_prompt_shown/clicked/dismissed with trigger: 'after_download'.
 */
export const PostDownloadPrompt = ({
  isFreeUser,
  downloadCount,
  currentModel,
  onUpgrade,
}: IPostDownloadPromptProps): JSX.Element | null => {
  const [visible, setVisible] = useState(false);
  const lastEvaluatedDownloadCountRef = useRef(0);
  const { pricingRegion } = useRegionTier();

  // Get copy variant for A/B testing
  const copyVariant = getVariant('after_download_copy', ['value', 'outcome', 'urgency']);

  // Check prompt frequency throttling (24h cooldown)
  const canShow = canShowPrompt({
    key: 'prompt_freq_post_download',
    cooldownMs: 24 * 60 * 60 * 1000, // 24 hours
  });

  useEffect(() => {
    if (!isFreeUser) return;
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
      imageVariant: currentModel,
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
      copyVariant,
    });
  }, [isFreeUser, downloadCount, pricingRegion, canShow, currentModel, copyVariant]);

  if (!visible) return null;

  const handleDismiss = () => {
    analytics.track('upgrade_prompt_dismissed', {
      trigger: 'after_download',
      imageVariant: currentModel,
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
      copyVariant,
    });
    setVisible(false);
  };

  const handleUpgradeClick = () => {
    setCheckoutTrackingContext({
      trigger: 'after_download',
      originatingModel: currentModel,
    });
    analytics.track('upgrade_prompt_clicked', {
      trigger: 'after_download',
      imageVariant: currentModel,
      destination: 'purchase_modal',
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
      copyVariant,
    });
    setVisible(false);
    onUpgrade();
  };

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

          <h3 className="text-lg font-semibold text-white mb-2">Want sharper, cleaner output?</h3>
          <p className="text-sm text-text-muted mb-5">
            Love the result?{' '}
            <button
              onClick={handleUpgradeClick}
              className="font-semibold text-secondary underline underline-offset-2 hover:text-secondary/80 transition-colors"
            >
              Get 10x sharper with Premium models.
            </button>
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={handleUpgradeClick}
              className="inline-flex items-center justify-center rounded-lg bg-secondary text-black font-semibold px-4 py-2 hover:bg-secondary/90 transition-colors"
            >
              Upgrade Now
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:text-white hover:border-white/20 transition-colors"
            >
              Continue Free
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
