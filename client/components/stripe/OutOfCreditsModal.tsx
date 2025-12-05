'use client';

import React, { useState } from 'react';
import { CreditPackSelector } from './CreditPackSelector';
import { AlertCircle, X } from 'lucide-react';

interface IOutOfCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchaseComplete: () => void;
}

export function OutOfCreditsModal({
  isOpen,
  onClose,
  onPurchaseComplete,
}: IOutOfCreditsModalProps): JSX.Element | null {
  const [showSubscriptionCTA, setShowSubscriptionCTA] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-end sm:items-center justify-center p-4">
        <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl p-6">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={24} />
          </button>

          {/* Header */}
          <div className="text-center mb-6">
            <div className="mx-auto w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">You&apos;re Out of Credits</h2>
            <p className="text-slate-600">
              Purchase credits to continue processing images, or subscribe for better value.
            </p>
          </div>

          {/* Tabs: One-Time vs Subscription */}
          <div className="flex gap-2 mb-6 justify-center">
            <button
              onClick={() => setShowSubscriptionCTA(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !showSubscriptionCTA
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Buy Credits
            </button>
            <button
              onClick={() => setShowSubscriptionCTA(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showSubscriptionCTA
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Subscribe (Best Value)
            </button>
          </div>

          {/* Content */}
          {!showSubscriptionCTA ? (
            <>
              <CreditPackSelector
                onPurchaseStart={() => {}}
                onPurchaseComplete={() => {
                  onPurchaseComplete();
                  onClose();
                }}
                onError={error => console.error(error)}
              />

              <div className="mt-4 text-center text-sm text-slate-500">
                Subscribe for up to 58% cheaper credits
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-600 mb-6">
                Get monthly credits with automatic rollover, plus 11-58% cheaper per-credit pricing.
              </p>
              <a
                href="/pricing"
                className="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
              >
                View Subscription Plans
              </a>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 text-center">
            <button
              onClick={onClose}
              className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
