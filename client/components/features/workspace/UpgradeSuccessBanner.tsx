'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Sparkles, X } from 'lucide-react';

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
    <div className="relative overflow-hidden rounded-lg bg-gradient-to-r from-accent to-secondary p-6 text-white shadow-lg">
      {/* Close button */}
      <button
        onClick={handleDismiss}
        className="absolute right-4 top-4 text-white/80 transition-colors hover:text-white"
      >
        <X size={20} />
      </button>

      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface/20">
            <Sparkles className="h-6 w-6" />
          </div>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold">
            Great work! {processedCount} {processedCount === 1 ? 'image' : 'images'} enhanced
          </h3>
          <p className="mt-1 text-sm text-white/90">
            Upgrade to Professional for 1000 credits/month and save up to 58%
          </p>
          <div className="mt-4 flex gap-3">
            <Link
              href="/pricing"
              className="inline-flex items-center rounded-md bg-surface px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-surface/90"
            >
              See Plans
            </Link>
            <button
              onClick={handleDismiss}
              className="inline-flex items-center rounded-md border border-white/30 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-surface/10"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
