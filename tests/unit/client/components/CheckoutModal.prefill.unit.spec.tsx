/**
 * Tests for CheckoutModal prefillPlanId behavior.
 *
 * When prefillPlanId is set the modal was opened from the model_gate direct
 * checkout shortcut.  The Stripe embed should load immediately (no plan picker)
 * and a "Change plan" escape hatch must be visible.
 *
 * When prefillPlanId is NOT set the modal behaves as before — no "Change plan"
 * UI is shown.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockTrack,
  mockCreateCheckoutSession,
  mockGetStoredOffer,
  mockShouldShowRescueOffer,
  mockShouldShowExitSurvey,
  mockGetTrackingContext,
  mockIsRescueEligible,
} = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockCreateCheckoutSession: vi.fn(),
  mockGetStoredOffer: vi.fn().mockReturnValue(null),
  mockShouldShowRescueOffer: vi.fn().mockReturnValue(false),
  mockShouldShowExitSurvey: vi.fn().mockReturnValue(false),
  mockGetTrackingContext: vi.fn().mockReturnValue(null),
  mockIsRescueEligible: vi.fn().mockReturnValue(false),
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockReturnValue(Promise.resolve({})),
}));

vi.mock('@stripe/react-stripe-js', () => ({
  EmbeddedCheckoutProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'stripe-provider' }, children),
  EmbeddedCheckout: () => React.createElement('div', { 'data-testid': 'stripe-embed' }),
}));

vi.mock('@shared/config/env', () => ({
  clientEnv: { STRIPE_PUBLISHABLE_KEY: 'pk_test_mock' },
}));

vi.mock('@shared/config/stripe', () => ({
  STRIPE_PRICES: {},
  determinePlanFromPriceId: vi.fn().mockReturnValue('hobby'),
}));

vi.mock('@client/utils/detectDeviceType', () => ({
  detectDeviceType: vi.fn().mockReturnValue('desktop'),
}));

vi.mock('@shared/config/checkout-rescue-offer', () => ({
  isCheckoutRescueOfferEligiblePrice: mockIsRescueEligible,
}));

vi.mock('@client/services/stripeService', () => ({
  StripeService: {
    createCheckoutSession: mockCreateCheckoutSession,
    createCheckoutRescueOffer: vi.fn(),
  },
  clearCheckoutSessionCache: vi.fn(),
}));

vi.mock('@client/analytics', () => ({
  analytics: {
    track: mockTrack,
    isEnabled: () => true,
    getDeviceId: () => null,
    getAmplitudeSessionId: () => null,
  },
}));

vi.mock('@client/store/toastStore', () => ({
  useToastStore: () => ({ showToast: vi.fn() }),
}));

vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({ pricingRegion: 'standard', banditArmId: null, isLoading: false }),
}));

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

vi.mock('@client/components/stripe/CheckoutExitSurvey', () => ({
  CheckoutExitSurvey: () => null,
  shouldShowExitSurvey: mockShouldShowExitSurvey,
  markExitSurveyShown: vi.fn(),
}));

vi.mock('@client/components/stripe/CheckoutRescueOffer', () => ({
  CheckoutRescueOffer: () => null,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      close: 'Close',
      loading: 'Loading...',
      error: 'Error',
      slowLoading: 'Still loading...',
      notConfigured: 'Not configured',
    };
    return map[key] ?? key;
  },
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { CheckoutModal } from '@client/components/stripe/CheckoutModal';

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const PRICE_ID = 'price_test_hobby';

const SUCCESS_RESPONSE = {
  clientSecret: 'cs_test_secret',
  checkoutOfferApplied: false,
  engagementDiscountApplied: false,
};

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CheckoutModal — prefillPlanId behavior', () => {
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

  describe('should skip plan picker when prefillPlanId is set', () => {
    it('shows the "Change plan" escape hatch', () => {
      renderModal({ prefillPlanId: PRICE_ID });
      expect(screen.getByTestId('change-plan-bar')).toBeInTheDocument();
    });

    it('"Change plan" link is rendered and accessible', () => {
      renderModal({ prefillPlanId: PRICE_ID });
      const link = screen.getByTestId('change-plan-link');
      expect(link).toBeInTheDocument();
      expect(link.tagName).toBe('BUTTON');
    });

    it('"Change plan" link text contains "Change plan"', () => {
      renderModal({ prefillPlanId: PRICE_ID });
      expect(screen.getByTestId('change-plan-link').textContent).toContain('Change plan');
    });

    it('does NOT show a plan picker section', () => {
      renderModal({ prefillPlanId: PRICE_ID });
      expect(screen.queryByTestId('plan-picker')).not.toBeInTheDocument();
    });

    it('immediately initiates a checkout session for the provided priceId', async () => {
      renderModal({ prefillPlanId: PRICE_ID });
      await waitFor(
        () =>
          expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
            PRICE_ID,
            expect.objectContaining({ uiMode: 'embedded' })
          ),
        { timeout: 3000 }
      );
    });
  });

  describe('should show plan picker when prefillPlanId is not set', () => {
    it('does NOT render the "Change plan" bar when prefillPlanId is absent', () => {
      renderModal();
      expect(screen.queryByTestId('change-plan-bar')).not.toBeInTheDocument();
    });

    it('does NOT render the "Change plan" link when prefillPlanId is undefined', () => {
      renderModal({ prefillPlanId: undefined });
      expect(screen.queryByTestId('change-plan-link')).not.toBeInTheDocument();
    });

    it('still initiates a checkout session for the priceId', async () => {
      renderModal();
      await waitFor(
        () =>
          expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
            PRICE_ID,
            expect.objectContaining({ uiMode: 'embedded' })
          ),
        { timeout: 3000 }
      );
    });
  });
});
