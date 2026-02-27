'use client';

import { Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export interface IUpgradeSuccessBannerProps {
  processedCount: number;
  onDismiss: () => void;
  hasSubscription: boolean;
}

export const UpgradeSuccessBanner = ({
  processedCount,
  onDismiss,
  hasSubscription,
}: IUpgradeSuccessBannerProps): JSX.Element | null => {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('upgrade-banner-dismissed') === 'true';
    }
    return false;
  });

  if (dismissed || hasSubscription) {
    return null;
  }

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('upgrade-banner-dismissed', 'true');
    }
    setDismissed(true);
    onDismiss();
  };

  return (
    <div className="relative overflow-hidden rounded-xl sm:rounded-2xl glass-strong p-2.5 sm:p-5 text-white shadow-xl animated-border border-accent/30">
      {/* Ambient backgrounds for a more premium feel */}
      <div className="absolute -right-4 -top-12 h-32 w-32 rounded-full bg-accent/20 blur-3xl opacity-50" />
      <div className="absolute -left-12 -bottom-12 h-32 w-32 rounded-full bg-secondary/20 blur-3xl opacity-50" />

      {/* Close button */}
      <button
        onClick={handleDismiss}
        className="absolute right-2 top-2 sm:right-3 sm:top-3 text-white/50 transition-colors hover:text-white z-10 p-1 hover:bg-white/5 rounded-full"
      >
        <X size={14} className="sm:w-4 sm:h-4" />
      </button>

      <div className="flex flex-row items-center gap-2.5 sm:gap-5 relative z-10">
        <div className="flex-shrink-0">
          <div className="flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-accent to-secondary shadow-lg shadow-accent/20">
            <Sparkles className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
          </div>
        </div>
        <div className="flex-1 text-left pr-5">
          <h3 className="text-[13px] sm:text-base font-bold tracking-tight">
            Great work! {processedCount} {processedCount === 1 ? 'image' : 'images'} enhanced
          </h3>
          <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-white/80 leading-relaxed max-w-md font-medium hidden sm:block">
            Unlock{' '}
            <span className="text-white font-bold italic underline decoration-accent/50 underline-offset-2">
              Professional Mode
            </span>{' '}
            for 1,000 credits/month and save over 50% on high-quality upscales.
          </p>
          <div className="mt-1.5 sm:mt-4 flex flex-wrap items-center gap-3 sm:gap-5">
            <Link
              href="/pricing"
              className="gradient-cta shine-effect px-3.5 sm:px-6 py-1 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-white shadow-lg active:scale-95 transition-transform"
            >
              See Plans
            </Link>
            <button
              onClick={handleDismiss}
              className="text-[9px] sm:text-[10px] font-bold text-text-muted hover:text-white transition-colors uppercase tracking-widest"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
