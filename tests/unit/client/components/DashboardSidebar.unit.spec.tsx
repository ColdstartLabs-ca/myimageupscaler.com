/**
 * Unit tests for DashboardSidebar component
 * Verifies the defensive check: canceled subscriptions always display "Free Plan"
 * regardless of stale subscription_tier data in the database.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

// --- Mocks must be declared before component import ---

// The vitest.setup.tsx globally mocks lucide-react but does not include all icons
// used by DashboardSidebar. Override with the full set this component needs.
vi.mock('lucide-react', () => ({
  LayoutDashboard: () => null,
  CreditCard: () => null,
  Settings: () => null,
  HelpCircle: () => null,
  LogOut: () => null,
  Shield: () => null,
  X: () => null,
  Loader2: () => null,
}));

vi.mock('@client/store/userStore', () => ({
  useUserStore: vi.fn(),
  useIsAdmin: vi.fn(() => false),
  useSubscription: vi.fn(() => null),
}));

vi.mock('@client/components/stripe/CreditsDisplay', () => ({
  CreditsDisplay: () => React.createElement('div', { 'data-testid': 'credits-display' }),
}));

vi.mock('@client/components/i18n/LocaleSwitcher', () => ({
  LocaleSwitcher: () => React.createElement('div', { 'data-testid': 'locale-switcher' }),
}));

vi.mock('@client/utils/logger', () => ({
  useLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@client/utils/cn', () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    APP_NAME: 'MyImageUpscaler',
    CACHE_USER_KEY_PREFIX: 'test',
  },
}));

// Mock translations for the sidebar namespace
vi.mock('next-intl', async () => {
  const actual = await vi.importActual<typeof import('next-intl')>('next-intl');
  return {
    ...actual,
    useTranslations: () => (key: string) => {
      const map: Record<string, string> = {
        dashboard: 'Dashboard',
        billing: 'Billing',
        settings: 'Settings',
        admin: 'Admin',
        helpSupport: 'Help & Support',
        signOut: 'Sign Out',
        closeMenu: 'Close menu',
        planUnavailable: 'Plan unavailable',
      };
      return map[key] ?? key;
    },
  };
});

// Import after mocks are set up
import { useUserStore, useIsAdmin, useSubscription } from '@client/store/userStore';
import { DashboardSidebar } from '@client/components/dashboard/DashboardSidebar';

const mockUseUserStore = vi.mocked(useUserStore);
const mockUseIsAdmin = vi.mocked(useIsAdmin);
const mockUseSubscription = vi.mocked(useSubscription);

// Helper: build a minimal IUserProfile
function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    stripe_customer_id: null,
    subscription_credits_balance: 0,
    purchased_credits_balance: 0,
    subscription_status: null,
    subscription_tier: null,
    role: 'user' as const,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// Helper: build the full user state that useUserStore returns
function buildUserState(profileOverrides: Record<string, unknown> = {}) {
  return {
    signOut: vi.fn(),
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      provider: 'email',
      role: 'user' as const,
      profile: buildProfile(profileOverrides),
      subscription: null,
    },
    isLoading: false,
    error: null,
  };
}

function renderSidebar() {
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <DashboardSidebar />
    </NextIntlClientProvider>
  );
}

describe('DashboardSidebar — plan display', () => {
  beforeEach(() => {
    mockUseIsAdmin.mockReturnValue(false);
    mockUseSubscription.mockReturnValue(null);
  });

  it('should show Free Plan when subscription_status is canceled, even with stale starter tier', () => {
    // Simulate the bug scenario: canceled subscription but subscription_tier is still 'starter'
    mockUseUserStore.mockReturnValue(
      buildUserState({
        subscription_status: 'canceled',
        subscription_tier: 'starter',
      }) as ReturnType<typeof useUserStore>
    );

    renderSidebar();

    // The plan badge must display "Free Plan" — not "Starter Plan"
    expect(screen.getByText('Free Plan')).toBeInTheDocument();
  });

  it('should show Starter Plan when subscription is active with starter tier', () => {
    mockUseUserStore.mockReturnValue(
      buildUserState({
        subscription_status: 'active',
        subscription_tier: 'starter',
      }) as ReturnType<typeof useUserStore>
    );

    renderSidebar();

    expect(screen.getByText('Starter Plan')).toBeInTheDocument();
  });

  it('should show Free Plan when subscription_tier is null and status is not canceled', () => {
    mockUseUserStore.mockReturnValue(
      buildUserState({
        subscription_status: null,
        subscription_tier: null,
      }) as ReturnType<typeof useUserStore>
    );

    renderSidebar();

    expect(screen.getByText('Free Plan')).toBeInTheDocument();
  });

  it('should show Free Plan when subscription_status is canceled with any tier', () => {
    const tiers = ['starter', 'hobby', 'pro', 'business'];

    for (const tier of tiers) {
      mockUseUserStore.mockReturnValue(
        buildUserState({
          subscription_status: 'canceled',
          subscription_tier: tier,
        }) as ReturnType<typeof useUserStore>
      );

      const { unmount } = renderSidebar();
      expect(screen.getByText('Free Plan')).toBeInTheDocument();
      unmount();
    }
  });

  it('should show correct plan names for active subscriptions', () => {
    // 'pro' tier maps to SUBSCRIPTION_PLANS.PRO_MONTHLY.name which is 'Professional'
    const cases = [
      { tier: 'hobby', expected: 'Hobby Plan' },
      { tier: 'pro', expected: 'Professional Plan' },
    ];

    for (const { tier, expected } of cases) {
      mockUseUserStore.mockReturnValue(
        buildUserState({
          subscription_status: 'active',
          subscription_tier: tier,
        }) as ReturnType<typeof useUserStore>
      );

      const { unmount } = renderSidebar();
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });
});
