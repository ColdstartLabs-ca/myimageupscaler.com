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
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-end sm:items-center justify-center p-4">
        <div className="relative w-full max-w-4xl bg-surface rounded-lg shadow-xl p-6">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-muted-foreground transition-colors"
          >
            <X size={24} />
          </button>

          {/* Header */}
          <div className="text-center mb-6">
            <div className="mx-auto w-12 h-12 bg-warning/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-warning" />
            </div>
            <h2 className="text-2xl font-bold text-primary mb-2">You&apos;re Out of Credits</h2>
            <p className="text-muted-foreground">
              Purchase credits to continue processing images, or subscribe for better value.
            </p>
          </div>

          {/* Tabs: One-Time vs Subscription */}
          <div className="flex gap-2 mb-6 justify-center">
            <button
              onClick={() => setShowSubscriptionCTA(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !showSubscriptionCTA
                  ? 'bg-accent text-white'
                  : 'bg-surface-light text-muted-foreground hover:bg-surface-light'
              }`}
            >
              Buy Credits
            </button>
            <button
              onClick={() => setShowSubscriptionCTA(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showSubscriptionCTA
                  ? 'bg-accent text-white'
                  : 'bg-surface-light text-muted-foreground hover:bg-surface-light'
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

              <div className="mt-4 text-center text-sm text-muted-foreground">
                Subscribe for up to 58% cheaper credits
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-6">
                Get monthly credits with automatic rollover, plus 11-58% cheaper per-credit pricing.
              </p>
              <a
                href="/pricing"
                className="inline-flex items-center px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors"
              >
                View Subscription Plans
              </a>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 text-center">
            <button
              onClick={onClose}
              className="text-sm text-muted-foreground hover:text-muted-foreground transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
