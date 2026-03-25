'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Modal } from '@client/components/ui/Modal';
import { Button } from '@client/components/ui/Button';
import { analytics } from '@client/analytics/analyticsClient';
import { getVariant } from '@client/utils/abTest';
import { clientEnv } from '@shared/config/env';

type TCopyVariant = 'value' | 'outcome' | 'urgency';

export interface IBatchLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  limit: number;
  attempted: number;
  currentCount: number;
  onAddPartial: () => void;
  onUpgrade: () => void;
  serverEnforced?: boolean;
}

export const BatchLimitModal: React.FC<IBatchLimitModalProps> = ({
  isOpen,
  onClose,
  limit,
  attempted,
  currentCount,
  onAddPartial,
  onUpgrade,
  serverEnforced = false,
}) => {
  const t = useTranslations('workspace.batchLimit');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const availableSlots = Math.max(0, limit - currentCount);

  // A/B test: assign copy variant
  const copyVariant: TCopyVariant = getVariant('batch_limit_copy', [
    'value',
    'outcome',
    'urgency',
  ]) as TCopyVariant;

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
        copyVariant,
      });
    }
  }, [isOpen, limit, attempted, currentCount, availableSlots, serverEnforced, copyVariant]);

  const handleQuickBuyClick = () => {
    analytics.track('batch_limit_quick_buy_clicked', {
      limit,
      attempted,
      currentCount,
      serverEnforced,
      userType: limit <= 5 ? 'free' : 'paid',
      copyVariant,
      quickBuy: true,
    });
    onClose();
    // Navigate directly to checkout with price ID
    router.push(`/checkout?priceId=${clientEnv.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL}`);
  };

  const handleSeePlansClick = () => {
    analytics.track('batch_limit_see_plans_clicked', {
      limit,
      attempted,
      currentCount,
      serverEnforced,
      userType: limit <= 5 ? 'free' : 'paid',
      copyVariant,
      quickBuy: false,
    });
    onClose();
    onUpgrade();
  };

  const handleAddPartial = () => {
    analytics.track('batch_limit_partial_add_clicked', {
      limit,
      attempted,
      currentCount,
      availableSlots,
      serverEnforced,
      userType: limit <= 5 ? 'free' : 'paid',
      copyVariant,
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
      copyVariant,
    });
    onClose();
  };

  if (!isOpen) return null;

  // Get copy based on variant
  const getCopyForVariant = () => {
    switch (copyVariant) {
      case 'value':
        return {
          title: t('title_value'),
          body: t('body_value'),
        };
      case 'outcome':
        return {
          title: t('title_outcome'),
          body: t('body_outcome'),
        };
      case 'urgency':
        return {
          title: t('title_urgency'),
          body: t('body_urgency'),
        };
    }
  };

  const copy = getCopyForVariant();

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md" data-testid="batch-limit-modal">
      {/* Before/After Image Comparison */}
      <div className="flex justify-center gap-4 mb-6">
        <div className="relative w-32 h-32 rounded-lg overflow-hidden shadow-sm">
          <Image
            src="/before-after/face-pro/before.webp"
            alt="Before: Standard quality upscaling"
            fill
            className="object-cover"
            sizes="128px"
            loading="lazy"
          />
          <span className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
            Before
          </span>
        </div>
        <div className="relative w-32 h-32 rounded-lg overflow-hidden shadow-sm">
          <Image
            src="/before-after/face-pro/after.webp"
            alt="After: Pro AI quality upscaling"
            fill
            className="object-cover"
            sizes="128px"
            loading="lazy"
          />
          <span className="absolute bottom-1 right-1 bg-accent/80 text-white text-xs px-2 py-0.5 rounded">
            After
          </span>
        </div>
      </div>

      {/* Value-Framed Header with Sparkles Icon */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-accent/20 to-secondary/20 mb-4">
          <Sparkles className="w-6 h-6 text-accent" />
        </div>

        <h2 className="text-xl font-bold text-primary mb-2">{copy.title}</h2>

        <p className="text-muted-foreground">{copy.body}</p>
      </div>

      {/* Remaining Slots Context (for paid users with partial queue) */}
      {limit > 1 && availableSlots > 0 && availableSlots < limit && (
        <div className="bg-surface rounded-lg p-4 mb-6 border border-border">
          <p className="text-sm text-muted-foreground">
            {t('remainingSlotsMessage', { availableSlots, limit })}
          </p>
        </div>
      )}

      {/* Server-enforced messaging */}
      {serverEnforced && (
        <div className="bg-surface rounded-lg p-4 mb-6 border border-border">
          <p className="text-sm text-muted-foreground">{t('securityMessage')}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        <Button variant="gradient" className="w-full" onClick={handleQuickBuyClick}>
          {t('quickBuyButton')}
        </Button>

        <Button variant="outline" className="w-full" onClick={handleSeePlansClick}>
          {t('seePlansButton')}
        </Button>

        {!serverEnforced && availableSlots > 0 && (
          <Button variant="ghost" className="w-full" onClick={handleAddPartial}>
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
