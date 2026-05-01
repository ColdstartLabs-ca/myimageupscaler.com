'use client';

import type { UserSegment } from '@/shared/types/stripe.types';
import { Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import { Modal } from '@client/components/ui/Modal';
import { setCheckoutTrackingContext } from '@client/utils/checkoutTrackingContext';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { getVariant } from '@client/utils/abTest';
import { canShowPrompt, markPromptShown } from '@client/utils/promptFrequency';
import { useTranslations } from 'next-intl';

export interface IPostDownloadPromptProps {
  userSegment: UserSegment;
  downloadCount: number;
  currentModel?: string;
  onExploreModels: () => void;
}

/**
 * A dismissible modal shown to free and credit_purchaser users after download clicks.
 * Shows deterministically on the 2nd download (not random).
 * Respects 24h cooldown via promptFrequency utility.
 * Fires upgrade_prompt_shown/clicked/dismissed with trigger: 'after_download'.
 * Segment-aware: credit_purchaser sees subscription messaging. */
const POST_DOWNLOAD_PROMPT_KEY = 'post_download_prompt';
export const PostDownloadPrompt = ({
  userSegment,
  downloadCount,
  currentModel,
  onExploreModels,
}: IPostDownloadPromptProps): JSX.Element | null => {
  const t = useTranslations('workspace.postDownloadPrompt');
  const [visible, setVisible] = useState(false);
  const previousDownloadCountRef = useRef(downloadCount);
  const { pricingRegion } = useRegionTier();
  const isCreditPurchaser = userSegment === 'credit_purchaser';
  const showPrompt = userSegment !== 'subscriber';

  // Get copy variant for A/B testing
  const copyVariant = getVariant('after_download_copy', ['value', 'outcome', 'urgency']);

  useEffect(() => {
    if (!showPrompt) return;
    if (downloadCount < 1) return;
    if (downloadCount <= previousDownloadCountRef.current) return;

    previousDownloadCountRef.current = downloadCount;

    // Respect 24-hour cooldown
    if (!canShowPrompt({ key: POST_DOWNLOAD_PROMPT_KEY, cooldownMs: 24 * 60 * 60 * 1000 })) {
      return;
    }

    setVisible(true);
    markPromptShown({ key: POST_DOWNLOAD_PROMPT_KEY, cooldownMs: 24 * 60 * 60 * 1000 });
    analytics.track('upgrade_prompt_shown', {
      trigger: 'post_download_explore',
      imageVariant: currentModel,
      currentPlan: userSegment,
      userSegment,
      pricingRegion: pricingRegion || 'standard',
      copyVariant,
    });
  }, [showPrompt, userSegment, downloadCount, pricingRegion, currentModel, copyVariant]);

  if (!visible) return null;

  const handleDismiss = () => {
    analytics.track('upgrade_prompt_dismissed', {
      trigger: 'post_download_explore',
      imageVariant: currentModel,
      currentPlan: userSegment,
      userSegment,
      pricingRegion: pricingRegion || 'standard',
      copyVariant,
    });
    setVisible(false);
  };

  const handleExploreModelsClick = () => {
    analytics.track('upgrade_prompt_clicked', {
      trigger: 'post_download_explore',
      imageVariant: currentModel,
      destination: isCreditPurchaser ? 'billing_subscription_tab' : 'purchase_modal',
      currentPlan: userSegment,
      userSegment,
      pricingRegion: pricingRegion || 'standard',
      copyVariant,
    });
    setCheckoutTrackingContext({ originatingTrigger: 'post_download_explore' });
    setVisible(false);
    onExploreModels();
  };

  // Segment-aware copy
  const title = isCreditPurchaser
    ? 'Want consistent quality every month?'
    : 'Want sharper, cleaner output?';
  const description = 'Love the result? ';
  const linkText = isCreditPurchaser
    ? 'Get 100 credits/mo with a subscription.'
    : 'Get 10x sharper with Premium models.';
  const ctaText = isCreditPurchaser ? 'View Subscriptions' : 'Upgrade Now';
  const continueText = isCreditPurchaser ? 'Continue' : 'Continue Free';

  return (
    <Modal
      isOpen={visible}
      onClose={handleDismiss}
      size="sm"
      showCloseButton={false}
      backdropClassName="bg-black/55 backdrop-blur-sm"
      panelClassName="border border-white/10 shadow-[0_32px_120px_rgba(0,0,0,0.72)]"
    >
      <div className="relative">
        <button
          onClick={handleDismiss}
          className="absolute top-0 right-0 text-text-muted hover:text-white transition-colors p-1 rounded-full hover:bg-white/5"
          aria-label={t('dismiss')}
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
              onClick={handleExploreModelsClick}
              className="font-semibold text-secondary underline underline-offset-2 hover:text-secondary/80 transition-colors"
            >
              {linkText}
            </button>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={handleExploreModelsClick}
              className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-secondary to-accent px-5 py-3.5 text-base font-bold text-white shadow-lg shadow-secondary/20 transition-all hover:scale-[1.01] hover:shadow-xl hover:shadow-secondary/30 sm:flex-1"
            >
              {ctaText}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-3 text-sm text-text-muted transition-colors hover:border-white/20 hover:text-white sm:px-5"
            >
              {continueText}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
