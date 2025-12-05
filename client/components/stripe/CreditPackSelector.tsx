'use client';

import React, { useState } from 'react';
import { getEnabledCreditPacks } from '@shared/config/subscription.utils';
import type { ICreditPack } from '@shared/config/subscription.types';
import { StripeService } from '@client/services/stripeService';
import { CreditCard, Check } from 'lucide-react';

interface ICreditPackSelectorProps {
  onPurchaseStart?: () => void;
  onPurchaseComplete?: () => void;
  onError?: (error: Error) => void;
}

export function CreditPackSelector({
  onPurchaseStart,
  onError,
}: ICreditPackSelectorProps): JSX.Element {
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const packs = getEnabledCreditPacks();

  const handlePurchase = async (packKey: string) => {
    setIsLoading(true);
    setSelectedPack(packKey);
    onPurchaseStart?.();

    try {
      const { url } = await StripeService.purchaseCredits(packKey);
      window.location.href = url;
    } catch (error) {
      console.error('Purchase error:', error);
      onError?.(error instanceof Error ? error : new Error('Purchase failed'));
      setIsLoading(false);
      setSelectedPack(null);
    }
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
    <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
      {packs.map(pack => (
        <div
          key={pack.key}
          className={`relative bg-white border rounded-xl p-6 transition-all cursor-pointer hover:border-indigo-500 hover:shadow-md ${
            selectedPack === pack.key ? 'border-indigo-500 ring-2 ring-indigo-500' : 'border-slate-200'
          } ${pack.popular ? 'border-indigo-300' : ''}`}
          onClick={() => !isLoading && handlePurchase(pack.key)}
        >
          {pack.popular && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-600 text-white text-xs font-semibold rounded-full">
              Best Value
            </div>
          )}

          <div className="text-center mb-4">
            <h3 className="text-lg font-semibold text-slate-900">{pack.name}</h3>
            <div className="text-3xl font-bold text-slate-900 mt-2">{formatPrice(pack.priceInCents)}</div>
          </div>

          <div className="text-center space-y-4">
            <div className="text-2xl font-semibold text-indigo-600">{pack.credits} credits</div>

            <div className="text-sm text-slate-500">${getPricePerCredit(pack)} per credit</div>

            <ul className="text-sm text-left space-y-2 mt-4">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span>Never expire</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span>Use anytime</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span>Stack with subscription</span>
              </li>
            </ul>

            <button
              className={`w-full px-4 py-3 rounded-lg font-medium transition-colors mt-4 ${
                pack.popular
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              disabled={isLoading}
            >
              {isLoading && selectedPack === pack.key ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Processing...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  <span>Buy Now</span>
                </div>
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
