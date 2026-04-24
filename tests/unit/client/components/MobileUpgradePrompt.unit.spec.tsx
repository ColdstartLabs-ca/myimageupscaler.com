/**
 * Unit tests for MobileUpgradePrompt
 *
 * Verifies:
 * - Renders when isVisible=true and isFreeUser=true
 * - Does NOT render for paid users
 * - Does NOT render when isVisible=false
 * - Does NOT render twice in the same session
 * - Tracks upgrade_prompt_shown on mount
 * - Calls onUpgradeDirect with correct planId and trigger when CTA clicked
 * - Falls back to onUpgrade when onUpgradeDirect not provided
 * - Tracks upgrade_prompt_clicked on CTA click
 * - Tracks upgrade_prompt_dismissed on dismiss
 * - Sets checkout tracking context on CTA click
 * - Dismiss button hides the prompt
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockTrack,
  mockSetCheckoutTrackingContext,
  mockResolveCheapestRegionalPlan,
  mockUseRegionTier,
} = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockSetCheckoutTrackingContext: vi.fn(),
  mockResolveCheapestRegionalPlan: vi.fn().mockReturnValue('price_test_small'),
  mockUseRegionTier: vi.fn(),
}));

vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: { track: mockTrack, isEnabled: () => true },
}));

vi.mock('@client/utils/checkoutTrackingContext', () => ({
  setCheckoutTrackingContext: mockSetCheckoutTrackingContext,
  getCheckoutTrackingContext: vi.fn().mockReturnValue(null),
}));

vi.mock('@shared/config/subscription.config', () => ({
  resolveCheapestRegionalPlan: mockResolveCheapestRegionalPlan,
}));

vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: mockUseRegionTier,
}));

vi.mock('lucide-react', () => ({
  Sparkles: () => null,
  X: () => null,
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { MobileUpgradePrompt } from '@client/components/features/workspace/MobileUpgradePrompt';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPrompt(overrides: Partial<React.ComponentProps<typeof MobileUpgradePrompt>> = {}) {
  const onUpgradeDirect = vi.fn();
  const onUpgrade = vi.fn();
  const onDismiss = vi.fn();

  const result = render(
    React.createElement(MobileUpgradePrompt, {
      isVisible: true,
      isFreeUser: true,
      onUpgradeDirect,
      onUpgrade,
      onDismiss,
      ...overrides,
    })
  );

  return { onUpgradeDirect, onUpgrade, onDismiss, ...result };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MobileUpgradePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRegionTier.mockReturnValue({ pricingRegion: 'standard' });
    mockResolveCheapestRegionalPlan.mockReturnValue('price_test_small');
    // Clear session state so prompt can show
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('upgrade_prompt_shown_mobile_preview');
    }
  });

  afterEach(() => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('upgrade_prompt_shown_mobile_preview');
    }
  });

  // -----------------------------------------------------------------------
  // Visibility conditions
  // -----------------------------------------------------------------------

  describe('visibility conditions', () => {
    it('should render when isVisible=true and isFreeUser=true', () => {
      renderPrompt();
      expect(screen.getByTestId('mobile-upgrade-prompt')).toBeInTheDocument();
    });

    it('should NOT render when isFreeUser=false', () => {
      renderPrompt({ isFreeUser: false });
      expect(screen.queryByTestId('mobile-upgrade-prompt')).not.toBeInTheDocument();
    });

    it('should NOT render when isVisible=false', () => {
      renderPrompt({ isVisible: false });
      expect(screen.queryByTestId('mobile-upgrade-prompt')).not.toBeInTheDocument();
    });

    it('should NOT render twice in the same session (session deduplication)', () => {
      // First render shows prompt and sets session key
      const { unmount } = renderPrompt();
      expect(screen.getByTestId('mobile-upgrade-prompt')).toBeInTheDocument();
      unmount();

      // Second render should not show again (session key already set)
      renderPrompt();
      expect(screen.queryByTestId('mobile-upgrade-prompt')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Analytics
  // -----------------------------------------------------------------------

  describe('analytics', () => {
    it('should track upgrade_prompt_shown on mount', () => {
      renderPrompt();
      expect(mockTrack).toHaveBeenCalledWith(
        'upgrade_prompt_shown',
        expect.objectContaining({
          trigger: 'mobile_preview_prompt',
          currentPlan: 'free',
          pricingRegion: 'standard',
        })
      );
    });

    it('should track upgrade_prompt_clicked when CTA is clicked', () => {
      renderPrompt();
      fireEvent.click(screen.getByTestId('mobile-upgrade-prompt-cta'));
      expect(mockTrack).toHaveBeenCalledWith(
        'upgrade_prompt_clicked',
        expect.objectContaining({
          trigger: 'mobile_preview_prompt',
          currentPlan: 'free',
          destination: 'checkout_direct',
        })
      );
    });

    it('should track upgrade_prompt_clicked with destination="upgrade_plan_modal" when no onUpgradeDirect', () => {
      renderPrompt({ onUpgradeDirect: undefined });
      fireEvent.click(screen.getByTestId('mobile-upgrade-prompt-cta'));
      expect(mockTrack).toHaveBeenCalledWith(
        'upgrade_prompt_clicked',
        expect.objectContaining({
          trigger: 'mobile_preview_prompt',
          destination: 'upgrade_plan_modal',
        })
      );
    });

    it('should track upgrade_prompt_dismissed when dismiss button clicked', () => {
      renderPrompt();
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss upgrade prompt' }));
      expect(mockTrack).toHaveBeenCalledWith(
        'upgrade_prompt_dismissed',
        expect.objectContaining({
          trigger: 'mobile_preview_prompt',
          currentPlan: 'free',
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // Checkout tracking context
  // -----------------------------------------------------------------------

  describe('checkout tracking context', () => {
    it('should set checkout tracking context on CTA click', () => {
      renderPrompt();
      fireEvent.click(screen.getByTestId('mobile-upgrade-prompt-cta'));
      expect(mockSetCheckoutTrackingContext).toHaveBeenCalledWith({
        trigger: 'mobile_preview_prompt',
      });
    });
  });

  // -----------------------------------------------------------------------
  // onUpgradeDirect
  // -----------------------------------------------------------------------

  describe('onUpgradeDirect', () => {
    it('should call onUpgradeDirect with trigger and planId when CTA clicked', () => {
      const { onUpgradeDirect } = renderPrompt();
      fireEvent.click(screen.getByTestId('mobile-upgrade-prompt-cta'));
      expect(onUpgradeDirect).toHaveBeenCalledWith({
        trigger: 'mobile_preview_prompt',
        planId: 'price_test_small',
      });
    });

    it('should pass the region to resolveCheapestRegionalPlan', () => {
      mockUseRegionTier.mockReturnValue({ pricingRegion: 'latam' });
      renderPrompt();
      fireEvent.click(screen.getByTestId('mobile-upgrade-prompt-cta'));
      expect(mockResolveCheapestRegionalPlan).toHaveBeenCalledWith('latam');
    });

    it('should call onUpgrade fallback when onUpgradeDirect not provided', () => {
      const { onUpgrade } = renderPrompt({ onUpgradeDirect: undefined });
      fireEvent.click(screen.getByTestId('mobile-upgrade-prompt-cta'));
      expect(onUpgrade).toHaveBeenCalled();
    });

    it('should NOT call onUpgrade when onUpgradeDirect is provided', () => {
      const { onUpgrade } = renderPrompt();
      fireEvent.click(screen.getByTestId('mobile-upgrade-prompt-cta'));
      expect(onUpgrade).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Dismiss behavior
  // -----------------------------------------------------------------------

  describe('dismiss behavior', () => {
    it('should hide the prompt when dismiss button is clicked', () => {
      renderPrompt();
      expect(screen.getByTestId('mobile-upgrade-prompt')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss upgrade prompt' }));
      expect(screen.queryByTestId('mobile-upgrade-prompt')).not.toBeInTheDocument();
    });

    it('should call onDismiss when dismiss button is clicked', () => {
      const { onDismiss } = renderPrompt();
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss upgrade prompt' }));
      expect(onDismiss).toHaveBeenCalled();
    });

    it('should hide the prompt when CTA is clicked', () => {
      renderPrompt();
      fireEvent.click(screen.getByTestId('mobile-upgrade-prompt-cta'));
      expect(screen.queryByTestId('mobile-upgrade-prompt')).not.toBeInTheDocument();
    });
  });
});
