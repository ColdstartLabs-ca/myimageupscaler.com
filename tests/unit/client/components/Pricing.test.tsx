import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pricing } from '@client/components/pixelperfect/Pricing';
import { useAuthStore } from '@client/store/authStore';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
import { useCheckoutStore } from '@client/store/checkoutStore';

// Mock the stores
vi.mock('@client/store/authStore');
vi.mock('@client/store/modalStore');
vi.mock('@client/store/toastStore');
vi.mock('@client/store/checkoutStore');

// Mock the CheckoutModal component
vi.mock('@client/components/stripe/CheckoutModal', () => ({
  CheckoutModal: ({ priceId, onClose }: { priceId: string; onClose: () => void }) => (
    <div data-testid="checkout-modal">
      <span>Checkout for {priceId}</span>
      <button onClick={onClose}>Close Modal</button>
    </div>
  ),
}));

// Mock Stripe configuration
vi.mock('@shared/config/stripe', () => ({
  HOMEPAGE_TIERS: [
    {
      name: 'Free',
      description: 'Get started for free',
      price: '$0',
      priceValue: 0,
      period: '/month',
      features: ['10 credits/month', 'Basic support'],
      priceId: null,
      variant: 'outline' as const,
      cta: 'Get Started',
      recommended: false,
    },
    {
      name: 'Pro',
      description: 'For professionals',
      price: '$29',
      priceValue: 29,
      period: '/month',
      features: ['500 credits/month', 'Priority support'],
      priceId: 'price_pro_monthly',
      variant: 'primary' as const,
      cta: 'Subscribe Now',
      recommended: true,
    },
  ],
  isStripePricesConfigured: () => true,
}));

describe('Pricing Component', () => {
  const mockOpenAuthModal = vi.fn();
  const mockShowToast = vi.fn();
  const mockSetPendingCheckout = vi.fn();
  const mockOpenCheckoutModal = vi.fn();
  const mockCloseCheckoutModal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(useModalStore).mockReturnValue({
      openAuthModal: mockOpenAuthModal,
      closeAuthModal: vi.fn(),
      isAuthModalOpen: false,
      authModalType: null,
    });

    vi.mocked(useToastStore).mockReturnValue({
      showToast: mockShowToast,
      toasts: [],
      hideToast: vi.fn(),
    });

    vi.mocked(useCheckoutStore).mockReturnValue({
      isCheckoutModalOpen: false,
      activePriceId: null,
      pendingPriceId: null,
      setPendingCheckout: mockSetPendingCheckout,
      openCheckoutModal: mockOpenCheckoutModal,
      closeCheckoutModal: mockCloseCheckoutModal,
      clearPendingCheckout: vi.fn(),
      processPendingCheckout: vi.fn(),
    });
  });

  describe('Unauthenticated user flow', () => {
    beforeEach(() => {
      vi.mocked(useAuthStore).mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        setAuthenticated: vi.fn(),
        setLoading: vi.fn(),
        setUser: vi.fn(),
        logout: vi.fn(),
        signInWithEmail: vi.fn(),
        signUpWithEmail: vi.fn(),
        signOut: vi.fn(),
        initializeAuth: vi.fn(),
        changePassword: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
      });
    });

    it('should open registration modal when clicking free tier', () => {
      render(<Pricing />);

      const freeButton = screen.getByRole('button', { name: 'Get Started' });
      fireEvent.click(freeButton);

      expect(mockOpenAuthModal).toHaveBeenCalledWith('register');
    });

    it('should save pending checkout and open login modal when unauthenticated user clicks paid tier', () => {
      render(<Pricing />);

      const proButton = screen.getByRole('button', { name: 'Subscribe Now' });
      fireEvent.click(proButton);

      expect(mockSetPendingCheckout).toHaveBeenCalledWith('price_pro_monthly');
      expect(mockOpenAuthModal).toHaveBeenCalledWith('login');
      expect(mockOpenCheckoutModal).not.toHaveBeenCalled();
    });
  });

  describe('Authenticated user flow', () => {
    beforeEach(() => {
      vi.mocked(useAuthStore).mockReturnValue({
        user: { email: 'test@example.com' },
        isAuthenticated: true,
        isLoading: false,
        setAuthenticated: vi.fn(),
        setLoading: vi.fn(),
        setUser: vi.fn(),
        logout: vi.fn(),
        signInWithEmail: vi.fn(),
        signUpWithEmail: vi.fn(),
        signOut: vi.fn(),
        initializeAuth: vi.fn(),
        changePassword: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
      });
    });

    it('should open checkout modal directly when authenticated user clicks paid tier', () => {
      render(<Pricing />);

      const proButton = screen.getByRole('button', { name: 'Subscribe Now' });
      fireEvent.click(proButton);

      expect(mockOpenAuthModal).not.toHaveBeenCalled();
      expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();
      expect(screen.getByText('Checkout for price_pro_monthly')).toBeInTheDocument();
    });

    it('should close checkout modal when close button is clicked', () => {
      render(<Pricing />);

      const proButton = screen.getByRole('button', { name: 'Subscribe Now' });
      fireEvent.click(proButton);

      expect(screen.getByTestId('checkout-modal')).toBeInTheDocument();

      const closeButton = screen.getByText('Close Modal');
      fireEvent.click(closeButton);

      expect(screen.queryByTestId('checkout-modal')).not.toBeInTheDocument();
    });
  });

  describe('Stripe configuration checks', () => {
    it('should show error toast when Stripe is not configured', async () => {
      // Mock Stripe as not configured
      vi.doMock('@shared/config/stripe', () => ({
        HOMEPAGE_TIERS: [
          {
            name: 'Pro',
            description: 'For professionals',
            price: '$29',
            priceValue: 29,
            period: '/month',
            features: ['500 credits/month'],
            priceId: 'price_pro_monthly',
            variant: 'primary' as const,
            cta: 'Subscribe Now',
            recommended: true,
          },
        ],
        isStripePricesConfigured: () => false,
      }));

      vi.mocked(useAuthStore).mockReturnValue({
        user: { email: 'test@example.com' },
        isAuthenticated: true,
        isLoading: false,
        setAuthenticated: vi.fn(),
        setLoading: vi.fn(),
        setUser: vi.fn(),
        logout: vi.fn(),
        signInWithEmail: vi.fn(),
        signUpWithEmail: vi.fn(),
        signOut: vi.fn(),
        initializeAuth: vi.fn(),
        changePassword: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
      });

      // Need to re-import after mocking
      const { Pricing: PricingWithMock } = await import('@client/components/pixelperfect/Pricing');
      render(<PricingWithMock />);

      const proButton = screen.getByRole('button', { name: 'Subscribe Now' });
      fireEvent.click(proButton);

      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'Payment system is not configured. Please try again later.',
        type: 'error',
      });

      expect(screen.queryByTestId('checkout-modal')).not.toBeInTheDocument();
    });
  });
});
