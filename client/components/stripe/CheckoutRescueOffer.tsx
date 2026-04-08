'use client';

import { Clock, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatCountdown, getRemainingSeconds } from '@shared/config/engagement-discount';
import type { ICheckoutRescueOffer } from '@shared/types/checkout-offer';

interface ICheckoutRescueOfferProps {
  offer: ICheckoutRescueOffer;
  isApplying: boolean;
  onClaim: () => void;
  onDismiss: () => void;
}

export function CheckoutRescueOffer({
  offer,
  isApplying,
  onClaim,
  onDismiss,
}: ICheckoutRescueOfferProps): JSX.Element {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    getRemainingSeconds(offer.expiresAt)
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      setRemainingSeconds(getRemainingSeconds(offer.expiresAt));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [offer.expiresAt]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-md rounded-2xl border border-accent/30 bg-surface p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Sparkles size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-white">Wait, here&apos;s 20% off Hobby</p>
            <p className="mt-1 text-sm text-text-muted">
              Finish checkout now and keep this rescue offer for the next few minutes.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
          <Clock size={16} />
          <span className="font-medium">Valid for {formatCountdown(remainingSeconds)}</span>
        </div>

        <div className="mt-6 grid gap-3">
          <button
            onClick={onClaim}
            disabled={isApplying || remainingSeconds === 0}
            className={`w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 ${
              isApplying || remainingSeconds === 0 ? 'cursor-not-allowed opacity-60' : ''
            }`}
          >
            {isApplying ? 'Applying discount...' : `Claim ${offer.discountPercent}% Off`}
          </button>
          <button
            onClick={onDismiss}
            disabled={isApplying}
            className={`w-full rounded-xl border border-border bg-surface-light px-4 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-light/80 disabled:cursor-not-allowed disabled:opacity-60 ${
              isApplying ? 'cursor-not-allowed opacity-60' : ''
            }`}
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
