import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for trackRevenue function in analyticsService.
 * Verifies that revenue events are correctly formatted for Amplitude's
 * Revenue charts using special $revenue, $productId, $quantity, $revenueType fields.
 */

// Mock fetch globally
const mockFetch = vi.fn(() => Promise.resolve({ ok: true } as Response));
vi.stubGlobal('fetch', mockFetch);

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    SUPABASE_URL: 'https://test.supabase.co',
  },
  serverEnv: {
    ENV: 'production', // Use production to test real API calls
    AMPLITUDE_API_KEY: 'real_api_key',
  },
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

describe('trackRevenue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should send revenue event with correct Amplitude fields', async () => {
    const { trackRevenue } = await import('@server/analytics/analyticsService');

    await trackRevenue(
      {
        userId: 'user_123',
        amountCents: 2900,
        productId: 'subscription_pro_monthly',
        purchaseType: 'subscription',
        currency: 'usd',
      },
      { apiKey: 'test_key', userId: 'user_123' }
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    const event = body.events[0];

    expect(event.event_type).toBe('revenue_received');
    expect(event.user_id).toBe('user_123');
    expect(event.event_properties.$revenue).toBe(29); // 2900 cents → $29
    expect(event.event_properties.$productId).toBe('subscription_pro_monthly');
    expect(event.event_properties.$quantity).toBe(1);
    expect(event.event_properties.$revenueType).toBe('subscription');
    expect(event.event_properties.amountCents).toBe(2900);
    expect(event.event_properties.currency).toBe('usd');
  });

  test('should attach a stable insert_id and sourceObjectId for a provider charge', async () => {
    const { trackRevenue } = await import('@server/analytics/analyticsService');

    await trackRevenue(
      {
        userId: 'user_123',
        amountCents: 2900,
        productId: 'subscription_pro_monthly',
        purchaseType: 'subscription',
        currency: 'usd',
        invoiceId: 'in_renewal_123',
        subscriptionId: 'sub_renewal_123',
        sourceObjectId: 'in_renewal_123',
        lifecycleAction: 'subscription_renewal',
      },
      { apiKey: 'test_key', userId: 'user_123' }
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    const event = body.events[0];

    expect(event.insert_id).toBe('revenue_received:in_renewal_123:subscription_renewal');
    expect(event.event_properties.sourceObjectId).toBe('in_renewal_123');
    expect(event.event_properties.lifecycleAction).toBe('subscription_renewal');
    expect(event.event_properties.invoiceId).toBe('in_renewal_123');
    expect(event.event_properties.subscriptionId).toBe('sub_renewal_123');
  });

  test('should claim a replayed billing revenue event only once', async () => {
    const { trackRevenue } = await import('@server/analytics/analyticsService');
    const claimedKeys = new Set<string>();
    const insert = vi.fn((payload: { event_key: string }) => {
      if (claimedKeys.has(payload.event_key)) {
        return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
      }
      claimedKeys.add(payload.event_key);
      return Promise.resolve({ error: null });
    });
    vi.mocked(supabaseAdmin.from).mockReturnValue({ insert } as never);

    const params = {
      userId: 'user_123',
      amountCents: 2900,
      productId: 'subscription_pro_monthly',
      purchaseType: 'subscription' as const,
      currency: 'usd',
      sourceObjectId: 'in_replayed_123',
      lifecycleAction: 'subscription_renewal',
    };
    const options = {
      apiKey: 'test_key',
      userId: 'user_123',
      sourceObjectId: 'in_replayed_123',
      lifecycleAction: 'subscription_renewal',
      deduplicate: true,
    };

    await expect(trackRevenue(params, options)).resolves.toBe(true);
    await expect(trackRevenue(params, options)).resolves.toBe(true);

    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[0][0].event_key).toBe(insert.mock.calls[1][0].event_key);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('should release a claim when the analytics provider rejects the event', async () => {
    const { trackRevenue } = await import('@server/analytics/analyticsService');
    const claimedKeys = new Set<string>();
    const insert = vi.fn((payload: { event_key: string }) => {
      claimedKeys.add(payload.event_key);
      return Promise.resolve({ error: null });
    });
    const deleteEq = vi.fn((_column: string, value: string) => {
      claimedKeys.delete(value);
      return Promise.resolve({ error: null });
    });
    const deleteClaim = vi.fn(() => ({ eq: deleteEq }));
    vi.mocked(supabaseAdmin.from).mockReturnValue({ insert, delete: deleteClaim } as never);
    mockFetch
      .mockResolvedValueOnce({ ok: false, text: vi.fn(() => Promise.resolve('rejected')) } as never)
      .mockResolvedValueOnce({ ok: true } as never);

    const params = {
      userId: 'user_123',
      amountCents: 2900,
      productId: 'subscription_pro_monthly',
      purchaseType: 'subscription' as const,
      sourceObjectId: 'in_provider_reject_123',
      lifecycleAction: 'subscription_renewal',
    };
    const options = {
      apiKey: 'test_key',
      userId: 'user_123',
      sourceObjectId: 'in_provider_reject_123',
      lifecycleAction: 'subscription_renewal',
      deduplicate: true,
    };

    await expect(trackRevenue(params, options)).resolves.toBe(false);
    await expect(trackRevenue(params, options)).resolves.toBe(true);

    expect(deleteClaim).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test('should reject zero and negative amounts without sending positive revenue', async () => {
    const { trackRevenue } = await import('@server/analytics/analyticsService');

    await expect(
      trackRevenue(
        {
          userId: 'user_123',
          amountCents: 0,
          productId: 'credit_pack_starter',
          purchaseType: 'credit_pack',
          sourceObjectId: 'pi_zero',
        },
        { apiKey: 'test_key', userId: 'user_123' }
      )
    ).resolves.toBe(false);

    await expect(
      trackRevenue(
        {
          userId: 'user_123',
          amountCents: -1,
          productId: 'credit_pack_starter',
          purchaseType: 'credit_pack',
          sourceObjectId: 'pi_negative',
        },
        { apiKey: 'test_key', userId: 'user_123' }
      )
    ).resolves.toBe(false);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('should convert cents to dollars for $revenue field', async () => {
    const { trackRevenue } = await import('@server/analytics/analyticsService');

    await trackRevenue(
      {
        userId: 'user_123',
        amountCents: 999,
        productId: 'credit_pack_starter',
        purchaseType: 'credit_pack',
      },
      { apiKey: 'test_key', userId: 'user_123' }
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body.events[0].event_properties.$revenue).toBe(9.99);
  });

  test('should default quantity to 1 and currency to usd', async () => {
    const { trackRevenue } = await import('@server/analytics/analyticsService');

    await trackRevenue(
      {
        userId: 'user_123',
        amountCents: 500,
        productId: 'credit_pack_starter',
        purchaseType: 'credit_pack',
      },
      { apiKey: 'test_key', userId: 'user_123' }
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body.events[0].event_properties.$quantity).toBe(1);
    expect(body.events[0].event_properties.currency).toBe('usd');
  });

  test('should return false when apiKey is missing', async () => {
    const { trackRevenue } = await import('@server/analytics/analyticsService');

    const result = await trackRevenue(
      {
        userId: 'user_123',
        amountCents: 500,
        productId: 'test',
        purchaseType: 'credit_pack',
      },
      { apiKey: '', userId: 'user_123' }
    );

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
