/**
 * Unit tests for EngagementDiscountBanner — source prop behavior.
 *
 * Verifies:
 * - Passes source='abandonment' to analytics when source prop is 'abandonment'
 * - Defaults to 'engagement' when no source prop is provided (uses store discountSource)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockTrack, mockUseEngagementDiscountStore } = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockUseEngagementDiscountStore: vi.fn(),
}));

vi.mock('@client/analytics', () => ({
  analytics: {
    track: mockTrack,
    isEnabled: () => true,
  },
}));

vi.mock('@client/store/engagementDiscountStore', () => ({
  useEngagementDiscountStore: mockUseEngagementDiscountStore,
}));

vi.mock('@shared/config/engagement-discount', () => ({
  DISCOUNT_TARGET_PACK: { credits: 100 },
  formatCountdown: (seconds: number) => `${Math.floor(seconds / 60)}:00`,
}));

vi.mock('@client/utils/checkoutTrackingContext', () => ({
  setCheckoutTrackingContext: vi.fn(),
}));

vi.mock('lucide-react', () => ({
  X: () => null,
  Clock: () => null,
  Sparkles: () => null,
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { EngagementDiscountBanner } from '@client/components/engagement-discount/EngagementDiscountBanner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_OFFER = {
  userId: 'user_123',
  offeredAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  discountPercent: 20,
  targetPackKey: 'starter',
  originalPriceCents: 1000,
  discountedPriceCents: 800,
  couponId: 'coupon_test',
  redeemed: false,
};

function makeStoreState(
  overrides: {
    discountSource?: 'engagement' | 'abandonment';
    hasTrackedImpression?: boolean;
    showToast?: boolean;
  } = {}
) {
  return {
    offer: BASE_OFFER,
    showToast: overrides.showToast ?? true,
    countdownEndTime: Date.now() + 30 * 60 * 1000,
    hasTrackedImpression: overrides.hasTrackedImpression ?? false,
    discountSource: overrides.discountSource ?? 'engagement',
    dismissToast: vi.fn(),
    setHasTrackedImpression: vi.fn(),
  };
}

function renderBanner(props: Partial<React.ComponentProps<typeof EngagementDiscountBanner>> = {}) {
  return render(
    React.createElement(EngagementDiscountBanner, {
      onClaimDiscount: vi.fn(),
      ...props,
    })
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EngagementDiscountBanner — source prop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("should pass source='abandonment' to analytics when source prop is 'abandonment'", () => {
    it("tracks engagement_discount_toast_shown with engagement_discount_source='abandonment'", () => {
      mockUseEngagementDiscountStore.mockReturnValue(makeStoreState());

      renderBanner({ source: 'abandonment' });

      expect(mockTrack).toHaveBeenCalledWith(
        'engagement_discount_toast_shown',
        expect.objectContaining({
          engagement_discount_source: 'abandonment',
        })
      );
    });

    it('does not track twice (hasTrackedImpression guard)', () => {
      mockUseEngagementDiscountStore.mockReturnValue(
        makeStoreState({ hasTrackedImpression: true })
      );

      renderBanner({ source: 'abandonment' });

      expect(mockTrack).not.toHaveBeenCalled();
    });
  });

  describe("should default source to 'engagement' when no source prop", () => {
    it("tracks with engagement_discount_source='engagement' when store has discountSource='engagement'", () => {
      mockUseEngagementDiscountStore.mockReturnValue(
        makeStoreState({ discountSource: 'engagement' })
      );

      // No source prop — should fall back to store value
      renderBanner();

      expect(mockTrack).toHaveBeenCalledWith(
        'engagement_discount_toast_shown',
        expect.objectContaining({
          engagement_discount_source: 'engagement',
        })
      );
    });

    it("reads discountSource='abandonment' from store when no source prop", () => {
      mockUseEngagementDiscountStore.mockReturnValue(
        makeStoreState({ discountSource: 'abandonment' })
      );

      // No explicit source prop — should pick up store value
      renderBanner();

      expect(mockTrack).toHaveBeenCalledWith(
        'engagement_discount_toast_shown',
        expect.objectContaining({
          engagement_discount_source: 'abandonment',
        })
      );
    });

    it('explicit source prop overrides store discountSource', () => {
      // Store says 'abandonment' but prop says 'engagement'
      mockUseEngagementDiscountStore.mockReturnValue(
        makeStoreState({ discountSource: 'abandonment' })
      );

      renderBanner({ source: 'engagement' });

      expect(mockTrack).toHaveBeenCalledWith(
        'engagement_discount_toast_shown',
        expect.objectContaining({
          engagement_discount_source: 'engagement',
        })
      );
    });
  });

  describe('should not track when banner is not shown', () => {
    it('does not track when showToast=false', () => {
      mockUseEngagementDiscountStore.mockReturnValue(makeStoreState({ showToast: false }));

      renderBanner({ source: 'abandonment' });

      expect(mockTrack).not.toHaveBeenCalled();
    });

    it('does not track when offer is null', () => {
      mockUseEngagementDiscountStore.mockReturnValue({
        ...makeStoreState(),
        offer: null,
        showToast: true,
      });

      renderBanner({ source: 'abandonment' });

      expect(mockTrack).not.toHaveBeenCalled();
    });
  });
});
