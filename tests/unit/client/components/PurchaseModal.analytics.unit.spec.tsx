import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PurchaseModal } from '@client/components/stripe/PurchaseModal';
import type { ICreditPack, IPlanConfig } from '@shared/config/subscription.types';

const { mockTrack, mockGetTrackingContext, mockSetTrackingContext, mockUseExperimentArm } =
  vi.hoisted(() => ({
    mockTrack: vi.fn(),
    mockGetTrackingContext: vi.fn(),
    mockSetTrackingContext: vi.fn(),
    mockUseExperimentArm: vi.fn(),
  }));

const creditPacks: ICreditPack[] = [
  {
    key: 'medium',
    name: 'Medium',
    credits: 150,
    priceInCents: 1499,
    currency: 'usd',
    stripePriceId: 'price_medium',
    description: 'Medium pack',
    enabled: true,
  },
  {
    key: 'small',
    name: 'Small',
    credits: 50,
    priceInCents: 499,
    currency: 'usd',
    stripePriceId: 'price_small',
    description: 'Starter pack',
    enabled: true,
  },
];

const basePlan = {
  stripePriceId: 'price_starter',
  priceInCents: 1900,
  currency: 'usd',
  interval: 'month',
  creditsPerCycle: 500,
  maxRollover: 3000,
  rolloverMultiplier: 6,
  trial: {
    enabled: false,
    durationDays: 0,
    trialCredits: null,
    requirePaymentMethod: true,
    allowMultipleTrials: false,
    autoConvertToPaid: true,
  },
  creditsExpiration: {
    mode: 'never',
    gracePeriodDays: 0,
    sendExpirationWarning: false,
    warningDaysBefore: 7,
  },
  features: [],
  description: '',
  displayOrder: 1,
  enabled: true,
  batchLimit: null,
  hourlyProcessingLimit: null,
} satisfies Omit<IPlanConfig, 'key' | 'name' | 'recommended'>;

const subscriptionPlans: IPlanConfig[] = [
  {
    ...basePlan,
    key: 'starter',
    name: 'Starter',
    recommended: false,
  },
  {
    ...basePlan,
    key: 'hobby',
    name: 'Hobby',
    stripePriceId: 'price_hobby',
    recommended: true,
  },
];

vi.mock('@client/analytics', () => ({
  analytics: {
    track: mockTrack,
    isEnabled: () => true,
  },
}));

vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({
    pricingRegion: 'standard',
    discountPercent: 0,
  }),
}));

vi.mock('@client/hooks/useExperimentArm', () => ({
  useExperimentArm: mockUseExperimentArm,
}));

vi.mock('@client/hooks/useCurrentPlan', () => ({
  useCurrentPlan: () => ({
    planKey: 'free',
    priceId: null,
    isPaidUser: false,
  }),
}));

vi.mock('@client/store/userStore', () => ({
  useUserStore: () => ({
    isAuthenticated: true,
  }),
}));

vi.mock('@client/store/modalStore', () => ({
  useModalStore: () => ({
    openAuthRequiredModal: vi.fn(),
  }),
}));

vi.mock('@client/utils/authRedirectManager', () => ({
  prepareAuthRedirect: vi.fn(),
}));

vi.mock('@client/utils/checkoutTrackingContext', () => ({
  clearCheckoutTrackingContext: vi.fn(),
  getCheckoutTrackingContext: mockGetTrackingContext,
  setCheckoutTrackingContext: mockSetTrackingContext,
}));

vi.mock('@shared/config/subscription.utils', () => ({
  getEnabledCreditPacks: () => creditPacks,
  getEnabledPlans: () => subscriptionPlans,
}));

vi.mock('@client/components/stripe/CheckoutModal', () => ({
  CheckoutModal: () => null,
}));

vi.mock('@client/components/stripe/PlanChangeModal', () => ({
  PlanChangeModal: () => null,
}));

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement('img', { ...props, alt: props.alt || '' }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('lucide-react', () => ({
  ArrowRight: () => null,
  Check: () => null,
  Coins: () => null,
  ShoppingCart: () => null,
  Star: () => null,
  X: () => null,
  Zap: () => null,
}));

describe('PurchaseModal analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTrackingContext.mockReturnValue(null);
    mockUseExperimentArm.mockReturnValue({
      assignment: {
        experimentKey: 'purchase_modal_default_selection',
        contextKey: 'global',
        armId: 10,
        armKey: 'current_modal_control',
        armConfig: {},
        assignmentKey: 'session:test',
        surface: 'purchase_modal',
      },
      armKey: 'current_modal_control',
      armConfig: {},
      isLoading: false,
      isFallback: false,
    });
  });

  test('tracks purchase_modal_opened with initial small credit-pack selection for model gates', async () => {
    render(
      <PurchaseModal
        isOpen={true}
        onClose={vi.fn()}
        onPurchaseComplete={vi.fn()}
        trigger="model_gate"
      />
    );

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith(
        'purchase_modal_opened',
        expect.objectContaining({
          trigger: 'model_gate',
          initialTab: 'credits',
          selectedType: 'credit_pack',
          selectedKey: 'small',
          priceId: 'price_small',
          lockToCredits: true,
          experimentKey: 'purchase_modal_default_selection',
          experimentArmKey: 'current_modal_control',
        })
      );
    });
  });

  test('tracks purchase_modal_opened with recommended subscription for batch-limit triggers', async () => {
    render(
      <PurchaseModal
        isOpen={true}
        onClose={vi.fn()}
        onPurchaseComplete={vi.fn()}
        trigger="workspace_batch_limit"
      />
    );

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith(
        'purchase_modal_opened',
        expect.objectContaining({
          trigger: 'workspace_batch_limit',
          initialTab: 'subscribe',
          selectedType: 'subscription',
          selectedKey: 'hobby',
          priceId: 'price_hobby',
          lockToCredits: false,
          experimentKey: 'purchase_modal_default_selection',
          experimentArmKey: 'current_modal_control',
        })
      );
    });
  });

  test('renders compact credit picker arm', async () => {
    mockUseExperimentArm.mockReturnValue({
      assignment: {
        experimentKey: 'purchase_modal_default_selection',
        contextKey: 'global',
        armId: 12,
        armKey: 'compact_credit_picker',
        armConfig: {
          defaultType: 'credit_pack',
          defaultKey: 'small',
          visiblePacks: ['small'],
          hideSubscriptionsInitially: true,
        },
        assignmentKey: 'session:test',
        surface: 'purchase_modal',
      },
      armKey: 'compact_credit_picker',
      armConfig: {
        defaultType: 'credit_pack',
        defaultKey: 'small',
        visiblePacks: ['small'],
        hideSubscriptionsInitially: true,
      },
      isLoading: false,
      isFallback: false,
    });

    const { queryByText } = render(
      <PurchaseModal
        isOpen={true}
        onClose={vi.fn()}
        onPurchaseComplete={vi.fn()}
        trigger="workspace"
      />
    );

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith(
        'purchase_modal_opened',
        expect.objectContaining({
          selectedKey: 'small',
          experimentArmKey: 'compact_credit_picker',
        })
      );
    });
    expect(queryByText('150')).toBeNull();
  });
});
