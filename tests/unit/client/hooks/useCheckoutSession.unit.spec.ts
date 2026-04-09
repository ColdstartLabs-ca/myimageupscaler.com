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
  mockTrackStepViewed,
  mockTrackError,
  mockOnComplete,
} = vi.hoisted(() => ({
  mockCreateCheckoutSession: vi.fn(),
  mockClearCache: vi.fn(),
  mockShowToast: vi.fn(),
  mockGetStoredOffer: vi.fn().mockReturnValue(null),
  mockGetTrackingContext: vi.fn().mockReturnValue(null),
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCheckoutSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCheckoutSession.mockResolvedValue(SUCCESS_RESPONSE);
    mockGetStoredOffer.mockReturnValue(null);
    mockGetTrackingContext.mockReturnValue(null);
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
});
