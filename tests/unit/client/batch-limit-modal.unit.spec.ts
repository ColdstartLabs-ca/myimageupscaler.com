/**
 * Unit tests for BatchLimitModal component
 *
 * Tests A/B variant rendering, quick-buy behavior, analytics tracking,
 * and before/after image display.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import React from 'react';

// Mock the next-intl useTranslations hook
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      'workspace.batchLimit': {
        title_value: 'Upscale Unlimited Images',
        title_outcome: 'Your Images Deserve Better Quality',
        title_urgency: 'Limited Time: 50 Credits for $4.99',
        body_value: 'Get 50 credits for just $4.99 — batch process, pro AI models, 4K output.',
        body_outcome:
          'See the difference pro AI models make. Sharper details, cleaner edges, up to 4K resolution.',
        body_urgency: 'Start batch processing now. Pro AI models included.',
        remainingSlotsMessage:
          'You have {availableSlots} of {limit} slots remaining in your queue.',
        securityMessage:
          'This is a security measure to prevent abuse. The limit will reset in approximately 1 hour. Upgrade your plan for higher limits.',
        quickBuyButton: 'Get 50 Credits — $4.99',
        seePlansButton: 'See All Plans',
        addPartialButton: 'Add {availableSlots} {count, plural, one {image} other {images}}',
      },
      common: {
        cancel: 'Cancel',
      },
    };
    return translations[namespace]?.[key] || key;
  },
}));

// Mock next/navigation
const mockRouter = {
  push: vi.fn(),
};
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Sparkles: () => React.createElement('span', { 'data-testid': 'sparkles-icon' }, 'Sparkles Icon'),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) =>
    React.createElement('img', {
      src,
      alt,
      ...props,
      'data-testid': `image-${alt.split(':')[0].toLowerCase()}`,
    }),
}));

// Mock Modal component
const MockModal = ({
  isOpen,
  onClose,
  children,
  ...props
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  [key: string]: unknown;
}) => {
  if (!isOpen) return null;
  return React.createElement(
    'div',
    { ...props, 'data-testid': 'batch-limit-modal' },
    children,
    React.createElement(
      'button',
      { onClick: onClose, 'aria-label': 'Close modal', 'data-testid': 'modal-close-button' },
      'Close'
    )
  );
};

vi.mock('@client/components/ui/Modal', () => ({
  Modal: MockModal,
}));

// Mock Button component
vi.mock('@client/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    variant,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    className?: string;
  }) =>
    React.createElement(
      'button',
      {
        onClick,
        className,
        'data-variant': variant,
        'data-testid': `button-${variant}`,
      },
      children
    ),
}));

// Mock analytics
vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: {
    track: vi.fn(),
  },
}));

// Mock abTest utility - we'll control this per test
let mockGetVariant: ReturnType<typeof vi.fn>;
vi.mock('@client/utils/abTest', () => ({
  getVariant: (...args: unknown[]) => mockGetVariant(...args),
}));

// Mock clientEnv
vi.mock('@shared/config/env', () => ({
  clientEnv: {
    NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL: 'price_test_small_123',
  },
}));

describe('BatchLimitModal', () => {
  const mockProps = {
    isOpen: true,
    onClose: vi.fn(),
    limit: 1,
    attempted: 5,
    currentCount: 1,
    onAddPartial: vi.fn(),
    onUpgrade: vi.fn(),
    serverEnforced: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for getVariant - returns 'value' variant
    mockGetVariant = vi.fn(() => 'value');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('A/B variant rendering', () => {
    it('should render value variant when assigned', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');

      render(React.createElement(BatchLimitModal, mockProps));

      expect(screen.getByText('Upscale Unlimited Images')).toBeInTheDocument();
      expect(
        screen.getByText('Get 50 credits for just $4.99 — batch process, pro AI models, 4K output.')
      ).toBeInTheDocument();
    });

    it('should render outcome variant when assigned', async () => {
      mockGetVariant = vi.fn(() => 'outcome');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');

      render(React.createElement(BatchLimitModal, mockProps));

      expect(screen.getByText('Your Images Deserve Better Quality')).toBeInTheDocument();
      expect(
        screen.getByText(
          'See the difference pro AI models make. Sharper details, cleaner edges, up to 4K resolution.'
        )
      ).toBeInTheDocument();
    });

    it('should render urgency variant when assigned', async () => {
      mockGetVariant = vi.fn(() => 'urgency');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');

      render(React.createElement(BatchLimitModal, mockProps));

      expect(screen.getByText('Limited Time: 50 Credits for $4.99')).toBeInTheDocument();
      expect(
        screen.getByText('Start batch processing now. Pro AI models included.')
      ).toBeInTheDocument();
    });

    it('should call getVariant with correct experiment name and variants', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');

      render(React.createElement(BatchLimitModal, mockProps));

      expect(mockGetVariant).toHaveBeenCalledWith('batch_limit_copy', [
        'value',
        'outcome',
        'urgency',
      ]);
    });
  });

  describe('Before/After images', () => {
    it('should show face-pro before/after images', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');

      render(React.createElement(BatchLimitModal, mockProps));

      const beforeImage = screen.getByTestId('image-before');
      const afterImage = screen.getByTestId('image-after');

      expect(beforeImage).toBeInTheDocument();
      expect(afterImage).toBeInTheDocument();
      expect(beforeImage).toHaveAttribute('src', '/before-after/face-pro/before.webp');
      expect(afterImage).toHaveAttribute('src', '/before-after/face-pro/after.webp');
    });

    it('should display before/after labels', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');

      render(React.createElement(BatchLimitModal, mockProps));

      expect(screen.getByText('Before')).toBeInTheDocument();
      expect(screen.getByText('After')).toBeInTheDocument();
    });
  });

  describe('Quick-buy functionality', () => {
    it('should navigate to checkout on quick-buy click', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');

      render(React.createElement(BatchLimitModal, mockProps));

      const quickBuyButton = screen.getByTestId('button-gradient');
      fireEvent.click(quickBuyButton);

      expect(mockRouter.push).toHaveBeenCalledWith('/checkout?priceId=price_test_small_123');
      expect(mockProps.onClose).toHaveBeenCalled();
    });

    it('should track quick-buy click with correct analytics properties', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');
      const { analytics } = await import('@client/analytics/analyticsClient');

      render(React.createElement(BatchLimitModal, mockProps));

      const quickBuyButton = screen.getByTestId('button-gradient');
      fireEvent.click(quickBuyButton);

      expect(analytics.track).toHaveBeenCalledWith('batch_limit_quick_buy_clicked', {
        limit: 1,
        attempted: 5,
        currentCount: 1,
        serverEnforced: false,
        userType: 'free',
        copyVariant: 'value',
        quickBuy: true,
      });
    });

    it('should open purchase modal on see plans click', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');

      render(React.createElement(BatchLimitModal, mockProps));

      const seePlansButton = screen.getByRole('button', { name: /See All Plans/i });
      fireEvent.click(seePlansButton);

      expect(mockProps.onUpgrade).toHaveBeenCalled();
      expect(mockProps.onClose).toHaveBeenCalled();
    });

    it('should track see plans click with quickBuy: false', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');
      const { analytics } = await import('@client/analytics/analyticsClient');

      render(React.createElement(BatchLimitModal, mockProps));

      const seePlansButton = screen.getByRole('button', { name: /See All Plans/i });
      fireEvent.click(seePlansButton);

      expect(analytics.track).toHaveBeenCalledWith('batch_limit_see_plans_clicked', {
        limit: 1,
        attempted: 5,
        currentCount: 1,
        serverEnforced: false,
        userType: 'free',
        copyVariant: 'value',
        quickBuy: false,
      });
    });
  });

  describe('Analytics tracking', () => {
    it('should track modal shown with copyVariant', async () => {
      mockGetVariant = vi.fn(() => 'urgency');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');
      const { analytics } = await import('@client/analytics/analyticsClient');

      render(React.createElement(BatchLimitModal, mockProps));

      expect(analytics.track).toHaveBeenCalledWith('batch_limit_modal_shown', {
        limit: 1,
        attempted: 5,
        currentCount: 1,
        availableSlots: 0,
        serverEnforced: false,
        userType: 'free',
        copyVariant: 'urgency',
      });
    });

    it('should track modal closed with copyVariant', async () => {
      mockGetVariant = vi.fn(() => 'outcome');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');
      const { analytics } = await import('@client/analytics/analyticsClient');

      render(React.createElement(BatchLimitModal, mockProps));

      // The modal close button should call onClose which triggers tracking
      const closeButton = screen.getByTestId('modal-close-button');
      fireEvent.click(closeButton);

      // The onClose prop should be called
      expect(mockProps.onClose).toHaveBeenCalled();

      // Analytics should track the close event
      expect(analytics.track).toHaveBeenCalledWith('batch_limit_modal_closed', {
        limit: 1,
        attempted: 5,
        currentCount: 1,
        availableSlots: 0,
        serverEnforced: false,
        userType: 'free',
        copyVariant: 'outcome',
      });
    });

    it('should track partial add clicked with copyVariant', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const propsWithAvailableSlots = { ...mockProps, limit: 10, currentCount: 7 };
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');
      const { analytics } = await import('@client/analytics/analyticsClient');

      render(React.createElement(BatchLimitModal, propsWithAvailableSlots));

      // Find the ghost button with the partial add text
      const buttons = screen.getAllByTestId('button-ghost');
      const addButton = buttons.find(btn => btn.textContent?.includes('Add'));

      expect(addButton).toBeDefined();
      if (addButton) {
        fireEvent.click(addButton);

        expect(analytics.track).toHaveBeenCalledWith('batch_limit_partial_add_clicked', {
          limit: 10,
          attempted: 5,
          currentCount: 7,
          availableSlots: 3,
          serverEnforced: false,
          userType: 'paid',
          copyVariant: 'value',
        });
      }
    });
  });

  describe('Icon and styling changes', () => {
    it('should render Sparkles icon instead of AlertTriangle', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');

      render(React.createElement(BatchLimitModal, mockProps));

      expect(screen.getByTestId('sparkles-icon')).toBeInTheDocument();
    });

    it('should use gradient variant for primary CTA', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');

      render(React.createElement(BatchLimitModal, mockProps));

      const quickBuyButton = screen.getByTestId('button-gradient');
      expect(quickBuyButton).toBeInTheDocument();
    });
  });

  describe('User type detection', () => {
    it('should identify free users (limit <= 5)', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');
      const { analytics } = await import('@client/analytics/analyticsClient');

      render(React.createElement(BatchLimitModal, mockProps));

      expect(analytics.track).toHaveBeenCalledWith(
        'batch_limit_modal_shown',
        expect.objectContaining({
          userType: 'free',
        })
      );
    });

    it('should identify paid users (limit > 5)', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');
      const { analytics } = await import('@client/analytics/analyticsClient');

      const paidProps = { ...mockProps, limit: 50, currentCount: 25 };
      render(React.createElement(BatchLimitModal, paidProps));

      expect(analytics.track).toHaveBeenCalledWith(
        'batch_limit_modal_shown',
        expect.objectContaining({
          userType: 'paid',
        })
      );
    });
  });

  describe('Server-enforced mode', () => {
    it('should show security message when serverEnforced is true', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');

      const serverEnforcedProps = { ...mockProps, serverEnforced: true };
      render(React.createElement(BatchLimitModal, serverEnforcedProps));

      expect(
        screen.getByText(
          'This is a security measure to prevent abuse. The limit will reset in approximately 1 hour. Upgrade your plan for higher limits.'
        )
      ).toBeInTheDocument();
    });

    it('should track serverEnforced flag in analytics', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');
      const { analytics } = await import('@client/analytics/analyticsClient');

      const serverEnforcedProps = { ...mockProps, serverEnforced: true };
      render(React.createElement(BatchLimitModal, serverEnforcedProps));

      expect(analytics.track).toHaveBeenCalledWith(
        'batch_limit_modal_shown',
        expect.objectContaining({
          serverEnforced: true,
        })
      );
    });
  });

  describe('Modal visibility', () => {
    it('should not render when isOpen is false', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');

      const { container } = render(
        React.createElement(BatchLimitModal, { ...mockProps, isOpen: false })
      );

      expect(container.querySelector('[data-testid="batch-limit-modal"]')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', async () => {
      mockGetVariant = vi.fn(() => 'value');
      const { BatchLimitModal } =
        await import('@/client/components/features/workspace/BatchLimitModal');

      render(React.createElement(BatchLimitModal, { ...mockProps, isOpen: true }));

      expect(screen.getByTestId('batch-limit-modal')).toBeInTheDocument();
    });
  });
});
