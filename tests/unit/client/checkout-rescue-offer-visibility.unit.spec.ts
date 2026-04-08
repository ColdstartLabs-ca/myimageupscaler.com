import { describe, expect, test } from 'vitest';
import { shouldShowCheckoutRescueOffer } from '@client/utils/checkoutRescueOfferVisibility';

describe('shouldShowCheckoutRescueOffer', () => {
  test('returns true for eligible stripe checkout exits without another discount', () => {
    expect(
      shouldShowCheckoutRescueOffer({
        step: 'stripe_embed',
        rescueOfferEligible: true,
        rescueOfferApplied: false,
        engagementDiscountApplied: false,
      })
    ).toBe(true);
  });

  test('returns false when a rescue offer is already applied', () => {
    expect(
      shouldShowCheckoutRescueOffer({
        step: 'stripe_embed',
        rescueOfferEligible: true,
        rescueOfferApplied: true,
        engagementDiscountApplied: false,
      })
    ).toBe(false);
  });

  test('returns false when checkout already includes an engagement discount', () => {
    expect(
      shouldShowCheckoutRescueOffer({
        step: 'stripe_embed',
        rescueOfferEligible: true,
        rescueOfferApplied: false,
        engagementDiscountApplied: true,
      })
    ).toBe(false);
  });

  test('returns false outside the embedded checkout step', () => {
    expect(
      shouldShowCheckoutRescueOffer({
        step: 'plan_selection',
        rescueOfferEligible: true,
        rescueOfferApplied: false,
        engagementDiscountApplied: false,
      })
    ).toBe(false);
  });
});
