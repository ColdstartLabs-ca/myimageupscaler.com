import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

const mockStripeService = vi.mocked(StripeService);
const mockUseModalStore = vi.mocked(useModalStore);
const mockUseToastStore = vi.mocked(useToastStore);

describe('PricingCard', () => {
  const mockOpenAuthModal = vi.fn();
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseModalStore.mockReturnValue({
      openAuthModal: mockOpenAuthModal,
    } as any);

    mockUseToastStore.mockReturnValue({
      showToast: mockShowToast,
    } as any);

    mockStripeService.redirectToCheckout.mockResolvedValue(undefined);
  });

  const defaultProps = {
    name: 'Pro Plan',
    description: 'Perfect for professionals',
    price: 29,
    currency: 'USD' as const,
    interval: 'month' as const,
    features: [
      '1000 credits per month',
      'Priority support',
      'Advanced features',
    ],
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
    expect(screen.getByText('Subscribe Now')).toBeInTheDocument();
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

    const subscribeButton = screen.getByText('Subscribe Now');
    await user.click(subscribeButton);

    expect(mockStripeService.redirectToCheckout).toHaveBeenCalledWith(
      'price_pro_monthly_123',
      {
        successUrl: 'http://localhost:3000/success',
        cancelUrl: 'http://localhost:3000/pricing',
      }
    );
  });

  it('shows loading state during checkout process', async () => {
    const user = userEvent.setup();
    mockStripeService.redirectToCheckout.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    render(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Subscribe Now');
    await user.click(subscribeButton);

    // Should show loading state
    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.getByText('Processing...')).toBeDisabled();
  });

  it('removes loading state after successful checkout', async () => {
    const user = userEvent.setup();
    render(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Subscribe Now');
    await user.click(subscribeButton);

    await waitFor(() => {
      expect(screen.getByText('Subscribe Now')).toBeInTheDocument();
      expect(screen.getByText('Subscribe Now')).not.toBeDisabled();
    });
  });

  it('handles authentication errors by opening auth modal', async () => {
    const user = userEvent.setup();
    const authError = new Error('User not authenticated');
    mockStripeService.redirectToCheckout.mockRejectedValue(authError);

    render(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Subscribe Now');
    await user.click(subscribeButton);

    await waitFor(() => {
      expect(mockLocation.replaceState).toHaveBeenCalledWith(
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

    const subscribeButton = screen.getByText('Subscribe Now');
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

    const subscribeButton = screen.getByText('Subscribe Now');
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

    const card = screen.getByText('Pro Plan').closest('div');
    expect(card).toHaveClass('border-indigo-500', 'ring-2', 'ring-indigo-500', 'ring-opacity-20');
  });

  it('applies correct styling for non-recommended card', () => {
    render(<PricingCard {...defaultProps} recommended={false} />);

    const card = screen.getByText('Pro Plan').closest('div');
    expect(card).toHaveClass('border-slate-200');
    expect(card).not.toHaveClass('border-indigo-500');
  });

  it('renders all features with checkmark icons', () => {
    render(<PricingCard {...defaultProps} />);

    const checkmarkIcons = document.querySelectorAll('svg[data-testid="checkmark-icon"]');
    expect(checkmarkIcons.length).toBe(3);

    const features = [
      '1000 credits per month',
      'Priority support',
      'Advanced features',
    ];

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

    const subscribeButton = screen.getByText('Subscribe Now');
    await user.click(subscribeButton);

    const loadingButton = screen.getByText('Processing...');
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveClass('bg-slate-300', 'text-slate-600', 'cursor-not-allowed');
  });

  it('has correct button styling for non-loading state', () => {
    render(<PricingCard {...defaultProps} />);

    const subscribeButton = screen.getByText('Subscribe Now');
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

    const subscribeButton = screen.getByText('Subscribe Now');
    await user.click(subscribeButton);

    expect(mockStripeService.redirectToCheckout).toHaveBeenCalledWith(
      'price_pro_monthly_123',
      {
        successUrl: 'http://localhost:3000/success',
        cancelUrl: 'http://localhost:3000/custom-pricing-page',
      }
    );
  });
});