'use client';

import { Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import { Modal } from '@client/components/ui/Modal';
import { setCheckoutTrackingContext } from '@client/utils/checkoutTrackingContext';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { getUserId, getVariantForIdentity } from '@client/utils/abTest';
import { useUserStore } from '@client/store/userStore';
import { useTranslations } from 'next-intl';

export interface IPostDownloadPromptProps {
  isFreeUser: boolean;
  downloadCount: number;
  currentModel?: string;
  onExploreModels: () => void;
}

const POST_DOWNLOAD_DISMISS_KEY = 'post_download_explore_dismiss_count';
const POST_DOWNLOAD_MAX_DISMISSES = 2;
const POST_DOWNLOAD_EXPERIMENT_KEY = 'post_download_surface';
const POST_DOWNLOAD_VARIANTS = ['blocking_modal_control', 'inline_explore_treatment'] as const;
type TPostDownloadVariant = (typeof POST_DOWNLOAD_VARIANTS)[number];

function getDismissCount(): number {
  if (typeof window === 'undefined') return 0;

  const raw = localStorage.getItem(POST_DOWNLOAD_DISMISS_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function incrementDismissCount(): number {
  if (typeof window === 'undefined') return 0;

  const next = getDismissCount() + 1;
  localStorage.setItem(POST_DOWNLOAD_DISMISS_KEY, String(next));
  return next;
}

/**
 * Fixed post-download A/B surface for free users after successful downloads.
 * Control shows the existing modal; treatment shows a non-blocking inline action.
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
  const funnelContextRef = useRef<ReturnType<typeof setCheckoutTrackingContext> | null>(null);
  const { pricingRegion } = useRegionTier();
  const userId = useUserStore(state => state.user?.id);
  const assignmentIdentity = userId ? `user:${userId}` : `device:${getUserId()}`;
  const experimentVariant = getVariantForIdentity(
    POST_DOWNLOAD_EXPERIMENT_KEY,
    POST_DOWNLOAD_VARIANTS,
    assignmentIdentity
  ) as TPostDownloadVariant;

  useEffect(() => {
    const previousDownloadCount = previousDownloadCountRef.current;
    previousDownloadCountRef.current = downloadCount;

    if (!isFreeUser) return;
    if (downloadCount < 1) return;
    if (downloadCount <= previousDownloadCount) return;
    if (getDismissCount() >= POST_DOWNLOAD_MAX_DISMISSES) return;

    const funnelContext = setCheckoutTrackingContext({
      entrySurface: 'post_download_explore',
      trigger: 'post_download_explore',
    });
    funnelContextRef.current = funnelContext;
    setVisible(true);
    analytics.track('upgrade_prompt_shown', {
      trigger: 'post_download_explore',
      imageVariant: currentModel,
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
      experimentKey: POST_DOWNLOAD_EXPERIMENT_KEY,
      experimentVariant,
      funnelAttemptId: funnelContext?.funnelAttemptId,
      entrySurface: funnelContext?.entrySurface,
      attributionChain: funnelContext?.attributionChain,
    });
  }, [isFreeUser, downloadCount, pricingRegion, currentModel, experimentVariant]);

  if (!visible) return null;

  const handleDismiss = () => {
    const dismissCount = incrementDismissCount();
    analytics.track('upgrade_prompt_dismissed', {
      trigger: 'post_download_explore',
      imageVariant: currentModel,
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
      experimentKey: POST_DOWNLOAD_EXPERIMENT_KEY,
      experimentVariant,
      funnelAttemptId: funnelContextRef.current?.funnelAttemptId,
      entrySurface: funnelContextRef.current?.entrySurface,
      attributionChain: funnelContextRef.current?.attributionChain,
      dismissCount,
    });
    setVisible(false);
  };

  const handleExploreModelsClick = () => {
    const funnelContext = setCheckoutTrackingContext({
      originatingTrigger: 'post_download_explore',
    });
    analytics.track('upgrade_prompt_clicked', {
      trigger: 'post_download_explore',
      imageVariant: currentModel,
      destination: 'model_gallery',
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
      experimentKey: POST_DOWNLOAD_EXPERIMENT_KEY,
      experimentVariant,
      funnelAttemptId: funnelContext?.funnelAttemptId,
      entrySurface: funnelContext?.entrySurface,
      attributionChain: funnelContext?.attributionChain,
    });
    setVisible(false);
    onExploreModels();
  };

  if (experimentVariant === 'inline_explore_treatment') {
    return (
      <div data-testid="post-download-inline-action" className="px-3 pt-3 md:px-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-light p-3">
          <Sparkles className="h-4 w-4 shrink-0 text-secondary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary">{t('title')}</p>
            <p className="truncate text-xs text-text-muted">{t('body')}</p>
          </div>
          <button
            type="button"
            onClick={handleExploreModelsClick}
            className="shrink-0 rounded-lg bg-secondary px-3 py-2 text-sm font-bold text-text-primary transition-opacity hover:opacity-90"
          >
            {t('cta')}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 rounded-full p-1 text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
            aria-label={t('dismiss')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

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
