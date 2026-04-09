/**
 * ANCHOR TESTS for CheckoutModal
 *
 * These tests lock in the current behavior BEFORE the refactoring described in
 * docs/PRDs/checkout-modal-refactor.md. Every test here must remain green throughout
 * the refactor. If a test breaks, a behavioral regression occurred.
 *
 * Coverage:
 * - Modal rendering (loading / error / embed states)
 * - Close behaviors (button, escape key, backdrop click)
 * - Analytics events (step_viewed, exit_intent, abandoned, error, step_time)
 * - Body scroll lock / restore
 * - Stripe session creation params
 * - Error handling & retry
 * - Rescue offer flow (show, claim, dismiss)
 * - Exit survey flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks (must run before any imports)
// ---------------------------------------------------------------------------

const {
  mockTrack,
  mockCreateCheckoutSession,
  mockCreateRescueOffer,
  mockClearCache,
  mockShowToast,
  mockGetStoredOffer,
  mockStoreOffer,
  mockClearStoredOffer,
  mockShouldShowRescueOffer,
  mockShouldShowExitSurvey,
  mockMarkExitSurveyShown,
  mockGetTrackingContext,
  mockIsRescueEligible,
} = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockCreateCheckoutSession: vi.fn(),
  mockCreateRescueOffer: vi.fn(),
  mockClearCache: vi.fn(),
  mockShowToast: vi.fn(),
  mockGetStoredOffer: vi.fn().mockReturnValue(null),
  mockStoreOffer: vi.fn(),
  mockClearStoredOffer: vi.fn(),
  mockShouldShowRescueOffer: vi.fn().mockReturnValue(false),
  mockShouldShowExitSurvey: vi.fn().mockReturnValue(false),
  mockMarkExitSurveyShown: vi.fn(),
  mockGetTrackingContext: vi.fn().mockReturnValue(null),
  mockIsRescueEligible: vi.fn().mockReturnValue(false),
}));

// Stripe
vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockReturnValue(Promise.resolve({})),
}));

vi.mock('@stripe/react-stripe-js', () => ({
  EmbeddedCheckoutProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'stripe-provider' }, children),
  EmbeddedCheckout: () => React.createElement('div', { 'data-testid': 'stripe-embed' }),
}));

// Config / env
vi.mock('@shared/config/env', () => ({
  clientEnv: {
    STRIPE_PUBLISHABLE_KEY: 'pk_test_mock_key',
  },
}));

vi.mock('@shared/config/stripe', () => ({
  STRIPE_PRICES: {
    STARTER_MONTHLY: 'price_starter',
    HOBBY_MONTHLY: 'price_hobby',
    PRO_MONTHLY: 'price_pro',
    BUSINESS_MONTHLY: 'price_business',
  },
  determinePlanFromPriceId: vi.fn((priceId: string) => {
    const map: Record<string, string> = {
      price_starter: 'starter',
      price_hobby: 'hobby',
      price_pro: 'pro',
      price_business: 'business',
    };
    return map[priceId] ?? 'hobby';
  }),
}));

vi.mock('@client/utils/detectDeviceType', () => ({
  detectDeviceType: vi.fn().mockReturnValue('desktop'),
}));

vi.mock('@shared/config/checkout-rescue-offer', () => ({
  isCheckoutRescueOfferEligiblePrice: mockIsRescueEligible,
}));

// Services
vi.mock('@client/services/stripeService', () => ({
  StripeService: {
    createCheckoutSession: mockCreateCheckoutSession,
    createCheckoutRescueOffer: mockCreateRescueOffer,
  },
  clearCheckoutSessionCache: mockClearCache,
}));

// Analytics
vi.mock('@client/analytics', () => ({
  analytics: { track: mockTrack, isEnabled: () => true },
}));

// Stores
vi.mock('@client/store/toastStore', () => ({
  useToastStore: () => ({ showToast: mockShowToast }),
}));

// Hooks
vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({
    pricingRegion: 'standard',
    banditArmId: null,
    isLoading: false,
  }),
}));

// Utils
vi.mock('@client/utils/checkoutRescueOfferStorage', () => ({
  getStoredCheckoutRescueOffer: mockGetStoredOffer,
  storeCheckoutRescueOffer: mockStoreOffer,
  clearStoredCheckoutRescueOffer: mockClearStoredOffer,
}));

vi.mock('@client/utils/checkoutRescueOfferVisibility', () => ({
  shouldShowCheckoutRescueOffer: mockShouldShowRescueOffer,
}));

vi.mock('@client/utils/checkoutTrackingContext', () => ({
  getCheckoutTrackingContext: mockGetTrackingContext,
}));

// Child components — thin stubs so we can assert when they appear
vi.mock('@client/components/stripe/CheckoutExitSurvey', () => ({
  CheckoutExitSurvey: ({
    onClose,
    priceId,
  }: {
    onClose: () => void;
    priceId: string;
    timeSpentMs: number;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'exit-survey', 'data-price-id': priceId },
      React.createElement(
        'button',
        { onClick: onClose, 'data-testid': 'survey-close' },
        'Close survey'
      )
    ),
  shouldShowExitSurvey: mockShouldShowExitSurvey,
  markExitSurveyShown: mockMarkExitSurveyShown,
}));

vi.mock('@client/components/stripe/CheckoutRescueOffer', () => ({
  CheckoutRescueOffer: ({
    onClaim,
    onDismiss,
  }: {
    offer: unknown;
    isApplying: boolean;
    onClaim: () => void;
    onDismiss: () => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'rescue-offer' },
      React.createElement(
        'button',
        { onClick: onClaim, 'data-testid': 'rescue-claim' },
        'Claim offer'
      ),
      React.createElement(
        'button',
        { onClick: onDismiss, 'data-testid': 'rescue-dismiss' },
        'Dismiss offer'
      )
    ),
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

import { CheckoutModal } from '@client/components/stripe/CheckoutModal';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRICE_ID = 'price_pro';

const SUCCESS_RESPONSE = {
  clientSecret: 'cs_test_secret',
  checkoutOfferApplied: false,
  engagementDiscountApplied: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal(props: Partial<React.ComponentProps<typeof CheckoutModal>> = {}) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const result = render(
    React.createElement(CheckoutModal, {
      priceId: PRICE_ID,
      onClose,
      onSuccess,
      ...props,
    })
  );
  return { onClose, onSuccess, ...result };
}

/** Flush all pending promises and React state updates */
async function flush() {
  await act(async () => {
    await new Promise(r => setTimeout(r, 0));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CheckoutModal — anchor tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCheckoutSession.mockResolvedValue(SUCCESS_RESPONSE);
    mockGetStoredOffer.mockReturnValue(null);
    mockShouldShowRescueOffer.mockReturnValue(false);
    mockShouldShowExitSurvey.mockReturnValue(false);
    mockGetTrackingContext.mockReturnValue(null);
    mockIsRescueEligible.mockReturnValue(false);
    document.body.style.overflow = '';
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  describe('rendering', () => {
    it('should render backdrop with data-modal="checkout"', () => {
      renderModal();
      expect(document.querySelector('[data-modal="checkout"]')).toBeTruthy();
    });

    it('should show loading spinner on initial mount', () => {
      // Never resolves — keeps loading state visible
      mockCreateCheckoutSession.mockReturnValue(new Promise(() => {}));
      renderModal();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should render the Stripe embed after session creation succeeds', async () => {
      renderModal();
      await flush();
      await waitFor(() => expect(screen.getByTestId('stripe-embed')).toBeInTheDocument());
    });

    it('should not show loading spinner after session succeeds', async () => {
      renderModal();
      await flush();
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    });

    it('should show error heading when session creation fails', async () => {
      mockCreateCheckoutSession.mockRejectedValue(new Error('Network error'));
      renderModal();
      await flush();
      await waitFor(() => expect(screen.getByText('Error')).toBeInTheDocument());
    });

    it('should show error message text when session creation fails', async () => {
      mockCreateCheckoutSession.mockRejectedValue(new Error('Network error'));
      renderModal();
      await flush();
      await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
    });

    it('should show "Manage subscription" link for ALREADY_SUBSCRIBED error', async () => {
      const err = Object.assign(new Error('Already subscribed'), { code: 'ALREADY_SUBSCRIBED' });
      mockCreateCheckoutSession.mockRejectedValue(err);
      renderModal();
      await flush();
      await waitFor(() => expect(screen.getByText('Manage subscription')).toBeInTheDocument());
    });

    it('should show "Try again" button for generic errors', async () => {
      mockCreateCheckoutSession.mockRejectedValue(new Error('timeout'));
      renderModal();
      await flush();
      await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument());
    });

    it('should render accessible close button', () => {
      renderModal();
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Timer-dependent rendering (isolated with fake timers)
  // -------------------------------------------------------------------------

  describe('timer-dependent rendering', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should show slow-loading message after 2 seconds', async () => {
      mockCreateCheckoutSession.mockReturnValue(new Promise(() => {}));
      renderModal();
      expect(screen.queryByText('This is taking longer than usual...')).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(2100);
      });

      expect(screen.getByText('This is taking longer than usual...')).toBeInTheDocument();
    });

    it('should track checkout_step_time every 5 seconds', async () => {
      renderModal();
      await act(async () => {
        vi.advanceTimersByTime(5100);
      });
      expect(mockTrack).toHaveBeenCalledWith(
        'checkout_step_time',
        expect.objectContaining({ priceId: PRICE_ID })
      );
    });

    it('should track checkout_step_time with expected shape', async () => {
      renderModal();
      await act(async () => {
        vi.advanceTimersByTime(5100);
      });
      const call = mockTrack.mock.calls.find(c => c[0] === 'checkout_step_time');
      expect(call?.[1]).toMatchObject({
        priceId: PRICE_ID,
        step: expect.any(String),
        timeSpentMs: expect.any(Number),
        cumulativeTimeMs: expect.any(Number),
      });
    });
  });

  // -------------------------------------------------------------------------
  // Body scroll lock
  // -------------------------------------------------------------------------

  describe('body scroll lock', () => {
    it('should set body overflow to hidden on mount', () => {
      renderModal();
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should restore original body overflow on unmount', () => {
      document.body.style.overflow = 'scroll';
      const { unmount } = renderModal();
      expect(document.body.style.overflow).toBe('hidden');
      unmount();
      expect(document.body.style.overflow).toBe('scroll');
    });
  });

  // -------------------------------------------------------------------------
  // Close behaviors
  // -------------------------------------------------------------------------

  describe('close behaviors', () => {
    it('should call onClose when close button is clicked', async () => {
      const { onClose } = renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when Escape key is pressed', async () => {
      const { onClose } = renderModal();
      fireEvent.keyDown(window, { key: 'Escape' });
      await flush();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when backdrop is clicked directly', async () => {
      const { onClose } = renderModal();
      const backdrop = document.querySelector('[data-modal="checkout"]') as HTMLElement;
      fireEvent.click(backdrop, { target: backdrop });
      await flush();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should NOT close when inner modal card is clicked', async () => {
      const { onClose } = renderModal();
      const inner = document.querySelector('[data-modal="checkout"] > div') as HTMLElement;
      fireEvent.click(inner);
      await flush();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('should remove keydown event listener on unmount', () => {
      const spy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderModal();
      unmount();
      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });
  });

  // -------------------------------------------------------------------------
  // Session creation
  // -------------------------------------------------------------------------

  describe('session creation', () => {
    it('should call createCheckoutSession with the priceId', async () => {
      renderModal();
      await flush();
      await waitFor(() =>
        expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
          PRICE_ID,
          expect.objectContaining({ uiMode: 'embedded' })
        )
      );
    });

    it('should retry session when "Try again" is clicked', async () => {
      mockCreateCheckoutSession
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue(SUCCESS_RESPONSE);
      renderModal();
      await flush();
      await waitFor(() => screen.getByText('Try again'));
      fireEvent.click(screen.getByText('Try again'));
      await flush();
      await waitFor(() => expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(2));
    });

    it('should clear session cache when retrying', async () => {
      mockCreateCheckoutSession.mockRejectedValue(new Error('fail'));
      renderModal();
      await flush();
      await waitFor(() => screen.getByText('Try again'));
      fireEvent.click(screen.getByText('Try again'));
      expect(mockClearCache).toHaveBeenCalled();
    });

    it('should clear error state after successful retry', async () => {
      mockCreateCheckoutSession
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue(SUCCESS_RESPONSE);
      renderModal();
      await flush();
      await waitFor(() => screen.getByText('Try again'));
      fireEvent.click(screen.getByText('Try again'));
      await flush();
      await waitFor(() => expect(screen.queryByText('Error')).not.toBeInTheDocument());
    });
  });

  // -------------------------------------------------------------------------
  // Analytics
  // -------------------------------------------------------------------------

  describe('analytics', () => {
    it('should track checkout_step_viewed with plan_selection on mount', () => {
      renderModal();
      expect(mockTrack).toHaveBeenCalledWith(
        'checkout_step_viewed',
        expect.objectContaining({ step: 'plan_selection', priceId: PRICE_ID })
      );
    });

    it('should include deviceType in checkout_step_viewed', () => {
      renderModal();
      expect(mockTrack).toHaveBeenCalledWith(
        'checkout_step_viewed',
        expect.objectContaining({
          deviceType: expect.stringMatching(/^(mobile|desktop|tablet)$/),
        })
      );
    });

    it('should include purchaseType in checkout_step_viewed', () => {
      renderModal();
      expect(mockTrack).toHaveBeenCalledWith(
        'checkout_step_viewed',
        expect.objectContaining({ purchaseType: 'subscription' })
      );
    });

    it('should track checkout_step_viewed with stripe_embed after session resolves', async () => {
      renderModal();
      await flush();
      await waitFor(() =>
        expect(mockTrack).toHaveBeenCalledWith(
          'checkout_step_viewed',
          expect.objectContaining({ step: 'stripe_embed', priceId: PRICE_ID })
        )
      );
    });

    it('should track checkout_exit_intent on close', async () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(mockTrack).toHaveBeenCalledWith(
        'checkout_exit_intent',
        expect.objectContaining({ priceId: PRICE_ID })
      );
    });

    it('should include method="close_button" in exit_intent for close button click', async () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(mockTrack).toHaveBeenCalledWith(
        'checkout_exit_intent',
        expect.objectContaining({ method: 'close_button' })
      );
    });

    it('should include method="escape_key" in exit_intent for Escape press', async () => {
      renderModal();
      fireEvent.keyDown(window, { key: 'Escape' });
      await flush();
      expect(mockTrack).toHaveBeenCalledWith(
        'checkout_exit_intent',
        expect.objectContaining({ method: 'escape_key' })
      );
    });

    it('should track checkout_abandoned on close', async () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(mockTrack).toHaveBeenCalledWith(
        'checkout_abandoned',
        expect.objectContaining({ priceId: PRICE_ID })
      );
    });

    it('should track checkout_error on session failure', async () => {
      mockCreateCheckoutSession.mockRejectedValue(new Error('some error'));
      renderModal();
      await flush();
      await waitFor(() =>
        expect(mockTrack).toHaveBeenCalledWith(
          'checkout_error',
          expect.objectContaining({ errorType: 'network_error', priceId: PRICE_ID })
        )
      );
    });

    it('should sanitize card numbers in checkout_error errorMessage', async () => {
      mockCreateCheckoutSession.mockRejectedValue(new Error('Card 4242424242424242 declined'));
      renderModal();
      await flush();
      await waitFor(() => {
        const call = mockTrack.mock.calls.find(c => c[0] === 'checkout_error');
        expect(call?.[1].errorMessage).not.toContain('4242424242424242');
        expect(call?.[1].errorMessage).toContain('[CARD]');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Rescue offer flow
  // -------------------------------------------------------------------------

  describe('rescue offer flow', () => {
    const mockOffer = {
      offerToken: 'tok_rescue_123',
      priceId: PRICE_ID,
      discountPercent: 20,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };

    beforeEach(() => {
      mockIsRescueEligible.mockReturnValue(true);
      mockShouldShowRescueOffer.mockReturnValue(true);
    });

    it('should show rescue offer on close when a stored offer exists', async () => {
      mockGetStoredOffer.mockReturnValue(mockOffer);
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(screen.getByTestId('rescue-offer')).toBeInTheDocument();
    });

    it('should NOT call onClose when showing rescue offer', async () => {
      mockGetStoredOffer.mockReturnValue(mockOffer);
      const { onClose } = renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(screen.getByTestId('rescue-offer')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('should call createCheckoutRescueOffer when no stored offer exists', async () => {
      mockGetStoredOffer.mockReturnValue(null);
      mockCreateRescueOffer.mockResolvedValue(mockOffer);
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      await waitFor(() => expect(mockCreateRescueOffer).toHaveBeenCalledWith(PRICE_ID));
    });

    it('should store the newly created rescue offer', async () => {
      mockGetStoredOffer.mockReturnValue(null);
      mockCreateRescueOffer.mockResolvedValue(mockOffer);
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      await waitFor(() => expect(mockStoreOffer).toHaveBeenCalledWith(mockOffer));
    });

    it('should fall through and close when rescue offer API call fails', async () => {
      mockGetStoredOffer.mockReturnValue(null);
      mockCreateRescueOffer.mockRejectedValue(new Error('API error'));
      const { onClose } = renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when rescue offer is dismissed', async () => {
      mockGetStoredOffer.mockReturnValue(mockOffer);
      const { onClose } = renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(screen.getByTestId('rescue-offer')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('rescue-dismiss'));
      await flush();
      expect(onClose).toHaveBeenCalled();
    });

    it('should create a new session with the offer token when claim is clicked', async () => {
      mockGetStoredOffer.mockReturnValue(mockOffer);
      renderModal();
      await flush();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(screen.getByTestId('rescue-offer')).toBeInTheDocument();
      mockCreateCheckoutSession.mockClear();
      fireEvent.click(screen.getByTestId('rescue-claim'));
      await flush();
      await waitFor(() =>
        expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
          PRICE_ID,
          expect.objectContaining({ offerToken: mockOffer.offerToken })
        )
      );
    });

    it('should track exit_intent when rescue offer is shown', async () => {
      mockGetStoredOffer.mockReturnValue(mockOffer);
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(screen.getByTestId('rescue-offer')).toBeInTheDocument();
      expect(mockTrack).toHaveBeenCalledWith(
        'checkout_exit_intent',
        expect.objectContaining({ priceId: PRICE_ID })
      );
    });

    it('should dismiss rescue offer and close on second ESC', async () => {
      mockGetStoredOffer.mockReturnValue(mockOffer);
      const { onClose } = renderModal();
      fireEvent.keyDown(window, { key: 'Escape' });
      await flush();
      expect(screen.getByTestId('rescue-offer')).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'Escape' });
      await flush();
      expect(onClose).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Exit survey flow
  // -------------------------------------------------------------------------

  describe('exit survey flow', () => {
    beforeEach(() => {
      mockIsRescueEligible.mockReturnValue(false);
      mockShouldShowRescueOffer.mockReturnValue(false);
      mockShouldShowExitSurvey.mockReturnValue(true);
    });

    it('should show exit survey when shouldShowExitSurvey returns true', async () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(screen.getByTestId('exit-survey')).toBeInTheDocument();
    });

    it('should pass the priceId to the exit survey', async () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(screen.getByTestId('exit-survey')).toHaveAttribute('data-price-id', PRICE_ID);
    });

    it('should call markExitSurveyShown when survey is displayed', async () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(mockMarkExitSurveyShown).toHaveBeenCalled();
    });

    it('should NOT call onClose immediately when showing survey', async () => {
      const { onClose } = renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(screen.getByTestId('exit-survey')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('should call onClose when survey close callback fires', async () => {
      const { onClose } = renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await flush();
      expect(screen.getByTestId('exit-survey')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('survey-close'));
      await flush();
      expect(onClose).toHaveBeenCalled();
    });

    it('should dismiss survey and close when ESC pressed while survey is visible', async () => {
      const { onClose } = renderModal();
      fireEvent.keyDown(window, { key: 'Escape' });
      await flush();
      expect(screen.getByTestId('exit-survey')).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'Escape' });
      await flush();
      expect(onClose).toHaveBeenCalled();
      expect(screen.queryByTestId('exit-survey')).not.toBeInTheDocument();
    });
  });
});
