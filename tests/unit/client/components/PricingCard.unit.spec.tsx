import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PricingCard } from '@client/components/stripe/PricingCard';

// Mock the dependencies
vi.mock('@client/services/stripeService', () => ({
  StripeService: {
    redirectToCheckout: vi.fn(),
  },
}));

vi.mock('@client/store/modalStore', () => ({
  useModalStore: vi.fn(() => ({
    openAuthModal: vi.fn(),
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
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseUserStore.mockReturnValue({
      isAuthenticated: true,
    } as { isAuthenticated: boolean });

    mockUseModalStore.mockReturnValue({
      openAuthModal: mockOpenAuthModal,
    } as { openAuthModal: typeof mockOpenAuthModal });

    mockUseToastStore.mockReturnValue({
      showToast: mockShowToast,
    } as { showToast: typeof mockShowToast });

    mockStripeService.redirectToCheckout.mockResolvedValue(undefined);
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
    render(<PricingCard {...defaultProps} />);

    expect(screen.getByText('Pro Plan')).toBeInTheDocument();
    expect(screen.getByText('Perfect for professionals')).toBeInTheDocument();
    expect(screen.getByText('$29')).toBeInTheDocument();
    expect(screen.getByText('per month')).toBeInTheDocument();
    expect(screen.getByText('1000 credits per month')).toBeInTheDocument();
    expect(screen.getByText('Priority support')).toBeInTheDocument();
    expect(screen.getByText('Advanced features')).toBeInTheDocument();
    expect(screen.getByText('Get Started')).toBeInTheDocument();
  });

  it('displays recommended badge when recommended prop is true', () => {
    render(<PricingCard {...defaultProps} recommended={true} />);

    expect(screen.getByText('Recommended')).toBeInTheDocument();
  });

  it('does not display recommended badge when recommended prop is false', () => {
    render(<PricingCard {...defaultProps} recommended={false} />);

    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
  });

  it('renders without description when not provided', () => {
    const propsWithoutDescription = { ...defaultProps };
    delete propsWithoutDescription.description;

    render(<PricingCard {...propsWithoutDescription} />);

    expect(screen.getByText('Pro Plan')).toBeInTheDocument();
    expect(screen.queryByText('Perfect for professionals')).not.toBeInTheDocument();
  });

  it('renders with different currency', () => {
    render(<PricingCard {...defaultProps} currency="EUR" />);

    expect(screen.getByText('EUR29')).toBeInTheDocument();
  });

  it('renders with yearly interval', () => {
    render(<PricingCard {...defaultProps} interval="year" />);

    expect(screen.getByText('per year')).toBeInTheDocument();
  });

  it('handles successful checkout redirect', async () => {
    const user = userEvent.setup();
    render(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Get Started');
    await user.click(subscribeButton);

    expect(mockStripeService.redirectToCheckout).toHaveBeenCalledWith('price_pro_monthly_123', {
      successUrl: 'http://localhost:3000/success',
      cancelUrl: 'http://localhost:3000/pricing',
    });
  });

  it('shows loading state during checkout process', async () => {
    const user = userEvent.setup();
    mockStripeService.redirectToCheckout.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    render(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Get Started');
    await user.click(subscribeButton);

    // Should show loading state
    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.getByText('Processing...')).toBeDisabled();
  });

  it('removes loading state after successful checkout', async () => {
    const user = userEvent.setup();
    render(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Get Started');
    await user.click(subscribeButton);

    await waitFor(() => {
      expect(screen.getByText('Get Started')).toBeInTheDocument();
      expect(screen.getByText('Get Started')).not.toBeDisabled();
    });
  });

  it('handles authentication errors by opening auth modal', async () => {
    const user = userEvent.setup();
    const authError = new Error('User not authenticated');
    mockStripeService.redirectToCheckout.mockRejectedValue(authError);

    render(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Get Started');
    await user.click(subscribeButton);

    await waitFor(() => {
      expect(mockHistory.replaceState).toHaveBeenCalledWith(
        {},
        '',
        'http://localhost:3000/pricing?checkout_price=price_pro_monthly_123'
      );
      expect(mockOpenAuthModal).toHaveBeenCalledWith('login');
    });
  });

  it('shows toast for general checkout errors', async () => {
    const user = userEvent.setup();
    const generalError = new Error('Payment failed');
    mockStripeService.redirectToCheckout.mockRejectedValue(generalError);

    render(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Get Started');
    await user.click(subscribeButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'Payment failed',
        type: 'error',
      });
    });
  });

  it('shows toast for non-Error exceptions', async () => {
    const user = userEvent.setup();
    mockStripeService.redirectToCheckout.mockRejectedValue('String error');

    render(<PricingCard {...defaultProps} />);

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
    render(<PricingCard {...defaultProps} recommended={true} />);

    const card = document.querySelector('.relative.bg-white.rounded-2xl');
    expect(card).toHaveClass('border-indigo-500', 'ring-2', 'ring-indigo-500', 'ring-opacity-20');
  });

  it('applies correct styling for non-recommended card', () => {
    render(<PricingCard {...defaultProps} recommended={false} />);

    const card = document.querySelector('.relative.bg-white.rounded-2xl');
    expect(card).toHaveClass('border-slate-200');
    expect(card).not.toHaveClass('border-indigo-500');
  });

  it('renders all features with checkmark icons', () => {
    render(<PricingCard {...defaultProps} />);

    const checkmarkIcons = document.querySelectorAll('svg[data-testid="checkmark-icon"]');
    expect(checkmarkIcons.length).toBe(3);

    const features = ['1000 credits per month', 'Priority support', 'Advanced features'];

    features.forEach(feature => {
      expect(screen.getByText(feature)).toBeInTheDocument();
    });
  });

  it('disables button while loading', async () => {
    const user = userEvent.setup();
    mockStripeService.redirectToCheckout.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    render(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Get Started');
    await user.click(subscribeButton);

    const loadingButton = screen.getByText('Processing...');
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveClass('bg-slate-300', 'text-slate-600', 'cursor-not-allowed');
  });

  it('has correct button styling for non-loading state', () => {
    render(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Get Started');
    expect(subscribeButton).toHaveClass(
      'bg-indigo-600',
      'hover:bg-indigo-700',
      'text-white',
      'shadow-md',
      'hover:shadow-lg'
    );
  });

  it('handles checkout with custom cancel URL', async () => {
    const user = userEvent.setup();
    mockLocation.href = 'http://localhost:3000/custom-pricing-page';

    render(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Get Started');
    await user.click(subscribeButton);

    expect(mockStripeService.redirectToCheckout).toHaveBeenCalledWith('price_pro_monthly_123', {
      successUrl: 'http://localhost:3000/success',
      cancelUrl: 'http://localhost:3000/custom-pricing-page',
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

      render(<PricingCard {...propsWithTrial} />);

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

      render(<PricingCard {...propsWithTrial} />);

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

      render(<PricingCard {...propsWithTrial} />);

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

      render(<PricingCard {...propsWithDisabledTrial} />);

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

      render(<PricingCard {...propsWithDisabledTrial} />);

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

      render(<PricingCard {...propsWithDisabledTrial} />);

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

      render(<PricingCard {...propsWith30DayTrial} />);

      expect(screen.getByText('30-day free trial')).toBeInTheDocument();
      expect(screen.getByText('Start 30-Day Trial')).toBeInTheDocument();
    });

    it('handles trial button click correctly', async () => {
      const user = userEvent.setup();
      // Reset location href to original value
      mockLocation.href = 'http://localhost:3000/pricing';

      const propsWithTrial = {
        ...defaultProps,
        trial: {
          enabled: true,
          durationDays: 14,
        },
      };

      render(<PricingCard {...propsWithTrial} />);

      const trialButton = screen.getByText('Start 14-Day Trial');
      await user.click(trialButton);

      expect(mockStripeService.redirectToCheckout).toHaveBeenCalledWith('price_pro_monthly_123', {
        successUrl: 'http://localhost:3000/success',
        cancelUrl: 'http://localhost:3000/pricing',
      });
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

      render(<PricingCard {...propsWithTrial} />);

      const trialButton = screen.getByText('Start 7-Day Trial');
      await user.click(trialButton);

      await waitFor(() => {
        expect(mockOnSelect).toHaveBeenCalled();
      });
      expect(mockStripeService.redirectToCheckout).not.toHaveBeenCalled();
    });

    it('displays no trial badge when trial prop is not provided', () => {
      render(<PricingCard {...defaultProps} />);

      expect(screen.queryByText(/-day free trial/)).not.toBeInTheDocument();
      expect(screen.getByText('Get Started')).toBeInTheDocument();
    });
  });
});
