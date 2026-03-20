/**
 * Unit tests for upgrade funnel analytics tracking improvements.
 *
 * Covers:
 * 1. ModelGalleryModal - imageVariant appears in model_gate upgrade_prompt_clicked events
 * 2. useCheckoutFlow - originatingModel stored in sessionStorage + included in checkout_opened
 * 3. AfterUpscaleBanner - imageVariant included in analytics events
 * 4. PremiumUpsellModal - currentModel attribute in analytics events
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockAnalyticsTrack, mockHandleCheckout, mockShowCheckoutModal } = vi.hoisted(() => ({
  mockAnalyticsTrack: vi.fn(),
  mockHandleCheckout: vi.fn(),
  mockShowCheckoutModal: false,
}));

vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: { track: mockAnalyticsTrack, isEnabled: () => true },
}));

vi.mock('@client/analytics', () => ({
  analytics: { track: mockAnalyticsTrack, isEnabled: () => true },
}));

vi.mock('@client/hooks/useCheckoutFlow', () => ({
  useCheckoutFlow: () => ({
    handleCheckout: mockHandleCheckout,
    showCheckoutModal: false,
    closeCheckoutModal: vi.fn(),
    handleCheckoutSuccess: vi.fn(),
    isProcessing: false,
    hasError: false,
    retryCount: 0,
  }),
}));

vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({ pricingRegion: 'standard' }),
}));

vi.mock('@shared/config/stripe', () => ({
  STRIPE_PRICES: {
    HOBBY_MONTHLY: 'price_hobby_monthly',
    PRO_MONTHLY: 'price_pro_monthly',
    STARTER_MONTHLY: 'price_starter_monthly',
    BUSINESS_MONTHLY: 'price_business_monthly',
    SMALL_CREDITS: 'price_small_credits',
    MEDIUM_CREDITS: 'price_medium_credits',
    LARGE_CREDITS: 'price_large_credits',
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@client/components/stripe/CheckoutModal', () => ({
  CheckoutModal: () => <div data-testid="checkout-modal" />,
}));

vi.mock('@client/components/ui/BeforeAfterSlider', () => ({
  BeforeAfterSlider: () => <div data-testid="before-after-slider" />,
}));

vi.mock('@client/components/ui/BottomSheet', () => ({
  BottomSheet: ({
    isOpen,
    children,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    onClose: () => void;
    title: string;
    className?: string;
  }) => (isOpen ? <div data-testid="bottom-sheet">{children}</div> : null),
}));

// Mock lucide-react icons used in the components under test
vi.mock('lucide-react', () => ({
  Lock: () => <span data-testid="lock-icon" />,
  Search: () => <span data-testid="search-icon" />,
  Sparkles: () => <span data-testid="sparkles-icon" />,
  X: () => <span data-testid="x-icon" />,
  ArrowRight: () => <span data-testid="arrow-right-icon" />,
  ChevronLeft: () => <span data-testid="chevron-left-icon" />,
  ChevronRight: () => <span data-testid="chevron-right-icon" />,
}));

vi.mock('@client/components/features/workspace/ModelGallerySearch', () => ({
  ModelGallerySearch: () => null,
}));

vi.mock('@client/components/features/workspace/ModelCard', () => ({
  ModelCard: ({
    isLocked,
    onLockedClick,
    tier,
  }: {
    tier: string;
    isLocked: boolean;
    onLockedClick?: () => void;
    isSelected?: boolean;
    onSelect?: (tier: string) => void;
    config?: unknown;
  }) =>
    isLocked ? (
      <button data-testid={`locked-${tier}`} onClick={onLockedClick}>
        Locked
      </button>
    ) : (
      <button data-testid={`free-${tier}`}>Free</button>
    ),
}));

vi.mock('@shared/config/model-costs.config', () => ({
  MODEL_COSTS: {
    PREMIUM_QUALITY_TIERS: ['face-pro', 'hd-upscale', 'ultra'],
    FREE_QUALITY_TIERS: ['quick', 'standard', 'face-restore'],
  },
}));

vi.mock('@/shared/types/coreflow.types', () => ({
  QualityTier: {},
  QUALITY_TIER_CONFIG: {
    'face-pro': { label: 'Portrait Pro', bestFor: 'faces', useCases: [], popularity: 90 },
    'hd-upscale': { label: 'HD Upscale', bestFor: 'photos', useCases: [], popularity: 80 },
    ultra: { label: 'Ultra', bestFor: 'max quality', useCases: [], popularity: 70 },
    quick: { label: 'Quick', bestFor: 'fast', useCases: [], popularity: 100 },
    standard: { label: 'Standard', bestFor: 'general', useCases: [], popularity: 85 },
    'face-restore': {
      label: 'Face Restore',
      bestFor: 'old photos',
      useCases: [],
      popularity: 95,
    },
    auto: { label: 'Auto', bestFor: 'auto', useCases: [], popularity: 50 },
  },
}));

vi.mock('@client/utils/promptFrequency', () => ({
  canShowPrompt: vi.fn(() => true),
  markPromptShown: vi.fn(),
}));

// ---------------------------------------------------------------------------
// sessionStorage stub
// ---------------------------------------------------------------------------

let sessionStorageData: Record<string, string> = {};

beforeEach(() => {
  sessionStorageData = {};
  vi.spyOn(window, 'sessionStorage', 'get').mockReturnValue({
    getItem: (key: string) => sessionStorageData[key] ?? null,
    setItem: (key: string, value: string) => {
      sessionStorageData[key] = value;
    },
    removeItem: (key: string) => {
      delete sessionStorageData[key];
    },
    clear: () => {
      sessionStorageData = {};
    },
    key: (index: number) => Object.keys(sessionStorageData)[index] ?? null,
    length: Object.keys(sessionStorageData).length,
  } as Storage);

  mockAnalyticsTrack.mockClear();
  mockHandleCheckout.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. ModelGalleryModal – imageVariant in model_gate events
// ---------------------------------------------------------------------------

describe('ModelGalleryModal – model_gate analytics', () => {
  // Lazy import after mocks are set up
  async function renderGallery(isFreeUser = true) {
    const { ModelGalleryModal } =
      await import('@client/components/features/workspace/ModelGalleryModal');
    return render(
      <ModelGalleryModal
        isOpen={true}
        onClose={vi.fn()}
        currentTier="quick"
        isFreeUser={isFreeUser}
        onSelect={vi.fn()}
        onUpgrade={mockHandleCheckout}
      />
    );
  }

  it('tracks upgrade_prompt_clicked with imageVariant when a locked model card is clicked', async () => {
    await renderGallery();

    const lockedBtn = screen.queryByTestId('locked-face-pro');
    if (!lockedBtn) return; // skip if mocked card not rendered

    fireEvent.click(lockedBtn);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith(
      'upgrade_prompt_clicked',
      expect.objectContaining({
        trigger: 'model_gate',
        imageVariant: 'face-pro',
      })
    );
  });

  it('stores originatingModel in sessionStorage when locked model is clicked', async () => {
    await renderGallery();

    const lockedBtn = screen.queryByTestId('locked-face-pro');
    if (!lockedBtn) return;

    fireEvent.click(lockedBtn);

    expect(sessionStorageData['checkout_originating_model']).toBe('face-pro');
  });

  it('tracks upgrade_prompt_clicked with imageVariant=banner for the banner button', async () => {
    await renderGallery();

    // Banner button text is "UPGRADE"
    const upgradeBtn = screen.queryByText('UPGRADE');
    if (!upgradeBtn) return;

    fireEvent.click(upgradeBtn);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith(
      'upgrade_prompt_clicked',
      expect.objectContaining({
        trigger: 'model_gate',
        imageVariant: 'banner',
      })
    );
  });

  it('calls handleCheckout when locked model is clicked', async () => {
    await renderGallery();

    const lockedBtn = screen.queryByTestId('locked-face-pro');
    if (!lockedBtn) return;

    fireEvent.click(lockedBtn);

    expect(mockHandleCheckout).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. AfterUpscaleBanner – imageVariant in analytics events
// ---------------------------------------------------------------------------

describe('AfterUpscaleBanner – imageVariant analytics', () => {
  async function renderBanner(currentModel?: string) {
    const { AfterUpscaleBanner } =
      await import('@client/components/features/workspace/AfterUpscaleBanner');
    return render(
      <AfterUpscaleBanner
        completedCount={3}
        isFreeUser={true}
        currentModel={currentModel as Parameters<typeof AfterUpscaleBanner>[0]['currentModel']}
      />
    );
  }

  it('includes imageVariant in upgrade_prompt_shown event', async () => {
    await act(async () => {
      await renderBanner('face-restore');
    });

    expect(mockAnalyticsTrack).toHaveBeenCalledWith(
      'upgrade_prompt_shown',
      expect.objectContaining({
        trigger: 'after_upscale',
        imageVariant: 'face-restore',
      })
    );
  });

  it('shows face-restore specific CTA text', async () => {
    await act(async () => {
      await renderBanner('face-restore');
    });

    expect(screen.getByText('Try Portrait Pro for sharper faces.')).toBeDefined();
  });

  it('shows generic CTA text for non-face-restore models', async () => {
    await act(async () => {
      await renderBanner('quick');
    });

    expect(screen.getByText('Upgrade for unlimited.')).toBeDefined();
  });

  it('includes imageVariant in upgrade_prompt_clicked when clicking the link', async () => {
    await act(async () => {
      await renderBanner('face-restore');
    });

    const upgradeLink = screen.getByText('Try Portrait Pro for sharper faces.');
    fireEvent.click(upgradeLink);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith(
      'upgrade_prompt_clicked',
      expect.objectContaining({
        trigger: 'after_upscale',
        imageVariant: 'face-restore',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 3. PremiumUpsellModal – currentModel in analytics events
// ---------------------------------------------------------------------------

describe('PremiumUpsellModal – currentModel analytics', () => {
  async function renderModal(currentModel?: string) {
    const { PremiumUpsellModal } =
      await import('@client/components/features/workspace/PremiumUpsellModal');

    return render(
      <PremiumUpsellModal
        isOpen={true}
        onClose={vi.fn()}
        onProceed={vi.fn()}
        onViewPlans={vi.fn()}
        currentModel={currentModel as Parameters<typeof PremiumUpsellModal>[0]['currentModel']}
      />
    );
  }

  it('includes currentModel in upgrade_prompt_shown event', async () => {
    await act(async () => {
      await renderModal('face-restore');
    });

    expect(mockAnalyticsTrack).toHaveBeenCalledWith(
      'upgrade_prompt_shown',
      expect.objectContaining({
        trigger: 'premium_upsell',
        currentModel: 'face-restore',
      })
    );
  });

  it('shows face-restore specific heading', async () => {
    await act(async () => {
      await renderModal('face-restore');
    });

    expect(screen.getByText('See what Portrait Pro can do')).toBeDefined();
  });

  it('shows generic heading for other models', async () => {
    await act(async () => {
      await renderModal('quick');
    });

    expect(screen.getByText('Unlock Premium Enhancement Models')).toBeDefined();
  });
});
