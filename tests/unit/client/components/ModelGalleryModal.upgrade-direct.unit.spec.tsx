import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  mockUseExperimentArm,
} = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockSetCheckoutTrackingContext: vi.fn(),
  mockResolveCheapestRegionalPlan: vi.fn().mockReturnValue('price_test_small'),
  mockUseRegionTier: vi.fn(),
  mockUseExperimentArm: vi.fn(),
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

vi.mock('@client/utils/abTest', () => ({
  getVariant: vi.fn().mockReturnValue('value'),
}));

vi.mock('lucide-react', () => ({
  ChevronDown: () => null,
  Check: () => null,
  Image: () => null,
  Lock: () => null,
  Search: () => null,
  Sparkles: () => null,
  X: () => null,
}));

vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: mockUseRegionTier,
}));

vi.mock('@client/hooks/useExperimentArm', () => ({
  useExperimentArm: mockUseExperimentArm,
}));

vi.mock('@shared/config/subscription.utils', () => ({
  getCreditsForTierAtScale: vi.fn(() => 3),
  getCreditDisplayForTier: vi.fn(() => '3 credits'),
  getEnabledCreditPacks: vi.fn(() => [
    { key: 'small', credits: 50, stripePriceId: 'price_test_small' },
    { key: 'medium', credits: 200, stripePriceId: 'price_test_medium' },
  ]),
  getEnabledPlans: vi.fn(() => [{ key: 'starter', stripePriceId: 'price_test_starter' }]),
}));

// BottomSheet just renders its children when isOpen=true
vi.mock('@client/components/ui/BottomSheet', () => ({
  BottomSheet: ({
    isOpen,
    children,
    footer,
    title,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    footer?: React.ReactNode;
    onClose: () => void;
    title: string;
  }) =>
    isOpen
      ? React.createElement(
          'div',
          { 'data-testid': 'bottom-sheet', 'data-title': title },
          children,
          footer
        )
      : null,
}));

// ModelCard renders a button that calls onLockedClick when isLocked=true
vi.mock(
  '/home/joao/projects/myimageupscaler.com/client/components/features/workspace/ModelCard',
  () => ({
    ModelCard: ({
      tier,
      isLocked,
      onLockedClick,
      onSelect,
    }: {
      tier: string;
      isLocked: boolean;
      onLockedClick?: () => void;
      onSelect: (tier: string) => void;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': `model-card-${tier}` },
        isLocked
          ? React.createElement(
              'button',
              { 'data-testid': `locked-${tier}`, onClick: onLockedClick },
              `Unlock ${tier}`
            )
          : React.createElement(
              'button',
              { 'data-testid': `select-${tier}`, onClick: () => onSelect(tier) },
              `Select ${tier}`
            )
      ),
  })
);

vi.mock(
  '/home/joao/projects/myimageupscaler.com/client/components/features/workspace/ModelGallerySearch',
  () => ({
    ModelGallerySearch: () => null,
  })
);

vi.mock('@shared/config/model-costs.config', () => ({
  MODEL_COSTS: {
    FREE_QUALITY_TIERS: ['quick', 'face-restore', 'bg-removal'],
    PREMIUM_QUALITY_TIERS: ['hd-upscale', 'ultra', 'face-pro'],
  },
}));

vi.mock('@/shared/types/coreflow.types', () => ({
  QUALITY_TIER_CONFIG: {
    quick: {
      label: 'Quick',
      bestFor: 'Speed',
      useCases: ['fast upscale'],
      popularity: 90,
      credits: 1,
    },
    'face-restore': {
      label: 'Face Restore',
      bestFor: 'Faces',
      useCases: ['portraits'],
      popularity: 80,
      credits: 1,
    },
    'bg-removal': {
      label: 'BG Removal',
      bestFor: 'Products',
      useCases: ['product photos'],
      popularity: 70,
      credits: 1,
    },
    'hd-upscale': {
      label: 'HD Upscale',
      bestFor: 'Detail',
      useCases: ['high detail'],
      popularity: 60,
      credits: 3,
    },
    ultra: {
      label: 'Ultra',
      bestFor: 'Best quality',
      useCases: ['maximum quality'],
      popularity: 50,
      credits: 5,
    },
    'face-pro': {
      label: 'Face Pro',
      bestFor: 'Professional faces',
      useCases: ['professional portraits'],
      popularity: 40,
      credits: 4,
    },
  },
  QualityTier: {},
}));

import { ModelGalleryModal } from '@client/components/features/workspace/ModelGalleryModal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STANDARD_REGION = 'standard';

function renderModal(overrides: Partial<React.ComponentProps<typeof ModelGalleryModal>> = {}) {
  const onClose = vi.fn();
  const onUpgrade = vi.fn();
  const onUpgradeDirect = vi.fn();
  const onSelect = vi.fn();

  const result = render(
    React.createElement(ModelGalleryModal, {
      isOpen: true,
      onClose,
      currentTier: 'quick' as any,
      isFreeUser: true,
      onSelect,
      onUpgrade,
      onUpgradeDirect,
      ...overrides,
    })
  );

  return { onClose, onUpgrade, onUpgradeDirect, onSelect, ...result };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModelGalleryModal — upgrade direct flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRegionTier.mockReturnValue({ pricingRegion: STANDARD_REGION });
    mockResolveCheapestRegionalPlan.mockReturnValue('price_test_small');
    mockUseExperimentArm.mockReturnValue({
      assignment: {
        experimentKey: 'model_gate_purchase_path',
        contextKey: 'global',
        armId: 20,
        armKey: 'direct_small_pack_control',
        armConfig: { path: 'direct_checkout', defaultKey: 'small' },
        assignmentKey: 'session:test',
        surface: 'model_gallery',
      },
      armKey: 'direct_small_pack_control',
      armConfig: { path: 'direct_checkout', defaultKey: 'small' },
      isLoading: false,
      isFallback: false,
    });
    // Suppress sessionStorage calls in test env
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  it('should open direct checkout when premium model clicked and direct handler exists', () => {
    const { onUpgradeDirect } = renderModal();
    fireEvent.click(screen.getByTestId('locked-hd-upscale'));

    expect(onUpgradeDirect).toHaveBeenCalledWith({
      trigger: 'model_gate',
      planId: 'price_test_small',
    });
  });

  it('should route every locked premium model through model_gate direct checkout', () => {
    const { onUpgradeDirect, onUpgrade } = renderModal();

    for (const tier of ['hd-upscale', 'ultra', 'face-pro']) {
      onUpgradeDirect.mockClear();
      mockSetCheckoutTrackingContext.mockClear();

      fireEvent.click(screen.getByTestId(`locked-${tier}`));

      expect(onUpgradeDirect).toHaveBeenCalledWith({
        trigger: 'model_gate',
        planId: 'price_test_small',
      });
      expect(mockSetCheckoutTrackingContext).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: 'model_gate',
          originatingModel: tier,
        })
      );
    }

    expect(onUpgrade).not.toHaveBeenCalled();
  });

  it('should not call onUpgrade when direct checkout is available', () => {
    const { onUpgrade } = renderModal();
    fireEvent.click(screen.getByTestId('locked-hd-upscale'));

    expect(onUpgrade).not.toHaveBeenCalled();
  });

  it('compact arm opens purchase modal path', () => {
    mockUseExperimentArm.mockReturnValue({
      assignment: {
        experimentKey: 'model_gate_purchase_path',
        contextKey: 'global',
        armId: 21,
        armKey: 'compact_credit_picker',
        armConfig: { path: 'compact_picker', visiblePacks: ['small', 'medium'] },
        assignmentKey: 'session:test',
        surface: 'model_gallery',
      },
      armKey: 'compact_credit_picker',
      armConfig: { path: 'compact_picker', visiblePacks: ['small', 'medium'] },
      isLoading: false,
      isFallback: false,
    });
    const { onUpgrade, onUpgradeDirect } = renderModal();
    fireEvent.click(screen.getByTestId('locked-hd-upscale'));

    expect(onUpgrade).toHaveBeenCalled();
    expect(onUpgradeDirect).not.toHaveBeenCalled();
  });

  it('should resolve the regional checkout plan from the model gate', () => {
    mockUseRegionTier.mockReturnValue({ pricingRegion: 'south_asia' });
    renderModal();
    fireEvent.click(screen.getByTestId('locked-hd-upscale'));

    expect(mockResolveCheapestRegionalPlan).toHaveBeenCalledWith('south_asia');
  });

  it('should set checkoutTrackingContext with trigger="model_gate" when premium clicked', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('locked-hd-upscale'));

    expect(mockSetCheckoutTrackingContext).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'model_gate',
        experimentKey: 'model_gate_purchase_path',
        experimentArmKey: 'direct_small_pack_control',
      })
    );
  });

  it('should set checkoutTrackingContext with originatingModel matching the tier', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('locked-hd-upscale'));

    expect(mockSetCheckoutTrackingContext).toHaveBeenCalledWith(
      expect.objectContaining({ originatingModel: 'hd-upscale' })
    );
  });

  it('should track upgrade_prompt_clicked with destination=checkout_direct', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('locked-hd-upscale'));

    expect(mockTrack).toHaveBeenCalledWith(
      'upgrade_prompt_clicked',
      expect.objectContaining({
        trigger: 'model_gate',
        destination: 'checkout_direct',
      })
    );
  });

  it('should still call onUpgrade when onUpgradeDirect is not provided', () => {
    const { onUpgrade } = renderModal({ onUpgradeDirect: undefined });
    fireEvent.click(screen.getByTestId('locked-hd-upscale'));

    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('should track upgrade_prompt_clicked with destination=upgrade_plan_modal when no direct handler', () => {
    renderModal({ onUpgradeDirect: undefined });
    fireEvent.click(screen.getByTestId('locked-hd-upscale'));

    expect(mockTrack).toHaveBeenCalledWith(
      'upgrade_prompt_clicked',
      expect.objectContaining({
        trigger: 'model_gate',
        destination: 'upgrade_plan_modal',
      })
    );
  });

  it('should track checkout_direct_unavailable before falling back to purchase modal', () => {
    renderModal({ onUpgradeDirect: undefined });
    fireEvent.click(screen.getByTestId('locked-hd-upscale'));

    expect(mockTrack).toHaveBeenCalledWith(
      'checkout_direct_unavailable',
      expect.objectContaining({
        trigger: 'model_gate',
        imageVariant: 'hd-upscale',
        currentPlan: 'free',
        fallbackDestination: 'upgrade_plan_modal',
      })
    );
  });

  it('should call onClose before opening direct checkout', () => {
    const callOrder: string[] = [];
    const onClose = vi.fn(() => callOrder.push('close'));
    const onUpgrade = vi.fn(() => callOrder.push('upgrade'));
    const onUpgradeDirect = vi.fn(() => callOrder.push('direct'));

    render(
      React.createElement(ModelGalleryModal, {
        isOpen: true,
        onClose,
        currentTier: 'quick' as any,
        isFreeUser: true,
        onSelect: vi.fn(),
        onUpgrade,
        onUpgradeDirect,
      })
    );

    fireEvent.click(screen.getByTestId('locked-hd-upscale'));

    expect(callOrder).toEqual(['close', 'direct']);
  });
});
