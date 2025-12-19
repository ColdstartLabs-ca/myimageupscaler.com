'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@client/components/ui/Modal';
import { Button } from '@client/components/ui/Button';
import { analytics } from '@client/analytics/analyticsClient';

export interface IBatchLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  limit: number;
  attempted: number;
  currentCount: number;
  onAddPartial: () => void;
  serverEnforced?: boolean;
}

export const BatchLimitModal: React.FC<IBatchLimitModalProps> = ({
  isOpen,
  onClose,
  limit,
  attempted,
  currentCount,
  onAddPartial,
  serverEnforced = false,
}) => {
  const router = useRouter();
  const availableSlots = Math.max(0, limit - currentCount);

  // Track modal view when opened
  React.useEffect(() => {
    if (isOpen) {
      analytics.track('batch_limit_modal_shown', {
        limit,
        attempted,
        currentCount,
        availableSlots,
        serverEnforced,
        userType: limit <= 5 ? 'free' : 'paid',
      });
    }
  }, [isOpen, limit, attempted, currentCount, availableSlots, serverEnforced]);

  const handleUpgradeClick = () => {
    analytics.track('batch_limit_upgrade_clicked', {
      limit,
      attempted,
      currentCount,
      serverEnforced,
      userType: limit <= 5 ? 'free' : 'paid',
      source: 'batch_limit_modal',
    });
    router.push('/pricing');
  };

  const handleAddPartial = () => {
    analytics.track('batch_limit_partial_add_clicked', {
      limit,
      attempted,
      currentCount,
      availableSlots,
      serverEnforced,
      userType: limit <= 5 ? 'free' : 'paid',
    });
    onAddPartial();
  };

  const handleClose = () => {
    analytics.track('batch_limit_modal_closed', {
      limit,
      attempted,
      currentCount,
      availableSlots,
      serverEnforced,
      userType: limit <= 5 ? 'free' : 'paid',
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" data-testid="batch-limit-modal">
      {/* Alert Icon and Header */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-600" />
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-2">
          {serverEnforced ? 'Batch Processing Limit Reached' : 'Batch Limit Reached'}
        </h2>

        {serverEnforced ? (
          <p className="text-slate-600">
            You&apos;ve reached the processing limit for your plan. You processed{' '}
            <span className="font-semibold">{currentCount}</span> images, but your plan allows a
            maximum of <span className="font-semibold">{limit}</span> images per hour.
          </p>
        ) : (
          <p className="text-slate-600">
            You tried to add <span className="font-semibold">{attempted}</span> image
            {attempted !== 1 ? 's' : ''}, but your plan allows a maximum of{' '}
            <span className="font-semibold">{limit}</span> image{limit !== 1 ? 's' : ''} in the
            queue.
          </p>
        )}
      </div>

      {/* Free User Special Message */}
      {limit <= 5 && (
        <div className="bg-slate-50 rounded-lg p-4 mb-6 border border-slate-200">
          <p className="text-sm text-slate-600">
            Free users can process up to 5 images per hour. Upgrade to unlock higher batch limits
            and process more images.
          </p>
        </div>
      )}

      {/* Server-enforced messaging */}
      {serverEnforced && (
        <div className="bg-amber-50 rounded-lg p-4 mb-6 border border-amber-200">
          <p className="text-sm text-amber-800">
            This is a security measure to prevent abuse. The limit will reset in approximately 1
            hour. Upgrade your plan for higher limits.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        <Button variant="primary" className="w-full" onClick={handleUpgradeClick}>
          Upgrade Plan
        </Button>

        {!serverEnforced && availableSlots > 0 && (
          <Button variant="outline" className="w-full" onClick={handleAddPartial}>
            Add {availableSlots} {availableSlots === 1 ? 'image' : 'images'}
          </Button>
        )}

        <Button variant="ghost" className="w-full" onClick={handleClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
};
