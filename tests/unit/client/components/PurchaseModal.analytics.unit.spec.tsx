import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PurchaseModal } from '@client/components/stripe/PurchaseModal';
import type { ICreditPack, IPlanConfig } from '@shared/config/subscription.types';

const {
  mockTrack,
  mockGetTrackingContext,
  mockSetTrackingContext,
  mockUseExperimentArm,
  mockCheckoutModal,
  mockGetSession,
} = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockGetTrackingContext: vi.fn(),
  mockSetTrackingContext: vi.fn(),
  mockUseExperimentArm: vi.fn(),
  mockCheckoutModal: vi.fn(() => null),
  mockGetSession: vi.fn(),
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
    user: { id: 'user-1' },
  }),
}));

vi.mock('@server/supabase/supabaseClient', () => ({
  supabase: { auth: { getSession: mockGetSession } },
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
  CheckoutModal: (props: unknown) => mockCheckoutModal(props),
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
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ autoTopUpEligible: true }),
      })
    );
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

  test('does not show auto top-up for an ineligible user', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ autoTopUpEligible: false }),
    } as Response);

    render(
      <PurchaseModal
        isOpen={true}
        onClose={vi.fn()}
        onPurchaseComplete={vi.fn()}
        trigger="model_gate"
      />
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /buy 50 credits/i })).toBeVisible()
    );
    expect(screen.queryByRole('checkbox', { name: /automatically buy/i })).not.toBeInTheDocument();
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

  test('keeps auto top-up unchecked and forwards explicit threshold consent only after opt-in', async () => {
    render(
      <PurchaseModal
        isOpen={true}
        onClose={vi.fn()}
        onPurchaseComplete={vi.fn()}
        trigger="model_gate"
      />
    );
    const checkbox = await screen.findByRole('checkbox', {
      name: /automatically buy small for/i,
    });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.change(screen.getByRole('combobox', { name: /refill below/i }), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: /buy 50 credits/i }));
    await waitFor(() =>
      expect(mockCheckoutModal).toHaveBeenCalledWith(
        expect.objectContaining({ autoTopUp: { enabled: true, thresholdCredits: 10 } })
      )
    );
  });

  test('resets auto top-up consent whenever the modal is reopened', async () => {
    const { rerender } = render(
      <PurchaseModal
        isOpen={true}
        onClose={vi.fn()}
        onPurchaseComplete={vi.fn()}
        trigger="model_gate"
      />
    );
    fireEvent.click(await screen.findByRole('checkbox', { name: /automatically buy small for/i }));
    expect(screen.getByRole('checkbox')).toBeChecked();
    rerender(
      <PurchaseModal
        isOpen={false}
        onClose={vi.fn()}
        onPurchaseComplete={vi.fn()}
        trigger="model_gate"
      />
    );
    rerender(
      <PurchaseModal
        isOpen={true}
        onClose={vi.fn()}
        onPurchaseComplete={vi.fn()}
        trigger="model_gate"
      />
    );
    expect(await screen.findByRole('checkbox')).not.toBeChecked();
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

  test('should include outOfCredits context when insufficient_credits prompt is shown', async () => {
    render(
      <PurchaseModal
        isOpen={true}
        onClose={vi.fn()}
        onPurchaseComplete={vi.fn()}
        trigger="insufficient_credits"
        outOfCredits={true}
        requiredCredits={4}
        currentBalance={1}
      />
    );

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith(
        'upgrade_prompt_shown',
        expect.objectContaining({
          trigger: 'insufficient_credits',
          outOfCredits: true,
          requiredCredits: 4,
          currentBalance: 1,
          initialTab: 'credits',
          lockToCredits: false,
        })
      );
    });
  });

  test('keeps the zero-credit gate open and tracks its display', async () => {
    const onClose = vi.fn();
    render(
      <PurchaseModal
        isOpen={true}
        onClose={onClose}
        onPurchaseComplete={vi.fn()}
        trigger="free_limit_exceeded"
        outOfCredits={true}
        hardGate={true}
      />
    );

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith(
        'free_limit_gate_shown',
        expect.objectContaining({ trigger: 'free_limit_exceeded' })
      );
    });
    expect(screen.queryByRole('button', { name: 'notNow' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /buy 50 credits/i }));
    expect(mockTrack).toHaveBeenCalledWith(
      'free_limit_gate_upgrade_clicked',
      expect.objectContaining({ trigger: 'free_limit_exceeded', destination: 'credits' })
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  test('requires a five-second confirmation before a fourth upgrade-prompt dismissal', async () => {
    const store = new Map<string, string>([['miu_upgrade_prompt_dismiss_count:user-1', '3']]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
    });
    const onClose = vi.fn();

    try {
      render(
        <PurchaseModal
          isOpen={true}
          onClose={onClose}
          onPurchaseComplete={vi.fn()}
          trigger="workspace"
        />
      );

      await screen.findByRole('button', { name: 'notNow' });
      vi.useFakeTimers();
      fireEvent.click(screen.getByRole('button', { name: 'notNow' }));
      const continueButton = screen.getByRole('button', { name: /continue with free plan/i });
      expect(continueButton).toBeDisabled();

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      fireEvent.click(continueButton);

      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
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
