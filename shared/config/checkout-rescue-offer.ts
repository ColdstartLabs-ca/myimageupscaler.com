import { STRIPE_PRICES } from '@shared/config/stripe';

/**
 * Temporary rescue offer shown when a user tries to abandon Hobby checkout.
 * Scoped narrowly so we can disable or revise it without touching the
 * broader pricing and engagement-discount flows.
 */
export const CHECKOUT_RESCUE_OFFER_CONFIG = {
  offerType: 'checkout_abandon_hobby',
  discountPercent: 20,
  offerValidityMinutes: 10,
  eligiblePriceIds: [STRIPE_PRICES.HOBBY_MONTHLY],
} as const;

export function isCheckoutRescueOfferEligiblePrice(priceId: string): boolean {
  return CHECKOUT_RESCUE_OFFER_CONFIG.eligiblePriceIds.includes(
    priceId as (typeof CHECKOUT_RESCUE_OFFER_CONFIG.eligiblePriceIds)[number]
  );
}
