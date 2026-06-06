import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pricing, calculateDiscountedPrice } from '@client/components/features/landing/Pricing';

const mockOpenAuthModal = vi.fn();

vi.mock('@client/store/modalStore', () => ({
  useModalStore: () => ({
    openAuthModal: mockOpenAuthModal,
  }),
}));

vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({
    discountPercent: 0,
    tier: 'standard',
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, number>) => {
    if (namespace === 'pricing') {
      const pricingLabels: Record<string, string> = {
        'creditPacks.subtitle': 'Buy credits once, use anytime.',
        'creditPacks.comparePlans': 'Compare subscription plans',
      };
      return pricingLabels[key] ?? key;
    }

    if (key === 'pricingCtaSubtext' && values?.freeCredits) {
      return `${values.freeCredits} free credits • No credit card`;
    }
    if (key === 'ctaGetFreeCredits' && values?.freeCredits) {
      return `Get ${values.freeCredits} Free Credits`;
    }
    const labels: Record<string, string> = {
      pricingCtaDescription: 'Professional quality enhancement at prosumer prices.',
      ctaSeeWhatItCosts: 'See What It Costs',
      ctaGetFreeCredits: 'Get Free Credits',
      pricingCtaSubtext: 'Free credits • No credit card',
    };
    return labels[key] ?? key;
  },
  useLocale: () => 'en',
}));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('lucide-react', async importOriginal => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return actual;
});

vi.mock('@client/components/seo/JsonLd', () => ({
  JsonLd: () => null,
}));

vi.mock('@client/components/stripe', () => ({
  CreditPackSelector: ({ discountPercent }: { discountPercent: number }) => (
    <div data-testid="credit-pack-selector">discount:{discountPercent}</div>
  ),
  SubscriptionPlanGrid: ({ discountPercent }: { discountPercent: number }) => (
    <div data-testid="subscription-plan-grid">discount:{discountPercent}</div>
  ),
  TrustBadges: () => <div data-testid="trust-badges" />,
}));

describe('Pricing landing section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to credit packs tab', () => {
    render(<Pricing />);

    expect(screen.getByTestId('landing-credit-packs')).toBeInTheDocument();
    expect(screen.getByTestId('credit-pack-selector')).toBeInTheDocument();
    expect(screen.queryByTestId('landing-subscriptions')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start for Free' })).not.toBeInTheDocument();
  });

  it('switches to subscription plans from toggle', () => {
    render(<Pricing />);

    fireEvent.click(screen.getByRole('button', { name: /Subscribe/i }));

    expect(screen.getByTestId('landing-subscriptions')).toBeInTheDocument();
    expect(screen.getByTestId('subscription-plan-grid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start for Free' })).toBeInTheDocument();
    expect(screen.queryByTestId('landing-credit-packs')).not.toBeInTheDocument();
  });

  it('opens registration modal from free tier CTA on subscribe tab', () => {
    render(<Pricing />);

    fireEvent.click(screen.getByRole('button', { name: /Subscribe/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Start for Free' }));

    expect(mockOpenAuthModal).toHaveBeenCalledWith('register');
  });

  it('links to full pricing page from gradient CTA', () => {
    render(<Pricing />);

    const pricingLink = screen.getByRole('link', { name: /See What It Costs/i });
    expect(pricingLink).toHaveAttribute('href', '/pricing');
  });

  it('exports calculateDiscountedPrice helper', () => {
    expect(calculateDiscountedPrice(49, 65)).toBe(17.15);
    expect(calculateDiscountedPrice(0, 65)).toBe(0);
  });
});
