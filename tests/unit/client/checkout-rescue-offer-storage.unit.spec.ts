import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getStoredCheckoutRescueOffer,
  storeCheckoutRescueOffer,
  clearStoredCheckoutRescueOffer,
} from '@client/utils/checkoutRescueOfferStorage';
import type { ICheckoutRescueOffer } from '@shared/types/checkout-offer';
import { STRIPE_PRICES } from '@shared/config/stripe';

describe('checkout rescue offer storage utils', () => {
  const mockPriceId = STRIPE_PRICES.HOBBY_MONTHLY;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('getStoredCheckoutRescueOffer', () => {
    test('returns null when no offer is stored', () => {
      const result = getStoredCheckoutRescueOffer(mockPriceId);
      expect(result).toBeNull();
    });

    test('returns null when window is undefined (SSR)', () => {
      const originalWindow = global.window;
      // @ts-expect-error - intentionally removing window
      delete global.window;

      const result = getStoredCheckoutRescueOffer(mockPriceId);
      expect(result).toBeNull();

      global.window = originalWindow;
    });

    test('returns valid stored offer', () => {
      const validOffer: ICheckoutRescueOffer = {
        offerToken: 'valid.token',
        priceId: mockPriceId,
        discountPercent: 20,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };

      sessionStorage.setItem(`checkout_rescue_offer:${mockPriceId}`, JSON.stringify(validOffer));

      const result = getStoredCheckoutRescueOffer(mockPriceId);
      expect(result).toEqual(validOffer);
    });

    test('returns null for expired offer', () => {
      const expiredOffer: ICheckoutRescueOffer = {
        offerToken: 'expired.token',
        priceId: mockPriceId,
        discountPercent: 20,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };

      sessionStorage.setItem(`checkout_rescue_offer:${mockPriceId}`, JSON.stringify(expiredOffer));

      const result = getStoredCheckoutRescueOffer(mockPriceId);
      expect(result).toBeNull();
      expect(sessionStorage.getItem(`checkout_rescue_offer:${mockPriceId}`)).toBeNull();
    });

    test('returns null and clears storage for malformed offer', () => {
      const malformedOffers = [
        'not-json',
        JSON.stringify({ offerToken: 'missing-fields' }),
        JSON.stringify({ offerToken: 'token', priceId: mockPriceId }),
        JSON.stringify({ offerToken: 'token', discountPercent: 20 }),
        JSON.stringify({
          offerToken: 'token',
          priceId: mockPriceId,
          discountPercent: 'not-number' as unknown,
        }),
        JSON.stringify({
          offerToken: 'token',
          priceId: mockPriceId,
          discountPercent: 20,
          expiresAt: 123,
        }),
      ];

      malformedOffers.forEach((malformed, index) => {
        sessionStorage.setItem(`checkout_rescue_offer:${mockPriceId}_${index}`, malformed);
        const result = getStoredCheckoutRescueOffer(`${mockPriceId}_${index}`);
        expect(result).toBeNull();
      });
    });

    test('returns null when priceId does not match stored offer', () => {
      const offer: ICheckoutRescueOffer = {
        offerToken: 'token',
        priceId: 'different_price_id',
        discountPercent: 20,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };

      sessionStorage.setItem(`checkout_rescue_offer:${mockPriceId}`, JSON.stringify(offer));

      const result = getStoredCheckoutRescueOffer(mockPriceId);
      expect(result).toBeNull();
      expect(sessionStorage.getItem(`checkout_rescue_offer:${mockPriceId}`)).toBeNull();
    });

    test('handles JSON parsing errors gracefully', () => {
      sessionStorage.setItem(`checkout_rescue_offer:${mockPriceId}`, '{invalid-json}');

      const result = getStoredCheckoutRescueOffer(mockPriceId);
      expect(result).toBeNull();
      expect(sessionStorage.getItem(`checkout_rescue_offer:${mockPriceId}`)).toBeNull();
    });
  });

  describe('storeCheckoutRescueOffer', () => {
    test('stores offer in sessionStorage', () => {
      const offer: ICheckoutRescueOffer = {
        offerToken: 'new.token',
        priceId: mockPriceId,
        discountPercent: 20,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };

      storeCheckoutRescueOffer(offer);

      const stored = sessionStorage.getItem(`checkout_rescue_offer:${mockPriceId}`);
      expect(stored).toBeDefined();
      expect(JSON.parse(stored!)).toEqual(offer);
    });

    test('does nothing when window is undefined (SSR)', () => {
      const originalWindow = global.window;
      // @ts-expect-error - intentionally removing window
      delete global.window;

      const offer: ICheckoutRescueOffer = {
        offerToken: 'token',
        priceId: mockPriceId,
        discountPercent: 20,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };

      expect(() => storeCheckoutRescueOffer(offer)).not.toThrow();

      global.window = originalWindow;
    });

    test('overwrites existing offer for same priceId', () => {
      const firstOffer: ICheckoutRescueOffer = {
        offerToken: 'first.token',
        priceId: mockPriceId,
        discountPercent: 20,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };

      const secondOffer: ICheckoutRescueOffer = {
        offerToken: 'second.token',
        priceId: mockPriceId,
        discountPercent: 20,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };

      storeCheckoutRescueOffer(firstOffer);
      storeCheckoutRescueOffer(secondOffer);

      const stored = sessionStorage.getItem(`checkout_rescue_offer:${mockPriceId}`);
      expect(JSON.parse(stored!)).toEqual(secondOffer);
    });
  });

  describe('clearStoredCheckoutRescueOffer', () => {
    test('removes stored offer', () => {
      const offer: ICheckoutRescueOffer = {
        offerToken: 'token',
        priceId: mockPriceId,
        discountPercent: 20,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };

      storeCheckoutRescueOffer(offer);
      expect(sessionStorage.getItem(`checkout_rescue_offer:${mockPriceId}`)).toBeDefined();

      clearStoredCheckoutRescueOffer(mockPriceId);
      expect(sessionStorage.getItem(`checkout_rescue_offer:${mockPriceId}`)).toBeNull();
    });

    test('does nothing when window is undefined (SSR)', () => {
      const originalWindow = global.window;
      // @ts-expect-error - intentionally removing window
      delete global.window;

      expect(() => clearStoredCheckoutRescueOffer(mockPriceId)).not.toThrow();

      global.window = originalWindow;
    });

    test('does nothing when no offer is stored', () => {
      expect(() => clearStoredCheckoutRescueOffer(mockPriceId)).not.toThrow();
      expect(sessionStorage.getItem(`checkout_rescue_offer:${mockPriceId}`)).toBeNull();
    });
  });

  describe('integration: get and store workflow', () => {
    test('round-trip: store -> get returns same offer', () => {
      const offer: ICheckoutRescueOffer = {
        offerToken: 'roundtrip.token',
        priceId: mockPriceId,
        discountPercent: 20,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };

      storeCheckoutRescueOffer(offer);
      const retrieved = getStoredCheckoutRescueOffer(mockPriceId);

      expect(retrieved).toEqual(offer);
    });

    test('clear -> get returns null', () => {
      const offer: ICheckoutRescueOffer = {
        offerToken: 'token',
        priceId: mockPriceId,
        discountPercent: 20,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };

      storeCheckoutRescueOffer(offer);
      clearStoredCheckoutRescueOffer(mockPriceId);
      const retrieved = getStoredCheckoutRescueOffer(mockPriceId);

      expect(retrieved).toBeNull();
    });
  });
});
