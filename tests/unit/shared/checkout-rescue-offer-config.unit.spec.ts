import { describe, expect, test } from 'vitest';
import {
  CHECKOUT_RESCUE_OFFER_CONFIG,
  isCheckoutRescueOfferEligiblePrice,
} from '@shared/config/checkout-rescue-offer';
import { STRIPE_PRICES } from '@shared/config/stripe';

describe('checkout rescue offer config', () => {
  describe('CHECKOUT_RESCUE_OFFER_CONFIG', () => {
    test('has 20% discount', () => {
      expect(CHECKOUT_RESCUE_OFFER_CONFIG.discountPercent).toBe(20);
    });

    test('has 10 minute validity', () => {
      expect(CHECKOUT_RESCUE_OFFER_CONFIG.offerValidityMinutes).toBe(10);
    });

    test('has correct offer type', () => {
      expect(CHECKOUT_RESCUE_OFFER_CONFIG.offerType).toBe('checkout_abandon');
    });

    test('includes Hobby monthly and all credit packs as eligible', () => {
      expect(CHECKOUT_RESCUE_OFFER_CONFIG.eligiblePriceIds).toContain(STRIPE_PRICES.HOBBY_MONTHLY);
      expect(CHECKOUT_RESCUE_OFFER_CONFIG.eligiblePriceIds).toContain(STRIPE_PRICES.SMALL_CREDITS);
      expect(CHECKOUT_RESCUE_OFFER_CONFIG.eligiblePriceIds).toContain(STRIPE_PRICES.MEDIUM_CREDITS);
      expect(CHECKOUT_RESCUE_OFFER_CONFIG.eligiblePriceIds).toContain(STRIPE_PRICES.LARGE_CREDITS);
      expect(CHECKOUT_RESCUE_OFFER_CONFIG.eligiblePriceIds).toHaveLength(4);
    });
  });

  describe('isCheckoutRescueOfferEligiblePrice', () => {
    test('returns true for Hobby monthly price', () => {
      expect(isCheckoutRescueOfferEligiblePrice(STRIPE_PRICES.HOBBY_MONTHLY)).toBe(true);
    });

    test('returns true for Small Credits pack', () => {
      expect(isCheckoutRescueOfferEligiblePrice(STRIPE_PRICES.SMALL_CREDITS)).toBe(true);
    });

    test('returns true for Medium Credits pack', () => {
      expect(isCheckoutRescueOfferEligiblePrice(STRIPE_PRICES.MEDIUM_CREDITS)).toBe(true);
    });

    test('returns true for Large Credits pack', () => {
      expect(isCheckoutRescueOfferEligiblePrice(STRIPE_PRICES.LARGE_CREDITS)).toBe(true);
    });

    test('returns false for Pro monthly price', () => {
      expect(isCheckoutRescueOfferEligiblePrice(STRIPE_PRICES.PRO_MONTHLY)).toBe(false);
    });

    test('returns false for arbitrary price IDs', () => {
      expect(isCheckoutRescueOfferEligiblePrice('price_test123')).toBe(false);
      expect(isCheckoutRescueOfferEligiblePrice('')).toBe(false);
      expect(isCheckoutRescueOfferEligiblePrice('price_unknown')).toBe(false);
    });
  });
});
