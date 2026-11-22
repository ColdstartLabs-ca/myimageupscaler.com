import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider } from '@client/components/analytics/AnalyticsProvider';

const { mockLoadAnalytics, env } = vi.hoisted(() => ({
  mockLoadAnalytics: vi.fn(),
  env: { AMPLITUDE_API_KEY: '' },
}));

vi.mock('@client/utils/loadAnalytics', () => ({ loadAnalytics: mockLoadAnalytics }));
vi.mock('@shared/config/env', () => ({ clientEnv: env, isDevelopment: () => false }));
vi.mock('@shared/utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-a' } } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));
vi.mock('next/web-vitals', () => ({ useReportWebVitals: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

const PENDING_KEY = 'miu_pending_signup_conversion';

function makeAnalytics(enabledAfterInit: boolean) {
  let enabled = false;
  return {
    isEnabled: vi.fn(() => enabled),
    getConsent: vi.fn(() => 'granted'),
    track: vi.fn(),
    trackPageView: vi.fn(() => {
      enabled = !enabledAfterInit;
    }),
    init: vi.fn(async () => {
      enabled = enabledAfterInit;
    }),
  };
}

describe('AnalyticsProvider sign_up delivery after the auth redirect', () => {
  beforeEach(() => {
    window.sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ method: 'google', userId: 'user-a', expiresAt: Date.now() + 60_000 })
    );
    (window as unknown as { gtag: () => void }).gtag = vi.fn();
  });

  it('delivers on the page view of the redirect target', async () => {
    env.AMPLITUDE_API_KEY = '';
    const analytics = makeAnalytics(false);
    mockLoadAnalytics.mockResolvedValue(analytics);

    render(<AnalyticsProvider>page</AnalyticsProvider>);

    await waitFor(() =>
      expect(analytics.track).toHaveBeenCalledWith('signup_completed', { method: 'google' })
    );
  });

  it('delivers as soon as analytics finishes starting', async () => {
    env.AMPLITUDE_API_KEY = 'test-key';
    const analytics = makeAnalytics(true);
    mockLoadAnalytics.mockResolvedValue(analytics);

    render(<AnalyticsProvider>page</AnalyticsProvider>);

    await waitFor(() => expect(analytics.init).toHaveBeenCalled());
    await waitFor(() => expect(analytics.track).toHaveBeenCalledTimes(1));
  });
});
