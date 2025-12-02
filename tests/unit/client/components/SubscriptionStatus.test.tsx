import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SubscriptionStatus } from '@client/components/stripe/SubscriptionStatus';

// Mock the dependencies
vi.mock('@client/services/stripeService', () => ({
  StripeService: {
    getActiveSubscription: vi.fn(),
    getUserProfile: vi.fn(),
  },
}));

vi.mock('@shared/config/stripe', () => ({
  getPlanForPriceId: vi.fn(),
}));

import { StripeService } from '@client/services/stripeService';
import { getPlanForPriceId } from '@shared/config/stripe';

const mockStripeService = vi.mocked(StripeService);
const mockGetPlanForPriceId = vi.mocked(getPlanForPriceId);

describe('SubscriptionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSubscription = {
    id: 'sub_test_123',
    status: 'active',
    price_id: 'price_pro_monthly',
    current_period_start: '2024-01-01T00:00:00Z',
    current_period_end: '2024-02-01T00:00:00Z',
    cancel_at_period_end: false,
    canceled_at: null,
  };

  const mockProfile = {
    subscription_tier: 'Professional',
    credits_balance: 1000,
  };

  it('shows loading state initially', () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(null);
    mockStripeService.getUserProfile.mockResolvedValue(null);

    render(<SubscriptionStatus />);

    expect(screen.getByText('Loading subscription...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument(); // Spinning loader
  });

  it('displays no subscription message when user has no active subscription', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(null);
    mockStripeService.getUserProfile.mockResolvedValue(null);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('No Active Subscription')).toBeInTheDocument();
      expect(screen.getByText(/don&apos;t have an active subscription/)).toBeInTheDocument();
      expect(screen.getByText('View Plans')).toBeInTheDocument();
    });
  });

  it('displays active subscription information correctly', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);
    mockGetPlanForPriceId.mockReturnValue({
      name: 'Professional',
      key: 'pro',
      creditsPerMonth: 1000,
      maxRollover: 6000,
    });

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('Subscription Status')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Plan:')).toBeInTheDocument();
      expect(screen.getByText('Professional')).toBeInTheDocument();
      expect(screen.getByText('Current Period Ends:')).toBeInTheDocument();
    });

    // Check that the date is formatted correctly
    expect(screen.getByText(/February 1, 2024/)).toBeInTheDocument();
  });

  it('displays subscription with plan from profile when price ID is unknown', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);
    mockGetPlanForPriceId.mockReturnValue(null);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('Professional')).toBeInTheDocument();
    });
  });

  it('displays unknown plan when neither price ID nor profile tier is available', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue({ subscription_tier: null });
    mockGetPlanForPriceId.mockReturnValue(null);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  it('displays correct status badge for different subscription statuses', async () => {
    const testCases = [
      { status: 'active', expectedText: 'Active', expectedClass: 'bg-green-100 text-green-800' },
      { status: 'trialing', expectedText: 'Trial', expectedClass: 'bg-blue-100 text-blue-800' },
      { status: 'past_due', expectedText: 'Past Due', expectedClass: 'bg-yellow-100 text-yellow-800' },
      { status: 'canceled', expectedText: 'Canceled', expectedClass: 'bg-red-100 text-red-800' },
      { status: 'incomplete', expectedText: 'incomplete', expectedClass: 'bg-slate-100 text-slate-800' },
    ];

    for (const testCase of testCases) {
      vi.clearAllMocks();
      mockStripeService.getActiveSubscription.mockResolvedValue({
        ...mockSubscription,
        status: testCase.status,
      });
      mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

      render(<SubscriptionStatus />);

      await waitFor(() => {
        const statusBadge = screen.getByText(testCase.expectedText);
        expect(statusBadge).toBeInTheDocument();
        expect(statusBadge).toHaveClass(testCase.expectedClass);
      });
    }
  });

  it('displays cancellation warning when subscription will be canceled at period end', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue({
      ...mockSubscription,
      cancel_at_period_end: true,
    });
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText(/subscription will be canceled at the end of the period/)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument(); // Warning icon
    });
  });

  it('does not display cancellation warning when cancel_at_period_end is false', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue({
      ...mockSubscription,
      cancel_at_period_end: false,
    });
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.queryByText(/subscription will be canceled/)).not.toBeInTheDocument();
    });
  });

  it('allows refreshing subscription data', async () => {
    const user = userEvent.setup();
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh');
    await user.click(refreshButton);

    // Verify that the services were called again
    expect(mockStripeService.getActiveSubscription).toHaveBeenCalledTimes(2);
    expect(mockStripeService.getUserProfile).toHaveBeenCalledTimes(2);
  });

  it('shows loading state when refreshing', async () => {
    const user = userEvent.setup();
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    // Mock slow refresh
    mockStripeService.getActiveSubscription.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(() => resolve(mockSubscription), 100))
    );

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh');
    await user.click(refreshButton);

    expect(screen.getByText('Loading subscription...')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    mockStripeService.getActiveSubscription.mockRejectedValue(new Error('API Error'));
    mockStripeService.getUserProfile.mockRejectedValue(new Error('API Error'));

    render(<SubscriptionStatus />);

    await waitFor(() => {
      // Should show no subscription state when API fails
      expect(screen.getByText('No Active Subscription')).toBeInTheDocument();
    });
  });

  it('formats dates correctly', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue({
      ...mockSubscription,
      current_period_end: '2024-12-25T10:30:00Z',
    });
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText(/December 25, 2024/)).toBeInTheDocument();
    });
  });

  it('has correct link to billing management', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      const manageButton = screen.getByText('Manage Subscription');
      expect(manageButton).toBeInTheDocument();
      expect(manageButton.closest('a')).toHaveAttribute('href', '/dashboard/billing');
    });
  });

  it('has correct link to pricing page when no subscription', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(null);
    mockStripeService.getUserProfile.mockResolvedValue(null);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      const viewPlansButton = screen.getByText('View Plans');
      expect(viewPlansButton).toBeInTheDocument();
      expect(viewPlansButton.closest('a')).toHaveAttribute('href', '/pricing');
    });
  });

  it('applies correct styling classes', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      const container = screen.getByText('Subscription Status').closest('div');
      expect(container).toHaveClass('bg-white', 'rounded-xl', 'shadow-lg', 'p-6');
    });
  });

  it('has accessible elements', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      // Refresh button should be accessible
      const refreshButton = screen.getByText('Refresh');
      expect(refreshButton).toBeInTheDocument();
      expect(refreshButton).toBeEnabled();
    });
  });

  it('loads data on mount', () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(null);
    mockStripeService.getUserProfile.mockResolvedValue(null);

    render(<SubscriptionStatus />);

    // Services should be called once on mount
    expect(mockStripeService.getActiveSubscription).toHaveBeenCalledTimes(1);
    expect(mockStripeService.getUserProfile).toHaveBeenCalledTimes(1);
  });
});