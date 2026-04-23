/**
 * Unit tests for NavBar upgrade button visibility.
 *
 * Verifies that the persistent "Upgrade" button in the nav header renders only
 * for authenticated free users, and is hidden for paid users or unauthenticated visitors.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => ({
  ChevronDown: () => null,
  Menu: () => null,
  X: () => null,
  Zap: () => null,
}));

vi.mock('@client/components/i18n/LocaleSwitcher', () => ({
  LocaleSwitcher: () => null,
}));

vi.mock('@client/components/stripe/CreditsDisplay', () => ({
  CreditsDisplay: () => null,
}));

vi.mock('@client/components/stripe/CheckoutModal', () => ({
  CheckoutModal: () => null,
}));

vi.mock('@client/components/stripe/PurchaseModal', () => ({
  PurchaseModal: () => null,
}));

vi.mock('@client/hooks/useClickOutside', () => ({
  useClickOutside: () => {},
}));

vi.mock('@client/analytics', () => ({
  analytics: { track: vi.fn(), isEnabled: () => true },
}));

vi.mock('@client/utils/checkoutTrackingContext', () => ({
  setCheckoutTrackingContext: vi.fn(),
  getCheckoutTrackingContext: vi.fn(() => null),
}));

vi.mock('@shared/config/subscription.config', () => ({
  resolveCheapestRegionalPlan: vi.fn(() => 'price_test_cheapest'),
}));

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    APP_NAME: 'MyImageUpscaler',
    CACHE_USER_KEY_PREFIX: 'test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  },
}));

vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({
    tier: 'standard',
    country: null,
    isLoading: false,
    pricingRegion: 'standard',
  }),
}));

vi.mock('@/lib/anti-freeloader/region-classifier', () => ({
  getFreeCreditsForTier: () => 3,
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement('img', { src: props.src as string, alt: props.alt as string }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

vi.mock('@/i18n/config', () => ({
  DEFAULT_LOCALE: 'en',
}));

vi.mock('@/shared/types/authProviders.types', () => ({
  AuthProvider: { EMAIL: 'email' },
}));

// ---------------------------------------------------------------------------
// Configurable store mock — set before each test
// ---------------------------------------------------------------------------

let mockIsAuthenticated = false;
let mockIsFreeUser = false;
let mockIsLoading = false;

vi.mock('@client/store/userStore', () => ({
  useUserStore: () => ({
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockIsLoading,
    user: mockIsAuthenticated ? { email: 'user@example.com', provider: 'email' } : null,
    signOut: vi.fn(),
  }),
  useUserData: () => ({
    isFreeUser: mockIsFreeUser,
  }),
}));

vi.mock('@client/store/modalStore', () => ({
  useModalStore: () => ({
    openAuthModal: vi.fn(),
  }),
}));

// Import AFTER mocks
import { NavBar } from '@client/components/navigation/NavBar';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NavBar — Upgrade button visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to safe defaults
    mockIsAuthenticated = false;
    mockIsFreeUser = false;
    mockIsLoading = false;
    // Clear sessionStorage so analytics side-effects don't bleed between tests
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('nav_persistent_shown');
    }
  });

  test('should render Upgrade button for authenticated free user', () => {
    mockIsAuthenticated = true;
    mockIsFreeUser = true;

    render(<NavBar />);

    expect(screen.getByTestId('nav-upgrade-button')).toBeInTheDocument();
  });

  test('should NOT render Upgrade button for paid user (isFreeUser=false)', () => {
    mockIsAuthenticated = true;
    mockIsFreeUser = false;

    render(<NavBar />);

    expect(screen.queryByTestId('nav-upgrade-button')).not.toBeInTheDocument();
  });

  test('should NOT render Upgrade button for unauthenticated user', () => {
    mockIsAuthenticated = false;
    mockIsFreeUser = false; // unauthenticated users are never free users in this context

    render(<NavBar />);

    expect(screen.queryByTestId('nav-upgrade-button')).not.toBeInTheDocument();
  });
});
