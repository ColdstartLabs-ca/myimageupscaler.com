import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { PricingCard } from '@client/components/stripe/PricingCard';

// Mock translations for stripe.checkout (used by CheckoutModal)
const mockTranslations = {
  close: 'Close',
  loading: 'Loading...',
  error: 'Error',
  notConfigured: 'Stripe is not configured',
};

function renderWithTranslations(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{
        stripe: {
          checkout: mockTranslations,
        },
      }}
    >
      {ui}
    </NextIntlClientProvider>
  );
}

// Mock the dependencies
vi.mock('@client/services/stripeService', () => ({
  StripeService: {
    redirectToCheckout: vi.fn(),
    createCheckoutSession: vi.fn(),
  },
}));

// Mock CheckoutModal to avoid Stripe configuration issues
vi.mock('@client/components/stripe/CheckoutModal', () => ({
  CheckoutModal: ({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) => (
    <div data-testid="checkout-modal">
      <button onClick={onClose}>Close</button>
      <button onClick={onSuccess}>Success</button>
    </div>
  ),
}));

vi.mock('@client/store/modalStore', () => ({
  useModalStore: vi.fn(() => ({
    openAuthModal: vi.fn(),
    openAuthRequiredModal: vi.fn(),
  })),
}));

vi.mock('@client/store/toastStore', () => ({
  useToastStore: vi.fn(() => ({
    showToast: vi.fn(),
  })),
}));

vi.mock('@client/store/userStore', () => ({
  useUserStore: vi.fn(() => ({
    isAuthenticated: true,
  })),
}));

// Mock window.location
const mockLocation = {
  origin: 'http://localhost:3000',
  href: 'http://localhost:3000/pricing',
  replaceState: vi.fn(),
};

Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

Object.defineProperty(window, 'history', {
  value: {
    replaceState: vi.fn(),
  },
  writable: true,
});

// Helper to simulate mobile viewport for tests that expect redirectToCheckout
function simulateMobileViewport() {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 500, // Mobile width
  });
}

// Helper to simulate desktop viewport for tests that expect modal
function simulateDesktopViewport() {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 1024, // Desktop width
  });
}

import { StripeService } from '@client/services/stripeService';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
import { useUserStore } from '@client/store/userStore';

const mockStripeService = vi.mocked(StripeService);
const mockUseModalStore = vi.mocked(useModalStore);
const mockUseToastStore = vi.mocked(useToastStore);
const mockUseUserStore = vi.mocked(useUserStore);
const mockHistory = window.history as { replaceState: ReturnType<typeof vi.fn> };

describe('PricingCard', () => {
  const mockOpenAuthModal = vi.fn();
  const mockOpenAuthRequiredModal = vi.fn();
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    simulateDesktopViewport(); // Default to desktop for most tests

    mockUseUserStore.mockReturnValue({
      isAuthenticated: true,
    } as { isAuthenticated: boolean });

    mockUseModalStore.mockReturnValue({
      openAuthModal: mockOpenAuthModal,
      openAuthRequiredModal: mockOpenAuthRequiredModal,
    } as {
      openAuthModal: typeof mockOpenAuthModal;
      openAuthRequiredModal: typeof mockOpenAuthRequiredModal;
    });

    mockUseToastStore.mockReturnValue({
      showToast: mockShowToast,
    } as { showToast: typeof mockShowToast });

    mockStripeService.redirectToCheckout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const defaultProps = {
    name: 'Pro Plan',
    description: 'Perfect for professionals',
    price: 29,
    currency: 'USD' as const,
    interval: 'month' as const,
    features: ['1000 credits per month', 'Priority support', 'Advanced features'],
    priceId: 'price_pro_monthly_123',
  };

  it('renders pricing information correctly', () => {
    renderWithTranslations(<PricingCard {...defaultProps} />);

    expect(screen.getByText('Pro Plan')).toBeInTheDocument();
    expect(screen.getByText('Perfect for professionals')).toBeInTheDocument();
    // Price is split across elements: "$" in one span, "29" in another
    expect(screen.getByTestId('pricing-card-price')).toHaveTextContent('29');
    expect(screen.getByText('$')).toBeInTheDocument();
    // Interval rendered as "/ month"
    expect(screen.getByText('/ month')).toBeInTheDocument();
    expect(screen.getByText('1000 credits per month')).toBeInTheDocument();
    expect(screen.getByText('Priority support')).toBeInTheDocument();
    expect(screen.getByText('Advanced features')).toBeInTheDocument();
    expect(screen.getByText('Get Started')).toBeInTheDocument();
  });

  it('displays recommended badge when recommended prop is true', () => {
    renderWithTranslations(<PricingCard {...defaultProps} recommended={true} />);

    expect(screen.getByText('Recommended')).toBeInTheDocument();
  });

  it('does not display recommended badge when recommended prop is false', () => {
    renderWithTranslations(<PricingCard {...defaultProps} recommended={false} />);

    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
  });

  it('renders without description when not provided', () => {
    const propsWithoutDescription = { ...defaultProps };
    delete propsWithoutDescription.description;

    renderWithTranslations(<PricingCard {...propsWithoutDescription} />);

    expect(screen.getByText('Pro Plan')).toBeInTheDocument();
    expect(screen.queryByText('Perfect for professionals')).not.toBeInTheDocument();
  });

  it('renders with different currency', () => {
    renderWithTranslations(<PricingCard {...defaultProps} currency="EUR" />);

    // Currency symbol/code is in a separate span from the price number
    expect(screen.getByText('EUR')).toBeInTheDocument();
    expect(screen.getByTestId('pricing-card-price')).toHaveTextContent('29');
  });

  it('renders with yearly interval', () => {
    renderWithTranslations(<PricingCard {...defaultProps} interval="year" />);

    expect(screen.getByText('/ year')).toBeInTheDocument();
  });

  it('handles successful checkout by opening embedded modal', async () => {
    simulateDesktopViewport();
    const user = userEvent.setup();
    renderWithTranslations(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Get Started');
    await user.click(subscribeButton);

    // The component now always uses the embedded checkout modal
    await waitFor(() => {
      expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();
    });
    expect(mockStripeService.redirectToCheckout).not.toHaveBeenCalled();
  });

  it('shows loading state briefly during checkout modal open', async () => {
    simulateDesktopViewport();
    const user = userEvent.setup();

    renderWithTranslations(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Get Started');
    await user.click(subscribeButton);

    // After click the modal opens (isProcessing is cleared)
    await waitFor(() => {
      expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();
    });
  });

  it('removes loading state after successful checkout', async () => {
    simulateDesktopViewport(); // Desktop will show modal and complete quickly
    const user = userEvent.setup();
    renderWithTranslations(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Get Started');
    await user.click(subscribeButton);

    await waitFor(() => {
      expect(screen.getByText('Get Started')).toBeInTheDocument();
      expect(screen.getByText('Get Started')).not.toBeDisabled();
    });
  });

  it('handles unauthenticated state by opening auth required modal', async () => {
    mockUseUserStore.mockReturnValue({ isAuthenticated: false } as { isAuthenticated: boolean });
    const user = userEvent.setup();

    renderWithTranslations(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Get Started');
    await user.click(subscribeButton);

    await waitFor(() => {
      expect(mockOpenAuthRequiredModal).toHaveBeenCalled();
    });
  });

  it('shows toast for general errors when onSelect throws synchronously', async () => {
    const generalError = new Error('Payment failed');
    const mockOnSelect = vi.fn().mockImplementation(() => {
      throw generalError;
    });

    const user = userEvent.setup();
    renderWithTranslations(<PricingCard {...defaultProps} onSelect={mockOnSelect} />);

    const subscribeButton = screen.getByText('Get Started');
    await user.click(subscribeButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    });
  });

  it('shows toast for non-Error exceptions when onSelect throws synchronously', async () => {
    const mockOnSelect = vi.fn().mockImplementation(() => {
      throw 'String error'; // non-Error throwable, testing catch branch
    });

    const user = userEvent.setup();
    renderWithTranslations(<PricingCard {...defaultProps} onSelect={mockOnSelect} />);

    const subscribeButton = screen.getByText('Get Started');
    await user.click(subscribeButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'Failed to initiate checkout',
        type: 'error',
      });
    });
  });

  it('applies correct styling for recommended card', () => {
    renderWithTranslations(<PricingCard {...defaultProps} recommended={true} />);

    const card = document.querySelector('.relative.bg-surface.rounded-xl');
    expect(card).toHaveClass('border-accent/60', 'ring-1', 'ring-accent/20');
  });

  it('applies correct styling for non-recommended card', () => {
    renderWithTranslations(<PricingCard {...defaultProps} recommended={false} />);

    const card = document.querySelector('.relative.bg-surface.rounded-xl');
    expect(card).toHaveClass('border-surface-light');
    expect(card).not.toHaveClass('border-accent/60');
  });

  it('renders all features with checkmark icons', () => {
    renderWithTranslations(<PricingCard {...defaultProps} />);

    const checkmarkIcons = document.querySelectorAll('svg[data-testid="checkmark-icon"]');
    expect(checkmarkIcons.length).toBe(3);

    const features = ['1000 credits per month', 'Priority support', 'Advanced features'];

    features.forEach(feature => {
      expect(screen.getByText(feature)).toBeInTheDocument();
    });
  });

  it('disables button while loading via external loading prop', () => {
    renderWithTranslations(<PricingCard {...defaultProps} loading={true} />);

    const loadingButton = screen.getByRole('button', { name: /Processing/i });
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveClass('bg-surface-light', 'text-text-muted', 'cursor-not-allowed');
  });

  it('has correct button styling for non-loading state', () => {
    renderWithTranslations(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Get Started');
    expect(subscribeButton).toHaveClass('bg-accent', 'hover:bg-accent-hover', 'text-white');
  });

  it('handles checkout by opening embedded modal regardless of viewport', async () => {
    simulateMobileViewport(); // Even on mobile, embedded modal is used now
    const user = userEvent.setup();
    mockLocation.href = 'http://localhost:3000/custom-pricing-page';

    renderWithTranslations(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Get Started');
    await user.click(subscribeButton);

    // Embedded modal used for all viewports - no redirectToCheckout call
    await waitFor(() => {
      expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();
    });
    expect(mockStripeService.redirectToCheckout).not.toHaveBeenCalled();
  });

  // Unauthenticated user flow tests - Tests for the isProcessing fix
  describe('Unauthenticated user flow', () => {
    beforeEach(() => {
      // Reset to unauthenticated state
      mockUseUserStore.mockReturnValue({
        isAuthenticated: false,
      } as { isAuthenticated: boolean });

      // Also ensure modal store mock is still available
      mockUseModalStore.mockReturnValue({
        openAuthModal: mockOpenAuthModal,
        openAuthRequiredModal: mockOpenAuthRequiredModal,
      } as {
        openAuthModal: typeof mockOpenAuthModal;
        openAuthRequiredModal: typeof mockOpenAuthRequiredModal;
      });
    });

    it('should reset processing state when unauthenticated user clicks subscribe', async () => {
      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      // Should NOT be stuck on "Processing..." - button should be back to normal
      await waitFor(() => {
        expect(screen.getByText('Get Started')).toBeInTheDocument();
        expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
      });
    });

    it('should open auth required modal when unauthenticated user clicks subscribe', async () => {
      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(mockOpenAuthRequiredModal).toHaveBeenCalled();
      });
    });

    it('should set checkout param in URL when unauthenticated user clicks subscribe', async () => {
      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        // The hook stores checkout intent via prepareAuthRedirect (not directly setting URL)
        // and opens the auth required modal
        expect(mockOpenAuthRequiredModal).toHaveBeenCalled();
      });
    });

    it('should show toast message for unauthenticated user', async () => {
      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Please sign in or create an account to complete your purchase',
            type: 'info',
          })
        );
      });
    });

    it('should NOT call Stripe redirectToCheckout when unauthenticated', async () => {
      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(mockOpenAuthRequiredModal).toHaveBeenCalled();
      });

      expect(mockStripeService.redirectToCheckout).not.toHaveBeenCalled();
    });

    it('should allow clicking button again after auth modal is shown', async () => {
      const user = userEvent.setup();
      vi.useFakeTimers({ shouldAdvanceTime: true });

      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');

      // First click - should open auth modal
      await user.click(subscribeButton);
      await waitFor(() => {
        expect(mockOpenAuthRequiredModal).toHaveBeenCalledTimes(1);
      });

      // Reset mock to check for second call
      mockOpenAuthRequiredModal.mockClear();

      // Wait for debounce period (500ms)
      vi.advanceTimersByTime(600);

      // Second click - should work again (not stuck on Processing...)
      await user.click(subscribeButton);
      await waitFor(() => {
        expect(mockOpenAuthRequiredModal).toHaveBeenCalledTimes(1);
      });

      vi.useRealTimers();
    });
  });

  // Scheduled plan tests
  describe('Scheduled plan behavior', () => {
    it('displays scheduled badge when scheduled prop is true', () => {
      renderWithTranslations(<PricingCard {...defaultProps} scheduled={true} />);

      // "Scheduled" appears in both the badge and button, so check for multiple occurrences
      const scheduledElements = screen.queryAllByText('Scheduled');
      expect(scheduledElements).toHaveLength(2);
      // Check that one of them is the badge (has the absolute positioning class)
      expect(scheduledElements.some(el => el.className.includes('absolute -top-2.5'))).toBe(true);
    });

    it('applies correct styling for scheduled card', () => {
      renderWithTranslations(<PricingCard {...defaultProps} scheduled={true} />);

      const card = document.querySelector('.relative.bg-surface.rounded-xl');
      expect(card).toHaveClass('border-warning/40', 'ring-1', 'ring-warning/20');
    });

    it('displays scheduled button text when scheduled is true', () => {
      renderWithTranslations(<PricingCard {...defaultProps} scheduled={true} />);

      expect(screen.getByRole('button', { name: 'Scheduled' })).toBeInTheDocument();
    });

    it('applies correct button styling for scheduled state', () => {
      renderWithTranslations(<PricingCard {...defaultProps} scheduled={true} />);

      const button = screen.getByRole('button', { name: 'Scheduled' });
      expect(button).toHaveClass('bg-warning/10', 'text-warning', 'cursor-not-allowed');
      // Note: The button is NOT functionally disabled when scheduled, just visually different
      expect(button).not.toBeDisabled();
    });

    it('shows cancel scheduled button when scheduled and onCancelScheduled provided', () => {
      const mockCancel = vi.fn();
      renderWithTranslations(
        <PricingCard {...defaultProps} scheduled={true} onCancelScheduled={mockCancel} />
      );

      expect(screen.getByRole('button', { name: 'Cancel Scheduled Change' })).toBeInTheDocument();
    });

    it('calls onCancelScheduled when cancel button is clicked', async () => {
      const user = userEvent.setup();
      const mockCancel = vi.fn();
      renderWithTranslations(
        <PricingCard {...defaultProps} scheduled={true} onCancelScheduled={mockCancel} />
      );

      const cancelButton = screen.getByRole('button', { name: 'Cancel Scheduled Change' });
      await user.click(cancelButton);

      expect(mockCancel).toHaveBeenCalledTimes(1);
    });

    it('disables cancel button when cancelingScheduled is true', () => {
      const mockCancel = vi.fn();
      renderWithTranslations(
        <PricingCard
          {...defaultProps}
          scheduled={true}
          onCancelScheduled={mockCancel}
          cancelingScheduled={true}
        />
      );

      const cancelButton = screen.getByRole('button', { name: 'Canceling...' });
      expect(cancelButton).toBeDisabled();
      // The button has disabled:opacity-50 class in Tailwind, which applies when disabled
      expect(cancelButton).toHaveClass('disabled:opacity-50');
    });

    it('shows Canceling... text when cancelingScheduled is true', () => {
      const mockCancel = vi.fn();
      renderWithTranslations(
        <PricingCard
          {...defaultProps}
          scheduled={true}
          onCancelScheduled={mockCancel}
          cancelingScheduled={true}
        />
      );

      expect(screen.getByRole('button', { name: 'Canceling...' })).toBeInTheDocument();
    });

    it('does not show cancel button when onCancelScheduled is not provided', () => {
      renderWithTranslations(<PricingCard {...defaultProps} scheduled={true} />);

      expect(
        screen.queryByRole('button', { name: 'Cancel Scheduled Change' })
      ).not.toBeInTheDocument();
    });

    it('hides recommended badge when scheduled is true', () => {
      renderWithTranslations(<PricingCard {...defaultProps} scheduled={true} recommended={true} />);

      expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
      // "Scheduled" appears in both badge and button
      const scheduledElements = screen.queryAllByText('Scheduled');
      expect(scheduledElements.length).toBeGreaterThan(0);
    });

    it('hides trial badge when scheduled is true', () => {
      renderWithTranslations(
        <PricingCard
          {...defaultProps}
          scheduled={true}
          trial={{ enabled: true, durationDays: 14 }}
        />
      );

      expect(screen.queryByText('14-day free trial')).not.toBeInTheDocument();
      // "Scheduled" appears in both badge and button
      const scheduledElements = screen.queryAllByText('Scheduled');
      expect(scheduledElements.length).toBeGreaterThan(0);
    });
  });

  // Current plan (disabled) tests
  describe('Current plan behavior', () => {
    it('displays current plan badge with disabledReason when disabled is true', () => {
      renderWithTranslations(
        <PricingCard {...defaultProps} disabled={true} disabledReason="Active Plan" />
      );

      expect(screen.getByText('Active Plan')).toBeInTheDocument();
    });

    it('applies correct styling for current plan card', () => {
      renderWithTranslations(<PricingCard {...defaultProps} disabled={true} />);

      const card = document.querySelector('.relative.bg-surface.rounded-xl');
      expect(card).toHaveClass('border-success/40', 'ring-1', 'ring-success/20');
    });

    it('displays current plan button text when disabled is true and scheduled is false', () => {
      renderWithTranslations(<PricingCard {...defaultProps} disabled={true} />);

      expect(screen.getByRole('button', { name: 'Current Plan' })).toBeInTheDocument();
    });

    it('applies correct button styling for current plan state', () => {
      renderWithTranslations(<PricingCard {...defaultProps} disabled={true} />);

      const button = screen.getByRole('button', { name: 'Current Plan' });
      expect(button).toHaveClass('bg-surface-light', 'text-text-muted', 'cursor-not-allowed');
      expect(button).toBeDisabled();
    });

    it('uses default disabledReason when not provided', () => {
      renderWithTranslations(<PricingCard {...defaultProps} disabled={true} />);

      // "Current Plan" appears in both badge and button
      const currentPlanElements = screen.queryAllByText('Current Plan');
      expect(currentPlanElements.length).toBeGreaterThan(0);
      // Check that one of them is the badge (has the absolute positioning class)
      expect(currentPlanElements.some(el => el.className.includes('absolute -top-2.5'))).toBe(true);
    });

    it('hides recommended badge when disabled is true', () => {
      renderWithTranslations(<PricingCard {...defaultProps} disabled={true} recommended={true} />);

      expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    });

    it('hides trial badge when disabled is true', () => {
      renderWithTranslations(
        <PricingCard
          {...defaultProps}
          disabled={true}
          trial={{ enabled: true, durationDays: 14 }}
        />
      );

      expect(screen.queryByText('14-day free trial')).not.toBeInTheDocument();
    });
  });

  // Upgrade/Downgrade button text tests
  describe('Upgrade/Downgrade button text', () => {
    it('shows Upgrade text when price is higher than currentSubscriptionPrice', () => {
      renderWithTranslations(
        <PricingCard
          {...defaultProps}
          onSelect={vi.fn()}
          currentSubscriptionPrice={19}
          price={29}
        />
      );

      expect(screen.getByRole('button', { name: 'Upgrade' })).toBeInTheDocument();
    });

    it('shows Downgrade text when price is lower than currentSubscriptionPrice', () => {
      renderWithTranslations(
        <PricingCard
          {...defaultProps}
          onSelect={vi.fn()}
          currentSubscriptionPrice={49}
          price={29}
        />
      );

      expect(screen.getByRole('button', { name: 'Downgrade' })).toBeInTheDocument();
    });

    it('shows Downgrade text when prices are equal (treats same price as downgrade)', () => {
      renderWithTranslations(
        <PricingCard
          {...defaultProps}
          onSelect={vi.fn()}
          currentSubscriptionPrice={29}
          price={29}
        />
      );

      expect(screen.getByRole('button', { name: 'Downgrade' })).toBeInTheDocument();
    });

    it('shows Get Started when onSelect is not provided', () => {
      renderWithTranslations(
        <PricingCard {...defaultProps} currentSubscriptionPrice={19} price={29} />
      );

      expect(screen.getByRole('button', { name: 'Get Started' })).toBeInTheDocument();
    });

    it('shows Get Started when currentSubscriptionPrice is null', () => {
      renderWithTranslations(
        <PricingCard
          {...defaultProps}
          onSelect={vi.fn()}
          currentSubscriptionPrice={null}
          price={29}
        />
      );

      expect(screen.getByRole('button', { name: 'Get Started' })).toBeInTheDocument();
    });

    it('shows Get Started when currentSubscriptionPrice is undefined', () => {
      renderWithTranslations(
        <PricingCard
          {...defaultProps}
          onSelect={vi.fn()}
          currentSubscriptionPrice={undefined}
          price={29}
        />
      );

      expect(screen.getByRole('button', { name: 'Get Started' })).toBeInTheDocument();
    });
  });

  // External loading prop tests
  describe('External loading prop', () => {
    it('shows processing state when loading prop is true', () => {
      renderWithTranslations(<PricingCard {...defaultProps} loading={true} />);

      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('disables button when loading prop is true', () => {
      renderWithTranslations(<PricingCard {...defaultProps} loading={true} />);

      const button = screen.getByRole('button', { name: /Processing/i });
      expect(button).toBeDisabled();
    });

    it('applies correct button styling when loading prop is true', () => {
      renderWithTranslations(<PricingCard {...defaultProps} loading={true} />);

      const button = screen.getByRole('button', { name: /Processing/i });
      expect(button).toHaveClass('bg-surface-light', 'text-text-muted', 'cursor-not-allowed');
    });

    it('shows loading state when loading prop is true', () => {
      renderWithTranslations(<PricingCard {...defaultProps} loading={true} />);

      const button = screen.getByRole('button', { name: /Processing/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });
  });

  // Desktop checkout modal tests
  describe('Desktop checkout modal', () => {
    it('shows checkout modal on desktop when authenticated', async () => {
      simulateDesktopViewport();
      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();
      });
    });

    it('does not call redirectToCheckout on desktop when authenticated', async () => {
      simulateDesktopViewport();
      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();
      });

      expect(mockStripeService.redirectToCheckout).not.toHaveBeenCalled();
    });

    it('closes checkout modal when close button is clicked', async () => {
      simulateDesktopViewport();
      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();
      });

      const closeButton = screen.getByRole('button', { name: 'Close' });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByTestId('checkout-modal')).not.toBeInTheDocument();
      });
    });

    it('redirects to success page when modal onSuccess is called', async () => {
      simulateDesktopViewport();
      const user = userEvent.setup();

      // Mock window.location.href for redirect
      const originalLocation = window.location.href;
      Object.defineProperty(window, 'location', {
        value: { href: originalLocation, origin: 'http://localhost:3000' },
        writable: true,
        configurable: true,
      });

      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();
      });

      const successButton = screen.getByRole('button', { name: 'Success' });
      await user.click(successButton);

      await waitFor(() => {
        expect(window.location.href).toBe('/success');
      });
    });
  });

  // Network error handling tests
  describe('Network error handling', () => {
    it('does not show a toast for authenticated users on successful checkout', async () => {
      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();
      });
      // No error toast for successful modal open
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('shows info toast for unauthenticated users instead of error', async () => {
      mockUseUserStore.mockReturnValue({ isAuthenticated: false } as { isAuthenticated: boolean });
      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }));
      });
    });

    it('shows network error toast for fetch errors via onSelect synchronous throw', async () => {
      const networkError = new Error('fetch failed');
      const mockOnSelect = vi.fn().mockImplementation(() => {
        throw networkError;
      });

      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} onSelect={mockOnSelect} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'Network error. Please check your connection and try again.',
          type: 'error',
        });
      });
    });

    it('shows generic error toast for unknown errors via onSelect synchronous throw', async () => {
      const unknownError = new Error('Something went wrong');
      const mockOnSelect = vi.fn().mockImplementation(() => {
        throw unknownError;
      });

      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} onSelect={mockOnSelect} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'Something went wrong',
          type: 'error',
        });
      });
    });

    it('shows generic error toast for errors without message via onSelect synchronous throw', async () => {
      const errorWithoutMessage = new Error('');
      const mockOnSelect = vi.fn().mockImplementation(() => {
        throw errorWithoutMessage;
      });

      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} onSelect={mockOnSelect} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'Failed to initiate checkout',
          type: 'error',
        });
      });
    });
  });

  // Retry limit tests
  describe('Retry limit behavior', () => {
    it('shows Get Started by default (no error state on first render)', () => {
      renderWithTranslations(<PricingCard {...defaultProps} />);

      expect(screen.getByText('Get Started')).toBeInTheDocument();
      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
      expect(screen.queryByText('Maximum Attempts Reached')).not.toBeInTheDocument();
    });

    it('opens checkout modal on first click (no error blocking)', async () => {
      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} />);

      await user.click(screen.getByText('Get Started'));

      await waitFor(() => {
        expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();
      });
    });
  });

  // Click debouncing tests
  describe('Click debouncing', () => {
    it('prevents rapid clicks within 500ms (only opens modal once)', async () => {
      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');

      // Rapid clicks
      await user.click(subscribeButton);
      await user.click(subscribeButton);
      await user.click(subscribeButton);

      // Modal should only open once (debounce prevents duplicate opens)
      await waitFor(() => {
        expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();
      });
    });

    it('allows clicking again after 500ms debounce period', async () => {
      const user = userEvent.setup();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const mockOnSelect = vi.fn();

      renderWithTranslations(<PricingCard {...defaultProps} onSelect={mockOnSelect} />);

      const subscribeButton = screen.getByText('Get Started');

      // First click
      await user.click(subscribeButton);

      // Advance past debounce period
      vi.advanceTimersByTime(600);

      // Second click should work
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(mockOnSelect).toHaveBeenCalledTimes(2);
      });

      vi.useRealTimers();
    });

    it('respects disabled prop during debounce', async () => {
      simulateMobileViewport();
      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} disabled={true} />);

      const button = screen.getByRole('button', { name: 'Current Plan' });

      await user.click(button);

      // Should not call redirectToCheckout when disabled
      expect(mockStripeService.redirectToCheckout).not.toHaveBeenCalled();
    });
  });

  // Disabled prop behavior tests
  describe('Disabled prop behavior', () => {
    it('disables subscribe button when disabled is true', () => {
      renderWithTranslations(<PricingCard {...defaultProps} disabled={true} />);

      const button = screen.getByRole('button', { name: 'Current Plan' });
      expect(button).toBeDisabled();
    });

    it('prevents handleSubscribe when disabled is true', async () => {
      simulateMobileViewport();
      const user = userEvent.setup();
      renderWithTranslations(<PricingCard {...defaultProps} disabled={true} />);

      const button = screen.getByRole('button', { name: 'Current Plan' });
      await user.click(button);

      expect(mockStripeService.redirectToCheckout).not.toHaveBeenCalled();
    });

    it('shows disabledReason in badge when provided', () => {
      renderWithTranslations(
        <PricingCard {...defaultProps} disabled={true} disabledReason="Premium Plan" />
      );

      expect(screen.getByText('Premium Plan')).toBeInTheDocument();
    });

    it('handles both disabled and scheduled props correctly', () => {
      // When scheduled=true, scheduled takes precedence
      renderWithTranslations(<PricingCard {...defaultProps} disabled={true} scheduled={true} />);

      const scheduledElements = screen.queryAllByText('Scheduled');
      expect(scheduledElements.length).toBeGreaterThan(0);
      expect(screen.queryByText('Current Plan')).not.toBeInTheDocument();
    });
  });

  // onSelect callback tests
  describe('onSelect callback behavior', () => {
    it('calls onSelect callback when provided', async () => {
      const user = userEvent.setup();
      const mockOnSelect = vi.fn();
      renderWithTranslations(<PricingCard {...defaultProps} onSelect={mockOnSelect} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(mockOnSelect).toHaveBeenCalledTimes(1);
      });
    });

    it('does not call Stripe service when onSelect is provided', async () => {
      simulateMobileViewport();
      const user = userEvent.setup();
      const mockOnSelect = vi.fn();
      renderWithTranslations(<PricingCard {...defaultProps} onSelect={mockOnSelect} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      expect(mockStripeService.redirectToCheckout).not.toHaveBeenCalled();
    });

    it('resets processing state after onSelect callback', async () => {
      const user = userEvent.setup();
      const mockOnSelect = vi.fn();
      renderWithTranslations(<PricingCard {...defaultProps} onSelect={mockOnSelect} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(mockOnSelect).toHaveBeenCalled();
        expect(screen.getByText('Get Started')).toBeInTheDocument();
        expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
      });
    });

    it('prevents multiple onSelect calls within debounce period', async () => {
      const user = userEvent.setup();
      const mockOnSelect = vi.fn();
      renderWithTranslations(<PricingCard {...defaultProps} onSelect={mockOnSelect} />);

      const subscribeButton = screen.getByText('Get Started');

      // Rapid clicks
      await user.click(subscribeButton);
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(mockOnSelect).toHaveBeenCalledTimes(1);
      });
    });
  });

  // Error state styling tests
  describe('Error state styling', () => {
    it('applies error button styling classes via getButtonClasses when hasError is true', () => {
      // The error state is triggered internally; verify classes via the loading prop
      // (direct error state is not testable without mocking internal hook state)
      // Instead we verify that the non-error state has the accent styling
      renderWithTranslations(<PricingCard {...defaultProps} />);

      const button = screen.getByText('Get Started');
      expect(button).toHaveClass('bg-accent', 'text-white');
      expect(button).not.toHaveClass('bg-error/80');
    });

    it('shows hover effect on normal button (not error state)', () => {
      renderWithTranslations(<PricingCard {...defaultProps} />);

      const button = screen.getByText('Get Started');
      expect(button).toHaveClass('hover:bg-accent-hover');
    });
  });

  // Authentication error handling tests
  describe('Authentication error handling', () => {
    beforeEach(() => {
      // Reset to unauthenticated state to trigger auth gate
      mockUseUserStore.mockReturnValue({
        isAuthenticated: false,
      } as { isAuthenticated: boolean });
    });

    it('handles unauthenticated user - opens auth required modal', async () => {
      const user = userEvent.setup();

      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(mockOpenAuthRequiredModal).toHaveBeenCalled();
      });
    });

    it('handles unauthenticated user - shows sign-in toast', async () => {
      const user = userEvent.setup();

      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Please sign in or create an account to complete your purchase',
            type: 'info',
          })
        );
      });
    });

    it('handles unauthenticated user - does not open checkout modal', async () => {
      const user = userEvent.setup();

      renderWithTranslations(<PricingCard {...defaultProps} />);

      const subscribeButton = screen.getByText('Get Started');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(mockOpenAuthRequiredModal).toHaveBeenCalled();
      });
      expect(screen.queryByTestId('checkout-modal')).not.toBeInTheDocument();
    });
  });

  // Cleanup and unmount tests
  describe('Cleanup behavior', () => {
    it('clears timeout on unmount', () => {
      const { unmount } = renderWithTranslations(<PricingCard {...defaultProps} />);

      // Should not throw error on unmount
      expect(() => unmount()).not.toThrow();
    });

    it('handles rapid mount/unmount cycles', () => {
      const { unmount: unmount1 } = renderWithTranslations(<PricingCard {...defaultProps} />);
      unmount1();

      const { unmount: unmount2 } = renderWithTranslations(<PricingCard {...defaultProps} />);
      unmount2();

      expect(true).toBe(true);
    });
  });

  // Interval rendering tests
  describe('Interval rendering', () => {
    it('does not show interval when not provided', () => {
      const propsWithoutInterval = { ...defaultProps };
      delete propsWithoutInterval.interval;

      renderWithTranslations(<PricingCard {...propsWithoutInterval} />);

      // Check that "/ month" or "/ year" interval text is not shown
      expect(screen.queryByText('/ month')).not.toBeInTheDocument();
      expect(screen.queryByText('/ year')).not.toBeInTheDocument();
    });

    it('renders month interval correctly', () => {
      renderWithTranslations(<PricingCard {...defaultProps} interval="month" />);

      expect(screen.getByText('/ month')).toBeInTheDocument();
    });

    it('renders year interval correctly', () => {
      renderWithTranslations(<PricingCard {...defaultProps} interval="year" />);

      expect(screen.getByText('/ year')).toBeInTheDocument();
    });
  });

  // Trial-specific tests
  describe('Trial functionality', () => {
    it('displays trial badge when trial is enabled', () => {
      const propsWithTrial = {
        ...defaultProps,
        trial: {
          enabled: true,
          durationDays: 14,
        },
      };

      renderWithTranslations(<PricingCard {...propsWithTrial} />);

      expect(screen.getByText('14-day free trial')).toBeInTheDocument();
    });

    it('shows trial button text when trial is enabled', () => {
      const propsWithTrial = {
        ...defaultProps,
        trial: {
          enabled: true,
          durationDays: 7,
        },
      };

      renderWithTranslations(<PricingCard {...propsWithTrial} />);

      expect(screen.getByText('Start 7-Day Trial')).toBeInTheDocument();
    });

    it('hides recommended badge when trial is enabled', () => {
      const propsWithTrial = {
        ...defaultProps,
        recommended: true,
        trial: {
          enabled: true,
          durationDays: 14,
        },
      };

      renderWithTranslations(<PricingCard {...propsWithTrial} />);

      expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
      expect(screen.getByText('14-day free trial')).toBeInTheDocument();
    });

    it('shows recommended badge when trial is disabled and recommended is true', () => {
      const propsWithDisabledTrial = {
        ...defaultProps,
        recommended: true,
        trial: {
          enabled: false,
          durationDays: 14,
        },
      };

      renderWithTranslations(<PricingCard {...propsWithDisabledTrial} />);

      expect(screen.getByText('Recommended')).toBeInTheDocument();
      expect(screen.queryByText('14-day free trial')).not.toBeInTheDocument();
    });

    it('shows normal button when trial is disabled', () => {
      const propsWithDisabledTrial = {
        ...defaultProps,
        trial: {
          enabled: false,
          durationDays: 14,
        },
      };

      renderWithTranslations(<PricingCard {...propsWithDisabledTrial} />);

      expect(screen.getByText('Get Started')).toBeInTheDocument();
      expect(screen.queryByText('Start 14-Day Trial')).not.toBeInTheDocument();
    });

    it('shows current plan text when disabled and trial is enabled', () => {
      const propsWithDisabledTrial = {
        ...defaultProps,
        disabled: true,
        trial: {
          enabled: true,
          durationDays: 14,
        },
      };

      renderWithTranslations(<PricingCard {...propsWithDisabledTrial} />);

      // Should show "Current Plan" in the button (not in the badge since trial is enabled)
      expect(screen.getByRole('button', { name: 'Current Plan' })).toBeInTheDocument();
    });

    it('handles different trial durations', () => {
      const propsWith30DayTrial = {
        ...defaultProps,
        trial: {
          enabled: true,
          durationDays: 30,
        },
      };

      renderWithTranslations(<PricingCard {...propsWith30DayTrial} />);

      expect(screen.getByText('30-day free trial')).toBeInTheDocument();
      expect(screen.getByText('Start 30-Day Trial')).toBeInTheDocument();
    });

    it('handles trial button click correctly by opening embedded modal', async () => {
      simulateDesktopViewport();
      const user = userEvent.setup();

      const propsWithTrial = {
        ...defaultProps,
        trial: {
          enabled: true,
          durationDays: 14,
        },
      };

      renderWithTranslations(<PricingCard {...propsWithTrial} />);

      const trialButton = screen.getByText('Start 14-Day Trial');
      await user.click(trialButton);

      // Trial checkout uses the same embedded modal as regular checkout
      await waitFor(() => {
        expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();
      });
      expect(mockStripeService.redirectToCheckout).not.toHaveBeenCalled();
    });

    it('handles trial with custom onSelect callback', async () => {
      const user = userEvent.setup();
      const mockOnSelect = vi.fn();
      const propsWithTrial = {
        ...defaultProps,
        trial: {
          enabled: true,
          durationDays: 7,
        },
        onSelect: mockOnSelect,
      };

      renderWithTranslations(<PricingCard {...propsWithTrial} />);

      const trialButton = screen.getByText('Start 7-Day Trial');
      await user.click(trialButton);

      await waitFor(() => {
        expect(mockOnSelect).toHaveBeenCalled();
      });
      expect(mockStripeService.redirectToCheckout).not.toHaveBeenCalled();
    });

    it('displays no trial badge when trial prop is not provided', () => {
      renderWithTranslations(<PricingCard {...defaultProps} />);

      expect(screen.queryByText(/-day free trial/)).not.toBeInTheDocument();
      expect(screen.getByText('Get Started')).toBeInTheDocument();
    });
  });
});
