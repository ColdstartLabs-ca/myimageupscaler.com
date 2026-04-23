/**
 * Unit tests for the workspace header Upgrade button.
 *
 * The button (data-testid="workspace-header-upgrade-button") only renders for
 * free users inside the active workspace view (when the queue is non-empty).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ProcessingStatus } from '@/shared/types/coreflow.types';

// ---------------------------------------------------------------------------
// useBatchQueue mock — expose a mutable state object
// ---------------------------------------------------------------------------

const mockBatchQueueState = {
  queue: [] as Array<Record<string, unknown>>,
  activeId: null as string | null,
  activeItem: null as Record<string, unknown> | null,
  isProcessingBatch: false,
  batchProgress: null,
  completedCount: 0,
  batchLimit: 1,
  batchLimitExceeded: null,
  setActiveId: vi.fn(),
  addFiles: vi.fn(),
  addSampleItem: vi.fn(),
  removeItem: vi.fn(),
  clearQueue: vi.fn(),
  processBatch: vi.fn(),
  processSingleItem: vi.fn(),
  clearBatchLimitError: vi.fn(),
};

vi.mock('@/client/hooks/useBatchQueue', () => ({
  useBatchQueue: () => mockBatchQueueState,
}));

// ---------------------------------------------------------------------------
// userStore mock — configurable isFreeUser
// ---------------------------------------------------------------------------

let mockIsFreeUser = true;

vi.mock('@client/store/userStore', () => ({
  useUserData: () => ({
    totalCredits: 100,
    profile: { id: 'user-123' },
    subscription: null,
    isAuthenticated: true,
    isFreeUser: mockIsFreeUser,
  }),
  useUserStore: vi.fn(() => ({ user: { id: 'user-123' } })),
  useProfile: vi.fn(() => ({ id: 'user-123' })),
  useSubscription: vi.fn(() => null),
}));

// ---------------------------------------------------------------------------
// lucide-react — override setup mock to include icons used by Workspace.tsx
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => ({
  Check: () => null,
  CheckCircle2: () => null,
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

// ---------------------------------------------------------------------------
// Sub-component mocks using full alias paths (test is outside component dir)
// ---------------------------------------------------------------------------

vi.mock('@client/components/features/workspace/BatchSidebar', () => ({
  BatchSidebar: () => null,
}));
vi.mock('@client/components/features/workspace/PreviewArea', () => ({
  PreviewArea: () => null,
}));
vi.mock('@client/components/features/workspace/QueueStrip', () => ({
  QueueStrip: () => null,
}));
vi.mock('@client/components/features/workspace/AfterUpscaleBanner', () => ({
  AfterUpscaleBanner: () => null,
}));
vi.mock('@client/components/features/workspace/ModelGalleryModal', () => ({
  ModelGalleryModal: () => null,
}));
vi.mock('@client/components/features/workspace/SampleImageSelector', () => ({
  SampleImageSelector: () => null,
}));
vi.mock('@client/components/features/workspace/PostDownloadPrompt', () => ({
  PostDownloadPrompt: () => null,
}));
vi.mock('@client/components/features/workspace/FirstDownloadCelebration', () => ({
  FirstDownloadCelebration: () => null,
}));
vi.mock('@client/components/features/workspace/MobileUpgradePrompt', () => ({
  MobileUpgradePrompt: () => null,
}));
vi.mock('@client/components/features/workspace/BatchLimitModal', () => ({
  BatchLimitModal: () => null,
}));
vi.mock('@client/components/features/workspace/ProgressSteps', () => ({
  ProgressSteps: () => null,
  checkIsFirstTimeUser: () => false,
  markFirstUploadCompleted: vi.fn(),
}));

vi.mock('@client/components/stripe/PurchaseModal', () => ({ PurchaseModal: () => null }));
vi.mock('@client/components/stripe/CheckoutModal', () => ({ CheckoutModal: () => null }));
vi.mock('@client/components/stripe/ErrorAlert', () => ({ ErrorAlert: () => null }));
vi.mock('@client/components/engagement-discount', () => ({
  EngagementDiscountBanner: () => null,
}));
vi.mock('@client/components/features/image-processing/Dropzone', () => ({
  Dropzone: () => React.createElement('div', { 'data-testid': 'dropzone' }, 'Dropzone'),
}));
vi.mock('@client/components/landing/AmbientBackground', () => ({
  AmbientBackground: () => null,
}));
vi.mock('@client/components/ui/TabButton', () => ({
  TabButton: ({ children }: { children: React.ReactNode }) =>
    React.createElement('button', null, children),
}));

vi.mock('@client/analytics', () => ({
  analytics: { track: vi.fn(), isEnabled: () => true },
}));

vi.mock('@client/utils/checkoutTrackingContext', () => ({
  setCheckoutTrackingContext: vi.fn(),
  getCheckoutTrackingContext: vi.fn(() => null),
}));

vi.mock('@shared/config/subscription.config', () => ({
  resolveCheapestRegionalPlan: vi.fn(() => 'price_test_cheapest'),
}));

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    APP_NAME: 'MyImageUpscaler',
    NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM: 'price_credits_medium',
  },
}));

vi.mock('@/client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({
    tier: 'standard',
    country: 'US',
    isLoading: false,
    isRestricted: false,
    isPaywalled: false,
    pricingRegion: 'standard',
    discountPercent: 0,
  }),
}));

vi.mock('@client/hooks/useEngagementTracker', () => ({
  useEngagementTracker: () => ({
    trackUpscale: vi.fn(),
    trackDownload: vi.fn(),
    trackModelSwitch: vi.fn(),
  }),
}));

vi.mock('@client/hooks/useOnboardingDriver', () => ({
  useOnboardingDriver: () => ({
    startTourPhase1: vi.fn().mockResolvedValue(undefined),
    startTour: vi.fn().mockResolvedValue(undefined),
    startTourPhase3: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('@client/utils/download', () => ({
  downloadSingle: vi.fn(),
}));

// Import AFTER mocks
import Workspace from '@client/components/features/workspace/Workspace';

// ---------------------------------------------------------------------------
// A minimal queue item to push the component into the active workspace state
// ---------------------------------------------------------------------------

function makeQueueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    file: new File(['x'], 'image.png', { type: 'image/png' }),
    previewUrl: 'blob:preview',
    processedUrl: null,
    status: ProcessingStatus.PENDING,
    progress: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Workspace — header Upgrade button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFreeUser = true;
    // Put one item in the queue so the active workspace view renders
    mockBatchQueueState.queue = [makeQueueItem()];
    mockBatchQueueState.activeId = 'item-1';
    mockBatchQueueState.activeItem = makeQueueItem();
    mockBatchQueueState.isProcessingBatch = false;
    mockBatchQueueState.batchProgress = null;
    mockBatchQueueState.completedCount = 0;
    mockBatchQueueState.batchLimit = 1;
    mockBatchQueueState.batchLimitExceeded = null;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('workspace_header_shown');
    }
  });

  test('should render workspace header Upgrade button for free user', () => {
    mockIsFreeUser = true;

    render(<Workspace />);

    expect(screen.getByTestId('workspace-header-upgrade-button')).toBeInTheDocument();
  });

  test('should NOT render workspace header Upgrade button for paid user', () => {
    mockIsFreeUser = false;

    render(<Workspace />);

    expect(screen.queryByTestId('workspace-header-upgrade-button')).not.toBeInTheDocument();
  });
});
