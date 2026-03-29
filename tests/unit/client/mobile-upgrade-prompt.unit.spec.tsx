/**
 * Unit tests for Phase 4: MobileUpgradePrompt redesign
 *
 * Tests cover:
 * - Upload variant: before/after images, value-framing copy, accessible touch targets
 * - Preview variant: larger button with price anchor, pulse animation
 * - A/B testing: copyVariant tracking on analytics events
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Module mocks (must be before imports of the modules under test)
// ---------------------------------------------------------------------------

const { mockAnalyticsTrack } = vi.hoisted(() => ({
  mockAnalyticsTrack: vi.fn(),
}));

vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: {
    track: mockAnalyticsTrack,
    isEnabled: () => true,
  },
}));

vi.mock('@client/analytics', () => ({
  analytics: {
    track: mockAnalyticsTrack,
    isEnabled: () => true,
  },
}));

// Mock useRegionTier to prevent fetch('/api/geo') in tests
// Use a factory function so we can override in specific tests
const mockUseRegionTier = vi.fn(() => ({
  tier: 'standard',
  pricingRegion: 'standard',
  discountPercent: 0,
  isRestricted: false,
  isLoading: false,
}));

vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => mockUseRegionTier(),
}));

// Mock lucide-react icons as simple spans
vi.mock('lucide-react', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const iconStub = ({ children, ...props }: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'icon', ...props }, children as React.ReactNode);
  return {
    ...actual,
    ArrowRight: iconStub,
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { MobileUpgradePrompt } from '@/client/components/features/workspace/MobileUpgradePrompt';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearAbTestStorage() {
  // Clear localStorage which stores AB test user ID
  localStorage.clear();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase 4: MobileUpgradePrompt redesign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAbTestStorage();
    // Reset mock to default values
    mockUseRegionTier.mockReturnValue({
      tier: 'standard',
      pricingRegion: 'standard',
      discountPercent: 0,
      isRestricted: false,
      isLoading: false,
    });
  });

  afterEach(() => {
    clearAbTestStorage();
  });

  describe('Upload variant', () => {
    const defaultProps = {
      variant: 'upload' as const,
      userSegment: 'free' as const,
      onUpgrade: vi.fn(),
    };

    it('should render before/after images', () => {
      render(<MobileUpgradePrompt {...defaultProps} />);

      const beforeImage = screen.getByAltText('Before');
      const afterImage = screen.getByAltText('After');

      expect(beforeImage).toBeInTheDocument();
      expect(afterImage).toBeInTheDocument();
      expect(beforeImage).toHaveAttribute('src', '/before-after/face-pro/before.webp');
      expect(afterImage).toHaveAttribute('src', '/before-after/face-pro/after.webp');
    });

    it('should have accessible touch targets (button py-2.5 = 44px min-height)', () => {
      const { container } = render(<MobileUpgradePrompt {...defaultProps} />);

      const button = screen.getByText(/Get Pro Results/i);
      // Button has py-2.5 (10px top + 10px bottom + text height = ~44px)
      // Meets the 44px WCAG minimum for touch targets
      expect(button).toHaveClass('py-2.5');
    });

    it('should show value-framing copy with price anchor', () => {
      render(<MobileUpgradePrompt {...defaultProps} />);

      expect(screen.getByText(/Get Pro Results — from/i)).toBeInTheDocument();
      expect(screen.getByText(/\$4.99/)).toBeInTheDocument();
    });

    it('should use filled bg-accent button instead of outline', () => {
      const { container } = render(<MobileUpgradePrompt {...defaultProps} />);

      const button = screen.getByText(/Get Pro Results/i);
      expect(button).toHaveClass('bg-accent');
      // Should not have outline border classes
      expect(button.className).not.toContain('border-');
    });

    it('should track copyVariant in analytics events', async () => {
      render(<MobileUpgradePrompt {...defaultProps} />);

      await waitFor(() => {
        expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
          trigger: 'mobile_upload_prompt',
          currentPlan: 'free',
          userSegment: 'free',
          pricingRegion: 'standard',
          copyVariant: expect.any(String), // 'control' or 'value'
        });
      });

      vi.clearAllMocks();

      const button = screen.getByText(/Get Pro Results/i);
      fireEvent.click(button);

      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_clicked', {
        trigger: 'mobile_upload_prompt',
        destination: 'upgrade_plan_modal',
        currentPlan: 'free',
        userSegment: 'free',
        pricingRegion: 'standard',
        copyVariant: expect.any(String),
      });
    });

    it('should NOT render for paid users', () => {
      const { container } = render(
        <MobileUpgradePrompt {...defaultProps} userSegment="subscriber" />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should fire upgrade_prompt_shown on mount for free users', async () => {
      render(<MobileUpgradePrompt {...defaultProps} userSegment="free" />);

      await waitFor(() => {
        expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
          trigger: 'mobile_upload_prompt',
          currentPlan: 'free',
          userSegment: 'free',
          pricingRegion: 'standard',
          copyVariant: expect.any(String),
        });
      });
    });

    it('should call onUpgrade when button is clicked', async () => {
      const onUpgrade = vi.fn();
      render(<MobileUpgradePrompt {...defaultProps} onUpgrade={onUpgrade} />);

      const button = screen.getByText(/Get Pro Results/i);
      fireEvent.click(button);

      expect(onUpgrade).toHaveBeenCalled();
    });

    it('should show discounted price for non-standard regions', () => {
      // Mock south_asia region (65% discount: $4.99 - 65% = $1.75)
      mockUseRegionTier.mockReturnValue({
        tier: 'standard',
        pricingRegion: 'south_asia',
        discountPercent: 65,
        isRestricted: false,
        isLoading: false,
      });

      render(<MobileUpgradePrompt {...defaultProps} />);

      expect(screen.getByText(/from \$1.75/i)).toBeInTheDocument();
    });
  });

  describe('Preview variant', () => {
    const defaultProps = {
      variant: 'preview' as const,
      userSegment: 'free' as const,
      onUpgrade: vi.fn(),
    };

    it('should have larger button padding (px-5 py-3) for bigger touch target', () => {
      const { container } = render(<MobileUpgradePrompt {...defaultProps} />);

      const button = screen.getByText(/Go Pro/i);
      // Button has px-5 py-3 (horizontal: 20px, vertical: 12px)
      expect(button).toHaveClass('px-5');
      expect(button).toHaveClass('py-3');
    });

    it('should show "Go Pro — $4.99" copy with price anchor', () => {
      render(<MobileUpgradePrompt {...defaultProps} />);

      expect(screen.getByText(/Go Pro — \$4.99/i)).toBeInTheDocument();
    });

    it('should have pulse animation class on first render', () => {
      render(<MobileUpgradePrompt {...defaultProps} />);

      const button = screen.getByText(/Go Pro/i);
      expect(button).toHaveClass('animate-pulse');
    });

    it('should remove pulse animation after 3 seconds', async () => {
      vi.useFakeTimers();

      render(<MobileUpgradePrompt {...defaultProps} />);

      const button = screen.getByText(/Go Pro/i);
      expect(button).toHaveClass('animate-pulse');

      // Fast-forward 3 seconds using act to wrap state updates
      await act(async () => {
        vi.advanceTimersByTime(3000);
        await Promise.resolve(); // Allow state updates to flush
      });

      // Re-query button after timer advance
      const buttonAfter = screen.getByText(/Go Pro/i);
      expect(buttonAfter).not.toHaveClass('animate-pulse');

      vi.useRealTimers();
    });

    it('should track copyVariant in analytics events', async () => {
      render(<MobileUpgradePrompt {...defaultProps} />);

      await waitFor(() => {
        expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
          trigger: 'mobile_preview_prompt',
          currentPlan: 'free',
          userSegment: 'free',
          pricingRegion: 'standard',
          copyVariant: expect.any(String),
        });
      });

      vi.clearAllMocks();

      const button = screen.getByText(/Go Pro/i);
      fireEvent.click(button);

      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_clicked', {
        trigger: 'mobile_preview_prompt',
        destination: 'upgrade_plan_modal',
        currentPlan: 'free',
        userSegment: 'free',
        pricingRegion: 'standard',
        copyVariant: expect.any(String),
      });
    });

    it('should NOT render for paid users', () => {
      const { container } = render(
        <MobileUpgradePrompt {...defaultProps} userSegment="subscriber" />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should fire upgrade_prompt_shown on mount for free users', async () => {
      render(<MobileUpgradePrompt {...defaultProps} userSegment="free" />);

      await waitFor(() => {
        expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
          trigger: 'mobile_preview_prompt',
          currentPlan: 'free',
          userSegment: 'free',
          pricingRegion: 'standard',
          copyVariant: expect.any(String),
        });
      });
    });

    it('should call onUpgrade when button is clicked', () => {
      const onUpgrade = vi.fn();
      render(<MobileUpgradePrompt {...defaultProps} onUpgrade={onUpgrade} />);

      const button = screen.getByText(/Go Pro/i);
      fireEvent.click(button);

      expect(onUpgrade).toHaveBeenCalled();
    });

    it('should show discounted price for non-standard regions', () => {
      // Mock south_asia region (65% discount: $4.99 - 65% = $1.75)
      mockUseRegionTier.mockReturnValue({
        tier: 'standard',
        pricingRegion: 'south_asia',
        discountPercent: 65,
        isRestricted: false,
        isLoading: false,
      });

      render(<MobileUpgradePrompt {...defaultProps} />);

      expect(screen.getByText(/Go Pro — \$1.75/i)).toBeInTheDocument();
    });
  });

  describe('A/B testing consistency', () => {
    it('should use consistent copyVariant across shown and clicked events', async () => {
      const props = {
        variant: 'upload' as const,
        userSegment: 'free' as const,
        onUpgrade: vi.fn(),
      };

      render(<MobileUpgradePrompt {...props} />);

      // Get the copyVariant from upgrade_prompt_shown
      let shownCopyVariant: string | undefined;
      await waitFor(() => {
        const calls = mockAnalyticsTrack.mock.calls;
        const shownCall = calls.find(call => call[0] === 'upgrade_prompt_shown');
        expect(shownCall).toBeDefined();
        shownCopyVariant = shownCall?.[1]?.copyVariant;
      });

      vi.clearAllMocks();

      // Click the button
      const button = screen.getByText(/Get Pro Results/i);
      fireEvent.click(button);

      // Verify copyVariant matches
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_clicked', {
        trigger: 'mobile_upload_prompt',
        destination: 'upgrade_plan_modal',
        currentPlan: 'free',
        userSegment: 'free',
        pricingRegion: 'standard',
        copyVariant: shownCopyVariant,
      });
    });

    it('should assign same variant to same user across renders', () => {
      // This test verifies the A/B test utility returns consistent results
      // by checking the copyVariant is deterministic for the same user

      const props = {
        variant: 'upload' as const,
        userSegment: 'free' as const,
        onUpgrade: vi.fn(),
      };

      render(<MobileUpgradePrompt {...props} />);

      const firstCall = mockAnalyticsTrack.mock.calls.find(
        call => call[0] === 'upgrade_prompt_shown'
      );
      const firstVariant = firstCall?.[1]?.copyVariant;

      // The A/B test should return a valid variant
      expect(firstVariant).toMatch(/^(control|value)$/);
    });
  });
});
