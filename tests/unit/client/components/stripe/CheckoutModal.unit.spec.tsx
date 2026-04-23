/**
 * Unit tests for CheckoutModal — GA4 purchase tracking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks (must run before any imports)
// ---------------------------------------------------------------------------

const {
  mockTrack,
  mockGaSendEvent,
  mockCreateCheckoutSession,
  mockCreateRescueOffer,
  mockClearCache,
  mockGetStoredOffer,
  mockShouldShowRescueOffer,
  mockShouldShowExitSurvey,
  mockMarkExitSurveyShown,
  mockGetTrackingContext,
  mockIsRescueEligible,
  capturedOnComplete,
} = vi.hoisted(() => {
  const capturedOnComplete = { current: null as (() => void) | null };
  return {
    mockTrack: vi.fn(),
    mockGaSendEvent: vi.fn(),
    mockCreateCheckoutSession: vi.fn(),
    mockCreateRescueOffer: vi.fn(),
    mockClearCache: vi.fn(),
    mockGetStoredOffer: vi.fn().mockReturnValue(null),
    mockShouldShowRescueOffer: vi.fn().mockReturnValue(false),
    mockShouldShowExitSurvey: vi.fn().mockReturnValue(false),
    mockMarkExitSurveyShown: vi.fn(),
    mockGetTrackingContext: vi.fn().mockReturnValue(null),
    mockIsRescueEligible: vi.fn().mockReturnValue(false),
    capturedOnComplete,
  };
});

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

// Analytics — Amplitude
vi.mock('@client/analytics', () => ({
  analytics: { track: mockTrack, isEnabled: () => true },
}));

// Analytics — GA4
vi.mock('@client/components/analytics/GoogleAnalytics', () => ({
  gaSendEvent: mockGaSendEvent,
}));

// Stores
vi.mock('@client/store/toastStore', () => ({
  useToastStore: () => ({ showToast: vi.fn() }),
}));

// Hooks
vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({
    pricingRegion: 'standard',
    banditArmId: null,
    isLoading: false,
  }),
}));

vi.mock('@client/hooks/useModalBehavior', () => ({
  useModalBehavior: vi.fn(),
}));

vi.mock('@client/hooks/useCheckoutAnalytics', () => ({
  useCheckoutAnalytics: () => ({
    trackStepViewed: vi.fn(),
    trackExitIntent: vi.fn(),
    trackCheckoutAbandoned: vi.fn(),
    trackError: vi.fn(),
    markCompleted: vi.fn(),
    resetLoadStart: vi.fn(),
    checkoutCompletedRef: { current: false },
    exitIntentTrackedRef: { current: false },
    currentStepRef: { current: 'plan_selection' },
    loadStartRef: { current: Date.now() },
    modalOpenedAtRef: { current: Date.now() },
  }),
}));

vi.mock('@client/hooks/useCheckoutRescueOffer', () => ({
  useCheckoutRescueOffer: () => ({
    showRescueOffer: false,
    rescueOffer: null,
    appliedOfferToken: null,
    tryShowRescueOffer: vi.fn().mockResolvedValue(false),
    claimOffer: vi.fn(),
    dismissOffer: vi.fn(),
    clearOffer: vi.fn(),
    hideRescueOffer: vi.fn(),
  }),
}));

// Mock useCheckoutSession to capture the onComplete callback so tests can
// trigger checkout completion without a real Stripe embed.
vi.mock('@client/hooks/useCheckoutSession', () => ({
  stripePromise: Promise.resolve({}),
  useCheckoutSession: (params: { onComplete: () => void }) => {
    capturedOnComplete.current = params.onComplete;
    return {
      clientSecret: 'cs_test_secret',
      loading: false,
      slowLoading: false,
      error: null,
      errorCode: null,
      applyingRescueOffer: false,
      rescueOfferAppliedRef: { current: false },
      engagementDiscountAppliedRef: { current: false },
      retry: vi.fn(),
      stripeOptions: {
        clientSecret: 'cs_test_secret',
        onComplete: params.onComplete,
      },
    };
  },
}));

// Utils
vi.mock('@client/utils/checkoutRescueOfferStorage', () => ({
  getStoredCheckoutRescueOffer: mockGetStoredOffer,
  storeCheckoutRescueOffer: vi.fn(),
  clearStoredCheckoutRescueOffer: vi.fn(),
}));

vi.mock('@client/utils/checkoutRescueOfferVisibility', () => ({
  shouldShowCheckoutRescueOffer: mockShouldShowRescueOffer,
}));

vi.mock('@client/utils/checkoutTrackingContext', () => ({
  getCheckoutTrackingContext: mockGetTrackingContext,
}));

// Child components — thin stubs
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
      React.createElement('button', { onClick: onClose, 'data-testid': 'survey-close' }, 'Close survey')
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
      React.createElement('button', { onClick: onClaim, 'data-testid': 'rescue-claim' }, 'Claim offer'),
      React.createElement('button', { onClick: onDismiss, 'data-testid': 'rescue-dismiss' }, 'Dismiss offer')
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

async function flush() {
  await act(async () => {
    await new Promise(r => setTimeout(r, 0));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CheckoutModal — GA4 purchase tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnComplete.current = null;
    mockGetStoredOffer.mockReturnValue(null);
    mockShouldShowRescueOffer.mockReturnValue(false);
    mockShouldShowExitSurvey.mockReturnValue(false);
    mockGetTrackingContext.mockReturnValue(null);
    mockIsRescueEligible.mockReturnValue(false);
    document.body.style.overflow = '';
  });

  it('should call gaSendEvent with purchase on checkout complete', async () => {
    renderModal();
    await flush();

    expect(capturedOnComplete.current).toBeTypeOf('function');

    await act(async () => {
      capturedOnComplete.current!();
    });

    expect(mockGaSendEvent).toHaveBeenCalledTimes(1);
    expect(mockGaSendEvent).toHaveBeenCalledWith('purchase', 'checkout', PRICE_ID);
  });
});
