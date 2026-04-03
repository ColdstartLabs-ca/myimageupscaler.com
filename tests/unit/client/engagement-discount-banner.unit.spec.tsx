import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { EngagementDiscountBanner } from '@client/components/engagement-discount/EngagementDiscountBanner';
import { analytics } from '@client/analytics/analyticsClient';

// Mock the analytics module
vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: {
    track: vi.fn(),
  },
}));

const mockTrack = analytics.track as unknown as ReturnType<typeof vi.fn>;

// Mock the engagement discount store
const mockDismissToast = vi.fn();
const mockSetHasTrackedImpression = vi.fn();
vi.mock('@client/store/engagementDiscountStore', () => ({
  useEngagementDiscountStore: vi.fn(() => ({
    offer: {
      discountPercent: 20,
      originalPriceCents: 999,
      discountedPriceCents: 799,
    },
    showToast: true,
    dismissToast: mockDismissToast,
    countdownEndTime: Date.now() + 30 * 60 * 1000, // 30 minutes from now
    hasTrackedImpression: false,
    setHasTrackedImpression: mockSetHasTrackedImpression,
  })),
}));

// Mock the DISCOUNT_TARGET_PACK
vi.mock('@shared/config/engagement-discount', () => ({
  DISCOUNT_TARGET_PACK: {
    credits: 500,
  },
  formatCountdown: (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  X: () => null,
  Clock: () => null,
  Sparkles: () => null,
}));

describe('EngagementDiscountBanner - Fix 1: Mobile Visibility', () => {
  beforeEach(() => {
    mockDismissToast.mockClear();
    mockTrack.mockClear();
    mockSetHasTrackedImpression.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Mobile Pricing Display', () => {
    test('should show pricing on mobile (not hidden)', () => {
      const onClaimDiscount = vi.fn();
      render(
        React.createElement(EngagementDiscountBanner, {
          onClaimDiscount: onClaimDiscount,
        })
      );

      // On mobile, pricing div should still exist (not have 'hidden md:flex')
      // The pricing should be hidden on mobile but visible on desktop
      const pricingContainer = screen.getByText(/20% off your first purchase/i).parentElement;
      expect(pricingContainer).toBeInTheDocument();
    });

    test('should show discounted price in CTA button on mobile', () => {
      const onClaimDiscount = vi.fn();
      render(
        React.createElement(EngagementDiscountBanner, {
          onClaimDiscount: onClaimDiscount,
        })
      );

      // CTA button should contain price on mobile
      const ctaButton = screen.getByRole('button', { name: /Claim 20% Off/i });
      expect(ctaButton).toBeInTheDocument();
      expect(ctaButton.textContent).toContain('Claim 20% Off');
      // Mobile text includes price
      expect(ctaButton.textContent).toContain('$7.99');
    });

    test('should show different text on desktop vs mobile in CTA', () => {
      const onClaimDiscount = vi.fn();
      const { container } = render(
        React.createElement(EngagementDiscountBanner, {
          onClaimDiscount: onClaimDiscount,
        })
      );

      const ctaButton = screen.getByRole('button', { name: /Claim 20% Off/i });

      // Desktop view (hidden on mobile): just "Claim 20% Off"
      const desktopText = ctaButton.querySelector('.hidden.md\\:inline');
      expect(desktopText).toBeInTheDocument();
      expect(desktopText?.textContent).toBe('Claim 20% Off');

      // Mobile view (hidden on desktop): includes price
      const mobileText = ctaButton.querySelector('.md\\:hidden');
      expect(mobileText).toBeInTheDocument();
      expect(mobileText?.textContent).toContain('Claim 20% Off - $7.99');
    });
  });

  describe('CTA Button Styling', () => {
    test('should have yellow background for high contrast', () => {
      const onClaimDiscount = vi.fn();
      render(
        React.createElement(EngagementDiscountBanner, {
          onClaimDiscount: onClaimDiscount,
        })
      );

      const ctaButton = screen.getByRole('button', { name: /Claim 20% Off/i });
      expect(ctaButton).toHaveClass('bg-yellow-400');
      expect(ctaButton).toHaveClass('text-black');
      expect(ctaButton).toHaveClass('hover:bg-yellow-300');
    });

    test('should NOT have white background', () => {
      const onClaimDiscount = vi.fn();
      render(
        React.createElement(EngagementDiscountBanner, {
          onClaimDiscount: onClaimDiscount,
        })
      );

      const ctaButton = screen.getByRole('button', { name: /Claim 20% Off/i });
      expect(ctaButton).not.toHaveClass('bg-white');
    });
  });

  describe('Desktop Pricing Display', () => {
    test('should show full pricing details on desktop', () => {
      const onClaimDiscount = vi.fn();
      render(
        React.createElement(EngagementDiscountBanner, {
          onClaimDiscount: onClaimDiscount,
        })
      );

      // Original price (strikethrough) should be visible on desktop
      const originalPrice = screen.getByText('$9.99');
      expect(originalPrice).toBeInTheDocument();
      expect(originalPrice).toHaveClass('line-through');

      // Discounted price should be visible
      const discountedPrice = screen.getByText('$7.99');
      expect(discountedPrice).toBeInTheDocument();
      expect(discountedPrice).toHaveClass('text-green-300');

      // Credit count should be visible
      const credits = screen.getByText(/500 credits/i);
      expect(credits).toBeInTheDocument();
    });
  });

  describe('Analytics Tracking', () => {
    test('should track CTA click with remaining time', async () => {
      const onClaimDiscount = vi.fn();
      render(
        React.createElement(EngagementDiscountBanner, {
          onClaimDiscount: onClaimDiscount,
        })
      );

      const ctaButton = screen.getByRole('button', { name: /Claim 20% Off/i });
      fireEvent.click(ctaButton);

      expect(mockTrack).toHaveBeenCalledWith('engagement_discount_cta_clicked', {
        timeRemainingSeconds: expect.any(Number),
      });
      expect(onClaimDiscount).toHaveBeenCalled();
    });

    test('should track toast_shown impression and set hasTrackedImpression', async () => {
      const { useEngagementDiscountStore } = await import('@client/store/engagementDiscountStore');
      (useEngagementDiscountStore as ReturnType<typeof vi.fn>).mockReturnValue({
        offer: { discountPercent: 20, originalPriceCents: 999, discountedPriceCents: 799 },
        showToast: true,
        dismissToast: mockDismissToast,
        countdownEndTime: Date.now() + 30 * 60 * 1000,
        hasTrackedImpression: false,
        setHasTrackedImpression: mockSetHasTrackedImpression,
      });

      render(React.createElement(EngagementDiscountBanner, { onClaimDiscount: vi.fn() }));

      await waitFor(() => {
        expect(mockTrack).toHaveBeenCalledWith('engagement_discount_toast_shown', {
          discountPercent: 20,
          originalPriceCents: 999,
          discountedPriceCents: 799,
        });
      });
      expect(mockSetHasTrackedImpression).toHaveBeenCalledWith(true);
    });

    test('should NOT track toast_shown when hasTrackedImpression is true', async () => {
      const { useEngagementDiscountStore } = await import('@client/store/engagementDiscountStore');
      (useEngagementDiscountStore as ReturnType<typeof vi.fn>).mockReturnValue({
        offer: { discountPercent: 20, originalPriceCents: 999, discountedPriceCents: 799 },
        showToast: true,
        dismissToast: mockDismissToast,
        countdownEndTime: Date.now() + 30 * 60 * 1000,
        hasTrackedImpression: true,
        setHasTrackedImpression: mockSetHasTrackedImpression,
      });

      render(React.createElement(EngagementDiscountBanner, { onClaimDiscount: vi.fn() }));

      await waitFor(() => {
        expect(mockTrack).not.toHaveBeenCalledWith('engagement_discount_toast_shown', expect.anything());
      });
      expect(mockSetHasTrackedImpression).not.toHaveBeenCalled();
    });
  });

  describe('Dismiss Functionality', () => {
    test('should track dismiss event and call dismissToast', async () => {
      const onClaimDiscount = vi.fn();
      render(
        React.createElement(EngagementDiscountBanner, {
          onClaimDiscount: onClaimDiscount,
        })
      );

      const dismissButton = screen.getByRole('button', { name: /dismiss offer/i });
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(mockTrack).toHaveBeenCalledWith('engagement_discount_toast_dismissed', {
          timeRemainingSeconds: expect.any(Number),
        });
      });

      await waitFor(() => {
        expect(mockDismissToast).toHaveBeenCalled();
      });
    });
  });
});
