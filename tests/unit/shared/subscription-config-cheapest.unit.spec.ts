import { describe, it, expect, vi } from 'vitest';

const SMALL_PRICE_ID = 'price_test_small';

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL: 'price_test_small',
    NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM: 'price_test_medium',
    NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LARGE: 'price_test_large',
    NEXT_PUBLIC_STRIPE_PRICE_STARTER: 'price_test_starter',
    NEXT_PUBLIC_STRIPE_PRICE_HOBBY: 'price_test_hobby',
    NEXT_PUBLIC_STRIPE_PRICE_PRO: 'price_test_pro',
    NEXT_PUBLIC_STRIPE_PRICE_BUSINESS: 'price_test_business',
  },
  serverEnv: {},
}));

vi.mock('@shared/config/timeouts.config', () => ({
  TIMEOUTS: { CACHE_MEDIUM_TTL: 300000 },
}));

vi.mock('@shared/config/credits.config', () => ({
  CREDIT_COSTS: {
    DEFAULT_FREE_CREDITS: 10,
    DEFAULT_TRIAL_CREDITS: 0,
    STARTER_MONTHLY_CREDITS: 100,
    HOBBY_MONTHLY_CREDITS: 200,
    PRO_MONTHLY_CREDITS: 1000,
    BUSINESS_MONTHLY_CREDITS: 5000,
    SMALL_PACK_CREDITS: 50,
    MEDIUM_PACK_CREDITS: 200,
    LARGE_PACK_CREDITS: 600,
    BASE_UPSCALE_COST: 1,
    BASE_ENHANCE_COST: 2,
    BASE_BOTH_COST: 2,
    BASE_CUSTOM_COST: 3,
    REAL_ESRGAN_MULTIPLIER: 1,
    GFPGAN_MULTIPLIER: 1,
    CLARITY_UPSCALER_MULTIPLIER: 2,
    FLUX_2_PRO_MULTIPLIER: 3,
    NANO_BANANA_PRO_MULTIPLIER: 5,
    LOW_CREDIT_WARNING_THRESHOLD: 5,
    CREDIT_WARNING_PERCENTAGE: 20,
  },
}));

import { resolveCheapestRegionalPlan } from '@shared/config/subscription.config';
import type { PricingRegion } from '@shared/config/pricing-regions';

describe('resolveCheapestRegionalPlan', () => {
  it('returns expected ID per region — standard', () => {
    expect(resolveCheapestRegionalPlan('standard')).toBe(SMALL_PRICE_ID);
  });

  it('returns expected ID per region — south_asia', () => {
    expect(resolveCheapestRegionalPlan('south_asia')).toBe(SMALL_PRICE_ID);
  });

  it('returns expected ID per region — southeast_asia', () => {
    expect(resolveCheapestRegionalPlan('southeast_asia')).toBe(SMALL_PRICE_ID);
  });

  it('returns expected ID per region — latam', () => {
    expect(resolveCheapestRegionalPlan('latam')).toBe(SMALL_PRICE_ID);
  });

  it('returns expected ID per region — eastern_europe', () => {
    expect(resolveCheapestRegionalPlan('eastern_europe')).toBe(SMALL_PRICE_ID);
  });

  it('returns expected ID per region — africa', () => {
    expect(resolveCheapestRegionalPlan('africa')).toBe(SMALL_PRICE_ID);
  });

  it('handles unknown region gracefully by returning the standard small pack', () => {
    const unknownRegion = 'unknown_region' as PricingRegion;
    expect(resolveCheapestRegionalPlan(unknownRegion)).toBe(SMALL_PRICE_ID);
  });

  it('always returns a non-empty string', () => {
    const regions: PricingRegion[] = [
      'standard',
      'south_asia',
      'southeast_asia',
      'latam',
      'eastern_europe',
      'africa',
    ];
    for (const region of regions) {
      const result = resolveCheapestRegionalPlan(region);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });
});
