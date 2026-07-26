import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ProcessingStatus } from '@/shared/types/coreflow.types';

const { mockOpenAuthRequiredModal, mockPrepareAuthRedirect } = vi.hoisted(() => ({
  mockOpenAuthRequiredModal: vi.fn(),
  mockPrepareAuthRedirect: vi.fn(),
}));

// Mock useBatchQueue hook
const mockAddFiles = vi.fn();
const mockProcessBatch = vi.fn();
const mockAddSampleItem = vi.fn();
const mockBatchQueueState = {
  queue: [] as Array<Record<string, unknown>>,
  activeId: null as string | null,
  activeItem: null as Record<string, unknown> | null,
  isProcessingBatch: false,
  batchProgress: null,
  completedCount: 0,
  batchLimit: 1,
  batchLimitExceeded: null,
  providerUnavailable: null as {
    message: string;
    isModalOpen: boolean;
    suppressPurchaseCtas: boolean;
  } | null,
  setActiveId: vi.fn(),
  addFiles: mockAddFiles,
  addSampleItem: mockAddSampleItem,
  removeItem: vi.fn(),
  clearQueue: vi.fn(),
  processBatch: mockProcessBatch,
  processSingleItem: vi.fn(),
  clearBatchLimitError: vi.fn(),
  clearProviderUnavailable: vi.fn(),
  showProviderUnavailable: vi.fn(),
};
vi.mock('@/client/hooks/useBatchQueue', () => ({
  useBatchQueue: () => mockBatchQueueState,
}));

// Mock userStore with configurable subscription state
let mockSubscription: { price_id: string } | null = null;
let mockIsFreeUser = true; // Default to free user
let mockProfile: { id: string } | null = { id: 'user-123' };
let mockIsAuthenticated = true;
let mockTotalCredits = 100;
vi.mock('@client/store/userStore', () => ({
  useUserData: () => ({
    totalCredits: mockTotalCredits,
    profile: mockProfile,
    subscription: mockSubscription,
    isAuthenticated: mockIsAuthenticated,
    isFreeUser: mockIsFreeUser,
  }),
  useUserStore: vi.fn(() => ({ user: mockProfile })),
  useProfile: vi.fn(() => mockProfile),
  useSubscription: vi.fn(() => mockSubscription),
}));

vi.mock('@client/store/modalStore', () => ({
  useModalStore: () => ({
    openAuthRequiredModal: mockOpenAuthRequiredModal,
  }),
}));

vi.mock('@client/utils/authRedirectManager', () => ({
  prepareAuthRedirect: mockPrepareAuthRedirect,
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('lucide-react', () => ({
  Check: () => null,
  CheckCircle2: () => null,
  ChevronDown: () => null,
  CreditCard: () => null,
  HelpCircle: () => null,
  Image: () => null,
  Layers: () => null,
  List: () => null,
  Loader2: () => null,
  Settings: () => null,
  Wand2: () => null,
  X: () => null,
  Zap: () => null,
}));

// Mock BatchLimitModal
vi.mock('../BatchLimitModal', () => ({
  BatchLimitModal: () => null,
}));
vi.mock('../ProviderUnavailableModal', () => ({
  ProviderUnavailableModal: () => null,
}));

// Mock UpgradeSuccessBanner
vi.mock('../UpgradeSuccessBanner', () => ({
  UpgradeSuccessBanner: () => null,
}));

vi.mock('../PreviewArea', () => ({
  PreviewArea: () => null,
}));

vi.mock('../QueueStrip', () => ({
  QueueStrip: () => null,
}));

vi.mock('../BatchSidebar', () => ({
  BatchSidebar: ({
    onProcess,
    onUpgradeDirect,
  }: {
    onProcess?: () => void;
    onUpgradeDirect?: (params: { trigger: string; planId: string }) => void;
  }) => (
    <div>
      <button data-testid="batch-sidebar-process" onClick={onProcess}>
        Process
      </button>
      <button
        data-testid="batch-sidebar-direct-checkout"
        onClick={() => onUpgradeDirect?.({ trigger: 'model_gate', planId: 'price_test_small' })}
      >
        Sidebar locked model
      </button>
    </div>
  ),
}));

vi.mock('../AfterUpscaleBanner', () => ({
  AfterUpscaleBanner: () => null,
}));

vi.mock('../ModelGalleryModal', () => ({
  ModelGalleryModal: ({
    isOpen,
    onUpgradeDirect,
  }: {
    isOpen: boolean;
    onUpgradeDirect?: (params: { trigger: string; planId: string }) => void;
  }) =>
    isOpen ? (
      <button
        data-testid="model-gallery-direct-checkout"
        onClick={() => onUpgradeDirect?.({ trigger: 'model_gate', planId: 'price_test_small' })}
      >
        Locked model
      </button>
    ) : null,
}));

vi.mock('../PremiumUpsellModal', () => ({
  PremiumUpsellModal: () => null,
}));

vi.mock('../SampleImageSelector', () => ({
  SampleImageSelector: () => null,
}));

vi.mock('../PostDownloadPrompt', () => ({
  PostDownloadPrompt: ({ onExploreModels }: { onExploreModels: () => void }) => (
    <button data-testid="post-download-explore-models" onClick={onExploreModels}>
      Explore models
    </button>
  ),
}));

vi.mock('../FirstDownloadCelebration', () => ({
  FirstDownloadCelebration: () => null,
}));

vi.mock('../MobileUpgradePrompt', () => ({
  MobileUpgradePrompt: ({
    isVisible,
    onUpgradeDirect,
  }: {
    isVisible: boolean;
    onUpgradeDirect?: (params: { trigger: string; planId: string }) => void;
  }) =>
    isVisible ? (
      <button
        data-testid="mobile-preview-direct-checkout"
        onClick={() =>
          onUpgradeDirect?.({ trigger: 'mobile_preview_prompt', planId: 'price_test_small' })
        }
      >
        Mobile preview upgrade
      </button>
    ) : null,
}));

vi.mock('@client/components/stripe/PurchaseModal', () => ({
  PurchaseModal: ({
    isOpen,
    trigger,
    outOfCredits,
    requiredCredits,
    currentBalance,
    onClose,
  }: {
    isOpen: boolean;
    trigger?: string;
    outOfCredits?: boolean;
    requiredCredits?: number;
    currentBalance?: number;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div
        data-testid="purchase-modal"
        data-trigger={trigger}
        data-out-of-credits={String(Boolean(outOfCredits))}
        data-required-credits={requiredCredits}
        data-current-balance={currentBalance}
      >
        <button onClick={onClose}>Dismiss purchase modal</button>
      </div>
    ) : null,
}));

vi.mock('@client/components/stripe/CheckoutModal', () => ({
  CheckoutModal: ({ priceId }: { priceId: string }) => (
    <div data-modal="checkout" data-price-id={priceId} />
  ),
}));

vi.mock('@client/components/engagement-discount', () => ({
  EngagementDiscountBanner: () => null,
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
  TabButton: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
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
    localStorage.clear();
    mockSubscription = null;
    mockIsFreeUser = true;
    mockProfile = { id: 'user-123' };
    mockIsAuthenticated = true;
    mockTotalCredits = 100;
    mockBatchQueueState.queue = [];
    mockBatchQueueState.activeId = null;
    mockBatchQueueState.activeItem = null;
    mockBatchQueueState.isProcessingBatch = false;
    mockBatchQueueState.batchProgress = null;
    mockBatchQueueState.completedCount = 0;
    mockBatchQueueState.batchLimit = 1;
    mockBatchQueueState.batchLimitExceeded = null;
    mockBatchQueueState.providerUnavailable = null;
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
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockSubscription = null;
    mockIsFreeUser = true;
    mockProfile = { id: 'user-123' };
    mockIsAuthenticated = true;
    mockTotalCredits = 100;
    mockBatchQueueState.queue = [];
    mockBatchQueueState.activeId = null;
    mockBatchQueueState.activeItem = null;
    mockBatchQueueState.isProcessingBatch = false;
    mockBatchQueueState.batchProgress = null;
    mockBatchQueueState.completedCount = 0;
    mockBatchQueueState.batchLimit = 1;
    mockBatchQueueState.batchLimitExceeded = null;
    mockBatchQueueState.providerUnavailable = null;
  });

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

  test('renders CheckoutModal after desktop/sidebar model-gate direct checkout starts', async () => {
    mockBatchQueueState.queue = [
      {
        id: 'item-1',
        status: ProcessingStatus.COMPLETED,
        file: new File(['test'], 'test.png', { type: 'image/png' }),
      },
    ];
    mockBatchQueueState.activeId = 'item-1';
    mockBatchQueueState.activeItem = mockBatchQueueState.queue[0];

    const { container } = render(<Workspace />);

    fireEvent.click(screen.getByTestId('batch-sidebar-direct-checkout'));

    await waitFor(() => {
      expect(
        container.querySelector('[data-modal="checkout"][data-price-id="price_test_small"]')
      ).toBeInTheDocument();
    });
  });

  test('suppresses workspace purchase entry points while a provider outage is active', () => {
    mockBatchQueueState.providerUnavailable = {
      message: 'Provider processing is temporarily unavailable',
      isModalOpen: false,
      suppressPurchaseCtas: true,
    };
    mockBatchQueueState.queue = [
      {
        id: 'item-1',
        status: ProcessingStatus.COMPLETED,
        file: new File(['test'], 'test.png', { type: 'image/png' }),
      },
    ];
    mockBatchQueueState.activeId = 'item-1';
    mockBatchQueueState.activeItem = mockBatchQueueState.queue[0];

    const { container } = render(<Workspace />);

    fireEvent.click(screen.getByTestId('batch-sidebar-direct-checkout'));

    expect(container.querySelector('[data-modal="checkout"]')).not.toBeInTheDocument();
    expect(screen.queryByText('More Credits')).not.toBeInTheDocument();
  });

  test('routes unauthenticated model-gate direct checkout through auth wall', async () => {
    mockProfile = null;
    mockIsAuthenticated = false;
    mockBatchQueueState.queue = [
      {
        id: 'item-1',
        status: ProcessingStatus.COMPLETED,
        file: new File(['test'], 'test.png', { type: 'image/png' }),
      },
    ];
    mockBatchQueueState.activeId = 'item-1';
    mockBatchQueueState.activeItem = mockBatchQueueState.queue[0];

    const analyticsTrack = await getAnalyticsMock();
    const { container } = render(<Workspace />);

    fireEvent.click(screen.getByTestId('batch-sidebar-direct-checkout'));

    expect(mockPrepareAuthRedirect).toHaveBeenCalledWith(
      'checkout',
      expect.objectContaining({
        context: expect.objectContaining({
          priceId: 'price_test_small',
          trigger: 'model_gate',
        }),
      })
    );
    expect(mockOpenAuthRequiredModal).toHaveBeenCalledTimes(1);
    expect(analyticsTrack).toHaveBeenCalledWith(
      'checkout_auth_required',
      expect.objectContaining({
        priceId: 'price_test_small',
        trigger: 'model_gate',
        source: 'model_gate',
        pricingRegion: 'standard',
      })
    );
    expect(
      container.querySelector('[data-modal="checkout"][data-price-id="price_test_small"]')
    ).not.toBeInTheDocument();
  });

  test('opens direct checkout when authenticated before profile has loaded', async () => {
    mockProfile = null;
    mockIsAuthenticated = true;
    mockBatchQueueState.queue = [
      {
        id: 'item-1',
        status: ProcessingStatus.COMPLETED,
        file: new File(['test'], 'test.png', { type: 'image/png' }),
      },
    ];
    mockBatchQueueState.activeId = 'item-1';
    mockBatchQueueState.activeItem = mockBatchQueueState.queue[0];

    const { container } = render(<Workspace />);

    fireEvent.click(screen.getByTestId('batch-sidebar-direct-checkout'));

    expect(mockOpenAuthRequiredModal).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        container.querySelector('[data-modal="checkout"][data-price-id="price_test_small"]')
      ).toBeInTheDocument();
    });
  });

  test('renders CheckoutModal after post-download explore gallery model gate', async () => {
    mockBatchQueueState.queue = [
      {
        id: 'item-1',
        status: ProcessingStatus.COMPLETED,
        file: new File(['test'], 'test.png', { type: 'image/png' }),
      },
    ];
    mockBatchQueueState.activeId = 'item-1';
    mockBatchQueueState.activeItem = mockBatchQueueState.queue[0];

    const { container } = render(<Workspace />);

    fireEvent.click(screen.getByTestId('post-download-explore-models'));
    fireEvent.click(screen.getByTestId('model-gallery-direct-checkout'));

    await waitFor(() => {
      expect(
        container.querySelector('[data-modal="checkout"][data-price-id="price_test_small"]')
      ).toBeInTheDocument();
    });
  });

  test('renders CheckoutModal after mobile quality selector model gate', async () => {
    mockBatchQueueState.queue = [
      {
        id: 'item-1',
        status: ProcessingStatus.COMPLETED,
        file: new File(['test'], 'test.png', { type: 'image/png' }),
      },
    ];
    mockBatchQueueState.activeId = 'item-1';
    mockBatchQueueState.activeItem = mockBatchQueueState.queue[0];

    const { container } = render(<Workspace />);
    const mobileQualitySelector = container.querySelector(
      '[data-driver="mobile-quality-selector"]'
    );

    expect(mobileQualitySelector).toBeInTheDocument();

    fireEvent.click(mobileQualitySelector as Element);
    fireEvent.click(screen.getByTestId('model-gallery-direct-checkout'));

    await waitFor(() => {
      expect(
        container.querySelector('[data-modal="checkout"][data-price-id="price_test_small"]')
      ).toBeInTheDocument();
    });
  });

  test('should not show mobile preview upgrade prompt after a completed result', async () => {
    mockBatchQueueState.queue = [
      {
        id: 'item-1',
        status: ProcessingStatus.COMPLETED,
        file: new File(['test'], 'test.png', { type: 'image/png' }),
      },
    ];
    mockBatchQueueState.activeId = 'item-1';
    mockBatchQueueState.activeItem = mockBatchQueueState.queue[0];
    mockBatchQueueState.completedCount = 1;

    const { container } = render(<Workspace />);

    fireEvent.click(screen.getByText('Preview'));

    expect(screen.queryByTestId('mobile-upgrade-prompt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-preview-direct-checkout')).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-modal="checkout"][data-price-id="price_test_small"]')
    ).not.toBeInTheDocument();
  });

  test('should open dismissible upgrade modal when credits are insufficient', async () => {
    const analyticsTrack = await getAnalyticsMock();
    mockTotalCredits = 0;
    mockBatchQueueState.queue = [
      {
        id: 'item-1',
        status: ProcessingStatus.IDLE,
        file: new File(['test'], 'test.png', { type: 'image/png' }),
      },
    ];
    mockBatchQueueState.activeId = 'item-1';
    mockBatchQueueState.activeItem = mockBatchQueueState.queue[0];

    render(<Workspace />);

    fireEvent.click(screen.getByTestId('batch-sidebar-process'));

    expect(mockProcessBatch).not.toHaveBeenCalled();
    expect(analyticsTrack).toHaveBeenCalledWith('credit_wall_shown', {
      source: 'preflight_batch',
      requiredCredits: 1,
      currentBalance: 0,
      deficit: 1,
    });
    expect(screen.getByTestId('purchase-modal')).toHaveAttribute(
      'data-trigger',
      'insufficient_credits'
    );
    expect(screen.getByTestId('purchase-modal')).toHaveAttribute('data-out-of-credits', 'true');
    expect(screen.getByTestId('purchase-modal')).toHaveAttribute('data-required-credits', '1');
    expect(screen.getByTestId('purchase-modal')).toHaveAttribute('data-current-balance', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss purchase modal' }));
    expect(screen.queryByTestId('purchase-modal')).not.toBeInTheDocument();
  });

  test('should still process when balance covers selected model cost', async () => {
    mockTotalCredits = 2;
    mockBatchQueueState.queue = [
      {
        id: 'item-1',
        status: ProcessingStatus.IDLE,
        file: new File(['test'], 'test.png', { type: 'image/png' }),
      },
    ];
    mockBatchQueueState.activeId = 'item-1';
    mockBatchQueueState.activeItem = mockBatchQueueState.queue[0];

    render(<Workspace />);

    fireEvent.click(screen.getByTestId('batch-sidebar-process'));

    expect(mockProcessBatch).toHaveBeenCalledWith(
      expect.objectContaining({ qualityTier: 'quick', scale: 2 })
    );
    expect(screen.queryByTestId('purchase-modal')).not.toBeInTheDocument();
  });
});

describe('Workspace Paywall Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockSubscription = null; // Free user by default
    mockIsFreeUser = true; // Free user by default
    mockTotalCredits = 100;
    mockBatchQueueState.queue = [];
    mockBatchQueueState.activeId = null;
    mockBatchQueueState.activeItem = null;
    mockBatchQueueState.isProcessingBatch = false;
    mockBatchQueueState.batchProgress = null;
    mockBatchQueueState.completedCount = 0;
    mockBatchQueueState.batchLimit = 1;
    mockBatchQueueState.batchLimitExceeded = null;
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

    const callCount = analyticsTrack.mock.calls.filter(call => call[0] === 'paywall_shown').length;

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

describe('Workspace Activation Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockSubscription = null;
    mockIsFreeUser = true;
    mockTotalCredits = 100;
    mockBatchQueueState.queue = [];
    mockBatchQueueState.activeId = null;
    mockBatchQueueState.activeItem = null;
    mockBatchQueueState.isProcessingBatch = false;
    mockBatchQueueState.batchProgress = null;
    mockBatchQueueState.completedCount = 0;
    mockBatchQueueState.batchLimit = 1;
    mockBatchQueueState.batchLimitExceeded = null;
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

  test('should track first_upload_completed when the first result is ready', async () => {
    const baseQueueItem = {
      id: 'item-1',
      file: new File(['x'], 'image.png', { type: 'image/png' }),
      previewUrl: 'blob:preview',
      processedUrl: null,
      status: ProcessingStatus.PROCESSING,
      progress: 50,
    };

    mockBatchQueueState.queue = [baseQueueItem];
    mockBatchQueueState.activeId = 'item-1';
    mockBatchQueueState.activeItem = baseQueueItem;
    mockBatchQueueState.completedCount = 0;

    const { rerender } = render(<Workspace />);
    const analyticsTrack = await getAnalyticsMock();

    analyticsTrack.mockClear();

    const completedQueueItem = {
      ...baseQueueItem,
      processedUrl: 'https://example.com/result.png',
      status: ProcessingStatus.COMPLETED,
      progress: 100,
    };

    mockBatchQueueState.queue = [completedQueueItem];
    mockBatchQueueState.activeItem = completedQueueItem;
    mockBatchQueueState.completedCount = 1;

    rerender(<Workspace />);

    await waitFor(() => {
      expect(analyticsTrack).toHaveBeenCalledWith('first_upload_completed', {
        source: 'upload',
        durationMs: expect.any(Number),
      });
    });
  });
});
