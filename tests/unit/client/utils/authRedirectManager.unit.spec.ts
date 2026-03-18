/**
 * Unit tests for authRedirectManager
 *
 * Covers the post-auth checkout redirect fix.
 * New behavior: when a checkout intent has returnTo set (e.g. /pricing?checkout=priceId),
 * handleAuthRedirect uses returnTo directly so the user returns to the pricing page
 * with the checkout modal pre-opened. Falls back to /checkout?priceId=... when returnTo
 * is absent (backward compatibility).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers: localStorage and window.location stubs
// ---------------------------------------------------------------------------

const REDIRECT_STORAGE_KEY = 'auth_redirect_intent';
const INTENT_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

function makeIntent(
  overrides: Partial<{
    action: string;
    context: Record<string, unknown>;
    returnTo: string;
    timestamp: number;
  }> = {}
) {
  return {
    action: 'checkout',
    context: { priceId: 'price_test_123' },
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Install a real in-memory localStorage implementation into the global mock.
 * The global vitest.setup.tsx mocks localStorage with vi.fn() stubs that don't
 * persist state. This helper wires the stubs to an actual Map so get/set/remove/clear
 * all work correctly within each test.
 */
function installRealLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.mocked(localStorage.getItem).mockImplementation((key: string) => store.get(key) ?? null);
  vi.mocked(localStorage.setItem).mockImplementation((key: string, value: string) => {
    store.set(key, value);
  });
  vi.mocked(localStorage.removeItem).mockImplementation((key: string) => {
    store.delete(key);
  });
  vi.mocked(localStorage.clear).mockImplementation(() => {
    store.clear();
  });
  return store;
}

function storeIntent(intent: ReturnType<typeof makeIntent>) {
  localStorage.setItem(REDIRECT_STORAGE_KEY, JSON.stringify(intent));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authRedirectManager — handleAuthRedirect (post-auth checkout)', () => {
  beforeEach(() => {
    installRealLocalStorage();

    // Stub window.location.href as a writable property
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost/',
        origin: 'http://localhost',
        pathname: '/',
        search: '',
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to /checkout?priceId=... when checkout intent has no returnTo', async () => {
    // Intents without returnTo (e.g. stored by old code) still work
    storeIntent(makeIntent({ action: 'checkout', context: { priceId: 'price_test_123' } }));

    const { handleAuthRedirect } = await import('@client/utils/authRedirectManager');
    await handleAuthRedirect();

    expect(window.location.href).toBe('/checkout?priceId=price_test_123');
  });

  it('URL-encodes the priceId in the /checkout fallback', async () => {
    const specialPriceId = 'price_test+special&chars=123';
    storeIntent(makeIntent({ action: 'checkout', context: { priceId: specialPriceId } }));

    const { handleAuthRedirect } = await import('@client/utils/authRedirectManager');
    await handleAuthRedirect();

    expect(window.location.href).toContain(encodeURIComponent(specialPriceId));
    expect(window.location.href).toBe(`/checkout?priceId=${encodeURIComponent(specialPriceId)}`);
  });

  it('uses returnTo when checkout intent has returnTo set (pricing page redirect)', async () => {
    // This is the primary new behavior: /pricing?checkout=priceId → modal auto-opens
    storeIntent(
      makeIntent({
        action: 'checkout',
        context: { priceId: 'price_test_123' },
        returnTo: '/pricing?checkout=price_test_123',
      })
    );

    const { handleAuthRedirect } = await import('@client/utils/authRedirectManager');
    await handleAuthRedirect();

    expect(window.location.href).toBe('/pricing?checkout=price_test_123');
  });

  it('should redirect to dashboard when no intent exists', async () => {
    // No intent stored

    const { handleAuthRedirect } = await import('@client/utils/authRedirectManager');
    await handleAuthRedirect();

    expect(window.location.href).toBe('/dashboard');
  });

  it('should redirect to dashboard when intent is expired', async () => {
    const expiredTimestamp = Date.now() - INTENT_EXPIRY_MS - 1000; // 1s past expiry
    storeIntent(
      makeIntent({
        action: 'checkout',
        context: { priceId: 'price_test_123' },
        timestamp: expiredTimestamp,
      })
    );

    const { handleAuthRedirect } = await import('@client/utils/authRedirectManager');
    await handleAuthRedirect();

    expect(window.location.href).toBe('/dashboard');
  });

  it('should clear the stored intent after reading it', async () => {
    storeIntent(makeIntent());

    const { handleAuthRedirect } = await import('@client/utils/authRedirectManager');
    await handleAuthRedirect();

    // Intent should be cleared after use
    expect(localStorage.getItem(REDIRECT_STORAGE_KEY)).toBeNull();
  });

  it('should redirect to returnTo URL when returnTo intent exists (non-checkout)', async () => {
    storeIntent(
      makeIntent({ action: 'access_dashboard', context: {}, returnTo: '/dashboard/settings' })
    );

    const { handleAuthRedirect } = await import('@client/utils/authRedirectManager');
    await handleAuthRedirect();

    expect(window.location.href).toBe('/dashboard/settings');
  });
});

describe('authRedirectManager — setAuthIntent / getAndClearAuthIntent', () => {
  beforeEach(() => {
    installRealLocalStorage();
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost/',
        origin: 'http://localhost',
        pathname: '/',
        search: '',
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should store and retrieve checkout intent with priceId', async () => {
    const { setAuthIntent, getAndClearAuthIntent } =
      await import('@client/utils/authRedirectManager');

    setAuthIntent({ action: 'checkout', context: { priceId: 'price_hobby_monthly' } });

    const intent = getAndClearAuthIntent();
    expect(intent).not.toBeNull();
    expect(intent?.action).toBe('checkout');
    expect(intent?.context?.priceId).toBe('price_hobby_monthly');
  });

  it('should return null when no intent is stored', async () => {
    const { getAndClearAuthIntent } = await import('@client/utils/authRedirectManager');

    const intent = getAndClearAuthIntent();
    expect(intent).toBeNull();
  });

  it('should return null for expired intent and clear storage', async () => {
    const expiredIntent = {
      action: 'checkout',
      context: { priceId: 'price_test' },
      timestamp: Date.now() - INTENT_EXPIRY_MS - 1,
    };
    localStorage.setItem(REDIRECT_STORAGE_KEY, JSON.stringify(expiredIntent));

    const { getAndClearAuthIntent } = await import('@client/utils/authRedirectManager');
    const intent = getAndClearAuthIntent();

    expect(intent).toBeNull();
    expect(localStorage.getItem(REDIRECT_STORAGE_KEY)).toBeNull();
  });

  it('should clear storage after retrieval (one-time read)', async () => {
    const { setAuthIntent, getAndClearAuthIntent } =
      await import('@client/utils/authRedirectManager');

    setAuthIntent({ action: 'checkout', context: { priceId: 'price_test' } });
    getAndClearAuthIntent(); // First read clears it

    const second = getAndClearAuthIntent();
    expect(second).toBeNull();
  });
});
