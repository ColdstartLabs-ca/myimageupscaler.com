/**
 * Unit tests for DashboardSidebar — UpgradeCard always-visible behaviour.
 *
 * Verifies that the UpgradeCard renders unconditionally for free users
 * (no probability gate) and is hidden for paid users.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks (matching DashboardSidebar.unit.spec.tsx pattern)
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => ({
  LayoutDashboard: () => null,
  CreditCard: () => null,
  Settings: () => null,
  HelpCircle: () => null,
  LogOut: () => null,
  Shield: () => null,
  X: () => null,
  Loader2: () => null,
  Zap: () => null,
}));

vi.mock('@client/components/stripe/CreditsDisplay', () => ({
  CreditsDisplay: () => React.createElement('div', { 'data-testid': 'credits-display' }),
}));

vi.mock('@client/components/i18n/LocaleSwitcher', () => ({
  LocaleSwitcher: () => null,
}));

// Mock UpgradeCard so we can detect its presence without framer-motion
vi.mock('@client/components/dashboard/UpgradeCard', () => ({
  UpgradeCard: () => React.createElement('div', { 'data-testid': 'upgrade-card' }),
}));

vi.mock('@client/components/stripe/PurchaseModal', () => ({
  PurchaseModal: () => null,
}));

vi.mock('@client/utils/logger', () => ({
  useLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@client/utils/cn', () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({
    tier: 'standard',
    country: null,
    isLoading: false,
    pricingRegion: 'standard',
  }),
}));

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    APP_NAME: 'MyImageUpscaler',
    CACHE_USER_KEY_PREFIX: 'test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  },
  loadEnv: () => ({
    APP_NAME: 'MyImageUpscaler',
    CACHE_USER_KEY_PREFIX: 'test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  }),
  serverEnv: {},
}));

vi.mock('next-intl', async () => {
  const actual = await vi.importActual<typeof import('next-intl')>('next-intl');
  return {
    ...actual,
    useTranslations: () => (key: string) => key,
  };
});

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement('img', { src: props.src as string, alt: props.alt as string }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// userStore mock — configurable isFreeUser
// ---------------------------------------------------------------------------

let mockIsFreeUser = true;
let mockUserSegment: 'free' | 'credit_purchaser' | 'subscriber' = 'free';

vi.mock('@client/store/userStore', () => ({
  useUserStore: vi.fn(() => ({
    signOut: vi.fn(),
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      provider: 'email',
      role: 'user',
      profile: {
        id: 'user-1',
        subscription_status: null,
        subscription_tier: null,
      },
      subscription: null,
    },
    isLoading: false,
    error: null,
  })),
  useIsAdmin: vi.fn(() => false),
  useSubscription: vi.fn(() => null),
  useUserData: vi.fn(() => ({
    totalCredits: 100,
    profile: null,
    subscription: null,
    isAuthenticated: true,
    isFreeUser: mockIsFreeUser,
    userSegment: mockUserSegment,
  })),
  useProfile: vi.fn(() => null),
}));

// Import AFTER mocks
import { DashboardSidebar } from '@client/components/dashboard/DashboardSidebar';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardSidebar — UpgradeCard always-visible', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFreeUser = true;
    mockUserSegment = 'free';
  });

  test('should always render UpgradeCard for free user without any probability gate', () => {
    mockIsFreeUser = true;

    render(<DashboardSidebar />);

    // Must be present unconditionally — no roll-of-the-dice guard
    expect(screen.getByTestId('upgrade-card')).toBeInTheDocument();
  });

  test('should NOT render UpgradeCard for paid user', () => {
    mockIsFreeUser = false;
    mockUserSegment = 'subscriber';

    render(<DashboardSidebar />);

    expect(screen.queryByTestId('upgrade-card')).not.toBeInTheDocument();
  });
});
