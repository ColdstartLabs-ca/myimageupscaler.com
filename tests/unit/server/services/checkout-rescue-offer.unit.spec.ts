import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  issueCheckoutRescueOffer,
  verifyCheckoutRescueOffer,
} from '@server/services/checkout-rescue-offer.service';
import { STRIPE_PRICES } from '@shared/config/stripe';

describe('checkout rescue offer service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-07T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('issues a valid hobby rescue offer token for the requesting user', () => {
    const offer = issueCheckoutRescueOffer({
      userId: 'user_123',
      priceId: STRIPE_PRICES.HOBBY_MONTHLY,
    });

    expect(offer.discountPercent).toBe(20);
    expect(offer.priceId).toBe(STRIPE_PRICES.HOBBY_MONTHLY);
    expect(offer.offerToken).toContain('.');

    const verification = verifyCheckoutRescueOffer({
      offerToken: offer.offerToken,
      userId: 'user_123',
      priceId: STRIPE_PRICES.HOBBY_MONTHLY,
    });

    expect(verification.valid).toBe(true);
    expect(verification.discountPercent).toBe(20);
  });

  test('rejects a token when the user does not match', () => {
    const offer = issueCheckoutRescueOffer({
      userId: 'user_123',
      priceId: STRIPE_PRICES.HOBBY_MONTHLY,
    });

    const verification = verifyCheckoutRescueOffer({
      offerToken: offer.offerToken,
      userId: 'user_999',
      priceId: STRIPE_PRICES.HOBBY_MONTHLY,
    });

    expect(verification.valid).toBe(false);
  });

  test('rejects a token after it expires', () => {
    const offer = issueCheckoutRescueOffer({
      userId: 'user_123',
      priceId: STRIPE_PRICES.HOBBY_MONTHLY,
    });

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    const verification = verifyCheckoutRescueOffer({
      offerToken: offer.offerToken,
      userId: 'user_123',
      priceId: STRIPE_PRICES.HOBBY_MONTHLY,
    });

    expect(verification.valid).toBe(false);
  });
});
