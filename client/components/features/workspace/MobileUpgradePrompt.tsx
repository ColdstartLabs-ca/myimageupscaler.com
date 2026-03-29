'use client';

import type { UserSegment } from '@/shared/types/stripe.types';
import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { analytics } from '@client/analytics/analyticsClient';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { setCheckoutTrackingContext } from '@client/utils/checkoutTrackingContext';
import { getVariant } from '@client/utils/abTest';

export interface IMobileUpgradePromptProps {
  variant: 'upload' | 'preview';
  userSegment: UserSegment;
  onUpgrade: () => void;
}

/**
 * Calculate discounted price for display, rounding to 2 decimal places.
 */
function calculateDiscountedPrice(priceValue: number, discountPercent: number): number {
  if (discountPercent <= 0 || priceValue === 0) return priceValue;
  return Math.round(priceValue * (1 - discountPercent / 100) * 100) / 100;
}

/** Format a numeric price as a USD string (e.g., 17.15 -> "$17.15"). */
function formatPrice(value: number): string {
  if (value === 0) return '$0';
  const formatted = value.toFixed(2).replace(/\.?0+$/, '');
  return `$${formatted}`;
}

/**
 * Inline upgrade prompt for mobile empty space below dropzone (upload variant)
 * and below the image preview during processing (preview variant).
 * Non-dismissible. Mobile-only via md:hidden.
 *
 * Phase 4 redesign:
 * - Upload variant: before/after face-pro thumbnails, value-framing copy, bigger CTA
 * - Preview variant: larger button with price anchor, pulse animation on first render
 * - A/B testing: copyVariant tracking on analytics events
 * - Segment-aware: different copy for free vs credit_purchaser users
 */
export const MobileUpgradePrompt = ({
  variant,
  userSegment,
  onUpgrade,
}: IMobileUpgradePromptProps): JSX.Element | null => {
  const { pricingRegion, discountPercent } = useRegionTier();
  const trackedRef = useRef(false);
  const [shouldPulse, setShouldPulse] = useState(true);
  const isCreditPurchaser = userSegment === 'credit_purchaser';
  const showPrompt = userSegment !== 'subscriber';

  // Get A/B test variant for copy (control vs value-framing)
  const copyVariant = getVariant('mobile_upload_copy', ['control', 'value']);

  // Small credits pack base price is $4.99 (from subscription.config.ts)
  const smallPackPrice = 4.99;
  const discountedPrice = calculateDiscountedPrice(smallPackPrice, discountPercent);
  const displayPrice = formatPrice(discountedPrice);

  // Stop pulse animation after 3 seconds for preview variant
  useEffect(() => {
    if (variant === 'preview' && shouldPulse) {
      const timer = setTimeout(() => setShouldPulse(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [variant, shouldPulse]);

  useEffect(() => {
    if (!showPrompt || trackedRef.current) return;
    trackedRef.current = true;
    analytics.track('upgrade_prompt_shown', {
      trigger: variant === 'upload' ? 'mobile_upload_prompt' : 'mobile_preview_prompt',
      currentPlan: userSegment,
      userSegment,
      pricingRegion: pricingRegion || 'standard',
      copyVariant,
    });
  }, [showPrompt, userSegment, variant, pricingRegion, copyVariant]);

  const handleClick = useCallback(() => {
    setCheckoutTrackingContext({
      trigger: variant === 'upload' ? 'mobile_upload_prompt' : 'mobile_preview_prompt',
    });
    analytics.track('upgrade_prompt_clicked', {
      trigger: variant === 'upload' ? 'mobile_upload_prompt' : 'mobile_preview_prompt',
      destination: isCreditPurchaser ? 'billing_subscription_tab' : 'upgrade_plan_modal',
      currentPlan: userSegment,
      userSegment,
      pricingRegion: pricingRegion || 'standard',
      copyVariant,
    });
    onUpgrade();
  }, [variant, pricingRegion, copyVariant, onUpgrade, isCreditPurchaser, userSegment]);

  if (!showPrompt) return null;

  // Segment-aware copy
  const uploadTitle = isCreditPurchaser
    ? 'Unlock monthly credits & pro models'
    : 'Get visibly better results';
  const uploadCta = isCreditPurchaser
    ? `Subscribe & Save — from ${displayPrice}/mo`
    : `Get Pro Results — from ${displayPrice}`;

  const previewTitle = isCreditPurchaser
    ? 'Get monthly credits with subscription'
    : 'Unlock pro AI models for sharper results';
  const previewCta = isCreditPurchaser
    ? `Subscribe — ${displayPrice}/mo`
    : `Go Pro — ${displayPrice}`;

  if (variant === 'upload') {
    return (
      <div className="md:hidden mt-3 rounded-xl border border-accent/20 bg-accent/5 p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1">
            <img
              src="/before-after/face-pro/before.webp"
              alt="Before"
              className="w-8 h-8 rounded-md object-cover"
              width={32}
              height={32}
            />
            <ArrowRight className="w-3 h-3 text-accent shrink-0" />
            <img
              src="/before-after/face-pro/after.webp"
              alt="After"
              className="w-8 h-8 rounded-md object-cover"
              width={32}
              height={32}
            />
          </div>
          <span className="text-sm font-semibold text-white">{uploadTitle}</span>
        </div>
        <ul className="space-y-1 mb-2">
          <li className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
            Pro AI models (Clarity, Real-ESRGAN Pro)
          </li>
          <li className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
            Sharper edges, finer details, fewer artifacts
          </li>
          <li className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
            Up to 4K output &amp; 25MB files
          </li>
        </ul>
        <button
          onClick={handleClick}
          className="block w-full text-center text-sm font-semibold text-white bg-accent rounded-lg py-2.5 hover:bg-accent/90 transition-colors"
        >
          {uploadCta}
        </button>
      </div>
    );
  }

  // Preview variant - larger button, price anchor, pulse animation
  return (
    <div className="md:hidden mt-3 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-white">{previewTitle}</p>
        <p className="text-[11px] text-text-muted mt-0.5">
          Clarity &amp; Real-ESRGAN Pro available
        </p>
      </div>
      <button
        onClick={handleClick}
        className={`shrink-0 text-xs font-semibold text-white bg-accent rounded-lg px-5 py-3 hover:bg-accent/90 transition-colors ${
          shouldPulse ? 'animate-pulse' : ''
        }`}
      >
        {previewCta}
      </button>
    </div>
  );
};
