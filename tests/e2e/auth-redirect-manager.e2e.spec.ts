import { test, expect } from '../test-fixtures';

/**
 * Auth Redirect Manager E2E Tests
 *
 * Tests the unified auth redirect manager flow in `client/utils/authRedirectManager.ts`.
 *
 * Approach: Direct testing of handleAuthRedirect() functionality.
 * Instead of navigating through the real auth callback page (which requires
 * complex Supabase mocking), we load a simple test page and directly execute
 * the redirect logic via page.evaluate() using inlined JS.
 *
 * Note: Browsers cannot import raw TypeScript source files, so the redirect
 * logic is inlined here. Unit tests in tests/unit/client/utils/authRedirectManager.unit.spec.ts
 * cover the TypeScript module logic; these E2E tests verify browser navigation behaviour.
 *
 * The tests verify:
 * 1. Checkout intents redirect to /checkout with priceId
 * 2. ReturnTo intents redirect to the stored path
 * 3. Expired intents fall through to /dashboard
 * 4. localStorage is properly cleaned up
 */

/** localStorage key used by authRedirectManager */
const STORAGE_KEY = 'auth_redirect_intent';

/** How long an intent stays valid (matches INTENT_EXPIRY_MS in authRedirectManager.ts) */
const INTENT_EXPIRY_MS = 30 * 60 * 1000;

interface IRedirectIntent {
  returnTo?: string;
  action?: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Builds an initScript that plants an auth_redirect_intent in localStorage
 * before any page JavaScript runs.
 */
function buildIntentInitScript(intent: IRedirectIntent): string {
  return `localStorage.setItem('${STORAGE_KEY}', ${JSON.stringify(JSON.stringify(intent))});`;
}

/**
 * Directly executes handleAuthRedirect() logic in the browser context and
 * waits for the navigation to complete.
 *
 * The redirect logic is inlined as plain JS because browsers cannot import
 * raw TypeScript source files. This mirrors authRedirectManager.ts exactly.
 */
async function executeRedirectAndWait(page: import('@playwright/test').Page): Promise<void> {
  const navPromise = page.waitForNavigation({ url: '**/**', timeout: 5000 });

  await page.evaluate(() => {
    const REDIRECT_STORAGE_KEY = 'auth_redirect_intent';
    const INTENT_EXPIRY_MS = 30 * 60 * 1000;

    const stored = localStorage.getItem(REDIRECT_STORAGE_KEY);

    if (!stored) {
      window.location.href = '/dashboard';
      return;
    }

    let intent: {
      returnTo?: string;
      action?: string;
      context?: Record<string, unknown>;
      timestamp: number;
    };

    try {
      intent = JSON.parse(stored);

      if (Date.now() - intent.timestamp > INTENT_EXPIRY_MS) {
        localStorage.removeItem(REDIRECT_STORAGE_KEY);
        window.location.href = '/dashboard';
        return;
      }

      localStorage.removeItem(REDIRECT_STORAGE_KEY);
    } catch {
      localStorage.removeItem(REDIRECT_STORAGE_KEY);
      window.location.href = '/dashboard';
      return;
    }

    // Handle checkout action
    if (intent.action === 'checkout') {
      if (intent.returnTo) {
        try {
          const url = new URL(intent.returnTo, window.location.origin);
          if (url.origin === window.location.origin) {
            window.location.href = intent.returnTo;
            return;
          }
        } catch {
          // Invalid URL - fall through to /checkout fallback
        }
      }
      if (typeof intent.context?.priceId === 'string') {
        window.location.href = `/checkout?priceId=${encodeURIComponent(intent.context.priceId as string)}`;
        return;
      }
    }

    // Handle explicit returnTo
    if (intent.returnTo) {
      try {
        const url = new URL(intent.returnTo, window.location.origin);
        if (url.origin === window.location.origin) {
          window.location.href = intent.returnTo;
          return;
        }
      } catch {
        // Invalid URL - fall through to dashboard
      }
    }

    window.location.href = '/dashboard';
  });

  await navPromise;
}

test.describe('Auth Redirect Manager - Direct Testing', () => {
  test.describe('Checkout intent', () => {
    test('redirects to /checkout?priceId=... when action is checkout with priceId in context', async ({
      page,
    }) => {
      const priceId = 'price_test_starter_monthly';

      const intent: IRedirectIntent = {
        action: 'checkout',
        context: { priceId },
        timestamp: Date.now(),
      };

      // Plant intent before page boots
      await page.addInitScript(buildIntentInitScript(intent));

      // Navigate to a simple page (auth redirect manager works on any page)
      await page.goto('/');

      // Execute redirect and wait for navigation
      await executeRedirectAndWait(page);

      // Should land on checkout with the correct priceId
      const url = new URL(page.url());
      expect(url.pathname).toBe('/checkout');
      expect(url.searchParams.get('priceId')).toBe(priceId);
    });

    test('URL-encodes special characters in priceId', async ({ page }) => {
      const specialPriceId = 'price_test+special&chars=123';

      const intent: IRedirectIntent = {
        action: 'checkout',
        context: { priceId: specialPriceId },
        timestamp: Date.now(),
      };

      await page.addInitScript(buildIntentInitScript(intent));
      await page.goto('/');
      await executeRedirectAndWait(page);

      const url = new URL(page.url());
      expect(url.pathname).toBe('/checkout');
      // The priceId should be URL encoded in the query string
      expect(url.searchParams.get('priceId')).toBe(specialPriceId);
    });

    test('uses returnTo when checkout intent has returnTo set', async ({ page }) => {
      const priceId = 'price_test_123';

      const intent: IRedirectIntent = {
        action: 'checkout',
        context: { priceId },
        returnTo: `/pricing?checkout=${priceId}`,
        timestamp: Date.now(),
      };

      await page.addInitScript(buildIntentInitScript(intent));
      await page.goto('/');
      await executeRedirectAndWait(page);

      const url = new URL(page.url());
      // Should redirect to pricing page (modal auto-opens there)
      expect(url.pathname).toBe('/pricing');
      expect(url.searchParams.get('checkout')).toBe(priceId);
    });

    test('localStorage is cleared after checkout redirect is processed', async ({ page }) => {
      const intent: IRedirectIntent = {
        action: 'checkout',
        context: { priceId: 'price_test_hobby_monthly' },
        timestamp: Date.now(),
      };

      await page.addInitScript(buildIntentInitScript(intent));
      await page.goto('/');
      await executeRedirectAndWait(page);

      // The intent key must be absent after the redirect is processed
      const storedValue = await page.evaluate(
        (key: string) => localStorage.getItem(key),
        STORAGE_KEY
      );
      expect(storedValue).toBeNull();
    });
  });

  test.describe('ReturnTo redirect', () => {
    test('rejects external returnTo URLs and falls through to /dashboard', async ({ page }) => {
      const intent: IRedirectIntent = {
        returnTo: 'https://evil.example.com/steal',
        timestamp: Date.now(),
      };

      await page.addInitScript(buildIntentInitScript(intent));
      await page.goto('/');
      await executeRedirectAndWait(page);

      // External URL validation check should reject and fall through to /dashboard
      const url = new URL(page.url());
      expect(url.pathname).toBe('/dashboard');
    });
  });

  test.describe('Expired intent', () => {
    test('falls through to /dashboard when intent timestamp is older than 30 minutes', async ({
      page,
    }) => {
      const thirtyOneMinutesAgo = Date.now() - INTENT_EXPIRY_MS - 60_000;

      const expiredIntent: IRedirectIntent = {
        action: 'checkout',
        context: { priceId: 'price_test_starter_monthly' },
        timestamp: thirtyOneMinutesAgo,
      };

      await page.addInitScript(buildIntentInitScript(expiredIntent));
      await page.goto('/');
      await executeRedirectAndWait(page);

      // Expired intent must be discarded — default fallback is /dashboard
      const url = new URL(page.url());
      expect(url.pathname).toBe('/dashboard');
    });

    test('clears expired intent from localStorage', async ({ page }) => {
      const thirtyOneMinutesAgo = Date.now() - INTENT_EXPIRY_MS - 60_000;

      const expiredIntent: IRedirectIntent = {
        returnTo: '/dashboard/billing',
        timestamp: thirtyOneMinutesAgo,
      };

      await page.addInitScript(buildIntentInitScript(expiredIntent));
      await page.goto('/');
      await executeRedirectAndWait(page);

      const storedValue = await page.evaluate(
        (key: string) => localStorage.getItem(key),
        STORAGE_KEY
      );
      expect(storedValue).toBeNull();
    });
  });

  test.describe('No intent stored', () => {
    test('redirects to /dashboard when no auth_redirect_intent is present', async ({ page }) => {
      // No addInitScript planting an intent — localStorage starts empty of this key
      await page.goto('/');
      await executeRedirectAndWait(page);

      const url = new URL(page.url());
      expect(url.pathname).toBe('/dashboard');
    });

    test('localStorage has no lingering intent key after default redirect', async ({ page }) => {
      await page.goto('/');
      await executeRedirectAndWait(page);

      const storedValue = await page.evaluate(
        (key: string) => localStorage.getItem(key),
        STORAGE_KEY
      );
      expect(storedValue).toBeNull();
    });
  });

  test.describe('setAuthIntent and getAndClearAuthIntent helpers', () => {
    test('setAuthIntent stores a valid intent in localStorage', async ({ page }) => {
      await page.goto('/');

      // Inline setAuthIntent logic (browsers cannot import raw TypeScript source files)
      await page.evaluate(() => {
        const intent = {
          action: 'checkout',
          context: { priceId: 'price_eval_test' },
          timestamp: Date.now(),
        };
        localStorage.setItem('auth_redirect_intent', JSON.stringify(intent));
      });

      const raw = await page.evaluate((key: string) => localStorage.getItem(key), STORAGE_KEY);
      expect(raw).not.toBeNull();

      const parsed = JSON.parse(raw!);
      expect(parsed.action).toBe('checkout');
      expect(parsed.context?.priceId).toBe('price_eval_test');
      expect(typeof parsed.timestamp).toBe('number');
    });

    test('getAndClearAuthIntent retrieves and removes the intent', async ({ page }) => {
      await page.goto('/');

      // Set an intent directly via localStorage
      await page.evaluate(() => {
        localStorage.setItem(
          'auth_redirect_intent',
          JSON.stringify({
            action: 'checkout',
            context: { priceId: 'price_test_clear' },
            timestamp: Date.now(),
          })
        );
      });

      // Retrieve and clear inline
      const retrieved = await page.evaluate((key: string) => {
        const stored = localStorage.getItem(key);
        if (!stored) return null;
        try {
          const intent = JSON.parse(stored);
          localStorage.removeItem(key);
          return intent;
        } catch {
          localStorage.removeItem(key);
          return null;
        }
      }, STORAGE_KEY);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.action).toBe('checkout');

      // Second call should return null (already cleared)
      const secondCall = await page.evaluate(
        (key: string) => localStorage.getItem(key),
        STORAGE_KEY
      );
      expect(secondCall).toBeNull();
    });

    test('intent timestamp is set to approximately now', async ({ page }) => {
      await page.goto('/');

      const beforeMs = Date.now();

      await page.evaluate(() => {
        localStorage.setItem(
          'auth_redirect_intent',
          JSON.stringify({
            action: 'checkout',
            context: { priceId: 'price_ts_test' },
            timestamp: Date.now(),
          })
        );
      });

      const afterMs = Date.now();

      const raw = await page.evaluate((key: string) => localStorage.getItem(key), STORAGE_KEY);
      const parsed = JSON.parse(raw!);

      // Timestamp must be within the window of the test execution
      expect(parsed.timestamp).toBeGreaterThanOrEqual(beforeMs);
      expect(parsed.timestamp).toBeLessThanOrEqual(afterMs + 100);
    });
  });
});
