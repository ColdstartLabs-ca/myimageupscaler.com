'use client';

import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import { useRegionTier } from '@client/hooks/useRegionTier';

export interface IMobileUpgradePromptProps {
  variant: 'upload' | 'preview';
  isFreeUser: boolean;
}

/**
 * Inline upgrade prompt for mobile empty space below dropzone (upload variant)
 * and below the image preview during processing (preview variant).
 * Non-dismissible. Mobile-only via md:hidden.
 */
export const MobileUpgradePrompt = ({
  variant,
  isFreeUser,
}: IMobileUpgradePromptProps): JSX.Element | null => {
  const { pricingRegion } = useRegionTier();
  const trackedRef = useRef(false);

  useEffect(() => {
    if (!isFreeUser || trackedRef.current) return;
    trackedRef.current = true;
    analytics.track('upgrade_prompt_shown', {
      trigger: variant === 'upload' ? 'mobile_upload_prompt' : 'mobile_preview_prompt',
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
    });
  }, [isFreeUser, variant, pricingRegion]);

  if (!isFreeUser) return null;

  const handleClick = () => {
    analytics.track('upgrade_prompt_clicked', {
      trigger: variant === 'upload' ? 'mobile_upload_prompt' : 'mobile_preview_prompt',
      destination: '/dashboard/billing',
      currentPlan: 'free',
      pricingRegion: pricingRegion || 'standard',
    });
  };

  if (variant === 'upload') {
    return (
      <div className="md:hidden mt-4 rounded-xl border border-accent/20 bg-accent/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-accent shrink-0" />
          <span className="text-sm font-semibold text-white">Get visibly better results</span>
        </div>
        <ul className="space-y-2 mb-4">
          <li className="flex items-center gap-2 text-xs text-text-muted">
            <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
            Access pro AI models (Clarity, Real-ESRGAN Pro)
          </li>
          <li className="flex items-center gap-2 text-xs text-text-muted">
            <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
            Sharper edges, finer details, fewer artifacts
          </li>
          <li className="flex items-center gap-2 text-xs text-text-muted">
            <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
            Up to 4K output &amp; 25MB files
          </li>
        </ul>
        <Link
          href="/dashboard/billing"
          onClick={handleClick}
          className="block w-full text-center text-xs font-semibold text-accent border border-accent/40 rounded-lg py-2 hover:bg-accent/10 transition-colors"
        >
          View Plans
        </Link>
      </div>
    );
  }

  return (
    <div className="md:hidden mt-3 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-white">Unlock pro AI models for sharper results</p>
        <p className="text-[11px] text-text-muted mt-0.5">
          Clarity &amp; Real-ESRGAN Pro available
        </p>
      </div>
      <Link
        href="/dashboard/billing"
        onClick={handleClick}
        className="shrink-0 text-xs font-semibold text-accent border border-accent/40 rounded-lg px-3 py-1.5 hover:bg-accent/10 transition-colors"
      >
        Upgrade
      </Link>
    </div>
  );
};
