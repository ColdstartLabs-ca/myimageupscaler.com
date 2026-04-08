import type { TCheckoutStep } from '@server/analytics/types';

interface ICheckoutRescueOfferVisibilityParams {
  step: TCheckoutStep;
  rescueOfferEligible: boolean;
  rescueOfferApplied: boolean;
  engagementDiscountApplied: boolean;
}

export function shouldShowCheckoutRescueOffer({
  step,
  rescueOfferEligible,
  rescueOfferApplied,
  engagementDiscountApplied,
}: ICheckoutRescueOfferVisibilityParams): boolean {
  return (
    step === 'stripe_embed' &&
    rescueOfferEligible &&
    !rescueOfferApplied &&
    !engagementDiscountApplied
  );
}
