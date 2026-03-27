/**
 * Unit tests for user segmentation logic in useUserData()
 *
 * Tests the derivation of UserSegment ('free' | 'credit_purchaser' | 'subscriber')
 * based on profile and subscription data.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IUserProfile, ISubscription, UserSegment } from '@/shared/types/stripe.types';

// Mock the userStore module
vi.mock('@/client/store/userStore', () => ({
  useUserStore: vi.fn(),
  useShallow: vi.fn((selector) => selector),
}));

// Helper to create mock profile
function createMockProfile(overrides: Partial<IUserProfile> = {}): IUserProfile {
  return {
    id: 'user-123',
    stripe_customer_id: null,
    subscription_credits_balance: 0,
    purchased_credits_balance: 0,
    subscription_status: null,
    subscription_tier: null,
    role: 'user',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// Helper to create mock subscription
function createMockSubscription(overrides: Partial<ISubscription> = {}): ISubscription {
  return {
    id: 'sub-123',
    user_id: 'user-123',
    status: 'active',
    price_id: 'price-starter',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date().toISOString(),
    trial_end: null,
    cancel_at_period_end: false,
    canceled_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// Extracted segmentation logic (mirrors useUserData implementation)
function computeUserSegment(
  profile: IUserProfile | null,
  subscription: ISubscription | null
): { userSegment: UserSegment; isFreeUser: boolean } {
  const subscriptionTier = profile?.subscription_tier?.toLowerCase() ?? null;
  const hasPaidTier = !!subscriptionTier && subscriptionTier !== 'free';
  const hasSubscription =
    hasPaidTier ||
    !!subscription?.price_id ||
    (!!profile?.subscription_status &&
      profile.subscription_status !== 'canceled' &&
      profile.subscription_status !== 'unpaid');
  const hasPurchasedCredits = (profile?.purchased_credits_balance ?? 0) > 0;
  const hasEverPurchased = hasPurchasedCredits || !!profile?.stripe_customer_id;

  const userSegment: UserSegment = hasSubscription
    ? 'subscriber'
    : hasEverPurchased
      ? 'credit_purchaser'
      : 'free';

  const isFreeUser = userSegment === 'free';

  return { userSegment, isFreeUser };
}

describe('User Segmentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('computeUserSegment', () => {
    it('should return "free" when no subscription and no purchases', () => {
      const profile = createMockProfile();
      const subscription = null;

      const { userSegment, isFreeUser } = computeUserSegment(profile, subscription);

      expect(userSegment).toBe('free');
      expect(isFreeUser).toBe(true);
    });

    it('should return "credit_purchaser" when has purchased credits but no subscription', () => {
      const profile = createMockProfile({
        purchased_credits_balance: 100,
        stripe_customer_id: 'cus_abc123',
      });
      const subscription = null;

      const { userSegment, isFreeUser } = computeUserSegment(profile, subscription);

      expect(userSegment).toBe('credit_purchaser');
      expect(isFreeUser).toBe(false);
    });

    it('should return "credit_purchaser" when has stripe_customer_id but zero balance', () => {
      // This handles users who bought credits but spent them all
      const profile = createMockProfile({
        purchased_credits_balance: 0, // All credits spent
        stripe_customer_id: 'cus_abc123', // But was a customer
      });
      const subscription = null;

      const { userSegment, isFreeUser } = computeUserSegment(profile, subscription);

      expect(userSegment).toBe('credit_purchaser');
      expect(isFreeUser).toBe(false);
    });

    it('should return "subscriber" when has active subscription (hasPaidTier)', () => {
      const profile = createMockProfile({
        subscription_tier: 'starter',
        subscription_status: 'active',
      });
      const subscription = null;

      const { userSegment, isFreeUser } = computeUserSegment(profile, subscription);

      expect(userSegment).toBe('subscriber');
      expect(isFreeUser).toBe(false);
    });

    it('should return "subscriber" when subscription is trialing', () => {
      const profile = createMockProfile({
        subscription_tier: 'starter',
        subscription_status: 'trialing',
      });
      const subscription = null;

      const { userSegment, isFreeUser } = computeUserSegment(profile, subscription);

      expect(userSegment).toBe('subscriber');
      expect(isFreeUser).toBe(false);
    });

    it('should return "subscriber" when subscription has price_id', () => {
      const profile = createMockProfile();
      const subscription = createMockSubscription({ price_id: 'price-starter' });

      const { userSegment, isFreeUser } = computeUserSegment(profile, subscription);

      expect(userSegment).toBe('subscriber');
      expect(isFreeUser).toBe(false);
    });

    it('should return "subscriber" when subscription_status is active (no tier)', () => {
      const profile = createMockProfile({
        subscription_status: 'active',
      });
      const subscription = null;

      const { userSegment, isFreeUser } = computeUserSegment(profile, subscription);

      expect(userSegment).toBe('subscriber');
      expect(isFreeUser).toBe(false);
    });

    it('should NOT return "subscriber" when subscription_status is canceled', () => {
      const profile = createMockProfile({
        subscription_status: 'canceled',
        purchased_credits_balance: 50, // Still a credit purchaser
      });
      const subscription = null;

      const { userSegment, isFreeUser } = computeUserSegment(profile, subscription);

      expect(userSegment).toBe('credit_purchaser');
      expect(isFreeUser).toBe(false);
    });

    it('should NOT return "subscriber" when subscription_status is unpaid', () => {
      const profile = createMockProfile({
        subscription_status: 'unpaid',
        purchased_credits_balance: 50,
      });
      const subscription = null;

      const { userSegment, isFreeUser } = computeUserSegment(profile, subscription);

      expect(userSegment).toBe('credit_purchaser');
      expect(isFreeUser).toBe(false);
    });

    it('should return "free" when subscription_tier is "free"', () => {
      const profile = createMockProfile({
        subscription_tier: 'free',
      });
      const subscription = null;

      const { userSegment, isFreeUser } = computeUserSegment(profile, subscription);

      expect(userSegment).toBe('free');
      expect(isFreeUser).toBe(true);
    });

    it('should prioritize subscriber over credit_purchaser', () => {
      // User has both subscription and purchased credits
      const profile = createMockProfile({
        subscription_tier: 'starter',
        subscription_status: 'active',
        purchased_credits_balance: 500,
        stripe_customer_id: 'cus_abc123',
      });
      const subscription = createMockSubscription();

      const { userSegment, isFreeUser } = computeUserSegment(profile, subscription);

      expect(userSegment).toBe('subscriber');
      expect(isFreeUser).toBe(false);
    });

    it('should handle null profile gracefully', () => {
      const profile = null;
      const subscription = null;

      const { userSegment, isFreeUser } = computeUserSegment(profile, subscription);

      expect(userSegment).toBe('free');
      expect(isFreeUser).toBe(true);
    });
  });

  describe('isFreeUser backward compatibility', () => {
    it('isFreeUser should be true only for "free" segment', () => {
      // Test all segments
      const cases: Array<{ segment: UserSegment; expectedIsFreeUser: boolean }> = [
        { segment: 'free', expectedIsFreeUser: true },
        { segment: 'credit_purchaser', expectedIsFreeUser: false },
        { segment: 'subscriber', expectedIsFreeUser: false },
      ];

      cases.forEach(({ segment, expectedIsFreeUser }) => {
        // Create profile that results in the expected segment
        let profile: IUserProfile | null;
        let subscription: ISubscription | null = null;

        switch (segment) {
          case 'free':
            profile = createMockProfile();
            break;
          case 'credit_purchaser':
            profile = createMockProfile({ stripe_customer_id: 'cus_123' });
            break;
          case 'subscriber':
            profile = createMockProfile({ subscription_tier: 'starter' });
            break;
        }

        const { userSegment, isFreeUser } = computeUserSegment(profile, subscription);

        expect(userSegment).toBe(segment);
        expect(isFreeUser).toBe(expectedIsFreeUser);
      });
    });
  });
});
