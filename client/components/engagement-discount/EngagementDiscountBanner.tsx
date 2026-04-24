'use client';

/**
 * Engagement Discount Banner Component
 *
 * A persistent sticky bottom banner that appears when a highly-engaged free user
 * qualifies for a 20% first-purchase discount. Shows a 30-minute countdown timer
 * and a CTA to claim the discount. Stays visible for the entire session until
 * dismissed or the offer expires.
 *
 * @see docs/PRDs/engagement-based-first-purchase-discount.md
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { X, Clock, Sparkles } from 'lucide-react';
import { useEngagementDiscountStore } from '@client/store/engagementDiscountStore';
import { analytics } from '@client/analytics';
import { DISCOUNT_TARGET_PACK, formatCountdown } from '@shared/config/engagement-discount';
import { cn } from '@client/utils/cn';
import { setCheckoutTrackingContext } from '@client/utils/checkoutTrackingContext';

export interface IEngagementDiscountBannerProps {
  /** Callback when CTA is clicked to start checkout */
  onClaimDiscount: () => void;
  /** Optional class name for custom styling */
  className?: string;
  /**
   * Source that triggered the discount toast.
   * 'engagement' = normal engagement-threshold path.
   * 'abandonment' = triggered by the upgrade abandonment detector.
   * Defaults to 'engagement'.
   */
  source?: 'engagement' | 'abandonment';
}

export const EngagementDiscountBanner: React.FC<IEngagementDiscountBannerProps> = ({
  onClaimDiscount,
  className,
  source,
}) => {
  const {
    offer,
    showToast,
    dismissToast,
    countdownEndTime,
    hasTrackedImpression,
    setHasTrackedImpression,
    discountSource,
  } = useEngagementDiscountStore();

  // Use explicitly passed source prop; fall back to what the store knows
  const resolvedSource = source ?? discountSource;

  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick the countdown every second while the banner is active
  useEffect(() => {
    if (!showToast || !countdownEndTime) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Silently dismiss if already expired when banner mounts
    const initialRemaining = Math.max(0, Math.floor((countdownEndTime - Date.now()) / 1000));
    if (initialRemaining === 0) {
      dismissToast();
      return;
    }

    const updateRemaining = () => {
      const remaining = Math.max(0, Math.floor((countdownEndTime - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        dismissToast();
      }
    };

    updateRemaining();
    intervalRef.current = setInterval(updateRemaining, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [showToast, countdownEndTime, dismissToast]);

  // Slide up when shown, slide down when hidden
  useEffect(() => {
    if (showToast && !isDismissed) {
      const timer = setTimeout(() => setIsVisible(true), 100);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [showToast, isDismissed]);

  // Track impression once per session — guard prevents re-firing on remount or offer reference changes
  useEffect(() => {
    if (showToast && offer && !hasTrackedImpression) {
      analytics.track('engagement_discount_toast_shown', {
        discountPercent: offer.discountPercent,
        originalPriceCents: offer.originalPriceCents,
        discountedPriceCents: offer.discountedPriceCents,
        engagement_discount_source: resolvedSource,
      });
      setHasTrackedImpression(true);
    }
  }, [showToast, offer, hasTrackedImpression, setHasTrackedImpression, resolvedSource]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      dismissToast();
      setIsDismissed(true);
      analytics.track('engagement_discount_toast_dismissed', {
        timeRemainingSeconds: remainingSeconds,
      });
    }, 300);
  }, [dismissToast, remainingSeconds]);

  const handleClaimClick = useCallback(() => {
    analytics.track('engagement_discount_cta_clicked', {
      timeRemainingSeconds: remainingSeconds,
    });
    setCheckoutTrackingContext({ trigger: 'engagement_discount_banner' });
    onClaimDiscount();
  }, [onClaimDiscount, remainingSeconds]);

  if (!showToast || !offer || isDismissed) {
    return null;
  }

  const formattedTime = formatCountdown(remainingSeconds);
  const isUrgent = remainingSeconds > 0 && remainingSeconds < 300;

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 w-full',
        'transform transition-all duration-300 ease-out',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
        className
      )}
    >
      {isUrgent && (
        <div className="absolute inset-0 animate-pulse bg-red-500/10 pointer-events-none" />
      )}

      <div
        className={cn(
          'relative w-full',
          'bg-gradient-to-r from-accent via-accent/95 to-tertiary/95',
          'border-t border-white/20 shadow-2xl backdrop-blur-sm'
        )}
      >
        <div className="max-w-7xl mx-auto px-4 py-2.5">
          <div className="flex items-center gap-2">
            {/* Content — two rows on mobile, single row on desktop */}
            <div className="flex-1 min-w-0 flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
              {/* Message row */}
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-4 h-4 text-yellow-300 shrink-0" />
                <span className="text-sm font-bold text-white truncate">
                  {offer.discountPercent}% off your first purchase
                </span>
                <span className="text-white/40">·</span>
                <div className="items-center gap-1.5 flex shrink-0">
                  <span className="text-sm text-white/50 line-through hidden md:block">
                    ${(offer.originalPriceCents / 100).toFixed(2)}
                  </span>
                  <span className="text-sm font-bold text-green-300 hidden md:block">
                    ${(offer.discountedPriceCents / 100).toFixed(2)}
                  </span>
                  <span className="text-white/40 hidden md:block">·</span>
                  <span className="text-sm text-white/70 hidden md:block">
                    {DISCOUNT_TARGET_PACK.credits} credits
                  </span>
                </div>
              </div>

              {/* Countdown + CTA row */}
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium shrink-0',
                    isUrgent ? 'bg-red-500/30 text-red-100' : 'bg-white/10 text-white/90'
                  )}
                >
                  <Clock className={cn('w-3 h-3', isUrgent && 'animate-pulse')} />
                  <span className="font-mono font-bold">{formattedTime}</span>
                </div>

                <button
                  onClick={handleClaimClick}
                  className={cn(
                    'flex-1 md:flex-none px-4 py-1.5 rounded-lg font-bold text-sm',
                    'bg-yellow-400 hover:bg-yellow-300 text-black',
                    'transition-colors shadow-lg active:scale-[0.98] whitespace-nowrap'
                  )}
                >
                  <span className="hidden md:inline">Claim {offer.discountPercent}% Off</span>
                  <span className="md:hidden">
                    Claim {offer.discountPercent}% Off - $
                    {(offer.discountedPriceCents / 100).toFixed(2)}
                  </span>
                </button>
              </div>
            </div>

            {/* Dismiss */}
            <button
              onClick={handleDismiss}
              className="shrink-0 self-start md:self-center p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Dismiss offer"
            >
              <X className="w-4 h-4 text-white/70" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
