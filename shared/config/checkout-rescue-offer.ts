import { STRIPE_PRICES } from '@shared/config/stripe';

/**
 * Temporary rescue offer shown when a user tries to abandon checkout.
 * Applies to the Hobby subscription and all credit packs.
 * Scoped narrowly so we can disable or revise it without touching the
 * broader pricing and engagement-discount flows.
 */
export const CHECKOUT_RESCUE_OFFER_CONFIG = {
  offerType: 'checkout_abandon',
  discountPercent: 20,
  offerValidityMinutes: 10,
  eligiblePriceIds: [
    STRIPE_PRICES.HOBBY_MONTHLY,
    STRIPE_PRICES.SMALL_CREDITS,
    STRIPE_PRICES.MEDIUM_CREDITS,
    STRIPE_PRICES.LARGE_CREDITS,
  ],
} as const;

export function isCheckoutRescueOfferEligiblePrice(priceId: string): boolean {
  return CHECKOUT_RESCUE_OFFER_CONFIG.eligiblePriceIds.includes(
    priceId as (typeof CHECKOUT_RESCUE_OFFER_CONFIG.eligiblePriceIds)[number]
  );
}
