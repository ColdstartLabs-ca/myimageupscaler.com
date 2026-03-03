'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Sparkles } from 'lucide-react';
import { analytics } from '@client/analytics/analyticsClient';
import { canShowPrompt, markPromptShown } from '@client/utils/promptFrequency';
import { cn } from '@client/utils/cn';

const POST_DOWNLOAD_FREQ_CONFIG = {
  key: 'post_download_prompt_last_shown',
  cooldownMs: 72 * 60 * 60 * 1000, // 72 hours
};

const SESSION_KEY = 'upgrade_prompt_shown_after_download';

export interface IPostDownloadPromptProps {
  isFreeUser: boolean;
  downloadCount: number;
}

export const PostDownloadPrompt: React.FC<IPostDownloadPromptProps> = ({
  isFreeUser,
  downloadCount,
}) => {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only show for free users after at least 1 download
    if (!isFreeUser || downloadCount < 1) return;

    // Session throttle: once per session
    if (typeof window !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === 'true') return;

    // Cross-session cooldown: 72h via localStorage
    if (!canShowPrompt(POST_DOWNLOAD_FREQ_CONFIG)) return;

    setVisible(true);
    markPromptShown(POST_DOWNLOAD_FREQ_CONFIG);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SESSION_KEY, 'true');
    }
    analytics.track('upgrade_prompt_shown', { trigger: 'after_download' });
  }, [isFreeUser, downloadCount]);

  if (!visible || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    analytics.track('upgrade_prompt_dismissed', { trigger: 'after_download' });
  };

  const handleCtaClick = () => {
    analytics.track('upgrade_prompt_clicked', { trigger: 'after_download' });
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-accent/30 bg-accent/5 px-4 py-3',
        'flex items-center gap-3',
        'animate-fade-in-up'
      )}
      data-testid="post-download-prompt"
    >
      <Sparkles className="h-4 w-4 text-accent shrink-0" />
      <p className="flex-1 text-xs font-medium text-white/80">
        Love the result?{' '}
        <span className="text-white font-bold">Get 10x sharper with Premium models.</span>
      </p>
      <Link
        href="/dashboard/billing"
        onClick={handleCtaClick}
        className="shrink-0 text-xs font-black uppercase tracking-wide text-accent hover:text-accent/80 transition-colors"
        data-testid="post-download-prompt-cta"
      >
        See Premium Plans
      </Link>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-white/40 hover:text-white/70 transition-colors p-0.5"
        aria-label="Dismiss upgrade prompt"
        data-testid="post-download-prompt-dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
