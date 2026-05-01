import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPromotionCodesRetrieve, mockPromotionCodesList, mockSupabaseFrom } = vi.hoisted(() => ({
  mockPromotionCodesRetrieve: vi.fn(),
  mockPromotionCodesList: vi.fn(),
  mockSupabaseFrom: vi.fn(),
}));

vi.mock('@server/stripe/config', () => ({
  stripe: {
    promotionCodes: {
      retrieve: mockPromotionCodesRetrieve,
      list: mockPromotionCodesList,
    },
  },
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: mockSupabaseFrom,
  },
}));

import { getPromoCodeByCheckoutId } from '@/server/services/recovery-discount.service';

describe('getPromoCodeByCheckoutId (optimized lookup)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retrieves promo code directly from Stripe when DB has recovery_discount_id', async () => {
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          recovery_discount_id: 'promo_db_123',
          recovery_discount_code: 'RECOVER-DB123',
        },
        error: null,
      }),
    };
    mockSupabaseFrom.mockReturnValue(selectChain);

    mockPromotionCodesRetrieve.mockResolvedValue({
      id: 'promo_db_123',
      code: 'RECOVER-DB123',
      active: true,
      promotion: {
        coupon: 'coupon_recovery',
        type: 'coupon',
      },
      expires_at: Math.floor(Date.now() / 1000) + 86400,
    });

    const result = await getPromoCodeByCheckoutId('checkout-123');

    expect(mockSupabaseFrom).toHaveBeenCalledWith('abandoned_checkouts');
    expect(mockPromotionCodesRetrieve).toHaveBeenCalledWith('promo_db_123');
    expect(mockPromotionCodesList).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        promotionCodeId: 'promo_db_123',
        code: 'RECOVER-DB123',
        couponId: 'coupon_recovery',
        checkoutId: 'checkout-123',
      })
    );
  });

  it('falls back to Stripe pagination when DB record lacks recovery_discount_id', async () => {
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { recovery_discount_id: null, recovery_discount_code: null },
        error: null,
      }),
    };
    mockSupabaseFrom.mockReturnValue(selectChain);

    mockPromotionCodesList.mockResolvedValue({
      data: [
        {
          id: 'promo_fallback_1',
          code: 'RECOVER-FB111',
          promotion: { coupon: 'coupon_recovery', type: 'coupon' },
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

    expect(mockPromotionCodesRetrieve).not.toHaveBeenCalled();
    expect(mockPromotionCodesList).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        promotionCodeId: 'promo_fallback_1',
        code: 'RECOVER-FB111',
        checkoutId: 'checkout-123',
      })
    );
  });

  it('falls back to Stripe pagination when DB query fails', async () => {
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'DB error' },
      }),
    };
    mockSupabaseFrom.mockReturnValue(selectChain);

    mockPromotionCodesList.mockResolvedValue({
      data: [],
      has_more: false,
    });

    const result = await getPromoCodeByCheckoutId('checkout-123');

    expect(mockPromotionCodesRetrieve).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
