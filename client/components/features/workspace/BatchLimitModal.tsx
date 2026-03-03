'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('workspace.batchLimit');
  const tCommon = useTranslations('common');
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
    router.push('/dashboard/billing');
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

        <h2 className="text-xl font-bold text-primary mb-2">
          {serverEnforced ? t('serverEnforcedTitle') : t('clientEnforcedTitle')}
        </h2>

        {serverEnforced ? (
          <p className="text-muted-foreground">
            {t.rich('serverEnforcedMessage', {
              currentCount: chunks => <span className="font-semibold">{chunks}</span>,
              limit: chunks => <span className="font-semibold">{chunks}</span>,
              currentCountValue: currentCount,
              limitValue: limit,
            })}
          </p>
        ) : (
          <p className="text-muted-foreground">
            {t('clientEnforcedMessage', {
              attempted,
              plural: attempted,
              limit,
              limitPlural: limit,
            })}
          </p>
        )}
      </div>

      {/* Free User Special Message */}
      {limit === 1 && (
        <div className="bg-surface rounded-lg p-4 mb-6 border border-border">
          <p className="text-sm text-muted-foreground">{t('freeUserMessage')}</p>
        </div>
      )}

      {/* Server-enforced messaging */}
      {serverEnforced && (
        <div className="bg-amber-50 rounded-lg p-4 mb-6 border border-amber-200">
          <p className="text-sm text-amber-800">{t('securityMessage')}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        <Button variant="primary" className="w-full" onClick={handleUpgradeClick}>
          {t('unlockBatchButton')}
        </Button>

        {!serverEnforced && availableSlots > 0 && (
          <Button variant="outline" className="w-full" onClick={handleAddPartial}>
            {t('addPartialButton', { availableSlots, count: availableSlots })}
          </Button>
        )}

        <Button variant="ghost" className="w-full" onClick={handleClose}>
          {tCommon('cancel')}
        </Button>
      </div>
    </Modal>
  );
};
