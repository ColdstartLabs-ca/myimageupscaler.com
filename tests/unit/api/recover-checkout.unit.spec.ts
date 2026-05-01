import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockSupabaseFrom, mockTrackServerEvent } = vi.hoisted(() => ({
  mockSupabaseFrom: vi.fn(),
  mockTrackServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: mockSupabaseFrom,
  },
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    AMPLITUDE_API_KEY: 'test-key',
    BASE_URL: 'https://example.com',
  },
}));

import { GET } from '@/app/api/checkout/recover/[checkoutId]/route';

describe('GET /api/checkout/recover/[checkoutId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when checkout is not found', async () => {
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    };
    mockSupabaseFrom.mockReturnValue(selectChain);

    const request = new NextRequest('http://localhost/api/checkout/recover/invalid-id');
    const response = await GET(request, { params: Promise.resolve({ checkoutId: 'invalid-id' }) });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('returns ALREADY_RECOVERED for recovered checkouts', async () => {
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'checkout-123',
          status: 'recovered',
          cart_data: { priceId: 'price_123', purchaseType: 'subscription' },
          recovery_discount_code: null,
        },
        error: null,
      }),
    };
    mockSupabaseFrom.mockReturnValue(selectChain);

    const request = new NextRequest('http://localhost/api/checkout/recover/checkout-123');
    const response = await GET(request, {
      params: Promise.resolve({ checkoutId: 'checkout-123' }),
    });
    const json = await response.json();

    expect(json.success).toBe(false);
    expect(json.error.code).toBe('ALREADY_RECOVERED');
    expect(json.data.isValid).toBe(false);
  });

  it('returns EXPIRED for checkouts older than 7 days', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'checkout-123',
          status: 'pending',
          created_at: eightDaysAgo,
          cart_data: { priceId: 'price_123', purchaseType: 'subscription' },
          recovery_discount_code: 'RECOVER-TEST',
        },
        error: null,
      }),
    };
    mockSupabaseFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain);

    const request = new NextRequest('http://localhost/api/checkout/recover/checkout-123');
    const response = await GET(request, {
      params: Promise.resolve({ checkoutId: 'checkout-123' }),
    });
    const json = await response.json();

    expect(json.success).toBe(false);
    expect(json.error.code).toBe('EXPIRED');
    expect(json.data.isValid).toBe(false);
  });

  it('returns valid recovery data for pending checkouts', async () => {
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'checkout-123',
          status: 'pending',
          created_at: new Date().toISOString(),
          cart_data: { priceId: 'price_123', purchaseType: 'subscription', planKey: 'pro' },
          recovery_discount_code: 'RECOVER-ABC123',
          user_id: 'user-123',
        },
        error: null,
      }),
    };
    mockSupabaseFrom.mockReturnValue(selectChain);

    const request = new NextRequest('http://localhost/api/checkout/recover/checkout-123');
    const response = await GET(request, {
      params: Promise.resolve({ checkoutId: 'checkout-123' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.isValid).toBe(true);
    expect(json.data.discountCode).toBe('RECOVER-ABC123');
    expect(json.data.cartData.planKey).toBe('pro');
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'recovery_link_clicked',
      expect.objectContaining({ checkoutId: 'checkout-123' }),
      expect.any(Object)
    );
  });
});
