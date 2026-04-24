/**
 * Unit tests for MobileUpgradePrompt
 *
 * Verifies:
 * - Renders for free and credit_purchaser users
 * - Does NOT render for subscriber users
 * - Tracks upgrade_prompt_shown on mount
 * - Calls onUpgrade when CTA is clicked
 * - Tracks upgrade_prompt_clicked on CTA click
 * - Sets checkout tracking context on CTA click
 * - Segment-aware: different copy for free vs credit_purchaser
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockTrack, mockSetCheckoutTrackingContext, mockUseRegionTier } = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockSetCheckoutTrackingContext: vi.fn(),
  mockUseRegionTier: vi.fn(),
}));

vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: { track: mockTrack, isEnabled: () => true },
}));

vi.mock('@client/utils/checkoutTrackingContext', () => ({
  setCheckoutTrackingContext: mockSetCheckoutTrackingContext,
  getCheckoutTrackingContext: vi.fn().mockReturnValue(null),
}));

vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: mockUseRegionTier,
}));

vi.mock('@client/utils/abTest', () => ({
  getVariant: vi.fn().mockReturnValue('value'),
}));

vi.mock('lucide-react', () => ({
  Sparkles: () => null,
  X: () => null,
  ArrowRight: () => <span data-testid="icon-arrow-right" />,
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { MobileUpgradePrompt } from '@client/components/features/workspace/MobileUpgradePrompt';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type UserSegment = 'free' | 'credit_purchaser' | 'subscriber';

function renderPrompt(overrides: Partial<React.ComponentProps<typeof MobileUpgradePrompt>> = {}) {
  const onUpgrade = vi.fn();

  const result = render(
    React.createElement(MobileUpgradePrompt, {
      variant: 'preview' as const,
      userSegment: 'free' as UserSegment,
      onUpgrade,
      ...overrides,
    })
  );

  return { onUpgrade, ...result };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MobileUpgradePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRegionTier.mockReturnValue({
      pricingRegion: 'standard',
      discountPercent: 0,
    });
  });

  // -----------------------------------------------------------------------
  // Visibility conditions
  // -----------------------------------------------------------------------

  describe('visibility conditions', () => {
    it('should render for free users', () => {
      renderPrompt({ userSegment: 'free' });
      // Component renders content (it is non-dismissible and always shows for non-subscribers)
      expect(screen.getByText(/Go Pro/i)).toBeInTheDocument();
    });

    it('should NOT render for subscriber users', () => {
      renderPrompt({ userSegment: 'subscriber' });
      // Component returns null for subscribers
      expect(screen.queryByText(/Go Pro/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Subscribe/i)).not.toBeInTheDocument();
    });

    it('should render for credit_purchaser users', () => {
      renderPrompt({ userSegment: 'credit_purchaser' });
      expect(screen.getByText(/Subscribe/i)).toBeInTheDocument();
    });

    it('should render upload variant for free users', () => {
      renderPrompt({ variant: 'upload', userSegment: 'free' });
      expect(screen.getByText(/Get Pro Results/i)).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Analytics
  // -----------------------------------------------------------------------

  describe('analytics', () => {
    it('should track upgrade_prompt_shown on mount for preview variant', () => {
      renderPrompt({ variant: 'preview', userSegment: 'free' });
      expect(mockTrack).toHaveBeenCalledWith(
        'upgrade_prompt_shown',
        expect.objectContaining({
          trigger: 'mobile_preview_prompt',
          userSegment: 'free',
          pricingRegion: 'standard',
        })
      );
    });

    it('should track upgrade_prompt_shown on mount for upload variant', () => {
      renderPrompt({ variant: 'upload', userSegment: 'free' });
      expect(mockTrack).toHaveBeenCalledWith(
        'upgrade_prompt_shown',
        expect.objectContaining({
          trigger: 'mobile_upload_prompt',
          userSegment: 'free',
          pricingRegion: 'standard',
        })
      );
    });

    it('should track upgrade_prompt_clicked when CTA is clicked', () => {
      renderPrompt({ variant: 'preview', userSegment: 'free' });
      const cta = screen.getByText(/Go Pro/i);
      fireEvent.click(cta);
      expect(mockTrack).toHaveBeenCalledWith(
        'upgrade_prompt_clicked',
        expect.objectContaining({
          trigger: 'mobile_preview_prompt',
          userSegment: 'free',
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // Checkout tracking context
  // -----------------------------------------------------------------------

  describe('checkout tracking context', () => {
    it('should set checkout tracking context on CTA click', () => {
      renderPrompt({ variant: 'preview', userSegment: 'free' });
      const cta = screen.getByText(/Go Pro/i);
      fireEvent.click(cta);
      expect(mockSetCheckoutTrackingContext).toHaveBeenCalledWith({
        trigger: 'mobile_preview_prompt',
      });
    });

    it('should set trigger to mobile_upload_prompt for upload variant', () => {
      renderPrompt({ variant: 'upload', userSegment: 'free' });
      const cta = screen.getByText(/Get Pro Results/i);
      fireEvent.click(cta);
      expect(mockSetCheckoutTrackingContext).toHaveBeenCalledWith({
        trigger: 'mobile_upload_prompt',
      });
    });
  });

  // -----------------------------------------------------------------------
  // onUpgrade callback
  // -----------------------------------------------------------------------

  describe('onUpgrade callback', () => {
    it('should call onUpgrade when CTA is clicked', () => {
      const { onUpgrade } = renderPrompt({ variant: 'preview', userSegment: 'free' });
      const cta = screen.getByText(/Go Pro/i);
      fireEvent.click(cta);
      expect(onUpgrade).toHaveBeenCalledTimes(1);
    });

    it('should call onUpgrade when upload variant CTA is clicked', () => {
      const { onUpgrade } = renderPrompt({ variant: 'upload', userSegment: 'free' });
      const cta = screen.getByText(/Get Pro Results/i);
      fireEvent.click(cta);
      expect(onUpgrade).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Segment-aware copy
  // -----------------------------------------------------------------------

  describe('segment-aware copy', () => {
    it('should show free-user copy for free segment', () => {
      renderPrompt({ variant: 'preview', userSegment: 'free' });
      expect(screen.getByText(/Go Pro/i)).toBeInTheDocument();
    });

    it('should show credit_purchaser copy for credit_purchaser segment', () => {
      renderPrompt({ variant: 'preview', userSegment: 'credit_purchaser' });
      expect(screen.getByText(/Subscribe/i)).toBeInTheDocument();
    });

    it('should show credit_purchaser upload copy', () => {
      renderPrompt({ variant: 'upload', userSegment: 'credit_purchaser' });
      expect(screen.getByText(/Subscribe & Save/i)).toBeInTheDocument();
    });
  });
});
