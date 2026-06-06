'use client';

import React, { useState, useRef, useEffect } from 'react';
import { getEnabledCreditPacks } from '@shared/config/subscription.utils';
import type { ICreditPack } from '@shared/config/subscription.types';
import { Check, CreditCard } from 'lucide-react';
import { CheckoutModal } from './CheckoutModal';
import { analytics } from '@client/analytics';
import { useUserStore } from '@client/store/userStore';
import { useModalStore } from '@client/store/modalStore';
import { prepareAuthRedirect } from '@client/utils/authRedirectManager';
import {
  getCheckoutTrackingContext,
  setCheckoutTrackingContext,
} from '@client/utils/checkoutTrackingContext';
import { useRegionTier } from '@client/hooks/useRegionTier';

interface ICreditPackSelectorProps {
  onPurchaseStart?: () => void;
  onPurchaseComplete?: () => void;
  onError?: (error: Error) => void;
  /** Regional discount percentage (0-100). When > 0, displays adjusted prices. */
  discountPercent?: number;
}

const PACK_FEATURES = ['Credits never expire', 'Use on any tool', 'Stackable with plans'] as const;

function getBadgeColorClass(badge: string): string {
  return badge === 'Best Value' ? 'bg-secondary' : 'bg-accent';
}

function getCardBorderClasses(badge: string | undefined, isSelected: boolean): string {
  if (isSelected) {
    return 'border-accent ring-1 ring-accent/20';
  }
  if (badge === 'Most Popular') {
    return 'border-accent/60 ring-1 ring-accent/20';
  }
  if (badge === 'Best Value') {
    return 'border-secondary/60 ring-1 ring-secondary/20';
  }
  return 'border-surface-light';
}

export function CreditPackSelector({
  onPurchaseStart,
  onPurchaseComplete,
  discountPercent = 0,
}: ICreditPackSelectorProps): JSX.Element {
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const { isAuthenticated } = useUserStore();
  const { openAuthRequiredModal } = useModalStore();
  const { pricingRegion } = useRegionTier();

  // Track initial vs final pack selection
  const initialPackRef = useRef<string | null>(null);
  const packSelectionStartTimeRef = useRef<number>(Date.now());
  const packSwitchCountRef = useRef<number>(0);
  const lastTrackedPackRef = useRef<string | null>(null);

  const packs = getEnabledCreditPacks();

  // Track pack selection time on mount
  useEffect(() => {
    packSelectionStartTimeRef.current = Date.now();

    return () => {
      // Track abandonment if no purchase was made
      if (!selectedPack) {
        const timeSpentMs = Date.now() - packSelectionStartTimeRef.current;
        analytics.track('checkout_step_time', {
          step: 'plan_selection',
          timeSpentMs,
          priceId: 'credit_pack_selector',
          cumulativeTimeMs: timeSpentMs,
        });
      }
    };
  }, [selectedPack]);

  const handlePurchase = (pack: ICreditPack) => {
    const checkoutContext = getCheckoutTrackingContext();

    // Track initial vs final selection
    if (initialPackRef.current === null) {
      initialPackRef.current = pack.key;
    } else if (lastTrackedPackRef.current !== pack.key) {
      // Track pack switch (comparison behavior)
      packSwitchCountRef.current += 1;
      analytics.track('pricing_plan_viewed', {
        planName: pack.key,
        priceId: pack.stripePriceId,
      });
    }
    lastTrackedPackRef.current = pack.key;

    // Track time spent on pack selection
    const selectionTimeMs = Date.now() - packSelectionStartTimeRef.current;
    analytics.track('checkout_step_time', {
      step: 'plan_selection',
      timeSpentMs: selectionTimeMs,
      priceId: pack.stripePriceId,
      cumulativeTimeMs: selectionTimeMs,
    });

    // Require auth before opening checkout — store intent so user returns here after sign-in
    if (!isAuthenticated) {
      if (pack.stripePriceId) {
        setCheckoutTrackingContext({
          trigger: checkoutContext?.trigger,
          originatingModel: checkoutContext?.originatingModel,
        });
        const currentSearchParams = new URLSearchParams(window.location.search);
        currentSearchParams.set('checkout', pack.stripePriceId);
        const returnTo = `${window.location.pathname}?${currentSearchParams.toString()}`;
        prepareAuthRedirect('checkout', {
          returnTo,
          context: {
            priceId: pack.stripePriceId,
            trigger: checkoutContext?.trigger,
            originatingModel: checkoutContext?.originatingModel,
          },
        });
        analytics.track('checkout_auth_required', {
          priceId: pack.stripePriceId,
          ...(checkoutContext?.trigger ? { trigger: checkoutContext.trigger } : {}),
          pricingRegion: pricingRegion || 'standard',
          ...(checkoutContext?.originatingModel
            ? { originatingModel: checkoutContext.originatingModel }
            : {}),
        });
      }
      openAuthRequiredModal();
      return;
    }

    setSelectedPack(pack.key);
    setSelectedPriceId(pack.stripePriceId);
    onPurchaseStart?.();
    analytics.track('checkout_opened', {
      priceId: pack.stripePriceId,
      source: 'embedded_modal',
      ...(checkoutContext?.trigger ? { trigger: checkoutContext.trigger } : {}),
      ...(checkoutContext?.originatingModel
        ? { originatingModel: checkoutContext.originatingModel }
        : {}),
      ...(checkoutContext?.originatingTrigger
        ? { originatingTrigger: checkoutContext.originatingTrigger }
        : {}),
      ...(checkoutContext?.attributionChain?.length
        ? { attributionChain: checkoutContext.attributionChain }
        : {}),
    });
    setShowCheckoutModal(true);
  };

  const handleCheckoutClose = () => {
    setShowCheckoutModal(false);
    setSelectedPack(null);
    setSelectedPriceId(null);
    // Reset tracking refs for next interaction
    initialPackRef.current = null;
    packSelectionStartTimeRef.current = Date.now();
    packSwitchCountRef.current = 0;
    lastTrackedPackRef.current = null;
  };

  const handleCheckoutSuccess = () => {
    onPurchaseComplete?.();
    handleCheckoutClose();
  };

  const applyDiscount = (cents: number): number => {
    if (discountPercent <= 0) return cents;
    return Math.round(cents * (1 - discountPercent / 100));
  };

  const getPricePerCredit = (pack: ICreditPack) => {
    return (applyDiscount(pack.priceInCents) / pack.credits / 100).toFixed(3);
  };

  const getDisplayPrice = (cents: number) => applyDiscount(cents) / 100;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {packs.map(pack => {
          const displayPrice = getDisplayPrice(pack.priceInCents);
          const formattedPrice = Number.isInteger(displayPrice)
            ? String(displayPrice)
            : displayPrice.toFixed(2);

          return (
            <div
              key={pack.key}
              className={`relative flex cursor-pointer flex-col rounded-xl border bg-surface transition-colors duration-150 ${getCardBorderClasses(
                pack.badge,
                selectedPack === pack.key
              )}`}
              onClick={() => handlePurchase(pack)}
            >
              {pack.badge && (
                <div
                  className={`absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${getBadgeColorClass(
                    pack.badge
                  )}`}
                >
                  {pack.badge}
                </div>
              )}

              {discountPercent > 0 && (
                <div className="absolute top-2 right-2 bg-error text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10 leading-tight">
                  {discountPercent}% OFF
                </div>
              )}

              <div className="flex h-full flex-col p-4">
                <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
                  {pack.name}
                </p>

                <div className="mb-3 text-center">
                  {discountPercent > 0 && (
                    <p className="mb-0.5 text-[11px] text-text-muted line-through">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      }).format(pack.priceInCents / 100)}
                    </p>
                  )}
                  <div className="flex items-baseline justify-center gap-0.5">
                    <span className="text-sm font-medium text-text-primary">$</span>
                    <span className="text-3xl font-bold tabular-nums text-text-primary">
                      {formattedPrice}
                    </span>
                  </div>
                </div>

                <div className="mb-3 text-center">
                  <span className="text-sm font-semibold gradient-text-primary">
                    {pack.credits.toLocaleString()} credits
                  </span>
                  <p className="mt-0.5 text-[11px] text-text-secondary">
                    ${getPricePerCredit(pack)} per credit
                  </p>
                </div>

                <div className="mb-3 border-t border-surface-light" />

                <ul className="mb-4 flex-grow space-y-1.5">
                  {PACK_FEATURES.map(feature => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-success"
                        strokeWidth={2.5}
                      />
                      <span className="text-xs leading-tight text-text-primary/80">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className="gradient-cta shine-effect flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Purchase</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showCheckoutModal && selectedPriceId && (
        <CheckoutModal
          priceId={selectedPriceId}
          onClose={handleCheckoutClose}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </>
  );
}
