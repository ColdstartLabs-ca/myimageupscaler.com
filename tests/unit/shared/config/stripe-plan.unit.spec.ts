import { describe, it, expect } from 'vitest';
import { determinePlanFromPriceId, STRIPE_PRICES } from '@shared/config/stripe';

describe('determinePlanFromPriceId', () => {
  it('should resolve STARTER_MONTHLY to "starter"', () => {
    expect(determinePlanFromPriceId(STRIPE_PRICES.STARTER_MONTHLY)).toBe('starter');
  });

  it('should resolve HOBBY_MONTHLY to "hobby"', () => {
    expect(determinePlanFromPriceId(STRIPE_PRICES.HOBBY_MONTHLY)).toBe('hobby');
  });

  it('should resolve PRO_MONTHLY to "pro"', () => {
    expect(determinePlanFromPriceId(STRIPE_PRICES.PRO_MONTHLY)).toBe('pro');
  });

  it('should resolve BUSINESS_MONTHLY to "business"', () => {
    expect(determinePlanFromPriceId(STRIPE_PRICES.BUSINESS_MONTHLY)).toBe('business');
  });

  it('should default to "hobby" for unknown priceId', () => {
    expect(determinePlanFromPriceId('price_unknown_xyz')).toBe('hobby');
  });
});
