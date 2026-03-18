'use client';

import React, { useState, useRef, useEffect } from 'react';
import { getEnabledCreditPacks } from '@shared/config/subscription.utils';
import type { ICreditPack } from '@shared/config/subscription.types';
import { CreditCard, Check } from 'lucide-react';
import { CheckoutModal } from './CheckoutModal';
import { analytics } from '@client/analytics';
import { useUserStore } from '@client/store/userStore';
import { useModalStore } from '@client/store/modalStore';
import { prepareAuthRedirect } from '@client/utils/authRedirectManager';

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
        const currentSearchParams = new URLSearchParams(window.location.search);
        currentSearchParams.set('checkout', pack.stripePriceId);
        const returnTo = `${window.location.pathname}?${currentSearchParams.toString()}`;
        prepareAuthRedirect('checkout', { returnTo, context: { priceId: pack.stripePriceId } });
      }
      openAuthRequiredModal();
      return;
    }

    setSelectedPack(pack.key);
    setSelectedPriceId(pack.stripePriceId);
    onPurchaseStart?.();
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
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {packs.map(pack => (
          <div
            key={pack.key}
            className={`relative glass border rounded-xl p-6 transition-all cursor-pointer hover:border-accent/50 hover:shadow-md ${
              selectedPack === pack.key ? 'border-accent ring-2 ring-accent' : 'border-border'
            } ${pack.badge ? 'border-accent/30' : ''}`}
            onClick={() => handlePurchase(pack)}
          >
            {pack.badge && (
              <div
                className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-white text-xs font-semibold rounded-full ${
                  pack.badge === 'Best Value' ? 'bg-emerald-600' : 'bg-accent'
                }`}
              >
                {pack.badge}
              </div>
            )}

            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold text-white">{pack.name}</h3>
              <div className="text-3xl font-bold text-white mt-2">
                {formatPrice(pack.priceInCents)}
              </div>
            </div>

            <div className="text-center space-y-4">
              <div className="text-2xl font-semibold text-accent">{pack.credits} credits</div>

              <div className="text-sm text-muted-foreground">
                ${getPricePerCredit(pack)} per credit
              </div>

              <ul className="text-sm text-left space-y-2 mt-4">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success flex-shrink-0" />
                  <span className="text-muted-foreground">Never expire</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success flex-shrink-0" />
                  <span className="text-muted-foreground">Use anytime</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success flex-shrink-0" />
                  <span className="text-muted-foreground">Stack with subscription</span>
                </li>
              </ul>

              <button
                className={`w-full px-4 py-3 rounded-lg font-medium transition-colors mt-4 ${
                  pack.badge
                    ? 'bg-accent hover:bg-accent-hover text-white shadow-[0_0_20px_rgba(var(--color-accent),0.3)]'
                    : 'glass hover:bg-surface/10 text-white'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  <span>Buy Now</span>
                </div>
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
