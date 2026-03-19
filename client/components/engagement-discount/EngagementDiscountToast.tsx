'use client';

/**
 * Engagement Discount Toast Component
 *
 * A slide-in toast that appears when a highly-engaged free user
 * qualifies for a 20% first-purchase discount. Shows a 30-minute
 * countdown timer and a CTA to claim the discount.
 *
 * @see docs/PRDs/engagement-based-first-purchase-discount.md
 */

import React, { useEffect, useState, useCallback } from 'react';
import { X, Clock, Sparkles, CreditCard } from 'lucide-react';
import {
  useEngagementDiscountStore,
  selectRemainingSeconds,
} from '@client/store/engagementDiscountStore';
import { analytics } from '@client/analytics';
import { ENGAGEMENT_DISCOUNT_CONFIG } from '@shared/config/engagement-discount';
import { formatCountdown } from '@shared/config/engagement-discount';
import { cn } from '@client/utils/cn';

/**
 * Props for the EngagementDiscountToast component.
 */
export interface IEngagementDiscountToastProps {
  /** Callback when CTA is clicked to start checkout */
  onClaimDiscount: () => void;
  /** Optional class name for custom styling */
  className?: string;
}

/**
 * Engagement Discount Toast Component
 *
 * Displays a slide-in toast with:
 * - 30-minute countdown timer
 * - Original vs discounted price
 * - CTA button to claim the discount
 * - Dismiss button
 */
export const EngagementDiscountToast: React.FC<IEngagementDiscountToastProps> = ({
  onClaimDiscount,
  className,
}) => {
  const {
    offer,
    showToast,
    dismissToast,
    countdownEndTime: _countdownEndTime,
  } = useEngagementDiscountStore();

  const remainingSeconds = useEngagementDiscountStore(selectRemainingSeconds);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Handle slide-in animation
  useEffect(() => {
    if (showToast && !isDismissed) {
      // Small delay for animation
      const timer = setTimeout(() => setIsVisible(true), 100);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [showToast, isDismissed]);

  // Track toast shown event
  useEffect(() => {
    if (showToast && offer) {
      analytics.track('engagement_discount_toast_shown', {
        discountPercent: offer.discountPercent,
        originalPriceCents: offer.originalPriceCents,
        discountedPriceCents: offer.discountedPriceCents,
      });
    }
  }, [showToast, offer]);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    // Wait for animation to complete
    setTimeout(() => {
      dismissToast();
      setIsDismissed(true);
      analytics.track('engagement_discount_toast_dismissed', {
        timeRemainingSeconds: remainingSeconds,
      });
    }, 300);
  }, [dismissToast, remainingSeconds]);

  // Handle CTA click
  const handleClaimClick = useCallback(() => {
    analytics.track('engagement_discount_cta_clicked', {
      timeRemainingSeconds: remainingSeconds,
    });
    onClaimDiscount();
  }, [onClaimDiscount, remainingSeconds]);

  // Don't render if no offer or already dismissed
  if (!showToast || !offer || isDismissed) {
    return null;
  }

  const formattedTime = formatCountdown(remainingSeconds);
  const isUrgent = remainingSeconds < 300; // Less than 5 minutes

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 max-w-sm w-full',
        'transform transition-all duration-300 ease-out',
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
        className
      )}
    >
      <div
        className={cn(
          'relative rounded-xl shadow-2xl overflow-hidden',
          'bg-gradient-to-br from-accent/95 via-accent/90 to-tertiary/95',
          'border border-white/20 backdrop-blur-sm'
        )}
      >
        {/* Urgent glow effect */}
        {isUrgent && <div className="absolute inset-0 animate-pulse bg-red-500/20" />}

        {/* Header with close button */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-yellow-300" />
            <span className="text-xs font-bold uppercase tracking-wider text-white/90">
              Special Offer
            </span>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* Main content */}
        <div className="px-4 pb-3">
          {/* Discount message */}
          <h3 className="text-lg font-bold text-white mb-1">
            {offer.discountPercent}% Off Your First Purchase!
          </h3>
          <p className="text-sm text-white/80 mb-3">
            Get {ENGAGEMENT_DISCOUNT_CONFIG.targetPackKey === 'medium' ? '50 credits' : 'credits'}{' '}
            at a special discount.
          </p>

          {/* Price comparison */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-1 text-white/60 line-through">
              <CreditCard className="w-4 h-4" />
              <span className="text-sm">${(offer.originalPriceCents / 100).toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1 text-white font-bold">
              <CreditCard className="w-4 h-4 text-green-300" />
              <span className="text-lg">${(offer.discountedPriceCents / 100).toFixed(2)}</span>
            </div>
          </div>

          {/* Countdown timer */}
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg mb-3',
              isUrgent ? 'bg-red-500/30 text-red-100' : 'bg-white/10 text-white/90'
            )}
          >
            <Clock className={cn('w-4 h-4', isUrgent && 'animate-pulse')} />
            <span className="text-sm font-medium">
              Offer expires in <span className="font-mono font-bold">{formattedTime}</span>
            </span>
          </div>

          {/* CTA Button */}
          <button
            onClick={handleClaimClick}
            className={cn(
              'w-full py-3 px-4 rounded-lg font-bold text-accent',
              'bg-white hover:bg-white/90 transition-colors',
              'shadow-lg active:scale-[0.98]'
            )}
          >
            Claim Your {offer.discountPercent}% Discount
          </button>

          {/* Fine print */}
          <p className="text-xs text-white/50 text-center mt-2">
            One-time offer for first-time purchasers
          </p>
        </div>
      </div>
    </div>
  );
};

// Named export only - default export removed for consistency with project conventions
