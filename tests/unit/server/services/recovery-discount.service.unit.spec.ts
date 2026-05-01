import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockPromotionCodesCreate,
  mockPromotionCodesList,
  mockPromotionCodesUpdate,
  mockCouponsCreate,
  mockCouponsRetrieve,
  mockSupabaseFrom,
} = vi.hoisted(() => ({
  mockPromotionCodesCreate: vi.fn(),
  mockPromotionCodesList: vi.fn(),
  mockPromotionCodesUpdate: vi.fn(),
  mockCouponsCreate: vi.fn(),
  mockCouponsRetrieve: vi.fn(),
  mockSupabaseFrom: vi.fn(),
}));

vi.mock('@server/stripe/config', () => ({
  stripe: {
    promotionCodes: {
      create: mockPromotionCodesCreate,
      list: mockPromotionCodesList,
      update: mockPromotionCodesUpdate,
      retrieve: vi.fn(),
    },
    coupons: {
      create: mockCouponsCreate,
      retrieve: mockCouponsRetrieve,
    },
  },
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: mockSupabaseFrom,
  },
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    STRIPE_RECOVERY_COUPON_ID: 'coupon_recovery',
  },
  clientEnv: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  },
}));

import {
  generateRecoveryPromoCode,
  getPromoCodeByCheckoutId,
  validateRecoveryCode,
} from '@/server/services/recovery-discount.service';

describe('recovery-discount.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { recovery_discount_id: null, recovery_discount_code: null },
        error: null,
      }),
    });
  });

  it('creates Stripe promotion codes with the SDK promotion payload', async () => {
    mockPromotionCodesCreate.mockResolvedValue({
      id: 'promo_123',
    });

    await generateRecoveryPromoCode('checkout-123', 'user@example.com');

    expect(mockPromotionCodesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        promotion: {
          coupon: 'coupon_recovery',
          type: 'coupon',
        },
        code: expect.stringMatching(/^RECOVER-/),
      })
    );
  });

  it('reads coupon information from promoCode.promotion.coupon during validation', async () => {
    mockPromotionCodesList.mockResolvedValue({
      data: [
        {
          id: 'promo_123',
          active: false,
          promotion: {
            coupon: 'coupon_recovery',
            type: 'coupon',
          },
          max_redemptions: 1,
          times_redeemed: 0,
          expires_at: null,
        },
      ],
    });

    const result = await validateRecoveryCode('recover-abcd1234');

    expect(result).toEqual({
      isValid: false,
      error: 'inactive',
      promotionCodeId: 'promo_123',
      couponId: 'coupon_recovery',
    });
  });

  it('paginates promotion code lookups until it finds the matching checkout id', async () => {
    mockPromotionCodesList
      .mockResolvedValueOnce({
        data: [
          {
            id: 'promo_page_1',
            code: 'RECOVER-AAAA1111',
            promotion: {
              coupon: 'coupon_recovery',
              type: 'coupon',
            },
            metadata: {
              checkout_id: 'other-checkout',
              type: 'abandoned_checkout_recovery',
            },
            expires_at: null,
          },
        ],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'promo_page_2',
            code: 'RECOVER-BBBB2222',
            promotion: {
              coupon: 'coupon_recovery',
              type: 'coupon',
            },
            metadata: {
              checkout_id: 'checkout-123',
              type: 'abandoned_checkout_recovery',
            },
            expires_at: null,
          },
        ],
        has_more: false,
      });

    const result = await getPromoCodeByCheckoutId('checkout-123');

    expect(mockPromotionCodesList).toHaveBeenNthCalledWith(1, {
      limit: 100,
      starting_after: undefined,
    });
    expect(mockPromotionCodesList).toHaveBeenNthCalledWith(2, {
      limit: 100,
      starting_after: 'promo_page_1',
    });
    expect(result).toEqual(
      expect.objectContaining({
        promotionCodeId: 'promo_page_2',
        couponId: 'coupon_recovery',
        checkoutId: 'checkout-123',
      })
    );
  });
});
