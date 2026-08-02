import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Hoisted mocks (must run before any imports)
// ---------------------------------------------------------------------------

const {
  mockCreateCheckoutSession,
  mockClearCache,
  mockShowToast,
  mockGetStoredOffer,
  mockGetTrackingContext,
  mockSetTrackingContext,
  mockTrack,
  mockTrackStepViewed,
  mockTrackError,
  mockOnComplete,
} = vi.hoisted(() => ({
  mockCreateCheckoutSession: vi.fn(),
  mockClearCache: vi.fn(),
  mockShowToast: vi.fn(),
  mockGetStoredOffer: vi.fn().mockReturnValue(null),
  mockGetTrackingContext: vi.fn().mockReturnValue(null),
  mockSetTrackingContext: vi.fn(),
  mockTrack: vi.fn(),
  mockTrackStepViewed: vi.fn(),
  mockTrackError: vi.fn(),
  mockOnComplete: vi.fn(),
}));

// Stripe
vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockReturnValue(Promise.resolve({})),
}));

// Config / env
vi.mock('@shared/config/env', () => ({
  clientEnv: {
    STRIPE_PUBLISHABLE_KEY: 'pk_test_mock_key',
  },
}));

// Services
vi.mock('@client/services/stripeService', () => ({
  StripeService: {
    createCheckoutSession: mockCreateCheckoutSession,
  },
  clearCheckoutSessionCache: mockClearCache,
}));

// Stores
vi.mock('@client/store/toastStore', () => ({
  useToastStore: () => ({ showToast: mockShowToast }),
}));

// Utils
vi.mock('@client/utils/checkoutRescueOfferStorage', () => ({
  getStoredCheckoutRescueOffer: mockGetStoredOffer,
}));

vi.mock('@client/utils/checkoutTrackingContext', () => ({
  getCheckoutTrackingContext: mockGetTrackingContext,
  setCheckoutTrackingContext: mockSetTrackingContext,
  getCheckoutFunnelMetadata: vi.fn(() => ({})),
}));

vi.mock('@client/analytics', () => ({
  analytics: {
    track: mockTrack,
    getDeviceId: () => null,
    getAmplitudeSessionId: () => null,
  },
}));

// next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      close: 'Close',
      loading: 'Loading...',
      error: 'Error',
      slowLoading: 'This is taking longer than usual...',
      notConfigured: 'Stripe is not configured',
    };
    return map[key] ?? key;
  },
}));

// ---------------------------------------------------------------------------
// Import under test (after all mocks are in place)
// ---------------------------------------------------------------------------

import { useCheckoutSession } from '@client/hooks/useCheckoutSession';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const PRICE_ID = 'price_pro';

const SUCCESS_RESPONSE = {
  clientSecret: 'cs_test_secret',
  checkoutOfferApplied: false,
  engagementDiscountApplied: false,
};

function buildParams(overrides: Partial<Parameters<typeof useCheckoutSession>[0]> = {}) {
  return {
    priceId: PRICE_ID,
    banditArmId: null,
    regionLoading: false,
    appliedOfferToken: null,
    trackStepViewed: mockTrackStepViewed,
    trackError: mockTrackError,
    onComplete: mockOnComplete,
    isAuthenticated: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCheckoutSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    mockCreateCheckoutSession.mockResolvedValue(SUCCESS_RESPONSE);
    mockGetStoredOffer.mockReturnValue(null);
    mockGetTrackingContext.mockReturnValue(null);
    mockSetTrackingContext.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Session creation
  // -------------------------------------------------------------------------

  it('should set clientSecret on successful session creation', async () => {
    const { result } = renderHook(() => useCheckoutSession(buildParams()));

    await waitFor(() => {
      expect(result.current.clientSecret).toBe('cs_test_secret');
    });
  });

  it('should set error when session creation fails', async () => {
    mockCreateCheckoutSession.mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() => useCheckoutSession(buildParams()));

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });

  it('retries without auto top-up when eligibility changes during checkout', async () => {
    const ineligibleError = Object.assign(new Error('Auto top-up is not available'), {
      code: 'AUTO_TOP_UP_NOT_ELIGIBLE',
    });
    mockCreateCheckoutSession
      .mockRejectedValueOnce(ineligibleError)
      .mockResolvedValueOnce(SUCCESS_RESPONSE);

    const { result } = renderHook(() =>
      useCheckoutSession(buildParams({ autoTopUp: { enabled: true, thresholdCredits: 25 } }))
    );

    await waitFor(() => expect(result.current.clientSecret).toBe('cs_test_secret'));
    expect(mockCreateCheckoutSession).toHaveBeenNthCalledWith(
      1,
      PRICE_ID,
      expect.objectContaining({ autoTopUp: { enabled: true, thresholdCredits: 25 } })
    );
    expect(mockCreateCheckoutSession).toHaveBeenNthCalledWith(
      2,
      PRICE_ID,
      expect.not.objectContaining({ autoTopUp: expect.anything() })
    );
  });

  it('should track stripe_embed step_viewed with load time on success', async () => {
    const { result } = renderHook(() => useCheckoutSession(buildParams()));

    await waitFor(() => {
      expect(result.current.clientSecret).toBe('cs_test_secret');
    });

    expect(mockTrackStepViewed).toHaveBeenCalledWith('stripe_embed', expect.any(Number));
  });

  it('should set stripeOptions.clientSecret when session is ready', async () => {
    const { result } = renderHook(() => useCheckoutSession(buildParams()));

    await waitFor(() => {
      expect(result.current.stripeOptions.clientSecret).toBe('cs_test_secret');
    });
  });

  it('passes model-gate attribution through checkout session metadata', async () => {
    mockGetTrackingContext.mockReturnValue({
      funnelAttemptId: 'fa_checkout_123',
      entrySurface: 'post_download_explore',
      trigger: 'model_gate',
      originatingModel: 'hd-upscale',
      originatingTrigger: 'post_download_explore',
      attributionChain: ['post_download_explore', 'model_gate'],
      pricingRegion: 'standard',
      discountPercent: 0,
      experimentKey: 'model_gate_purchase_path',
      experimentContextKey: 'global',
      experimentArmId: 20,
      experimentArmKey: 'direct_small_pack_control',
      experimentAssignmentKey: 'session:model-gate',
    });

    renderHook(() => useCheckoutSession(buildParams({ banditArmId: 42 })));

    await waitFor(() => {
      expect(mockCreateCheckoutSession).toHaveBeenCalled();
    });

    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      PRICE_ID,
      expect.objectContaining({
        uiMode: 'embedded',
        metadata: expect.objectContaining({
          funnel_attempt_id: 'fa_checkout_123',
          entry_surface: 'post_download_explore',
          checkout_trigger: 'model_gate',
          checkout_originating_model: 'hd-upscale',
          checkout_originating_trigger: 'post_download_explore',
          checkout_attribution_chain: 'post_download_explore,model_gate',
          exp_key: 'model_gate_purchase_path',
          exp_ctx: 'global',
          exp_arm_id: '20',
          exp_arm_key: 'direct_small_pack_control',
          exp_assign_key: 'session:model-gate',
          checkout_ui_mode: 'embedded',
          checkout_authenticated: 'true',
          bandit_arm_id: '42',
        }),
      })
    );
    expect(mockTrack).toHaveBeenCalledWith(
      'checkout_session_requested',
      expect.objectContaining({
        funnelAttemptId: 'fa_checkout_123',
        entrySurface: 'post_download_explore',
        experimentKey: 'model_gate_purchase_path',
        experimentArmKey: 'direct_small_pack_control',
      })
    );
  });

  it('does not create a second session when hosted checkout has no URL', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    mockCreateCheckoutSession.mockResolvedValueOnce({ url: '' });

    const { result } = renderHook(() => useCheckoutSession(buildParams()));

    await waitFor(() =>
      expect(result.current.error).toBe('No hosted checkout URL returned from checkout session')
    );

    expect(mockCreateCheckoutSession).toHaveBeenNthCalledWith(
      1,
      PRICE_ID,
      expect.objectContaining({ uiMode: 'hosted' })
    );
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith(
      'checkout_error',
      expect.objectContaining({
        failurePoint: 'hosted_checkout_url_missing',
      })
    );
  });

  it('tracks embedded checkout session creation with authentication and attribution context', async () => {
    mockGetTrackingContext.mockReturnValue({
      trigger: 'model_gate',
      originatingModel: 'hd-upscale',
      originatingTrigger: 'post_download_explore',
      attributionChain: ['post_download_explore', 'model_gate'],
    });

    const { result } = renderHook(() =>
      useCheckoutSession(buildParams({ isAuthenticated: false }))
    );

    await waitFor(() => {
      expect(result.current.clientSecret).toBe('cs_test_secret');
    });

    expect(mockTrack).toHaveBeenCalledWith(
      'checkout_session_created',
      expect.objectContaining({
        priceId: PRICE_ID,
        uiMode: 'embedded',
        isAuthenticated: false,
        trigger: 'model_gate',
        originatingModel: 'hd-upscale',
        originatingTrigger: 'post_download_explore',
        attributionChain: ['post_download_explore', 'model_gate'],
      })
    );
  });

  // -------------------------------------------------------------------------
  // Slow loading timer
  // -------------------------------------------------------------------------

  it('should set slowLoading after 2 seconds of loading', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    // Never resolves — keeps loading state
    mockCreateCheckoutSession.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useCheckoutSession(buildParams()));

    expect(result.current.slowLoading).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    expect(result.current.slowLoading).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Timeout
  // -------------------------------------------------------------------------

  it('should set error on 30s timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    // Never resolves
    mockCreateCheckoutSession.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useCheckoutSession(buildParams()));

    await act(async () => {
      vi.advanceTimersByTime(30100);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('should call trackError on timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    // Never resolves
    mockCreateCheckoutSession.mockReturnValue(new Promise(() => {}));

    renderHook(() => useCheckoutSession(buildParams()));

    await act(async () => {
      vi.advanceTimersByTime(30100);
    });

    expect(mockTrackError).toHaveBeenCalledWith(
      'network_error',
      expect.any(String),
      'plan_selection'
    );
  });

  // -------------------------------------------------------------------------
  // Retry
  // -------------------------------------------------------------------------

  it('should re-create session when retry() is called', async () => {
    mockCreateCheckoutSession
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue(SUCCESS_RESPONSE);

    const { result } = renderHook(() => useCheckoutSession(buildParams()));

    // Wait for first (failed) attempt
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    // Trigger retry
    act(() => {
      result.current.retry();
    });

    // Wait for second (successful) attempt
    await waitFor(() => {
      expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(2);
    });
  });

  it('preserves the first checkout context and offer across a prop-change retry', async () => {
    const firstContext = {
      funnelAttemptId: 'fa_retry_stable_123',
      entrySurface: 'purchase_modal',
      trigger: 'purchase_modal',
      experimentKey: 'purchase_modal_default_selection',
      experimentContextKey: 'global',
      experimentArmId: 10,
      experimentArmKey: 'control',
      experimentAssignmentKey: 'session:stable',
    };
    mockGetTrackingContext.mockReturnValue(firstContext);
    mockCreateCheckoutSession
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValueOnce(SUCCESS_RESPONSE);

    const { result, rerender } = renderHook(
      ({ offerToken }: { offerToken: string }) =>
        useCheckoutSession(buildParams({ appliedOfferToken: offerToken })),
      { initialProps: { offerToken: 'offer_initial' } }
    );

    await waitFor(() => expect(result.current.error).toBeTruthy());
    mockGetTrackingContext.mockReturnValue({
      ...firstContext,
      funnelAttemptId: 'fa_changed_456',
      experimentAssignmentKey: 'session:changed',
    });

    rerender({ offerToken: 'offer_changed' });
    await waitFor(() => expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(2));

    expect(mockCreateCheckoutSession.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        offerToken: 'offer_initial',
        metadata: expect.objectContaining({
          funnel_attempt_id: 'fa_retry_stable_123',
          exp_assign_key: 'session:stable',
        }),
      })
    );
  });
});
