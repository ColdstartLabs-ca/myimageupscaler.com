'use client';

import { Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import { canShowPrompt, markPromptShown } from '@client/utils/promptFrequency';

const POST_DOWNLOAD_SESSION_KEY = 'upgrade_prompt_shown_after_download';
const POST_DOWNLOAD_LS_KEY = 'prompt_freq_after_download';
const POST_DOWNLOAD_COOLDOWN_MS = 72 * 60 * 60 * 1000; // 72 hours

export interface IPostDownloadPromptProps {
  isFreeUser: boolean;
  downloadCount: number;
}

/**
 * A dismissible slide-in banner shown to free users after their first download.
 * Uses both sessionStorage (once per session) and localStorage (72h cross-session) throttling.
 * Fires upgrade_prompt_shown/clicked/dismissed with trigger: 'after_download'.
 */
export const PostDownloadPrompt = ({
  isFreeUser,
  downloadCount,
}: IPostDownloadPromptProps): JSX.Element | null => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isFreeUser) return;
    if (downloadCount < 1) return;
    if (typeof window === 'undefined') return;

    // Cross-session 72h cooldown
    if (!canShowPrompt({ key: POST_DOWNLOAD_LS_KEY, cooldownMs: POST_DOWNLOAD_COOLDOWN_MS }))
      return;

    // Once per session
    const alreadyShown = sessionStorage.getItem(POST_DOWNLOAD_SESSION_KEY);
    if (alreadyShown) return;

    sessionStorage.setItem(POST_DOWNLOAD_SESSION_KEY, 'true');
    markPromptShown({ key: POST_DOWNLOAD_LS_KEY, cooldownMs: POST_DOWNLOAD_COOLDOWN_MS });
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
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3 flex items-center gap-3 animate-slide-up">
      <Sparkles className="w-4 h-4 text-secondary shrink-0" />
      <p className="text-sm text-white flex-1">
        Love the result?{' '}
        <Link
          href="/dashboard/billing"
          className="font-semibold text-secondary underline underline-offset-2 hover:text-secondary/80 transition-colors"
          onClick={handleUpgradeClick}
        >
          Get 10x sharper with Premium models.
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
