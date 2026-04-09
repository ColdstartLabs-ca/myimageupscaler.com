'use client';

import { useState, useEffect, useCallback } from 'react';
import type React from 'react';
import { StripeService } from '@client/services/stripeService';
import {
  clearStoredCheckoutRescueOffer,
  getStoredCheckoutRescueOffer,
  storeCheckoutRescueOffer,
} from '@client/utils/checkoutRescueOfferStorage';
import { shouldShowCheckoutRescueOffer } from '@client/utils/checkoutRescueOfferVisibility';
import type { ICheckoutRescueOffer } from '@shared/types/checkout-offer';
import type { TCheckoutExitMethod, TCheckoutStep } from '@server/analytics/types';

export interface ITryShowRescueOfferParams {
  step: TCheckoutStep;
  rescueOfferEligible: boolean;
  rescueOfferApplied: boolean;
  engagementDiscountApplied: boolean;
  method: TCheckoutExitMethod;
  exitIntentTrackedRef: React.MutableRefObject<boolean>;
  trackExitIntent: (step: TCheckoutStep, method: TCheckoutExitMethod) => void;
}

export interface IClaimOfferDeps {
  rescueOfferAppliedRef: React.MutableRefObject<boolean>;
  resetLoadStart: () => void;
  retry: () => void;
}

export interface IDismissOfferDeps {
  trackCheckoutAbandoned: (step: TCheckoutStep) => void;
  onClose: () => void;
}

export interface IUseCheckoutRescueOfferReturn {
  showRescueOffer: boolean;
  rescueOffer: ICheckoutRescueOffer | null;
  appliedOfferToken: string | null;
  tryShowRescueOffer: (params: ITryShowRescueOfferParams) => Promise<boolean>;
  claimOffer: (deps: IClaimOfferDeps) => void;
  dismissOffer: (deps: IDismissOfferDeps) => void;
  clearOffer: () => void;
  hideRescueOffer: () => void;
}

export function useCheckoutRescueOffer(priceId: string): IUseCheckoutRescueOfferReturn {
  const [showRescueOffer, setShowRescueOffer] = useState(false);
  const [rescueOffer, setRescueOffer] = useState<ICheckoutRescueOffer | null>(null);
  const [appliedOfferToken, setAppliedOfferToken] = useState<string | null>(null);

  useEffect(() => {
    setRescueOffer(getStoredCheckoutRescueOffer(priceId));
  }, [priceId]);

  const tryShowRescueOffer = useCallback(
    async (params: ITryShowRescueOfferParams): Promise<boolean> => {
      const { step, rescueOfferEligible, rescueOfferApplied, engagementDiscountApplied,
              method, exitIntentTrackedRef, trackExitIntent } = params;

      if (!shouldShowCheckoutRescueOffer({ step, rescueOfferEligible, rescueOfferApplied, engagementDiscountApplied })) {
        return false;
      }

      const show = (offer: ICheckoutRescueOffer) => {
        setRescueOffer(offer);
        setShowRescueOffer(true);
        exitIntentTrackedRef.current = true;
        trackExitIntent(step, method);
      };

      const existingOffer = getStoredCheckoutRescueOffer(priceId);
      if (existingOffer) { show(existingOffer); return true; }

      try {
        const createdOffer = await StripeService.createCheckoutRescueOffer(priceId);
        storeCheckoutRescueOffer(createdOffer);
        show(createdOffer);
        return true;
      } catch (err) {
        console.warn('[CHECKOUT_RESCUE_OFFER] Failed to issue offer, closing normally', {
          priceId,
          error: err instanceof Error ? err.message : err,
        });
        return false;
      }
    },
    [priceId]
  );

  const claimOffer = useCallback(
    ({ rescueOfferAppliedRef, resetLoadStart, retry }: IClaimOfferDeps) => {
      setShowRescueOffer(false);
      if (rescueOffer) setAppliedOfferToken(rescueOffer.offerToken);
      rescueOfferAppliedRef.current = true;
      resetLoadStart();
      retry();
    },
    [rescueOffer]
  );

  const dismissOffer = useCallback(
    ({ trackCheckoutAbandoned, onClose }: IDismissOfferDeps) => {
      setShowRescueOffer(false);
      trackCheckoutAbandoned('stripe_embed');
      onClose();
    },
    []
  );

  const clearOffer = useCallback(() => {
    clearStoredCheckoutRescueOffer(priceId);
    setAppliedOfferToken(null);
  }, [priceId]);

  const hideRescueOffer = useCallback(() => setShowRescueOffer(false), []);

  return { showRescueOffer, rescueOffer, appliedOfferToken,
           tryShowRescueOffer, claimOffer, dismissOffer, clearOffer, hideRescueOffer };
}
