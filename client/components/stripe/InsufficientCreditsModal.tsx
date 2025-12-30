'use client';

import React from 'react';
// import { useRouter } from 'next/navigation'; // Temporarily commented - not used
import { AlertCircle, X } from 'lucide-react';

export interface IInsufficientCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  requiredCredits: number;
  currentBalance: number;
  onBuyCredits: () => void;
  onViewPlans: () => void;
}

export function InsufficientCreditsModal({
  isOpen,
  onClose,
  requiredCredits,
  currentBalance,
  onBuyCredits,
  onViewPlans,
}: IInsufficientCreditsModalProps): JSX.Element | null {
  const deficit = requiredCredits - currentBalance;
  const costPerCredit = 2; // Approximate based on medium pack ($14.99 / 200 credits)
  const maxImagesWithCurrentBalance = Math.floor(currentBalance / costPerCredit);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-end justify-center p-4 sm:items-center">
        <div className="relative w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl dark:bg-gray-800">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-muted-foreground dark:text-gray-500 dark:hover:text-gray-300"
          >
            <X size={24} />
          </button>

          {/* Header */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 dark:bg-warning/20">
              <AlertCircle className="h-6 w-6 text-warning dark:text-warning/80" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-primary dark:text-gray-100">
              Not Enough Credits
            </h2>
            <p className="text-muted-foreground dark:text-gray-400">
              This batch requires {requiredCredits} credits. You have {currentBalance}.
            </p>
          </div>

          {/* Options */}
          <div className="mb-6 space-y-3">
            <button
              onClick={onBuyCredits}
              className="w-full rounded-lg bg-accent px-6 py-3 font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Buy {deficit}+ Credits
            </button>
            <button
              onClick={onViewPlans}
              className="w-full rounded-lg border border-border bg-surface px-6 py-3 font-medium text-muted-foreground transition-colors hover:bg-surface dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              View Plans (Save up to 58%)
            </button>
          </div>

          {/* Alternative suggestion */}
          {maxImagesWithCurrentBalance > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4 dark:border-gray-700 dark:bg-gray-900">
              <p className="text-sm text-muted-foreground dark:text-gray-400">
                Or reduce batch size to {maxImagesWithCurrentBalance}{' '}
                {maxImagesWithCurrentBalance === 1 ? 'image' : 'images'} to process with your
                current balance
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
