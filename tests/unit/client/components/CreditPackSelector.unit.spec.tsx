import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreditPackSelector } from '@client/components/stripe/CreditPackSelector';

vi.mock('@client/analytics', () => ({
  analytics: {
    isEnabled: () => false,
    track: vi.fn(),
  },
}));

vi.mock('@client/store/userStore', () => ({
  useUserStore: () => ({ isAuthenticated: true }),
}));

vi.mock('@client/store/modalStore', () => ({
  useModalStore: () => ({ openAuthRequiredModal: vi.fn() }),
}));

vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({ pricingRegion: 'standard' }),
}));

vi.mock('./CheckoutModal', () => ({
  CheckoutModal: () => null,
}));

vi.mock('lucide-react', async importOriginal => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    Check: ({ className }: { className?: string }) => (
      <span data-testid="check-icon" className={className} />
    ),
    CreditCard: ({ className }: { className?: string }) => (
      <span data-testid="credit-card-icon" className={className} />
    ),
  };
});

describe('CreditPackSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses site gradient CTA styling on purchase buttons', () => {
    render(<CreditPackSelector />);

    screen.getAllByRole('button', { name: /purchase/i }).forEach(button => {
      expect(button.className).toContain('gradient-cta');
      expect(button.className).not.toContain('bg-accent');
    });
  });

  it('uses secondary badge styling for Best Value packs', () => {
    const { container } = render(<CreditPackSelector />);

    const bestValueBadge = screen.getByText('Best Value');
    expect(bestValueBadge.className).toContain('bg-secondary');
    expect(bestValueBadge.className).not.toContain('bg-success');

    const bestValueCard = bestValueBadge.closest('.relative.flex');
    expect(bestValueCard?.className).toContain('border-secondary/60');

    expect(container.querySelector('.gradient-text-primary')).toBeTruthy();
  });
});
