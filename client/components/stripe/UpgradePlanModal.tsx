'use client';

import { useEffect } from 'react';
import { BottomSheet } from '@client/components/ui/BottomSheet';
import { SubscriptionPlanGrid } from './SubscriptionPlanGrid';
import { analytics } from '@client/analytics';
import { useRegionTier } from '@client/hooks/useRegionTier';

export type TUpgradeModalTrigger =
  | 'model_gate'
  | 'premium_upsell'
  | 'mobile_prompt'
  | 'batch_limit'
  | 'upgrade_card';

export interface IUpgradePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  trigger: TUpgradeModalTrigger;
}

/**
 * Modal displaying subscription plan options (Hobby/Pro/Business).
 * Wraps SubscriptionPlanGrid in a BottomSheet. Each PricingCard handles
 * auth + embedded checkout via useCheckoutFlow internally.
 */
export function UpgradePlanModal({
  isOpen,
  onClose,
  trigger,
}: IUpgradePlanModalProps): JSX.Element {
  const { discountPercent } = useRegionTier();

  useEffect(() => {
    if (isOpen) {
      analytics.track('upgrade_plans_viewed', {
        trigger,
        pricingRegion: discountPercent > 0 ? 'discounted' : 'standard',
        discountPercent,
      });
    }
  }, [isOpen, trigger, discountPercent]);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Choose a Plan" className="pb-safe">
      <div className="p-4 md:p-6">
        <p className="text-sm text-text-muted mb-6 text-center">
          Unlock premium AI models, higher resolution, and batch processing.
        </p>
        <SubscriptionPlanGrid discountPercent={discountPercent} />
      </div>
    </BottomSheet>
  );
}
