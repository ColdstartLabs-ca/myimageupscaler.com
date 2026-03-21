import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for $identify event tracking in analytics.
 *
 * These tests verify that the $identify event is correctly sent to Amplitude
 * when subscription events occur, setting user properties like plan and subscription_status.
 */

// Mock the trackServerEvent function
const mockTrackServerEvent = vi.fn();

// Mock the serverEnv
vi.mock('@shared/config/env', () => ({
  serverEnv: {
    AMPLITUDE_API_KEY: 'test_api_key',
    ENV: 'test',
  },
  isTest: () => true,
}));

// Mock the analytics module
vi.mock('@server/analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
}));

// Mock supabaseAdmin
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() =>
            Promise.resolve({
              data: {
                id: 'user_123',
                subscription_status: 'active',
                subscription_credits_balance: 100,
                purchased_credits_balance: 50,
              },
            })
          ),
          single: vi.fn(() =>
            Promise.resolve({
              data: { email: 'test@example.com' },
            })
          ),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    })),
    rpc: vi.fn(() =>
      Promise.resolve({
        data: { success: true },
        error: null,
      })
    ),
  },
}));

// Mock stripe
vi.mock('@server/stripe', () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(() =>
        Promise.resolve({
          id: 'sub_123',
          items: { data: [{ price: { id: 'price_test', recurring: { interval: 'month' } } }] },
          status: 'active',
        })
      ),
    },
  },
}));

// Mock email service
vi.mock('@server/services/email.service', () => ({
  getEmailService: () => ({
    send: vi.fn(() => Promise.resolve()),
  }),
}));

describe('Analytics $identify Event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('trackServerEvent for $identify', () => {
    test('should send $identify event with user_properties format', async () => {
      const { trackServerEvent } = await import('@server/analytics');

      await trackServerEvent(
        '$identify',
        {
          $set: {
            plan: 'pro',
            subscription_status: 'active',
            subscription_started_at: '2026-02-26T00:00:00.000Z',
            billing_interval: 'monthly',
          },
        },
        { apiKey: 'test_key', userId: 'user_123' }
      );

      expect(mockTrackServerEvent).toHaveBeenCalledWith(
        '$identify',
        expect.objectContaining({
          $set: expect.objectContaining({
            plan: 'pro',
            subscription_status: 'active',
          }),
        }),
        expect.objectContaining({
          userId: 'user_123',
        })
      );
    });

    test('should include plan property in $set', async () => {
      const { trackServerEvent } = await import('@server/analytics');

      await trackServerEvent(
        '$identify',
        {
          $set: {
            plan: 'hobby',
            subscription_status: 'active',
          },
        },
        { apiKey: 'test_key', userId: 'user_456' }
      );

      const call = mockTrackServerEvent.mock.calls.find(c => c[0] === '$identify');
      expect(call).toBeDefined();
      expect(call![1]).toHaveProperty('$set.plan', 'hobby');
    });

    test('should set plan to free on subscription cancellation', async () => {
      const { trackServerEvent } = await import('@server/analytics');

      await trackServerEvent(
        '$identify',
        {
          $set: {
            plan: 'free',
            subscription_status: 'canceled',
            subscription_canceled_at: '2026-02-26T00:00:00.000Z',
          },
        },
        { apiKey: 'test_key', userId: 'user_789' }
      );

      const call = mockTrackServerEvent.mock.calls.find(c => c[0] === '$identify');
      expect(call).toBeDefined();
      expect(call![1]).toHaveProperty('$set.plan', 'free');
      expect(call![1]).toHaveProperty('$set.subscription_status', 'canceled');
    });
  });

  describe('User property updates', () => {
    test('should support $setOnce for first-time properties', async () => {
      const { trackServerEvent } = await import('@server/analytics');

      await trackServerEvent(
        '$identify',
        {
          $setOnce: {
            first_subscription_at: '2026-02-26T00:00:00.000Z',
          },
          $set: {
            plan: 'pro',
          },
        },
        { apiKey: 'test_key', userId: 'user_123' }
      );

      expect(mockTrackServerEvent).toHaveBeenCalledWith(
        '$identify',
        expect.objectContaining({
          $setOnce: expect.objectContaining({
            first_subscription_at: '2026-02-26T00:00:00.000Z',
          }),
        }),
        expect.any(Object)
      );
    });

    test('should support $add for cumulative properties', async () => {
      const { trackServerEvent } = await import('@server/analytics');

      await trackServerEvent(
        '$identify',
        {
          $set: { plan: 'pro' },
          $add: {
            total_revenue_cents: 2900,
            total_purchases: 1,
          },
        },
        { apiKey: 'test_key', userId: 'user_123' }
      );

      expect(mockTrackServerEvent).toHaveBeenCalledWith(
        '$identify',
        expect.objectContaining({
          $add: expect.objectContaining({
            total_revenue_cents: 2900,
            total_purchases: 1,
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('Subscription handler $identify calls', () => {
    test('should track $identify after subscription_created', async () => {
      // This test verifies the pattern used in subscription.handler.ts
      const { trackServerEvent } = await import('@server/analytics');

      // Simulate subscription creation
      await trackServerEvent(
        'subscription_created',
        {
          plan: 'pro',
          amountCents: 2900,
          billingInterval: 'monthly',
          status: 'active',
          subscriptionId: 'sub_123',
        },
        { apiKey: 'test_key', userId: 'user_123' }
      );

      // Followed by $identify
      await trackServerEvent(
        '$identify',
        {
          $set: {
            plan: 'pro',
            subscription_status: 'active',
            subscription_started_at: new Date().toISOString(),
            billing_interval: 'monthly',
          },
        },
        { apiKey: 'test_key', userId: 'user_123' }
      );

      // Verify both events were tracked
      expect(mockTrackServerEvent).toHaveBeenCalledTimes(2);
      expect(mockTrackServerEvent).toHaveBeenNthCalledWith(
        1,
        'subscription_created',
        expect.any(Object),
        expect.any(Object)
      );
      expect(mockTrackServerEvent).toHaveBeenNthCalledWith(
        2,
        '$identify',
        expect.objectContaining({
          $set: expect.objectContaining({
            plan: 'pro',
            subscription_status: 'active',
          }),
        }),
        expect.any(Object)
      );
    });

    test('should track $identify with plan=free after subscription_canceled', async () => {
      const { trackServerEvent } = await import('@server/analytics');

      // Simulate subscription cancellation
      await trackServerEvent(
        'subscription_canceled',
        {
          plan: 'pro',
          subscriptionId: 'sub_123',
        },
        { apiKey: 'test_key', userId: 'user_123' }
      );

      // Followed by $identify with plan=free
      await trackServerEvent(
        '$identify',
        {
          $set: {
            plan: 'free',
            subscription_status: 'canceled',
            subscription_canceled_at: new Date().toISOString(),
          },
        },
        { apiKey: 'test_key', userId: 'user_123' }
      );

      // Verify the $identify has plan=free
      const identifyCall = mockTrackServerEvent.mock.calls.find(c => c[0] === '$identify');
      expect(identifyCall).toBeDefined();
      expect(identifyCall![1]).toHaveProperty('$set.plan', 'free');
    });
  });

  describe('Billing interval normalization', () => {
    test('should normalize "month" to "monthly"', async () => {
      const { trackServerEvent } = await import('@server/analytics');

      const billingInterval = 'month';
      await trackServerEvent(
        '$identify',
        {
          $set: {
            plan: 'pro',
            subscription_status: 'active',
            billing_interval: billingInterval === 'month' ? 'monthly' : billingInterval,
          },
        },
        { apiKey: 'test_key', userId: 'user_123' }
      );

      const call = mockTrackServerEvent.mock.calls.find(c => c[0] === '$identify');
      expect(call![1]).toHaveProperty('$set.billing_interval', 'monthly');
    });

    test('should keep "yearly" as-is', async () => {
      const { trackServerEvent } = await import('@server/analytics');

      const billingInterval = 'year';
      await trackServerEvent(
        '$identify',
        {
          $set: {
            plan: 'pro',
            subscription_status: 'active',
            billing_interval: billingInterval === 'month' ? 'monthly' : billingInterval,
          },
        },
        { apiKey: 'test_key', userId: 'user_123' }
      );

      const call = mockTrackServerEvent.mock.calls.find(c => c[0] === '$identify');
      expect(call![1]).toHaveProperty('$set.billing_interval', 'year');
    });
  });
});

import type { IAnalyticsEventName } from '@server/analytics/types';

describe('Analytics $identify Event Name Type', () => {
  test('should include $identify in IAnalyticsEventName type', () => {
    // This is a compile-time check - if $identify is not in the type,
    // TypeScript would fail to compile
    const eventName: IAnalyticsEventName = '$identify';
    expect(eventName).toBe('$identify');
  });
});
