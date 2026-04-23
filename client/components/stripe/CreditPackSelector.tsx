'use client';

import React, { useState, useRef, useEffect } from 'react';
import { getEnabledCreditPacks } from '@shared/config/subscription.utils';
import type { ICreditPack } from '@shared/config/subscription.types';
import { CreditCard } from 'lucide-react';
import { CheckoutModal } from './CheckoutModal';
import { analytics } from '@client/analytics';
import { useUserStore } from '@client/store/userStore';
import { useModalStore } from '@client/store/modalStore';
import { prepareAuthRedirect } from '@client/utils/authRedirectManager';
import {
  getCheckoutTrackingContext,
  setCheckoutTrackingContext,
} from '@client/utils/checkoutTrackingContext';

interface ICreditPackSelectorProps {
  onPurchaseStart?: () => void;
  onPurchaseComplete?: () => void;
  onError?: (error: Error) => void;
  /** Regional discount percentage (0-100). When > 0, displays adjusted prices. */
  discountPercent?: number;
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

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(applyDiscount(cents) / 100);
  };

  const getPricePerCredit = (pack: ICreditPack) => {
    return (applyDiscount(pack.priceInCents) / pack.credits / 100).toFixed(3);
  };

  return (
    <>
      <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
        {packs.map(pack => (
          <div
            key={pack.key}
            className={`relative bg-surface rounded-xl border flex flex-col transition-colors duration-150 cursor-pointer ${
              selectedPack === pack.key
                ? 'border-accent'
                : pack.badge
                  ? 'border-accent/40 hover:border-accent/60'
                  : 'border-surface-light hover:border-surface-light/80'
            }`}
            onClick={() => handlePurchase(pack)}
          >
            {pack.badge && (
              <div
                className={`absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 text-white text-[10px] font-semibold rounded-full z-10 uppercase tracking-wide ${
                  pack.badge === 'Best Value' ? 'bg-success' : 'bg-accent'
                }`}
              >
                {pack.badge}
              </div>
            )}

            {discountPercent > 0 && (
              <div className="absolute top-2 right-2 bg-error text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10 leading-tight">
                {discountPercent}% OFF
              </div>
            )}

            <div className="p-4 flex flex-col h-full">
              {/* Pack name */}
              <p className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary text-center mb-3">
                {pack.name}
              </p>

              {/* Price */}
              <div className="text-center mb-2">
                {discountPercent > 0 && (
                  <p className="text-[11px] text-text-muted line-through mb-0.5">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                      pack.priceInCents / 100
                    )}
                  </p>
                )}
                <span className="text-2xl font-bold text-text-primary tabular-nums">
                  {formatPrice(pack.priceInCents)}
                </span>
              </div>

              {/* Credits */}
              <div className="text-center mb-3">
                <span className="text-sm font-semibold text-accent">
                  {pack.credits.toLocaleString()} credits
                </span>
                <p className="text-[11px] text-text-secondary mt-0.5">
                  ${getPricePerCredit(pack)} per credit
                </p>
              </div>

              {/* Divider */}
              <div className="border-t border-surface-light mb-3" />

              {/* Features */}
              <ul className="space-y-1.5 mb-4 flex-grow">
                {['Credits never expire', 'Use on any tool', 'Stackable with plans'].map(
                  (feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-3.5 w-3.5 text-success flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-xs text-text-primary/80 leading-tight">{feature}</span>
                    </li>
                  )
                )}
              </ul>

              {/* CTA */}
              <button
                className={`w-full py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  pack.badge
                    ? 'bg-accent hover:bg-accent-hover text-white'
                    : 'bg-surface-light hover:bg-surface-light/80 text-text-primary'
                }`}
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>Purchase</span>
              </button>
            </div>
          </div>
        ))}
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
