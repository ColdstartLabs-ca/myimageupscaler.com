import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SubscriptionStatus } from '@client/components/stripe/SubscriptionStatus';
import type { ISubscription, IUserProfile } from '@shared/types/stripe';

// Mock dependencies
vi.mock('@client/services/stripeService', () => ({
  StripeService: {
    getActiveSubscription: vi.fn(),
    getUserProfile: vi.fn(),
  },
}));

vi.mock('@shared/config/stripe', () => ({
  getPlanDisplayName: vi.fn(() => 'Pro Plan'),
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
      toLocaleDateString: vi.fn(() => testDate.toLocaleDateString()),
    };
  });

  // Mock the relativeTime plugin
  mockDayjs.extend = vi.fn();

  return mockDayjs;
});

vi.mock('dayjs/plugin/relativeTime', () => ({}));

import { StripeService } from '@client/services/stripeService';
import { getPlanDisplayName } from '@shared/config/stripe';

const mockStripeService = vi.mocked(StripeService);
const mockGetPlanDisplayName = vi.mocked(getPlanDisplayName);

describe('SubscriptionStatus - Trial Functionality', () => {
  const mockSubscription: ISubscription = {
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

  const mockProfile: IUserProfile = {
    id: 'user_123',
    stripe_customer_id: 'cus_123',
    credits_balance: 500,
    subscription_status: 'trialing',
    subscription_tier: 'Pro',
    role: 'user',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockStripeService.getActiveSubscription.mockResolvedValue(null);
    mockStripeService.getUserProfile.mockResolvedValue(null);
    mockGetPlanDisplayName.mockReturnValue('Pro Plan');
  });

  it('displays trial badge when subscription status is trialing', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('Trial')).toBeInTheDocument();
    });
  });

  it('displays trial information when subscription is in trial period', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('Trial Ends:')).toBeInTheDocument();
      expect(screen.getByText('January 29, 2024')).toBeInTheDocument();
    });

    // Check for trial information box
    expect(screen.getByText(/Your trial ends/)).toBeInTheDocument();
    expect(
      screen.getByText(/After the trial, you will be charged the regular subscription price/)
    ).toBeInTheDocument();
  });

  it('shows correct trial end date when trial_end is provided', async () => {
    const trialSubscription = {
      ...mockSubscription,
      trial_end: '2024-01-25T00:00:00Z', // 10 days from current date
    };

    mockStripeService.getActiveSubscription.mockResolvedValue(trialSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('Trial Ends:')).toBeInTheDocument();
      expect(screen.getByText('January 25, 2024')).toBeInTheDocument();
    });
  });

  it('falls back to current_period_end when trial_end is null', async () => {
    const subscriptionWithoutTrialEnd = {
      ...mockSubscription,
      trial_end: null,
    };

    mockStripeService.getActiveSubscription.mockResolvedValue(subscriptionWithoutTrialEnd);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('Current Period Ends:')).toBeInTheDocument();
      expect(screen.getByText('February 1, 2024')).toBeInTheDocument();
    });

    // Should not show trial information box when trial_end is null
    expect(screen.queryByText(/Your trial ends/)).not.toBeInTheDocument();
  });

  it('displays regular period end for non-trial subscriptions', async () => {
    const activeSubscription = {
      ...mockSubscription,
      status: 'active',
      trial_end: null,
    };

    mockStripeService.getActiveSubscription.mockResolvedValue(activeSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Current Period Ends:')).toBeInTheDocument();
      expect(screen.getByText('February 1, 2024')).toBeInTheDocument();
    });

    // Should not show trial information
    expect(screen.queryByText(/Your trial ends/)).not.toBeInTheDocument();
  });

  it('shows time remaining until trial ends', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText(/Your trial ends in 14 days/)).toBeInTheDocument();
    });
  });

  it('displays trial information with appropriate styling', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      const trialInfo = screen.getByText(/Your trial ends/).closest('div');
      expect(trialInfo).toHaveClass('bg-blue-50', 'border-blue-200', 'text-blue-800');
    });
  });

  it('handles canceled trial subscription', async () => {
    const canceledTrialSubscription = {
      ...mockSubscription,
      status: 'canceled',
      cancel_at_period_end: true,
    };

    mockStripeService.getActiveSubscription.mockResolvedValue(canceledTrialSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('Canceled')).toBeInTheDocument();
      expect(screen.getByText('Current Period Ends:')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Your subscription will be canceled at the end of the period/)
    ).toBeInTheDocument();
  });

  it('loads trial data on mount', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(mockStripeService.getActiveSubscription).toHaveBeenCalled();
      expect(mockStripeService.getUserProfile).toHaveBeenCalled();
    });
  });

  it('refreshes trial data when refresh button is clicked', async () => {
    const user = userEvent.setup();
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('Trial')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh');
    await user.click(refreshButton);

    await waitFor(() => {
      expect(mockStripeService.getActiveSubscription).toHaveBeenCalledTimes(2);
      expect(mockStripeService.getUserProfile).toHaveBeenCalledTimes(2);
    });
  });

  it('shows loading state while fetching trial data', async () => {
    mockStripeService.getActiveSubscription.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );
    mockStripeService.getUserProfile.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    render(<SubscriptionStatus />);

    expect(screen.getByText('Loading subscription...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Loading subscription...')).not.toBeInTheDocument();
    });
  });

  it('handles error when loading trial data', async () => {
    mockStripeService.getActiveSubscription.mockRejectedValue(new Error('API Error'));
    mockStripeService.getUserProfile.mockRejectedValue(new Error('API Error'));

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('No Active Subscription')).toBeInTheDocument();
    });
  });

  it('displays plan name correctly for trial subscription', async () => {
    mockStripeService.getActiveSubscription.mockResolvedValue(mockSubscription);
    mockStripeService.getUserProfile.mockResolvedValue(mockProfile);

    render(<SubscriptionStatus />);

    await waitFor(() => {
      expect(screen.getByText('Pro Plan')).toBeInTheDocument();
    });

    expect(mockGetPlanDisplayName).toHaveBeenCalledWith({
      priceId: 'price_pro_monthly',
      subscriptionTier: 'Pro',
    });
  });
});
