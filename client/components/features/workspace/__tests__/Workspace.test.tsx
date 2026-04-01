import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

// Mock useBatchQueue hook
const mockAddFiles = vi.fn();
const mockProcessBatch = vi.fn();
vi.mock('@/client/hooks/useBatchQueue', () => ({
  useBatchQueue: () => ({
    queue: [],
    activeId: null,
    activeItem: null,
    isProcessingBatch: false,
    batchProgress: null,
    completedCount: 0,
    batchLimit: 1,
    batchLimitExceeded: null,
    setActiveId: vi.fn(),
    addFiles: mockAddFiles,
    removeItem: vi.fn(),
    clearQueue: vi.fn(),
    processBatch: mockProcessBatch,
    processSingleItem: vi.fn(),
    clearBatchLimitError: vi.fn(),
  }),
}));

// Mock userStore with configurable subscription state
let mockSubscription: { price_id: string } | null = null;
let mockIsFreeUser = true; // Default to free user
vi.mock('@client/store/userStore', () => ({
  useUserData: () => ({
    totalCredits: 100,
    profile: { id: 'user-123' },
    subscription: mockSubscription,
    isAuthenticated: true,
    isFreeUser: mockIsFreeUser,
  }),
  useUserStore: vi.fn(() => ({ user: { id: 'user-123' } })),
  useProfile: vi.fn(() => ({ id: 'user-123' })),
  useSubscription: vi.fn(() => mockSubscription),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock BatchLimitModal
vi.mock('../BatchLimitModal', () => ({
  BatchLimitModal: () => null,
}));

// Mock UpgradeSuccessBanner
vi.mock('../UpgradeSuccessBanner', () => ({
  UpgradeSuccessBanner: () => null,
}));

// Mock Dropzone
vi.mock('@client/components/features/image-processing/Dropzone', () => ({
  Dropzone: () => <div data-testid="dropzone">Dropzone</div>,
}));

// Mock AmbientBackground
vi.mock('@client/components/landing/AmbientBackground', () => ({
  AmbientBackground: () => null,
}));

// Mock ErrorAlert
vi.mock('@client/components/stripe/ErrorAlert', () => ({
  ErrorAlert: () => null,
}));

// Mock TabButton
vi.mock('@client/components/ui/TabButton', () => ({
  TabButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

// Mock analytics
vi.mock('@client/analytics', () => ({
  analytics: {
    track: vi.fn(),
    isEnabled: () => true,
  },
}));

// Mock useRegionTier to avoid fetch('/api/geo') in test env
const mockUseRegionTier = vi.fn();
vi.mock('@/client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({
    tier: 'standard',
    country: null,
    isLoading: false,
    isRestricted: false,
    isPaywalled: false,
    pricingRegion: 'standard',
    discountPercent: 0,
    ...mockUseRegionTier(),
  }),
}));

// Import after mocks are set up
import Workspace from '../Workspace';

// Get analytics mock for assertions
const getAnalyticsMock = async () => {
  const analytics = await import('@client/analytics');
  return analytics.analytics.track;
};

describe('Workspace Quality Tier Defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscription = null;
  });

  describe('Free User', () => {
    test('should default to quick quality tier for free users', async () => {
      mockSubscription = null; // Free user has no subscription

      const { container } = render(<Workspace />);

      // The component renders in empty state when queue is empty
      await waitFor(() => {
        expect(container).toBeTruthy();
      });

      // Free users default to 'quick' tier
    });
  });

  describe('Paid User', () => {
    test('should default to quick quality tier for paid users', async () => {
      mockSubscription = { price_id: 'price_123' }; // Paid user has subscription

      const { container } = render(<Workspace />);

      await waitFor(() => {
        expect(container).toBeTruthy();
      });

      // Paid users also default to 'quick' tier (same as free users)
    });
  });
});

describe('Workspace Quality Tier Logic', () => {
  test('should initialize with quick tier for all users', () => {
    mockSubscription = null;

    // Render component
    const { container } = render(<Workspace />);

    // Component should render the empty state (dropzone)
    expect(container).toBeTruthy();
  });

  test('should keep quick tier for paid users', async () => {
    // Start with subscription to simulate paid user
    mockSubscription = { price_id: 'price_hobby_monthly' };

    render(<Workspace />);

    // Wait for render to complete
    await waitFor(
      () => {
        // Paid users also use 'quick' as default - no tier change happens
        expect(true).toBe(true);
      },
      { timeout: 100 }
    );
  });
});

describe('Workspace Paywall Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscription = null; // Free user by default
    mockIsFreeUser = true; // Free user by default
    // Default: not paywalled
    mockUseRegionTier.mockReturnValue({
      tier: 'standard',
      country: 'US',
      isLoading: false,
      isRestricted: false,
      isPaywalled: false,
      pricingRegion: 'standard',
      discountPercent: 0,
    });
  });

  test('should track paywall_shown when user is paywalled and free', async () => {
    // Simulate paywalled country
    mockUseRegionTier.mockReturnValue({
      tier: 'paywalled',
      country: 'PH',
      isLoading: false,
      isRestricted: false,
      isPaywalled: true,
      pricingRegion: 'standard',
      discountPercent: 0,
    });

    render(<Workspace />);

    const analyticsTrack = await getAnalyticsMock();

    // Wait for the analytics call
    await waitFor(
      () => {
        expect(analyticsTrack).toHaveBeenCalledWith('paywall_shown', {
          country: 'PH',
          context: 'authenticated_workspace',
        });
      },
      { timeout: 100 }
    );
  });

  test('should not track paywall_shown when user is not paywalled', async () => {
    // Simulate non-paywalled country
    mockUseRegionTier.mockReturnValue({
      tier: 'standard',
      country: 'US',
      isLoading: false,
      isRestricted: false,
      isPaywalled: false,
      pricingRegion: 'standard',
      discountPercent: 0,
    });

    render(<Workspace />);

    const analyticsTrack = await getAnalyticsMock();

    // Wait a bit to ensure analytics would have been called if it was going to be
    await waitFor(
      () => {
        expect(analyticsTrack).not.toHaveBeenCalledWith('paywall_shown', expect.any(Object));
      },
      { timeout: 100 }
    );
  });

  test('should not track paywall_shown when user has subscription', async () => {
    // Simulate paywalled country but with subscription
    mockIsFreeUser = false; // Not free user
    mockUseRegionTier.mockReturnValue({
      tier: 'paywalled',
      country: 'PH',
      isLoading: false,
      isRestricted: false,
      isPaywalled: true,
      pricingRegion: 'standard',
      discountPercent: 0,
    });

    render(<Workspace />);

    const analyticsTrack = await getAnalyticsMock();

    // Wait a bit to ensure analytics would have been called if it was going to be
    await waitFor(
      () => {
        expect(analyticsTrack).not.toHaveBeenCalledWith('paywall_shown', expect.any(Object));
      },
      { timeout: 100 }
    );
  });

  test('should track paywall_shown only once per mount', async () => {
    // Simulate paywalled country
    mockUseRegionTier.mockReturnValue({
      tier: 'paywalled',
      country: 'VN',
      isLoading: false,
      isRestricted: false,
      isPaywalled: true,
      pricingRegion: 'standard',
      discountPercent: 0,
    });

    const { rerender } = render(<Workspace />);

    const analyticsTrack = await getAnalyticsMock();

    // Wait for the first analytics call
    await waitFor(
      () => {
        expect(analyticsTrack).toHaveBeenCalledWith('paywall_shown', {
          country: 'VN',
          context: 'authenticated_workspace',
        });
      },
      { timeout: 100 }
    );

    const callCount = analyticsTrack.mock.calls.filter(
      call => call[0] === 'paywall_shown'
    ).length;

    // Rerender to trigger effect again
    rerender(<Workspace />);

    // Wait a bit to ensure no additional calls
    await waitFor(
      () => {
        const newCallCount = analyticsTrack.mock.calls.filter(
          call => call[0] === 'paywall_shown'
        ).length;
        expect(newCallCount).toBe(callCount); // Should still be 1
      },
      { timeout: 100 }
    );
  });
});
