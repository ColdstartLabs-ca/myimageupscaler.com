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
  },
}));

import { POST } from '@/app/api/checkout/abandoned/route';

describe('POST /api/checkout/abandoned', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid purchaseType values', async () => {
    const request = new NextRequest('http://localhost/api/checkout/abandoned', {
      method: 'POST',
      body: JSON.stringify({
        priceId: 'price_123',
        purchaseType: 'invalid_type',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('purchaseType');
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  it('accepts subscription as valid purchaseType', async () => {
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'checkout-123' },
        error: null,
      }),
    };
    mockSupabaseFrom.mockReturnValue(insertChain);

    const request = new NextRequest('http://localhost/api/checkout/abandoned', {
      method: 'POST',
      body: JSON.stringify({
        priceId: 'price_123',
        purchaseType: 'subscription',
        planKey: 'pro',
        originalAmountCents: 1900,
        currency: 'USD',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.checkoutId).toBe('checkout-123');
  });

  it('accepts credit_pack as valid purchaseType', async () => {
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'checkout-456' },
        error: null,
      }),
    };
    mockSupabaseFrom.mockReturnValue(insertChain);

    const request = new NextRequest('http://localhost/api/checkout/abandoned', {
      method: 'POST',
      body: JSON.stringify({
        priceId: 'price_456',
        purchaseType: 'credit_pack',
        packKey: 'starter',
        originalAmountCents: 499,
        currency: 'USD',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.checkoutId).toBe('checkout-456');
  });

  it('rejects missing purchaseType', async () => {
    const request = new NextRequest('http://localhost/api/checkout/abandoned', {
      method: 'POST',
      body: JSON.stringify({
        priceId: 'price_123',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('purchaseType');
  });
});
