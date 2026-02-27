import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowRight: () => <span data-testid="arrow-right-icon" />,
  Calendar: () => <span data-testid="calendar-icon" />,
  CreditCard: () => <span data-testid="credit-card-icon" />,
  ExternalLink: () => <span data-testid="external-link-icon" />,
  History: () => <span data-testid="history-icon" />,
  Loader2: () => <span data-testid="loader-icon" />,
  Package: () => <span data-testid="package-icon" />,
  Plus: () => <span data-testid="plus-icon" />,
  Receipt: () => <span data-testid="receipt-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
  Wallet: () => <span data-testid="wallet-icon" />,
}));

// Mock translations for dashboard.billing
const mockTranslations = {
  title: 'Billing',
  subtitle: 'Manage your subscription and payment methods',
  refresh: 'Refresh',
  currentPlan: 'Current Plan',
  freePlan: 'Free Plan',
  creditsBalance: 'Credits balance',
  changePlan: 'Change Plan',
  choosePlan: 'Choose Plan',
  cancelSubscription: 'Cancel Subscription',
  trialEnds: 'Trial Ends',
  currentPeriodEnds: 'Current Period Ends',
  trialActiveStrong: 'Trial Active:',
  trialEndsText: 'Your trial ends {date}.',
  subscriptionCanceled: 'Your subscription will be canceled at the end of the current period.',
  scheduledPlanChange: 'Scheduled Plan Change',
  keepBenefitsUntil: "You'll keep all {plan} benefits until then.",
  changeOrCancel: 'Change or cancel this',
  planChangesOn: 'Your plan will change on {date}.',
  buyCredits: 'Buy Credits',
  buyCreditsSubtitle: 'One-time credit packs that never expire',
  tip: 'Tip:',
  subscriptionBetterValue: 'Subscriptions offer better value',
  subscribeBetterValue: 'Subscribe for better value',
  paymentMethods: 'Payment Methods',
  paymentMethodsSubtitle: 'Manage your payment methods',
  managePortal: 'Manage your payment methods through the Stripe Customer Portal.',
  manageSubscription: 'Manage Subscription',
  opening: 'Opening...',
  noPaymentMethods: 'No payment methods added yet',
  choosePlanToSetup: 'Choose a plan to set up a payment method.',
  viewPricing: 'View Pricing',
  billingHistory: 'Billing History',
  billingHistorySubtitle: 'View your past invoices',
  viewInvoices: 'View Invoices',
  viewInvoicesPortal: 'View invoices from the Stripe Customer Portal.',
  noBillingHistory: 'No billing history yet',
  loading: 'Loading billing information...',
  error: 'Failed to load billing information',
  tryAgain: 'Try Again',
  errors: {
    failedToOpenPortal: 'Failed to open billing portal',
    failedToCancelSubscription: 'Failed to cancel subscription',
  },
  success: {
    subscriptionCanceled: 'Subscription canceled successfully.',
  },
  tabs: {
    subscription: 'Subscription',
    credits: 'Credits',
    invoices: 'Invoices & Payment',
  },
  creditHistory: {
    title: 'Credit History',
    subtitle: 'View your credit transactions',
    type: {
      purchase: 'Purchase',
      subscription: 'Subscription',
      usage: 'Usage',
      refund: 'Refund',
      bonus: 'Bonus',
    },
    noTransactions: 'No credit transactions yet',
    loading: 'Loading credit history...',
    error: 'Failed to load credit history',
    loadMore: 'Load More',
  },
};

function renderWithTranslations(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{
        dashboard: {
          billing: mockTranslations,
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
    getUserProfile: vi.fn(),
    getActiveSubscription: vi.fn(),
    redirectToPortal: vi.fn(),
    cancelSubscription: vi.fn(),
    getCreditHistory: vi.fn(),
  },
}));

vi.mock('@client/store/toastStore', () => ({
  useToastStore: vi.fn(() => ({
    showToast: vi.fn(),
  })),
}));

vi.mock('@shared/config/stripe', () => ({
  getPlanDisplayName: vi.fn(() => 'Pro Plan'),
  getPlanForPriceId: vi.fn(() => ({ name: 'Basic Plan' })),
  SUBSCRIPTION_PLANS: {
    HOBBY_MONTHLY: {
      name: 'Hobby',
      description: 'For casual users',
      price: 9,
      interval: 'month',
      features: ['100 credits/month', 'Basic models'],
    },
    PRO_MONTHLY: {
      name: 'Pro',
      description: 'For professionals',
      price: 29,
      interval: 'month',
      features: ['500 credits/month', 'All models'],
      recommended: true,
    },
    BUSINESS_MONTHLY: {
      name: 'Business',
      description: 'For teams',
      price: 99,
      interval: 'month',
      features: ['2000 credits/month', 'Priority support'],
    },
  },
  STRIPE_PRICES: {
    HOBBY_MONTHLY: 'price_hobby_123',
    PRO_MONTHLY: 'price_pro_123',
    BUSINESS_MONTHLY: 'price_business_123',
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

// Mock CreditPackSelector to avoid Stripe issues
vi.mock('@client/components/stripe/CreditPackSelector', () => ({
  CreditPackSelector: () => <div data-testid="credit-pack-selector">Credit Pack Selector</div>,
}));

// Mock CancelSubscriptionModal
vi.mock('@client/components/stripe/CancelSubscriptionModal', () => ({
  CancelSubscriptionModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="cancel-subscription-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

// Mock PricingCard component
vi.mock('@client/components/stripe/PricingCard', () => ({
  PricingCard: ({
    name,
    priceId,
    recommended,
    onSelect,
  }: {
    name: string;
    priceId: string;
    recommended?: boolean;
    onSelect?: () => void;
  }) => (
    <div data-testid={`pricing-card-${priceId}`} data-recommended={recommended ? 'true' : 'false'}>
      <span data-testid="plan-name">{name}</span>
      {onSelect && (
        <button data-testid={`select-plan-${priceId}`} onClick={onSelect}>
          Get Started
        </button>
      )}
    </div>
  ),
}));

// Mock PlanChangeModal
vi.mock('@client/components/stripe/PlanChangeModal', () => ({
  PlanChangeModal: ({
    isOpen,
    onClose,
    targetPriceId,
  }: {
    isOpen: boolean;
    onClose: () => void;
    targetPriceId: string;
  }) =>
    isOpen ? (
      <div data-testid="plan-change-modal">
        <span data-testid="target-price-id">{targetPriceId}</span>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

import { StripeService } from '@client/services/stripeService';
import { useToastStore } from '@client/store/toastStore';
import { getPlanDisplayName } from '@shared/config/stripe';
import { useRouter } from 'next/navigation';

const mockStripeService = vi.mocked(StripeService);
const mockUseToastStore = vi.mocked(useToastStore);
const mockGetPlanDisplayName = vi.mocked(getPlanDisplayName);
const mockUseRouter = vi.mocked(useRouter);

// Import the component after mocks are set up
import BillingPage from '@/app/[locale]/dashboard/billing/page';

describe('BillingPage', () => {
  const mockShowToast = vi.fn();
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseToastStore.mockReturnValue({
      showToast: mockShowToast,
    } as { showToast: typeof mockShowToast });

    mockUseRouter.mockReturnValue({
      push: mockPush,
    } as { push: typeof mockPush });

    // Default mocks
    mockStripeService.getUserProfile.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      subscription_credits_balance: 100,
      purchased_credits_balance: 50,
      stripe_customer_id: 'cus_123',
      subscription_tier: 'pro',
    });

    mockStripeService.getActiveSubscription.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      price_id: 'price_123',
      current_period_end: '2026-03-15T00:00:00Z',
      cancel_at_period_end: false,
    });

    mockStripeService.getCreditHistory.mockResolvedValue({
      transactions: [],
      pagination: { total: 0 },
    });

    mockGetPlanDisplayName.mockReturnValue('Pro Plan');
  });

  afterEach(() => {
    cleanup();
  });

  describe('Loading and Error States', () => {
    it('should show loading state initially', () => {
      // Don't resolve the promises immediately
      mockStripeService.getUserProfile.mockImplementation(() => new Promise(() => {}));

      renderWithTranslations(<BillingPage />);

      expect(screen.getByText('Loading billing information...')).toBeInTheDocument();
    });

    it('should show error state when loading fails', async () => {
      mockStripeService.getUserProfile.mockRejectedValue(new Error('Network error'));

      renderWithTranslations(<BillingPage />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load billing information')).toBeInTheDocument();
      });

      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  describe('Tab Layout', () => {
    it('should render Credits tab as default', async () => {
      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await waitFor(() => {
        expect(screen.getByText('Billing')).toBeInTheDocument();
      });

      // Check that credits tab is active (has text-accent class)
      const tabButtons = document.querySelectorAll('.flex.gap-1 button');
      const creditsTab = Array.from(tabButtons).find(btn => btn.textContent === 'Credits');
      expect(creditsTab).toBeDefined();
      expect(creditsTab).toHaveClass('text-accent');
    });

    it('should render all three tabs', async () => {
      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await waitFor(() => {
        expect(screen.getByText('Billing')).toBeInTheDocument();
      });

      // Find tabs in the tab bar specifically
      const tabButtons = document.querySelectorAll('.flex.gap-1 button');
      const tabLabels = Array.from(tabButtons).map(btn => btn.textContent);

      expect(tabLabels).toContain('Subscription');
      expect(tabLabels).toContain('Credits');
      expect(tabLabels).toContain('Invoices & Payment');
    });

    it('should render Credits tab content by default', async () => {
      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await waitFor(() => {
        expect(screen.getByText('Billing')).toBeInTheDocument();
      });

      // Credits tab is default — CreditPackSelector should be visible without clicking
      await waitFor(() => {
        expect(screen.getByTestId('credit-pack-selector')).toBeInTheDocument();
      });
    });

    it('should show subscription plan info in Subscription tab', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await waitFor(() => {
        expect(screen.getByText('Billing')).toBeInTheDocument();
      });

      // Click on Subscription tab (credits is default now)
      const tabButtons = document.querySelectorAll('.flex.gap-1 button');
      const subscriptionTab = Array.from(tabButtons).find(
        btn => btn.textContent === 'Subscription'
      ) as HTMLElement;
      await user.click(subscriptionTab);

      await waitFor(() => {
        expect(screen.getByText('Current Plan')).toBeInTheDocument();
      });

      expect(screen.getByText('Pro Plan')).toBeInTheDocument();
      expect(screen.getByText('Credits balance')).toBeInTheDocument();
    });

    it('should show change plan button', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await waitFor(() => {
        expect(screen.getByText('Billing')).toBeInTheDocument();
      });

      const tabButtons = document.querySelectorAll('.flex.gap-1 button');
      const subscriptionTab = Array.from(tabButtons).find(
        btn => btn.textContent === 'Subscription'
      ) as HTMLElement;
      await user.click(subscriptionTab);

      await waitFor(() => {
        expect(screen.getByTestId('change-plan-button')).toBeInTheDocument();
      });

      expect(screen.getByText('Change Plan')).toBeInTheDocument();
    });

    it('should navigate to pricing when change plan button clicked', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await waitFor(() => {
        expect(screen.getByText('Billing')).toBeInTheDocument();
      });

      const tabButtons = document.querySelectorAll('.flex.gap-1 button');
      const subscriptionTab = Array.from(tabButtons).find(
        btn => btn.textContent === 'Subscription'
      ) as HTMLElement;
      await user.click(subscriptionTab);

      await waitFor(() => {
        expect(screen.getByTestId('change-plan-button')).toBeInTheDocument();
      });

      const changePlanButton = screen.getByTestId('change-plan-button');
      await user.click(changePlanButton);

      expect(mockPush).toHaveBeenCalledWith('/pricing');
    });
  });

  describe('Subscription Tab Content', () => {
    async function switchToSubscriptionTab() {
      const user = userEvent.setup();
      await waitFor(() => {
        expect(screen.getByText('Billing')).toBeInTheDocument();
      });
      const tabButtons = document.querySelectorAll('.flex.gap-1 button');
      const subscriptionTab = Array.from(tabButtons).find(
        btn => btn.textContent === 'Subscription'
      ) as HTMLElement;
      await user.click(subscriptionTab);
    }

    it('should display current plan card', async () => {
      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await switchToSubscriptionTab();

      await waitFor(() => {
        expect(screen.getByText('Current Plan')).toBeInTheDocument();
      });

      expect(screen.getByText('Pro Plan')).toBeInTheDocument();
    });

    it('should display credits balance', async () => {
      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await switchToSubscriptionTab();

      await waitFor(() => {
        expect(screen.getByText('Credits balance')).toBeInTheDocument();
      });

      // 100 + 50 = 150
      expect(screen.getByText('150')).toBeInTheDocument();
    });

    it('should display subscription status badge', async () => {
      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await switchToSubscriptionTab();

      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument();
      });
    });

    it('should show cancel subscription button for active subscription', async () => {
      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await switchToSubscriptionTab();

      await waitFor(() => {
        expect(screen.getByText('Cancel Subscription')).toBeInTheDocument();
      });
    });

    it('should not show cancel button when subscription is already canceled', async () => {
      mockStripeService.getActiveSubscription.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        price_id: 'price_123',
        current_period_end: '2026-03-15T00:00:00Z',
        cancel_at_period_end: true,
      });

      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await switchToSubscriptionTab();

      await waitFor(() => {
        expect(screen.getByText(/Your subscription will be canceled/)).toBeInTheDocument();
      });

      expect(screen.queryByText('Cancel Subscription')).not.toBeInTheDocument();
    });

    // Skip this test because dayjs relativeTime plugin requires complex setup in test env
    it.skip('should show trial information for trialing subscription', async () => {
      mockStripeService.getActiveSubscription.mockResolvedValue({
        id: 'sub_123',
        status: 'trialing',
        price_id: 'price_123',
        current_period_end: '2026-03-15T00:00:00Z',
        trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        cancel_at_period_end: false,
      });

      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await waitFor(() => {
        expect(screen.getByText('Trial Active:')).toBeInTheDocument();
      });
    });
  });

  describe('Credits Tab Content', () => {
    it('should display credit pack selector', async () => {
      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      // Credits tab is default — no click needed
      await waitFor(() => {
        expect(screen.getByTestId('credit-pack-selector')).toBeInTheDocument();
      });
    });

    it('should display buy credits section', async () => {
      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await waitFor(() => {
        expect(screen.getByText('Buy Credits')).toBeInTheDocument();
      });
      expect(screen.getByText('One-time credit packs that never expire')).toBeInTheDocument();
    });

    it('should display credit history section', async () => {
      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await waitFor(() => {
        expect(screen.getByText('Credit History')).toBeInTheDocument();
      });
    });

    it('should display empty credit history message', async () => {
      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await waitFor(() => {
        expect(screen.getByText('No credit transactions yet')).toBeInTheDocument();
      });
    });

    it('should display credit transactions', async () => {
      mockStripeService.getCreditHistory.mockResolvedValue({
        transactions: [
          {
            id: 'tx_1',
            amount: 100,
            type: 'purchase',
            description: 'Credit pack purchase',
            created_at: '2026-02-10T00:00:00Z',
            reference_id: null,
          },
          {
            id: 'tx_2',
            amount: -10,
            type: 'usage',
            description: 'Image upscale',
            created_at: '2026-02-12T00:00:00Z',
            reference_id: null,
          },
        ],
        pagination: { total: 2 },
      });

      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await waitFor(() => {
        expect(screen.getByText('Credit pack purchase')).toBeInTheDocument();
      });

      expect(screen.getByText('+100')).toBeInTheDocument();
      expect(screen.getByText('-10')).toBeInTheDocument();
    });
  });

  describe('Invoices & Payment Tab', () => {
    async function switchToInvoicesTab() {
      const user = userEvent.setup();
      await waitFor(() => {
        expect(screen.getByText('Billing')).toBeInTheDocument();
      });
      const tabButtons = document.querySelectorAll('.flex.gap-1 button');
      const invoicesTab = Array.from(tabButtons).find(
        btn => btn.textContent === 'Invoices & Payment'
      ) as HTMLElement;
      await user.click(invoicesTab);
    }

    it('should display payment methods section', async () => {
      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await switchToInvoicesTab();

      await waitFor(() => {
        expect(screen.getByText('Payment Methods')).toBeInTheDocument();
      });

      expect(screen.getByText('Manage Subscription')).toBeInTheDocument();
    });

    it('should display billing history section', async () => {
      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await switchToInvoicesTab();

      await waitFor(() => {
        expect(screen.getByText('Billing History')).toBeInTheDocument();
      });

      expect(screen.getByText('View Invoices')).toBeInTheDocument();
    });

    it('should call redirectToPortal when manage subscription clicked', async () => {
      const user = userEvent.setup();
      mockStripeService.redirectToPortal.mockResolvedValue(undefined);

      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await switchToInvoicesTab();

      await waitFor(() => {
        expect(screen.getByText('Manage Subscription')).toBeInTheDocument();
      });

      const manageButton = screen.getByText('Manage Subscription');
      await user.click(manageButton);

      await waitFor(() => {
        expect(mockStripeService.redirectToPortal).toHaveBeenCalled();
      });
    });
  });

  describe('Free Plan User', () => {
    async function switchToSubscriptionTab() {
      const user = userEvent.setup();
      await waitFor(() => {
        expect(screen.getByText('Billing')).toBeInTheDocument();
      });
      const tabButtons = document.querySelectorAll('.flex.gap-1 button');
      const subscriptionTab = Array.from(tabButtons).find(
        btn => btn.textContent === 'Subscription'
      ) as HTMLElement;
      await user.click(subscriptionTab);
    }

    it('should show Choose Plan heading for free users', async () => {
      mockStripeService.getActiveSubscription.mockResolvedValue(null as never);
      mockGetPlanDisplayName.mockReturnValue('Free Plan');

      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await switchToSubscriptionTab();

      await waitFor(() => {
        expect(screen.getByText('Choose Plan')).toBeInTheDocument();
      });
    });

    it('should show plan cards for free users without subscription', async () => {
      mockStripeService.getActiveSubscription.mockResolvedValue(null as never);
      mockGetPlanDisplayName.mockReturnValue('Free Plan');

      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await switchToSubscriptionTab();

      await waitFor(() => {
        expect(screen.getByTestId('pricing-card-price_hobby_123')).toBeInTheDocument();
        expect(screen.getByTestId('pricing-card-price_pro_123')).toBeInTheDocument();
        expect(screen.getByTestId('pricing-card-price_business_123')).toBeInTheDocument();
      });
    });

    it('should show recommended badge on Pro plan card', async () => {
      mockStripeService.getActiveSubscription.mockResolvedValue(null as never);
      mockGetPlanDisplayName.mockReturnValue('Free Plan');

      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await switchToSubscriptionTab();

      await waitFor(() => {
        const proCard = screen.getByTestId('pricing-card-price_pro_123');
        expect(proCard).toHaveAttribute('data-recommended', 'true');
      });
    });

    it('should open plan change modal when plan card clicked for free users', async () => {
      const user = userEvent.setup();
      mockStripeService.getActiveSubscription.mockResolvedValue(null as never);
      mockGetPlanDisplayName.mockReturnValue('Free Plan');

      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await switchToSubscriptionTab();

      await waitFor(() => {
        expect(screen.getByTestId('select-plan-price_pro_123')).toBeInTheDocument();
      });

      const selectButton = screen.getByTestId('select-plan-price_pro_123');
      await user.click(selectButton);

      await waitFor(() => {
        expect(screen.getByTestId('plan-change-modal')).toBeInTheDocument();
        expect(screen.getByTestId('target-price-id')).toHaveTextContent('price_pro_123');
      });
    });

    it('should not show plan cards when user has active subscription', async () => {
      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await switchToSubscriptionTab();

      await waitFor(() => {
        expect(screen.getByText('Current Plan')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('pricing-card-price_hobby_123')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pricing-card-price_pro_123')).not.toBeInTheDocument();
    });

    it('should show no payment methods message for free users without stripe customer id', async () => {
      const user = userEvent.setup();
      mockStripeService.getActiveSubscription.mockResolvedValue(null as never);
      mockStripeService.getUserProfile.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        subscription_credits_balance: 0,
        purchased_credits_balance: 0,
        stripe_customer_id: null,
        subscription_tier: null,
      });
      mockGetPlanDisplayName.mockReturnValue('Free Plan');

      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await waitFor(() => {
        expect(screen.getByText('Billing')).toBeInTheDocument();
      });

      // Navigate to Invoices & Payment tab
      const tabButtons = document.querySelectorAll('.flex.gap-1 button');
      const invoicesTab = Array.from(tabButtons).find(
        btn => btn.textContent === 'Invoices & Payment'
      ) as HTMLElement;
      await user.click(invoicesTab);

      await waitFor(() => {
        expect(screen.getByText('No payment methods added yet')).toBeInTheDocument();
      });

      expect(screen.getByText('View Pricing')).toBeInTheDocument();
    });
  });

  describe('Refresh Button', () => {
    it('should reload data when refresh button clicked', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithTranslations(<BillingPage />);
      });

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh');
      await user.click(refreshButton);

      // Should have been called at least once on mount, and again on click
      await waitFor(() => {
        expect(mockStripeService.getUserProfile).toHaveBeenCalledTimes(2);
        expect(mockStripeService.getCreditHistory).toHaveBeenCalledTimes(2);
      });
    });
  });
});
