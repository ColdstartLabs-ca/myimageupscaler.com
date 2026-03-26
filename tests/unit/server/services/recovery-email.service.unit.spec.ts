import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IAbandonedCheckout } from '@/shared/types/abandoned-checkout.types';
import dayjs from 'dayjs';

const { mockSend, mockTrackServerEvent, mockGenerateRecoveryPromoCode, mockRpc, mockFrom } =
  vi.hoisted(() => ({
    mockSend: vi.fn(),
    mockTrackServerEvent: vi.fn().mockResolvedValue(undefined),
    mockGenerateRecoveryPromoCode: vi.fn(),
    mockRpc: vi.fn(),
    mockFrom: vi.fn(),
  }));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    BASE_URL: 'https://example.com',
    SUPPORT_EMAIL: 'support@example.com',
    APP_NAME: 'MyImageUpscaler',
    AMPLITUDE_API_KEY: 'amplitude-key',
  },
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
}));

vi.mock('@server/services/email-providers', () => ({
  getEmailProviderManager: () => ({
    send: mockSend,
  }),
}));

vi.mock('@server/services/recovery-discount.service', () => ({
  generateRecoveryPromoCode: mockGenerateRecoveryPromoCode,
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

import { sendDueRecoveryEmails, sendRecoveryEmail } from '@/server/services/recovery-email.service';

describe('recovery-email.service', () => {
  const checkout: IAbandonedCheckout = {
    id: 'checkout-123',
    userId: 'user-123',
    email: 'user@example.com',
    priceId: 'price_123',
    purchaseType: 'subscription',
    planKey: 'pro',
    pricingRegion: 'standard',
    discountPercent: 0,
    cartData: {
      priceId: 'price_123',
      purchaseType: 'subscription',
      planKey: 'pro',
      pricingRegion: 'standard',
      discountPercent: 0,
      originalAmountCents: 1900,
      currency: 'USD',
      createdAt: '2026-03-12T09:00:00.000Z',
    },
    emailsSent: {
      email_1hr: true,
      email_24hr: false,
      email_72hr: false,
    },
    status: 'pending',
    createdAt: '2026-03-12T09:00:00.000Z',
    updatedAt: '2026-03-12T09:00:00.000Z',
    firstEmailSentAt: '2026-03-12T10:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T12:30:00.000Z'));
    mockSend.mockResolvedValue({
      success: true,
      provider: 'resend',
      messageId: 'msg_123',
    });
    mockGenerateRecoveryPromoCode.mockResolvedValue({
      code: 'RECOVER-ABCD1234',
      promotionCodeId: 'promo_123',
      couponId: 'coupon_123',
      checkoutId: 'checkout-123',
      expiresAt: new Date('2026-03-19T12:30:00.000Z'),
    });
    mockRpc.mockResolvedValue({ error: null });
  });

  it('returns due counts without sending emails when dryRun is enabled', async () => {
    const rows = [
      {
        id: 'checkout-1',
        user_id: 'user-1',
        email: 'one@example.com',
        price_id: 'price_1',
        purchase_type: 'subscription',
        plan_key: 'pro',
        pack_key: null,
        pricing_region: 'standard',
        discount_percent: 0,
        cart_data: checkout.cartData,
        recovery_discount_code: null,
        recovery_discount_id: null,
        emails_sent: { email_1hr: false, email_24hr: false, email_72hr: false },
        status: 'pending',
        created_at: '2026-03-12T11:16:00.000Z',
        updated_at: '2026-03-12T11:16:00.000Z',
        recovered_at: null,
        first_email_sent_at: null,
        second_email_sent_at: null,
        third_email_sent_at: null,
      },
      {
        id: 'checkout-2',
        user_id: 'user-2',
        email: 'two@example.com',
        price_id: 'price_2',
        purchase_type: 'subscription',
        plan_key: 'pro',
        pack_key: null,
        pricing_region: 'standard',
        discount_percent: 0,
        cart_data: checkout.cartData,
        recovery_discount_code: null,
        recovery_discount_id: null,
        emails_sent: { email_1hr: false, email_24hr: false, email_72hr: false },
        status: 'pending',
        created_at: '2026-03-12T11:20:00.000Z',
        updated_at: '2026-03-12T11:20:00.000Z',
        recovered_at: null,
        first_email_sent_at: null,
        second_email_sent_at: null,
        third_email_sent_at: null,
      },
    ];

    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      not: vi.fn(),
      neq: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
    };

    query.select.mockReturnValue(query);
    query.eq.mockImplementation((field: string) => {
      if (field === 'status') {
        return query;
      }

      return Promise.resolve({ data: rows, error: null });
    });
    query.not.mockReturnValue(query);
    query.neq.mockReturnValue(query);
    query.gte.mockReturnValue(query);
    query.lte.mockReturnValue(query);
    mockFrom.mockReturnValue(query);

    const result = await sendDueRecoveryEmails('1hr', { dryRun: true });
    const expectedNewestEligibleAt = dayjs().subtract(1, 'hour').toISOString();
    const expectedOldestEligibleAt = dayjs(expectedNewestEligibleAt)
      .subtract(15, 'minute')
      .toISOString();

    expect(result).toEqual({ sent: 0, failed: 0, total: 2 });
    expect(query.not).toHaveBeenCalledWith('email', 'is', null);
    expect(query.neq).toHaveBeenCalledWith('email', '');
    expect(query.gte).toHaveBeenCalledWith('created_at', expectedOldestEligibleAt);
    expect(query.lte).toHaveBeenCalledWith('created_at', expectedNewestEligibleAt);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('targets the cron-sized due window instead of sending reminder emails early', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      not: vi.fn(),
      neq: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
    };

    query.select.mockReturnValue(query);
    query.eq.mockImplementation((field: string) => {
      if (field === 'status') {
        return query;
      }

      return Promise.resolve({ data: [], error: null });
    });
    query.not.mockReturnValue(query);
    query.neq.mockReturnValue(query);
    query.gte.mockReturnValue(query);
    query.lte.mockReturnValue(query);
    mockFrom.mockReturnValue(query);

    await sendDueRecoveryEmails('24hr', { dryRun: true });
    const expectedNewestEligibleAt = dayjs().subtract(24, 'hour').toISOString();
    const expectedOldestEligibleAt = dayjs(expectedNewestEligibleAt)
      .subtract(15, 'minute')
      .toISOString();

    expect(query.gte).toHaveBeenCalledWith('created_at', expectedOldestEligibleAt);
    expect(query.lte).toHaveBeenCalledWith('created_at', expectedNewestEligibleAt);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('marks sent emails with the RPC helper so prior JSON flags are preserved', async () => {
    const result = await sendRecoveryEmail('24hr', checkout);

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('mark_email_sent', {
      checkout_uuid: 'checkout-123',
      email_type: 'email_24hr',
    });
  });
});
