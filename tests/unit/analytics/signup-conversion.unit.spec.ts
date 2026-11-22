import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GA4Provider } from '@shared/analytics/providers/ga4-provider';
import { sanitizeGa4Params } from '@shared/analytics/types';
import { normalizeCoreEventProperties } from '@server/analytics/core-event-contract';
import {
  flushSignupConversion,
  markSignupConversion,
  openSignupFence,
} from '@client/analytics/signup-conversion';

const { mockLoadAnalytics } = vi.hoisted(() => ({ mockLoadAnalytics: vi.fn() }));
vi.mock('@client/utils/loadAnalytics', () => ({ loadAnalytics: mockLoadAnalytics }));

const { authListeners } = vi.hoisted(() => ({
  authListeners: [] as Array<(event: string, session: null) => void>,
}));
vi.mock('@shared/utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-a' } } }, error: null }),
      onAuthStateChange: (listener: (event: string, session: null) => void) => {
        authListeners.push(listener);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  }),
}));

const PENDING_KEY = 'miu_pending_signup_conversion';
const TEN_MINUTES_MS = 10 * 60 * 1000;

function setPending(method: string, expiresAt = Date.now() + TEN_MINUTES_MS): void {
  window.sessionStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ method, userId: 'user-a', expiresAt })
  );
}

type TWindowWithGtag = Window & { gtag?: (...args: unknown[]) => void };

function makeAnalytics(overrides: { enabled?: boolean; consent?: string } = {}) {
  return {
    isEnabled: vi.fn(() => overrides.enabled ?? true),
    getConsent: vi.fn(() => overrides.consent ?? 'granted'),
    track: vi.fn(),
  };
}

describe('GA4 payload validity', () => {
  // GA4's validation endpoint answers VALUE_INVALID for null params, and the
  // collection endpoint drops the whole event while still returning 2xx.
  it('sends account_created for direct traffic without null params', () => {
    const properties = normalizeCoreEventProperties('account_created', {
      method: 'google',
      pricingRegion: 'standard',
      attributionAvailable: true,
    });
    expect(properties.utmSource).toBeNull();

    const params = sanitizeGa4Params('account_created', { ...properties });

    expect(Object.values(params)).not.toContain(null);
    expect(params).toEqual({
      method: 'google',
      pricingRegion: 'standard',
      attributionAvailable: true,
    });
  });

  it('keeps meaningful falsy values and drops undefined', () => {
    expect(
      sanitizeGa4Params('login', { zero: 0, off: false, empty: '', gone: undefined, none: null })
    ).toEqual({ zero: 0, off: false, empty: '' });
  });

  it('still renames reserved traffic-source params', () => {
    expect(sanitizeGa4Params('login', { source: 'file_picker', medium: null })).toEqual({
      ui_source: 'file_picker',
    });
  });

  it('delivers signup_completed to gtag as the GA4 sign_up event', async () => {
    const gtag = vi.fn();
    (window as TWindowWithGtag).gtag = gtag;
    const provider = new GA4Provider();
    await provider.init({ measurementId: 'G-TEST' });

    provider.track('signup_completed', { method: 'google', first_touch_utm_source: null });

    expect(gtag).toHaveBeenCalledWith('event', 'sign_up', { method: 'google' });
    delete (window as TWindowWithGtag).gtag;
  });
});

describe('stored consent', () => {
  // AnalyticsProvider grants consent while getConsent() says pending, so a stale
  // pending answer before init would overwrite a stored denial on every page load.
  const storedConsent = vi.mocked(localStorage.getItem);

  afterEach(() => {
    storedConsent.mockReset();
  });

  it('reports a stored denial before analytics initializes', async () => {
    vi.resetModules();
    storedConsent.mockReturnValue(JSON.stringify({ analytics: 'denied' }));
    const { analytics } = await import('@client/analytics/analyticsClient');

    expect(analytics.getConsent()).toBe('denied');
  });

  it('reports pending for a first visit', async () => {
    vi.resetModules();
    storedConsent.mockReturnValue(null);
    const { analytics } = await import('@client/analytics/analyticsClient');

    expect(analytics.getConsent()).toBe('pending');
  });
});

describe('markSignupConversion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    (window as TWindowWithGtag).gtag = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as TWindowWithGtag).gtag;
  });

  it('holds the send so an auth redirect cannot destroy the queued GA4 hit', async () => {
    const analytics = makeAnalytics();
    mockLoadAnalytics.mockResolvedValue(analytics);

    await markSignupConversion('google', 'user-a', openSignupFence());
    await vi.advanceTimersByTimeAsync(1000);

    expect(analytics.track).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull();
  });

  it('sends on the same page when no redirect follows', async () => {
    const analytics = makeAnalytics();
    mockLoadAnalytics.mockResolvedValue(analytics);

    await markSignupConversion('email', 'user-a', openSignupFence());
    await vi.advanceTimersByTimeAsync(3000);

    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith('signup_completed', { method: 'email' });
  });
});

describe('flushSignupConversion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    (window as TWindowWithGtag).gtag = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as TWindowWithGtag).gtag;
  });

  it('emits once with the method and no identity data', async () => {
    setPending('google');
    const analytics = makeAnalytics();

    await flushSignupConversion(analytics);
    await flushSignupConversion(analytics);

    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith('signup_completed', { method: 'google' });
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it.each(['/auth/callback', '/de/auth/confirm'])(
    'holds the conversion on %s because that page redirects next',
    async path => {
      window.history.pushState({}, '', path);
      setPending('google');
      const analytics = makeAnalytics();

      await flushSignupConversion(analytics);
      await vi.runAllTimersAsync();

      expect(analytics.track).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull();
      window.history.pushState({}, '', '/');
    }
  );

  it('emits nothing without a pending conversion', async () => {
    const analytics = makeAnalytics();

    await flushSignupConversion(analytics);

    expect(analytics.track).not.toHaveBeenCalled();
  });

  it('discards the conversion when consent is denied', async () => {
    setPending('email');
    const analytics = makeAnalytics({ enabled: false, consent: 'denied' });

    await flushSignupConversion(analytics);
    await vi.runAllTimersAsync();

    expect(analytics.track).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('waits for analytics startup, then emits once', async () => {
    setPending('google');
    const analytics = makeAnalytics({ enabled: false, consent: 'pending' });

    await flushSignupConversion(analytics);
    expect(analytics.track).not.toHaveBeenCalled();

    analytics.isEnabled.mockReturnValue(true);
    analytics.getConsent.mockReturnValue('granted');
    await vi.runAllTimersAsync();

    expect(analytics.track).toHaveBeenCalledTimes(1);
  });

  it('waits for the lazy-loaded gtag instead of losing the event', async () => {
    setPending('google');
    delete (window as TWindowWithGtag).gtag;
    const analytics = makeAnalytics();

    await flushSignupConversion(analytics);
    expect(analytics.track).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull();

    (window as TWindowWithGtag).gtag = vi.fn();
    await vi.runAllTimersAsync();

    expect(analytics.track).toHaveBeenCalledTimes(1);
  });

  it('stops retrying and keeps the conversion for the next page when analytics never starts', async () => {
    setPending('google');
    const analytics = makeAnalytics({ enabled: false, consent: 'pending' });

    await flushSignupConversion(analytics);
    await vi.runAllTimersAsync();

    expect(vi.getTimerCount()).toBe(0);
    expect(analytics.track).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull();
  });

  describe('signup lifecycle bound', () => {
    it('discards a conversion past its lifetime without sending', async () => {
      setPending('google', Date.now() - 1);
      const analytics = makeAnalytics();

      await flushSignupConversion(analytics);

      expect(analytics.track).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
    });

    it('expires a conversion that waited through its retries', async () => {
      const analytics = makeAnalytics({ enabled: false, consent: 'pending' });
      mockLoadAnalytics.mockResolvedValue(analytics);
      await markSignupConversion('google', 'user-a', openSignupFence());
      await flushSignupConversion(analytics);
      await vi.advanceTimersByTimeAsync(TEN_MINUTES_MS + 1);

      const later = makeAnalytics();
      await flushSignupConversion(later);

      expect(later.track).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
    });

    it.each([
      'google',
      '{"method":"google"}',
      '{"expiresAt":9999999999999}',
      '{"method":"google","expiresAt":9999999999999}',
      'null',
      '{',
    ])('discards the malformed entry %s without sending', async raw => {
      window.sessionStorage.setItem(PENDING_KEY, raw);
      const analytics = makeAnalytics();

      await flushSignupConversion(analytics);

      expect(analytics.track).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
    });

    it('does not carry a conversion across a sign-out', async () => {
      setPending('google');
      const analytics = makeAnalytics({ enabled: false });
      await flushSignupConversion(analytics);

      authListeners.forEach(listener => listener('SIGNED_OUT', null));
      analytics.isEnabled.mockReturnValue(true);
      await flushSignupConversion(analytics);

      expect(analytics.track).not.toHaveBeenCalled();
    });
  });
});
