'use client';

import React, { useState } from 'react';
import { getEnabledCreditPacks } from '@shared/config/subscription.utils';
import type { ICreditPack } from '@shared/config/subscription.types';
import { CreditCard, Check } from 'lucide-react';
import { CheckoutModal } from './CheckoutModal';

interface ICreditPackSelectorProps {
  onPurchaseStart?: () => void;
  onPurchaseComplete?: () => void;
  onError?: (error: Error) => void;
}

export function CreditPackSelector({
  onPurchaseStart,
  onPurchaseComplete,
}: ICreditPackSelectorProps): JSX.Element {
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  const packs = getEnabledCreditPacks();

  const handlePurchase = (pack: ICreditPack) => {
    setSelectedPack(pack.key);
    setSelectedPriceId(pack.stripePriceId);
    setShowCheckoutModal(true);
    onPurchaseStart?.();
  };

  const handleCheckoutClose = () => {
    setShowCheckoutModal(false);
    setSelectedPack(null);
    setSelectedPriceId(null);
  };

  const handleCheckoutSuccess = () => {
    onPurchaseComplete?.();
    handleCheckoutClose();
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const getPricePerCredit = (pack: ICreditPack) => {
    return (pack.priceInCents / pack.credits / 100).toFixed(3);
  };

  return (
    <>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {packs.map(pack => (
          <div
            key={pack.key}
            className={`relative glass border rounded-xl p-6 transition-all cursor-pointer hover:border-accent/50 hover:shadow-md ${
              selectedPack === pack.key ? 'border-accent ring-2 ring-accent' : 'border-border'
            } ${pack.popular ? 'border-accent/30' : ''}`}
            onClick={() => handlePurchase(pack)}
          >
            {pack.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent text-white text-xs font-semibold rounded-full">
                Best Value
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
                  pack.popular
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
