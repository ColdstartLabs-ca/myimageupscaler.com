import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { CheckoutRescueOffer } from '@client/components/stripe/CheckoutRescueOffer';
import type { ICheckoutRescueOffer } from '@shared/types/checkout-offer';
import { STRIPE_PRICES } from '@shared/config/stripe';

// Mock lucide-react icons
vi.mock('lucide-react', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const iconStub = ({ children, ...props }: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'icon', ...props }, children as React.ReactNode);
  return {
    ...actual,
    Clock: iconStub,
    Sparkles: iconStub,
  };
});

describe('CheckoutRescueOffer component', () => {
  const mockOffer: ICheckoutRescueOffer = {
    offerToken: 'test.token',
    priceId: STRIPE_PRICES.HOBBY_MONTHLY,
    discountPercent: 20,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };

  const defaultProps = {
    offer: mockOffer,
    isApplying: false,
    onClaim: vi.fn(),
    onDismiss: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-07T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('rendering', () => {
    test('renders the offer modal with title and description', () => {
      render(<CheckoutRescueOffer {...defaultProps} />);

      expect(screen.getByText(/Wait, here's 20% off/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Finish checkout now and keep this rescue offer for the next few minutes/i)
      ).toBeInTheDocument();
    });

    test('shows correct discount percentage in claim button', () => {
      render(<CheckoutRescueOffer {...defaultProps} />);

      expect(screen.getByText(/Claim 20% Off/i)).toBeInTheDocument();
    });

    test('shows "No thanks" dismiss button', () => {
      render(<CheckoutRescueOffer {...defaultProps} />);

      expect(screen.getByText(/No thanks/i)).toBeInTheDocument();
    });

    test('displays countdown timer with remaining time', () => {
      const offerWithExpiry: ICheckoutRescueOffer = {
        ...mockOffer,
        expiresAt: new Date('2026-04-07T12:05:00.000Z').toISOString(),
      };

      render(<CheckoutRescueOffer {...defaultProps} offer={offerWithExpiry} />);

      expect(screen.getByText(/Valid for/i)).toBeInTheDocument();
    });

    test('shows applying state when isApplying is true', () => {
      render(<CheckoutRescueOffer {...defaultProps} isApplying={true} />);

      expect(screen.getByText(/Applying discount.../i)).toBeInTheDocument();
      expect(screen.getByText(/No thanks/i)).toBeDisabled();
    });

    test('disables claim button when time has expired', () => {
      const expiredOffer: ICheckoutRescueOffer = {
        ...mockOffer,
        expiresAt: new Date('2026-04-07T11:59:00.000Z').toISOString(),
      };

      render(<CheckoutRescueOffer {...defaultProps} offer={expiredOffer} />);

      const claimButton = screen.getByText(/Claim 20% Off/i);
      expect(claimButton).toBeDisabled();
    });
  });

  describe('user interactions', () => {
    test('calls onClaim when claim button is clicked', () => {
      render(<CheckoutRescueOffer {...defaultProps} />);

      const claimButton = screen.getByText(/Claim 20% Off/i);
      fireEvent.click(claimButton);

      expect(defaultProps.onClaim).toHaveBeenCalledTimes(1);
    });

    test('does not call onClaim when claim button is disabled', () => {
      render(<CheckoutRescueOffer {...defaultProps} isApplying={true} />);

      const claimButton = screen.getByText(/Applying discount.../i);
      fireEvent.click(claimButton);

      expect(defaultProps.onClaim).not.toHaveBeenCalled();
    });

    test('calls onDismiss when dismiss button is clicked', () => {
      render(<CheckoutRescueOffer {...defaultProps} />);

      const dismissButton = screen.getByText(/No thanks/i);
      fireEvent.click(dismissButton);

      expect(defaultProps.onDismiss).toHaveBeenCalledTimes(1);
    });

    test('does not call onDismiss when dismiss button is disabled during apply', () => {
      render(<CheckoutRescueOffer {...defaultProps} isApplying={true} />);

      const dismissButton = screen.getByText(/No thanks/i);
      fireEvent.click(dismissButton);

      expect(defaultProps.onDismiss).not.toHaveBeenCalled();
    });
  });

  describe('countdown timer', () => {
    test('updates countdown every second', async () => {
      const offer: ICheckoutRescueOffer = {
        ...mockOffer,
        expiresAt: new Date('2026-04-07T12:05:00.000Z').toISOString(),
      };

      render(<CheckoutRescueOffer {...defaultProps} offer={offer} />);

      const initialText = screen.getByText(/Valid for/i).textContent;

      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      const updatedText = screen.getByText(/Valid for/i).textContent;
      expect(updatedText).not.toBe(initialText);
    });

    test('clears interval on unmount', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      const { unmount } = render(<CheckoutRescueOffer {...defaultProps} />);

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    test('has proper z-index for modal overlay', () => {
      const { container } = render(<CheckoutRescueOffer {...defaultProps} />);

      const overlay = container.querySelector('.z-\\[60\\]');
      expect(overlay).toBeInTheDocument();
    });

    test('claim button is properly disabled visually and functionally', () => {
      render(<CheckoutRescueOffer {...defaultProps} isApplying={true} />);

      const claimButton = screen.getByText(/Applying discount.../i);
      expect(claimButton).toBeDisabled();
      // Check for disabled styling classes
      expect(claimButton.className).toContain('opacity-60');
      expect(claimButton.className).toContain('cursor-not-allowed');
    });

    test('dismiss button is properly disabled visually and functionally', () => {
      render(<CheckoutRescueOffer {...defaultProps} isApplying={true} />);

      const dismissButton = screen.getByText(/No thanks/i);
      expect(dismissButton).toBeDisabled();
      // Check for disabled styling classes
      expect(dismissButton.className).toContain('opacity-60');
      expect(dismissButton.className).toContain('cursor-not-allowed');
    });
  });

  describe('edge cases', () => {
    test('renders with different discount percentages', () => {
      const customOffer: ICheckoutRescueOffer = {
        ...mockOffer,
        discountPercent: 15,
      };

      render(<CheckoutRescueOffer {...defaultProps} offer={customOffer} />);

      expect(screen.getByText(/Claim 15% Off/i)).toBeInTheDocument();
    });

    test('handles rapid clicks on claim button', () => {
      render(<CheckoutRescueOffer {...defaultProps} />);

      const claimButton = screen.getByText(/Claim 20% Off/i);

      fireEvent.click(claimButton);
      fireEvent.click(claimButton);
      fireEvent.click(claimButton);

      expect(defaultProps.onClaim).toHaveBeenCalledTimes(3);
    });
  });
});
