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
    <div className="relative overflow-hidden rounded-2xl glass-strong p-5 text-white shadow-xl animated-border border-accent/30">
      {/* Ambient backgrounds for a more premium feel */}
      <div className="absolute -right-4 -top-12 h-32 w-32 rounded-full bg-accent/20 blur-3xl opacity-50" />
      <div className="absolute -left-12 -bottom-12 h-32 w-32 rounded-full bg-secondary/20 blur-3xl opacity-50" />

      {/* Close button */}
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-3 text-white/50 transition-colors hover:text-white z-10 p-1 hover:bg-white/5 rounded-full"
      >
        <X size={16} />
      </button>

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 relative z-10">
        <div className="flex-shrink-0">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-secondary shadow-lg shadow-accent/20">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
        </div>
        <div className="flex-1 text-center sm:text-left">
          <h3 className="text-base font-bold tracking-tight">
            Great work! {processedCount} {processedCount === 1 ? 'image' : 'images'} enhanced
          </h3>
          <p className="mt-1 text-xs text-white/80 leading-relaxed max-w-md font-medium">
            Unlock{' '}
            <span className="text-white font-bold italic underline decoration-accent/50 underline-offset-2">
              Professional Mode
            </span>{' '}
            for 1,000 credits/month and save over 50% on high-quality upscales.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-5">
            <Link
              href="/pricing"
              className="gradient-cta shine-effect px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider text-white shadow-lg active:scale-95 transition-transform"
            >
              See Plans
            </Link>
            <button
              onClick={handleDismiss}
              className="text-[10px] font-bold text-text-muted hover:text-white transition-colors uppercase tracking-widest"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
