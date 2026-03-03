'use client';

import { Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import { Modal } from '@client/components/ui/Modal';

const POST_DOWNLOAD_SHOW_PROBABILITY = 0.5;

export interface IPostDownloadPromptProps {
  isFreeUser: boolean;
  downloadCount: number;
}

/**
 * A dismissible modal shown to free users after download clicks.
 * Evaluates a simple 50% chance on each new download event.
 * Fires upgrade_prompt_shown/clicked/dismissed with trigger: 'after_download'.
 */
export const PostDownloadPrompt = ({
  isFreeUser,
  downloadCount,
}: IPostDownloadPromptProps): JSX.Element | null => {
  const [visible, setVisible] = useState(false);
  const lastEvaluatedDownloadCountRef = useRef(0);

  useEffect(() => {
    if (!isFreeUser) return;
    if (downloadCount < 1) return;
    if (downloadCount === lastEvaluatedDownloadCountRef.current) return;
    lastEvaluatedDownloadCountRef.current = downloadCount;

    if (Math.random() >= POST_DOWNLOAD_SHOW_PROBABILITY) return;

    setVisible(true);

    analytics.track('upgrade_prompt_shown', {
      trigger: 'after_download',
      currentPlan: 'free',
    });
  }, [isFreeUser, downloadCount]);

  if (!visible) return null;

  const handleDismiss = () => {
    analytics.track('upgrade_prompt_dismissed', {
      trigger: 'after_download',
      currentPlan: 'free',
    });
    setVisible(false);
  };

  const handleUpgradeClick = () => {
    analytics.track('upgrade_prompt_clicked', {
      trigger: 'after_download',
      destination: '/dashboard/billing',
      currentPlan: 'free',
    });
    setVisible(false);
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
            <Link
              href="/dashboard/billing"
              className="font-semibold text-secondary underline underline-offset-2 hover:text-secondary/80 transition-colors"
              onClick={handleUpgradeClick}
            >
              Get 10x sharper with Premium models.
            </Link>
          </p>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/billing"
              className="inline-flex items-center justify-center rounded-lg bg-secondary text-black font-semibold px-4 py-2 hover:bg-secondary/90 transition-colors"
              onClick={handleUpgradeClick}
            >
              Upgrade Now
            </Link>
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
