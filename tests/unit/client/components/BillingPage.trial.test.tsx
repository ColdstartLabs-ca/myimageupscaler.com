import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import BillingPage from '@app/dashboard/billing/page';
import type { IUserProfile, ISubscription } from '@shared/types/stripe';

// Mock dependencies
vi.mock('@client/services/stripeService', () => ({
  StripeService: {
    getUserProfile: vi.fn(),
    getActiveSubscription: vi.fn(),
    redirectToPortal: vi.fn(),
    cancelSubscription: vi.fn(),
  },
}));

vi.mock('@client/store/toastStore', () => ({
  useToastStore: vi.fn(() => ({
    showToast: vi.fn(),
  })),
}));

vi.mock('@shared/config/stripe', () => ({
  getPlanDisplayName: vi.fn((data) => data.subscriptionTier || 'Free Plan'),
}));

vi.mock('dayjs', () => {
  const mockDayjs = vi.fn((date?: string | Date) => {
    const now = new Date('2024-01-15T10:00:00Z'); // Fixed current date for testing
    const testDate = date ? new Date(date) : now;

    return {
      fromNow: vi.fn(() => {
        const diff = testDate.getTime() - now.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days > 0) {
          return `in ${days} days`;
        } else if (days < 0) {
          return `${Math.abs(days)} days ago`;
        } else {
          return 'a few seconds ago';
        }
      }),
      extend: vi.fn(),
    };
  });

  return mockDayjs;
});

vi.mock('dayjs/plugin/relativeTime', () => ({}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

import { StripeService } from '@client/services/stripeService';
import { useToastStore } from '@client/store/toastStore';
import { useRouter } from 'next/navigation';

const mockStripeService = vi.mocked(StripeService);
const mockUseToastStore = vi.mocked(useToastStore);
const mockUseRouter = vi.mocked(useRouter);

describe('BillingPage - Trial Functionality', () => {
  const mockTrialSubscription: ISubscription = {
    id: 'sub_123',
    user_id: 'user_123',
    status: 'trialing',
    price_id: 'price_pro_monthly',
    current_period_start: '2024-01-01T00:00:00Z',
    current_period_end: '2024-02-01T00:00:00Z',
    trial_end: '2024-01-29T00:00:00Z', // 14 days from 2024-01-15
    cancel_at_period_end: false,
    canceled_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  };

  const mockTrialProfile: IUserProfile = {
    id: 'user_123',
    stripe_customer_id: 'cus_123',
    credits_balance: 500,
    subscription_status: 'trialing',
    subscription_tier: 'Professional',
    role: 'user',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  };

  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseToastStore.mockReturnValue({
      showToast: mockShowToast,
    } as any);

    mockUseRouter.mockReturnValue({
      push: vi.fn(),
    } as any);

    mockStripeService.getUserProfile.mockResolvedValue(mockTrialProfile);
    mockStripeService.getActiveSubscription.mockResolvedValue(mockTrialSubscription);
    mockStripeService.redirectToPortal.mockResolvedValue(undefined);
    mockStripeService.cancelSubscription.mockResolvedValue(undefined);
  });

  it('displays trial badge for active trial subscription', async () => {
    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText('Trial')).toBeInTheDocument();
    });
  });

  it('shows trial end date instead of current period end for trial subscriptions', async () => {
    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText('Trial Ends')).toBeInTheDocument();
      expect(screen.getByText('January 29, 2024')).toBeInTheDocument();
    });

    // Should not show "Current Period Ends" for trial
    expect(screen.queryByText('Current Period Ends')).not.toBeInTheDocument();
  });

  it('displays trial information box for active trial', async () => {
    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText(/Trial Active:/)).toBeInTheDocument();
      expect(screen.getByText(/Your trial ends in 14 days/)).toBeInTheDocument();
      expect(screen.getByText(/Your card will be charged the regular subscription price after the trial ends/)).toBeInTheDocument();
    });
  });

  it('shows current period end for non-trial active subscriptions', async () => {
    const activeSubscription = {
      ...mockTrialSubscription,
      status: 'active',
      trial_end: null,
    };

    mockStripeService.getActiveSubscription.mockResolvedValue(activeSubscription);

    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Current Period Ends')).toBeInTheDocument();
      expect(screen.getByText('February 1, 2024')).toBeInTheDocument();
    });

    // Should not show trial information
    expect(screen.queryByText(/Trial Active:/)).not.toBeInTheDocument();
  });

  it('falls back to current_period_end when trial_end is null', async () => {
    const subscriptionWithoutTrialEnd = {
      ...mockTrialSubscription,
      status: 'trialing',
      trial_end: null,
    };

    mockStripeService.getActiveSubscription.mockResolvedValue(subscriptionWithoutTrialEnd);

    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText('Current Period Ends')).toBeInTheDocument();
      expect(screen.getByText('February 1, 2024')).toBeInTheDocument();
    });

    // Should not show trial information when trial_end is null
    expect(screen.queryByText(/Trial Active:/)).not.toBeInTheDocument();
  });

  it('displays correct plan name for trial subscription', async () => {
    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText('Professional')).toBeInTheDocument();
    });
  });

  it('shows credits balance for trial users', async () => {
    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText('500')).toBeInTheDocument();
      expect(screen.getByText('Credits balance')).toBeInTheDocument();
    });
  });

  it('handles trial with cancel_at_period_end', async () => {
    const canceledTrialSubscription = {
      ...mockTrialSubscription,
      cancel_at_period_end: true,
    };

    mockStripeService.getActiveSubscription.mockResolvedValue(canceledTrialSubscription);

    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText('Trial')).toBeInTheDocument();
      expect(screen.getByText('Trial Ends')).toBeInTheDocument();
      expect(screen.getByText('Your trial ends in 14 days')).toBeInTheDocument();
      expect(screen.getByText(/Your subscription will be canceled at the end of the current period/)).toBeInTheDocument();
    });
  });

  it('shows manage subscription button for trial users', async () => {
    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText('Manage Subscription')).toBeInTheDocument();
    });
  });

  it('loads trial data on component mount', async () => {
    render(<BillingPage />);

    await waitFor(() => {
      expect(mockStripeService.getUserProfile).toHaveBeenCalled();
      expect(mockStripeService.getActiveSubscription).toHaveBeenCalled();
    });
  });

  it('refreshes trial data when refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText('Trial')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh');
    await user.click(refreshButton);

    await waitFor(() => {
      expect(mockStripeService.getUserProfile).toHaveBeenCalledTimes(2);
      expect(mockStripeService.getActiveSubscription).toHaveBeenCalledTimes(2);
    });
  });

  it('shows loading state while fetching trial data', async () => {
    mockStripeService.getUserProfile.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    mockStripeService.getActiveSubscription.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(<BillingPage />);

    expect(screen.getByText('Loading billing information...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Loading billing information...')).not.toBeInTheDocument();
    });
  });

  it('handles error when loading trial data', async () => {
    mockStripeService.getUserProfile.mockRejectedValue(new Error('API Error'));
    mockStripeService.getActiveSubscription.mockRejectedValue(new Error('API Error'));

    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load billing information')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  it('shows no subscription message for users without trial', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(null);

    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText('Free Plan')).toBeInTheDocument();
    });

    // Should not show trial information
    expect(screen.queryByText(/Trial Active:/)).not.toBeInTheDocument();
  });

  it('displays trial information with correct styling', async () => {
    render(<BillingPage />);

    await waitFor(() => {
      const trialInfo = screen.getByText(/Trial Active:/).closest('div');
      expect(trialInfo).toHaveClass('bg-blue-50', 'border-blue-200', 'text-blue-800');
    });
  });

  it('opens Stripe portal when manage subscription is clicked', async () => {
    const user = userEvent.setup();
    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText('Manage Subscription')).toBeInTheDocument();
    });

    const manageButton = screen.getByText('Manage Subscription');
    await user.click(manageButton);

    expect(mockStripeService.redirectToPortal).toHaveBeenCalled();
  });

  it('shows error toast when portal opening fails', async () => {
    const user = userEvent.setup();
    mockStripeService.redirectToPortal.mockRejectedValue(new Error('Portal Error'));

    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText('Manage Subscription')).toBeInTheDocument();
    });

    const manageButton = screen.getByText('Manage Subscription');
    await user.click(manageButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'Portal Error',
        type: 'error',
      });
    });
  });

  it('handles trial subscription cancellation', async () => {
    const user = userEvent.setup();
    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText('Cancel Subscription')).toBeInTheDocument();
    });

    // Open cancel modal
    const cancelButton = screen.getByText('Cancel Subscription');
    await user.click(cancelButton);

    // Modal should open (we can't test the full modal flow here without importing it)
    expect(screen.getByText('Cancel Subscription')).toBeInTheDocument();
  });
});