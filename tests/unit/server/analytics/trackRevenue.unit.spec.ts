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
  serverEnv: {
    ENV: 'production', // Use production to test real API calls
    AMPLITUDE_API_KEY: 'real_api_key',
  },
}));

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
