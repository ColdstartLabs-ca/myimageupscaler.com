'use client';

import { Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import { Modal } from '@client/components/ui/Modal';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { getVariant } from '@client/utils/abTest';
import { useTranslations } from 'next-intl';

export interface IPostDownloadPromptProps {
  isFreeUser: boolean;
  downloadCount: number;
  currentModel?: string;
  onExploreModels: () => void;
}

/**
 * A dismissible modal shown to free users after download clicks.
 * Shows on every successful download for free users.
 * Fires upgrade_prompt_shown/clicked/dismissed with trigger: 'post_download_explore'.
 */
export const PostDownloadPrompt = ({
  isFreeUser,
  downloadCount,
  currentModel,
  onExploreModels,
}: IPostDownloadPromptProps): JSX.Element | null => {
  const t = useTranslations('workspace.postDownloadPrompt');
  const [visible, setVisible] = useState(false);
  const previousDownloadCountRef = useRef(downloadCount);
  const { pricingRegion } = useRegionTier();

  // Get copy variant for A/B testing
  const copyVariant = getVariant('after_download_copy', ['value', 'outcome', 'urgency']);

  useEffect(() => {
    const previousDownloadCount = previousDownloadCountRef.current;
    previousDownloadCountRef.current = downloadCount;

    if (!isFreeUser) return;
    if (downloadCount < 1) return;
    if (downloadCount <= previousDownloadCount) return;

    setVisible(true);
    analytics.track('upgrade_prompt_shown', {
      trigger: 'post_download_explore',
      imageVariant: currentModel,
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
      copyVariant,
    });
  }, [isFreeUser, downloadCount, pricingRegion, currentModel, copyVariant]);

  if (!visible) return null;

  const handleDismiss = () => {
    analytics.track('upgrade_prompt_dismissed', {
      trigger: 'post_download_explore',
      imageVariant: currentModel,
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
      copyVariant,
    });
    setVisible(false);
  };

  const handleExploreModelsClick = () => {
    analytics.track('upgrade_prompt_clicked', {
      trigger: 'post_download_explore',
      imageVariant: currentModel,
      destination: 'model_gallery',
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
      copyVariant,
    });
    setVisible(false);
    onExploreModels();
  };

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

          <h3 className="text-lg font-semibold text-white mb-2">{t('title')}</h3>
          <p className="text-sm text-text-muted mb-5">{t('body')}</p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={handleExploreModelsClick}
              className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-secondary to-accent px-5 py-3.5 text-base font-bold text-white shadow-lg shadow-secondary/20 transition-all hover:scale-[1.01] hover:shadow-xl hover:shadow-secondary/30 sm:flex-1"
            >
              {t('cta')}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-3 text-sm text-text-muted transition-colors hover:border-white/20 hover:text-white sm:px-5"
            >
              {t('maybeLater')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
