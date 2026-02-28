/**
 * Unit Tests: Subscription Cancellation — Tier Reset
 *
 * Verifies that handleSubscriptionDeleted resets subscription_tier to null
 * in the profiles table when a subscription is canceled.
 *
 * Bug: After canceling, the sidebar showed "Starter Plan" instead of "Free Plan"
 * because subscription_tier was not cleared on cancellation.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SubscriptionHandler } from '../../../app/api/webhooks/stripe/handlers/subscription.handler';
import Stripe from 'stripe';

// Mock supabaseAdmin before importing the handler
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@server/stripe', () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
}));

vi.mock('@shared/config/stripe', () => ({
  resolvePlanOrPack: vi.fn((priceId: string) => ({
    type: 'plan',
    key: 'starter',
    name: 'Starter',
    stripePriceId: priceId,
    priceInCents: 900,
    currency: 'usd',
    credits: 100,
    creditsPerCycle: 100,
  })),
  getPlanForPriceId: vi.fn(),
  assertKnownPriceId: vi.fn(),
}));

vi.mock('@shared/config/subscription.config', () => ({
  getTrialConfig: vi.fn(() => null),
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: new Proxy({} as Record<string, string>, {
    get(_, prop) {
      const defaults: Record<string, string> = {
        AMPLITUDE_API_KEY: 'test-amplitude-key',
        ENV: 'test',
      };
      return defaults[prop as string] ?? '';
    },
  }),
  isTest: vi.fn(() => true),
  isDevelopment: vi.fn(() => false),
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@server/services/email.service', () => ({
  getEmailService: vi.fn(() => ({
    send: vi.fn(() => Promise.resolve()),
  })),
}));

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

describe('SubscriptionHandler.handleSubscriptionDeleted', () => {
  const mockCustomerId = 'cus_test_cancel_123';
  const mockUserId = 'user_test_cancel_123';
  const mockSubscriptionId = 'sub_test_cancel_123';

  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  /** Minimal Stripe subscription object for a canceled subscription */
  function makeDeletedSubscription(
    overrides: Partial<Stripe.Subscription> = {}
  ): Stripe.Subscription {
    return {
      id: mockSubscriptionId,
      customer: mockCustomerId,
      status: 'canceled',
      items: {
        data: [
          {
            price: {
              id: 'price_starter_monthly',
            },
          } as Stripe.SubscriptionItem,
        ],
        object: 'list',
        has_more: false,
        url: '/v1/subscription_items',
      },
      cancel_at_period_end: false,
      ...overrides,
    } as Stripe.Subscription;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  test('should reset subscription_tier to null when subscription is deleted', async () => {
    // Arrange
    const profileUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const subscriptionUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: mockUserId },
                error: null,
              }),
            }),
          }),
          update: profileUpdateMock,
          single: vi.fn().mockResolvedValue({ data: null }),
        } as never;
      }
      if (table === 'subscriptions') {
        return {
          update: subscriptionUpdateMock,
        } as never;
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as never;
    });

    // Act
    await SubscriptionHandler.handleSubscriptionDeleted(makeDeletedSubscription());

    // Assert — the profile update must include subscription_tier: null
    expect(profileUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_tier: null,
      })
    );
  });

  test('should set subscription_status to canceled when subscription is deleted', async () => {
    // Arrange
    const profileUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: mockUserId },
                error: null,
              }),
            }),
          }),
          update: profileUpdateMock,
          single: vi.fn().mockResolvedValue({ data: null }),
        } as never;
      }
      if (table === 'subscriptions') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        } as never;
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as never;
    });

    // Act
    await SubscriptionHandler.handleSubscriptionDeleted(makeDeletedSubscription());

    // Assert — the profile update must include subscription_status: 'canceled'
    expect(profileUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_status: 'canceled',
      })
    );
  });
});
