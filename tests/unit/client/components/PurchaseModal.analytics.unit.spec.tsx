import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  mockPrepareAuthRedirect,
  mockRegionState,
  mockUserState,
} = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockGetTrackingContext: vi.fn(),
  mockSetTrackingContext: vi.fn(),
  mockUseExperimentArm: vi.fn(),
  mockCheckoutModal: vi.fn(() => null),
  mockGetSession: vi.fn(),
  mockPrepareAuthRedirect: vi.fn(),
  mockRegionState: {
    pricingRegion: 'standard',
    discountPercent: 0,
  },
  mockUserState: {
    isAuthenticated: true,
    user: { id: 'user-1' } as { id: string } | null,
  },
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
  {
    key: 'large',
    name: 'Large',
    credits: 600,
    priceInCents: 3999,
    currency: 'usd',
    stripePriceId: 'price_large',
    description: 'Large pack',
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
  useRegionTier: () => mockRegionState,
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
  useUserStore: () => mockUserState,
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
  prepareAuthRedirect: mockPrepareAuthRedirect,
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
    mockUserState.isAuthenticated = true;
    mockUserState.user = { id: 'user-1' };
    mockRegionState.pricingRegion = 'standard';
    mockRegionState.discountPercent = 0;
    mockSetTrackingContext.mockImplementation(context => ({
      funnelAttemptId: 'attempt_test_123',
      ...context,
    }));
    const experimentResults = new Map<string, Record<string, unknown>>();
    mockUseExperimentArm.mockImplementation(({ experimentKey }: { experimentKey: string }) => {
      const cached = experimentResults.get(experimentKey);
      if (cached) return cached;

      const isModelGate = experimentKey === 'model_gate_purchase_path';
      const armKey = isModelGate ? 'direct_small_pack_control' : 'current_modal_control';
      const result = {
        assignment: {
          experimentKey,
          contextKey: 'global',
          armId: 10,
          armKey,
          armConfig: {},
          assignmentKey: 'session:test',
          surface: 'purchase_modal',
        },
        armKey,
        armConfig: {},
        isLoading: false,
        isFallback: false,
      };
      experimentResults.set(experimentKey, result);
      return result;
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
          experimentKey: 'model_gate_purchase_path',
          experimentArmKey: 'direct_small_pack_control',
        })
      );
    });
    expect(mockUseExperimentArm).toHaveBeenCalledWith(
      expect.objectContaining({
        experimentKey: 'model_gate_purchase_path',
        assignmentScope: 'session',
      })
    );
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

  test('should use purchase-stage semantics without duplicate promotional events', async () => {
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
        'purchase_modal_opened',
        expect.objectContaining({
          trigger: 'insufficient_credits',
          funnelAttemptId: 'attempt_test_123',
          entrySurface: 'insufficient_credits',
          outOfCredits: true,
          requiredCredits: 4,
          currentBalance: 1,
          initialTab: 'credits',
          lockToCredits: false,
        })
      );
    });
    expect(mockTrack).not.toHaveBeenCalledWith('upgrade_prompt_shown', expect.anything());
    expect(mockUseExperimentArm).toHaveBeenCalledWith(
      expect.objectContaining({
        experimentKey: 'insufficient_credits_purchase_path',
        assignmentScope: 'session',
        surface: 'purchase_modal',
      })
    );
  });

  test('recommends the sufficient pack first and reveals larger options on request', async () => {
    mockUseExperimentArm.mockReturnValue({
      assignment: {
        experimentKey: 'insufficient_credits_purchase_path',
        contextKey: 'global',
        armId: 21,
        armKey: 'direct_sufficient_pack',
        armConfig: {},
        assignmentKey: 'session:test',
        surface: 'purchase_modal',
      },
      armKey: 'direct_sufficient_pack',
      armConfig: {},
      isLoading: false,
      isFallback: false,
    });
    render(
      <PurchaseModal
        isOpen={true}
        onClose={vi.fn()}
        onPurchaseComplete={vi.fn()}
        trigger="insufficient_credits"
        outOfCredits={true}
        requiredCredits={30}
        currentBalance={0}
      />
    );

    expect(await screen.findByRole('button', { name: /continue this upscale/i })).toBeVisible();
    expect(screen.queryByText('150')).not.toBeInTheDocument();
    expect(screen.getByText(/after purchase: 50 credits/i)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /see all options/i }));

    expect(screen.getByText('150')).toBeVisible();
  });

  test('shows the exact discounted regional price for the recommended pack', async () => {
    mockRegionState.pricingRegion = 'latam';
    mockRegionState.discountPercent = 50;
    mockUseExperimentArm.mockReturnValue({
      assignment: {
        experimentKey: 'insufficient_credits_purchase_path',
        contextKey: 'global',
        armId: 20,
        armKey: 'sufficient_pack_focus',
        armConfig: {},
        assignmentKey: 'session:test',
        surface: 'purchase_modal',
      },
      armKey: 'sufficient_pack_focus',
      armConfig: {},
      isLoading: false,
      isFallback: false,
    });

    render(
      <PurchaseModal
        isOpen={true}
        onClose={vi.fn()}
        onPurchaseComplete={vi.fn()}
        trigger="insufficient_credits"
        outOfCredits={true}
        requiredCredits={30}
        currentBalance={0}
      />
    );

    expect(await screen.findByText('$2.50')).toBeVisible();
    expect(mockTrack).toHaveBeenCalledWith(
      'purchase_modal_opened',
      expect.objectContaining({
        selectedKey: 'small',
        priceId: 'price_small',
        pricingRegion: 'latam',
        recommendedPriceInCents: 250,
      })
    );
  });

  test('should track purchase CTA and abandonment with the complete ordered-attempt context', async () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <PurchaseModal
        isOpen={true}
        onClose={onClose}
        onPurchaseComplete={vi.fn()}
        trigger="insufficient_credits"
        outOfCredits={true}
        requiredCredits={4}
        currentBalance={1}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: /buy 50 credits/i }));
    expect(mockTrack).toHaveBeenCalledWith(
      'purchase_cta_clicked',
      expect.objectContaining({
        trigger: 'insufficient_credits',
        funnelAttemptId: 'attempt_test_123',
        entrySurface: 'insufficient_credits',
        selectedType: 'credit_pack',
        selectedKey: 'small',
        priceId: 'price_small',
      })
    );
    expect(mockTrack).not.toHaveBeenCalledWith('upgrade_prompt_clicked', expect.anything());

    unmount();
    render(
      <PurchaseModal
        isOpen={true}
        onClose={onClose}
        onPurchaseComplete={vi.fn()}
        trigger="insufficient_credits"
        outOfCredits={true}
        requiredCredits={4}
        currentBalance={1}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'notNow' }));

    expect(mockTrack).toHaveBeenCalledWith(
      'purchase_modal_abandoned',
      expect.objectContaining({
        trigger: 'insufficient_credits',
        funnelAttemptId: 'attempt_test_123',
        entrySurface: 'insufficient_credits',
        selectedType: 'credit_pack',
        selectedKey: 'small',
        priceId: 'price_small',
        checkoutOpened: false,
      })
    );
    expect(mockTrack).toHaveBeenCalledWith(
      'upgrade_prompt_dismissed',
      expect.objectContaining({
        trigger: 'insufficient_credits',
        method: 'close_button',
        funnelAttemptId: 'attempt_test_123',
        entrySurface: 'insufficient_credits',
      })
    );
  });

  test('should preserve the checkout-owning model-gate assignment through auth', async () => {
    const modelGateContext = {
      funnelAttemptId: 'attempt_model_gate_123',
      entrySurface: 'post_download_explore',
      trigger: 'model_gate',
      originatingTrigger: 'post_download_explore',
      attributionChain: ['post_download_explore', 'model_gate'],
      pricingRegion: 'standard',
      discountPercent: 0,
      experimentKey: 'model_gate_purchase_path',
      experimentContextKey: 'global',
      experimentArmId: 20,
      experimentArmKey: 'direct_small_pack_control',
      experimentAssignmentKey: 'session:model-gate',
    };
    mockUserState.isAuthenticated = false;
    mockUserState.user = null;
    mockGetTrackingContext.mockReturnValue(modelGateContext);
    mockSetTrackingContext.mockReturnValue(modelGateContext);

    render(
      <PurchaseModal
        isOpen={true}
        onClose={vi.fn()}
        onPurchaseComplete={vi.fn()}
        trigger="model_gate"
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: /buy 50 credits/i }));

    expect(mockPrepareAuthRedirect).toHaveBeenCalledWith(
      'checkout',
      expect.objectContaining({
        context: expect.objectContaining(modelGateContext),
      })
    );
    expect(mockTrack).toHaveBeenCalledWith(
      'checkout_auth_required',
      expect.objectContaining({
        funnelAttemptId: 'attempt_model_gate_123',
        entrySurface: 'post_download_explore',
        experimentKey: 'model_gate_purchase_path',
        experimentArmKey: 'direct_small_pack_control',
        experimentAssignmentKey: 'session:model-gate',
      })
    );
    expect(mockTrack).not.toHaveBeenCalledWith(
      'checkout_auth_required',
      expect.objectContaining({ experimentKey: 'purchase_modal_default_selection' })
    );
  });

  test('should always render a working close button for zero-credit users', async () => {
    const onClose = vi.fn();
    render(
      <PurchaseModal
        isOpen={true}
        onClose={onClose}
        onPurchaseComplete={vi.fn()}
        trigger="insufficient_credits"
        outOfCredits={true}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'notNow' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockTrack).not.toHaveBeenCalledWith('free_limit_gate_shown', expect.anything());
    expect(mockTrack).not.toHaveBeenCalledWith(
      'free_limit_gate_upgrade_clicked',
      expect.anything()
    );
  });

  test('dismisses immediately regardless of how many times the prompt was dismissed before', async () => {
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
      fireEvent.click(screen.getByRole('button', { name: 'notNow' }));

      expect(onClose).toHaveBeenCalledOnce();
      expect(screen.queryByRole('dialog', { name: /free plan/i })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('preserves all credit packs as the current-modal control baseline', async () => {
    render(
      <PurchaseModal
        isOpen={true}
        onClose={vi.fn()}
        onPurchaseComplete={vi.fn()}
        trigger="workspace"
      />
    );

    expect(await screen.findByText('50')).toBeVisible();
    expect(screen.getByText('150')).toBeVisible();
    expect(screen.getByText('600')).toBeVisible();
    expect(screen.queryByRole('button', { name: /see all options/i })).not.toBeInTheDocument();
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
          visiblePacks: ['small', 'medium'],
          hideSubscriptionsInitially: true,
        },
        assignmentKey: 'session:test',
        surface: 'purchase_modal',
      },
      armKey: 'compact_credit_picker',
      armConfig: {
        defaultType: 'credit_pack',
        defaultKey: 'small',
        visiblePacks: ['small', 'medium'],
        hideSubscriptionsInitially: true,
      },
      isLoading: false,
      isFallback: false,
    });

    render(
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
    expect(screen.getByText('150')).toBeVisible();
    expect(screen.queryByText('600')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /see all options/i }));

    expect(screen.getByText('600')).toBeVisible();
  });
});
