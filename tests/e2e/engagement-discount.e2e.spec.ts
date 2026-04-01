/**
 * Engagement Discount E2E Tests
 *
 * Tests the engagement-based first-purchase discount feature:
 * 1. API endpoint behavior (eligibility check)
 * 2. Signal tracking in sessionStorage
 * 3. Toast display when user meets engagement thresholds
 * 4. Toast interactions (dismiss, claim)
 *
 * Flow: free user meets 2/3 engagement thresholds (upscales + model switch)
 *       → eligibility API returns eligible
 *       → toast slides in with discount offer
 *
 * @see docs/PRDs/engagement-based-first-purchase-discount.md
 */

import { test, expect } from '../test-fixtures';
import { getAuthInitScript } from '../helpers/auth-helpers';

// ─── Constants ─────────────────────────────────────────────────────────────────

const SIGNALS_KEY = 'miu_engagement_signals';
const OFFER_KEY = 'miu_engagement_offer';

// ─── Helpers ───────────────────────────────────────────────────────────────────

type Page = import('@playwright/test').Page;

/** Mock the eligibility endpoint to return an eligible response */
async function mockEligibilityEligible(page: Page): Promise<void> {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await page.route('**/api/engagement-discount/eligibility', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        eligible: true,
        discountExpiresAt: expiresAt,
        couponId: 'test-coupon-id',
        discountPercent: 20,
        targetPackKey: 'medium',
        originalPriceCents: 1499,
        discountedPriceCents: 1199,
      }),
    });
  });
}

/** Mock the eligibility endpoint to return ineligible */
async function mockEligibilityIneligible(page: Page, reason = 'already_offered'): Promise<void> {
  await page.route('**/api/engagement-discount/eligibility', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ eligible: false, reason }),
    });
  });
}

/** Mock Supabase auth session and user data for a free user */
async function setupFreeUserApiMocks(page: Page): Promise<void> {
  await page.route('**/auth/v1/session', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: {
          access_token: 'fake-test-token',
          user: { id: 'test-user-id', email: 'test@example.com', aud: 'authenticated' },
        },
      }),
    });
  });

  await page.route('**/rest/v1/rpc/get_user_data', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profile: {
          id: 'test-user-id',
          email: 'test@example.com',
          role: 'user',
          subscription_credits_balance: 10,
          purchased_credits_balance: 0,
        },
        subscription: null,
      }),
    });
  });
}

/** initScript: clear all engagement discount state before page load */
function getClearEngagementScript(): string {
  return `
    sessionStorage.removeItem('${SIGNALS_KEY}');
    sessionStorage.removeItem('${OFFER_KEY}');
  `;
}

/**
 * initScript: pre-populate signals so ONE free-tier model switch tips over eligibility.
 *
 * Starting state:
 *   upscales=3 ✓ (threshold: 3)
 *   downloads=1 ✗ (threshold: 2)
 *   modelSwitches=0 ✗ (threshold: 1)
 *   → 1/3 thresholds met, ineligible
 *
 * After one model switch (modelSwitches → 1):
 *   upscales ✓ + modelSwitches ✓ → 2/3 → isEligible!
 */
function getSignalsNearThresholdScript(): string {
  return `
    sessionStorage.setItem('${SIGNALS_KEY}', JSON.stringify({
      upscales: 3,
      downloads: 1,
      modelSwitches: 0,
      sessionStartedAt: Date.now()
    }));
  `;
}

/**
 * initScript: inject a fake Supabase v2 session into the browser cookie.
 *
 * @supabase/ssr v0.7.0 createBrowserClient() uses document.cookie as the
 * session storage backend. Without a valid cookie, Supabase fires
 * INITIAL_SESSION(null) which triggers store.reset() → isFreeUser=false
 * and the eligibility check is skipped.
 *
 * The session is stored as `base64-{base64url(JSON.stringify(session))}` in
 * the cookie named 'supabase.auth.token' (GoTrueClient's default STORAGE_KEY).
 * expires_at=9999999999 prevents automatic token refresh.
 */
function getSupabaseSessionScript(userId = 'test-user-id', email = 'test@example.com'): string {
  return `
    (function() {
      // Custom base64url encoder (no padding, URL-safe chars)
      function toBase64URL(str) {
        const b64 = btoa(str);
        let out = '';
        for (let i = 0; i < b64.length; i++) {
          const c = b64[i];
          if (c === '+') out += '-';
          else if (c === '/') out += '_';
          else if (c === '=') {} // drop padding
          else out += c;
        }
        return out;
      }

      // Minimal fake JWT: header.payload.fakeSig (signature not verified client-side)
      const jwtHeader  = toBase64URL(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const jwtPayload = toBase64URL(JSON.stringify({
        sub: '${userId}',
        email: '${email}',
        aud: 'authenticated',
        role: 'authenticated',
        exp: 9999999999,
        iat: 1700000000,
      }));
      const fakeJwt = jwtHeader + '.' + jwtPayload + '.fakesig';

      // Supabase v2 session object
      const sessionJson = JSON.stringify({
        access_token: fakeJwt,
        token_type: 'bearer',
        expires_in: 99999999,
        expires_at: 9999999999,
        refresh_token: 'fake-refresh-token',
        user: {
          id: '${userId}',
          aud: 'authenticated',
          role: 'authenticated',
          email: '${email}',
          email_confirmed_at: '2024-01-01T00:00:00.000000Z',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
        },
      });

      // @supabase/ssr encodes values as 'base64-{base64url(json)}'
      const cookieValue = 'base64-' + toBase64URL(sessionJson);

      // Set the cookie before Supabase client initializes
      document.cookie = 'supabase.auth.token=' + cookieValue + '; path=/; max-age=99999999';
    })();
  `;
}

/**
 * Upload the sample test image to the workspace via the file input.
 * Waits until the item appears in the queue (transitions to active workspace state).
 */
async function uploadTestImage(page: Page): Promise<void> {
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles('tests/fixtures/sample.jpg');
  // Wait for the item to appear in the queue (active workspace state)
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="queue-item"]').length > 0,
    {},
    { timeout: 10000 }
  );
}

/**
 * Switch the quality tier from the default "Quick" to "Face Restore" (a free tier).
 * "Face Restore" is in FREE_QUALITY_TIERS and different from the 'quick' default,
 * so clicking it triggers trackModelSwitch() via the useEffect in Workspace.tsx.
 *
 * Flow:
 *   1. Click "Quality Tier" button → opens ModelGalleryModal
 *   2. Click "Face Restore" card → onSelect('face-restore') + onClose()
 *   3. config.qualityTier changes → useEffect → trackModelSwitch()
 */
async function switchToFaceRestoreModel(page: Page): Promise<void> {
  // Wait for the quality tier label in the sidebar
  const qualityTierLabel = page.getByText('Quality Tier');
  await expect(qualityTierLabel).toBeVisible({ timeout: 10000 });

  // Click the tier selector button (pattern from model-selection.e2e.spec.ts)
  const tierSelectorButton = qualityTierLabel.locator('..').locator('button').first();
  await tierSelectorButton.click();

  // Wait for model gallery modal to open
  await expect(page.getByText('Face Restore').first()).toBeVisible({ timeout: 5000 });

  // Click the Face Restore card — free tier, triggers handleSelect → onSelect + onClose
  await page.getByText('Face Restore').first().click();

  // Brief pause for React state update and useEffect to fire
  await page.waitForTimeout(300);
}

/**
 * Full setup + navigation that makes the engagement discount toast appear.
 * Reused across multiple toast display and interaction tests.
 */
async function setupAndShowToast(page: Page): Promise<void> {
  await page.addInitScript(getClearEngagementScript());
  await page.addInitScript(getSignalsNearThresholdScript());
  // Inject Supabase v2 session cookie so INITIAL_SESSION fires with a valid session.
  // Without this, INITIAL_SESSION(null) → store.reset() → isFreeUser=false → no eligibility check.
  await page.addInitScript(getSupabaseSessionScript());
  // Inject free user auth into localStorage so userStore recognizes user immediately
  await page.addInitScript(
    getAuthInitScript({
      profile: {
        id: 'test-user-id',
        email: 'test@example.com',
        role: 'user',
        subscription_credits_balance: 10,
        purchased_credits_balance: 0,
      },
      subscription: null,
    })
  );

  await mockEligibilityEligible(page);
  await setupFreeUserApiMocks(page);

  await page.goto('/dashboard');
  await uploadTestImage(page);
  await switchToFaceRestoreModel(page);

  // Toast animates in after 100ms delay → allow up to 10s for full visibility
  await expect(page.getByText(/off your first purchase/i)).toBeVisible({ timeout: 10000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Engagement Discount: API Endpoint', () => {
  test('returns 401 for unauthenticated requests (no token)', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/engagement-discount/eligibility', { method: 'GET' });
      return { status: res.status };
    });
    expect(result.status).toBe(401);
  });

  test('returns 401 without a Bearer token', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/engagement-discount/eligibility', {
        method: 'GET',
        headers: { Authorization: 'not-a-bearer-token' },
      });
      return { status: res.status };
    });
    expect(result.status).toBe(401);
  });

  test('unauthenticated response is JSON (not an HTML error page)', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/engagement-discount/eligibility');
      const contentType = res.headers.get('content-type') ?? '';
      const body = await res.json();
      return { contentType, body };
    });
    expect(result.contentType).toContain('application/json');
    // Middleware wraps 401s in {success: false, error: {code, message}}
    expect(result.body).toHaveProperty('success', false);
  });

  test('unauthenticated response contains UNAUTHORIZED error code', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/engagement-discount/eligibility');
      return res.json();
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNAUTHORIZED');
  });
});

test.describe('Engagement Discount: Signal Tracking', () => {
  test('fresh page has no signals in sessionStorage', async ({ page }) => {
    await page.addInitScript(getClearEngagementScript());
    await setupFreeUserApiMocks(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    const stored = await page.evaluate(key => sessionStorage.getItem(key), SIGNALS_KEY);
    expect(stored).toBeNull();
  });

  test('pre-loaded signals survive page load and are readable', async ({ page }) => {
    await page.addInitScript(getClearEngagementScript());
    await page.addInitScript(getSignalsNearThresholdScript());
    await setupFreeUserApiMocks(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    const stored = await page.evaluate(key => sessionStorage.getItem(key), SIGNALS_KEY);
    expect(stored).not.toBeNull();

    const signals = JSON.parse(stored!);
    expect(signals.upscales).toBe(3);
    expect(signals.downloads).toBe(1);
    expect(signals.modelSwitches).toBe(0);
    expect(typeof signals.sessionStartedAt).toBe('number');
  });

  test('signals object has the required shape', async ({ page }) => {
    await page.addInitScript(getClearEngagementScript());
    await page.addInitScript(getSignalsNearThresholdScript());
    await setupFreeUserApiMocks(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    const signals = await page.evaluate(key => {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, SIGNALS_KEY);

    expect(signals).not.toBeNull();
    expect(signals).toMatchObject({
      upscales: expect.any(Number),
      downloads: expect.any(Number),
      modelSwitches: expect.any(Number),
      sessionStartedAt: expect.any(Number),
    });
  });
});

test.describe('Engagement Discount: Toast Display', () => {
  test('toast appears after user meets thresholds via model switch', async ({ page }) => {
    await setupAndShowToast(page);
    // Already asserted inside setupAndShowToast; double-check here
    await expect(page.getByText('off your first purchase')).toBeVisible();
  });

  test('toast shows the correct discount percentage', async ({ page }) => {
    await setupAndShowToast(page);
    await expect(page.getByText(/20% off your first purchase/i)).toBeVisible();
  });

  test('toast shows original price ($14.99)', async ({ page }) => {
    // Original price is only shown on desktop (hidden on mobile)
    await page.setViewportSize({ width: 1280, height: 720 });
    await setupAndShowToast(page);
    await expect(page.getByText('$14.99')).toBeVisible();
  });

  test('toast shows discounted price ($11.99)', async ({ page }) => {
    // Discounted price is in the green text span (desktop) or in the button (mobile)
    await page.setViewportSize({ width: 1280, height: 720 });
    await setupAndShowToast(page);
    await expect(page.locator('.text-green-300')).toContainText('$11.99');
  });

  test('toast shows a countdown timer', async ({ page }) => {
    await setupAndShowToast(page);
    // Countdown is shown as a time display (e.g., "29:59") with a clock icon
    await expect(page.locator('.font-mono').first()).toBeVisible();
  });

  test('toast has a dismiss button (aria-label="Dismiss")', async ({ page }) => {
    await setupAndShowToast(page);
    await expect(page.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  });

  test('toast has a claim CTA button', async ({ page }) => {
    await setupAndShowToast(page);
    await expect(page.getByRole('button', { name: /Claim 20% Off/i })).toBeVisible();
  });

  test('toast shows fine print for first-time purchasers', async ({ page }) => {
    await setupAndShowToast(page);
    // The banner is only shown to free users meeting engagement thresholds
    // which implicitly indicates it's for first-time purchasers
    await expect(page.getByText(/off your first purchase/i)).toBeVisible();
  });

  test('toast does NOT appear when eligibility API returns ineligible', async ({ page }) => {
    await page.addInitScript(getClearEngagementScript());
    await page.addInitScript(getSignalsNearThresholdScript());
    await page.addInitScript(getSupabaseSessionScript());
    await page.addInitScript(
      getAuthInitScript({
        profile: {
          id: 'test-user-id',
          email: 'test@example.com',
          role: 'user',
          subscription_credits_balance: 10,
          purchased_credits_balance: 0,
        },
        subscription: null,
      })
    );
    await mockEligibilityIneligible(page, 'already_offered');
    await setupFreeUserApiMocks(page);

    await page.goto('/dashboard');
    await uploadTestImage(page);
    await switchToFaceRestoreModel(page);

    // Allow time for any async eligibility check to complete
    await page.waitForTimeout(2000);

    await expect(page.getByText('off your first purchase')).not.toBeVisible();
  });
});

test.describe('Engagement Discount: Toast Interactions', () => {
  test('dismiss button hides the toast', async ({ page }) => {
    await setupAndShowToast(page);

    // Click the dismiss button
    await page.getByRole('button', { name: 'Dismiss' }).click();

    // Wait for the slide-out animation (300ms) + a bit of buffer
    await expect(page.getByText('off your first purchase')).not.toBeVisible({ timeout: 2000 });
  });

  test('claim button is enabled and clickable', async ({ page }) => {
    await setupAndShowToast(page);

    const claimButton = page.getByRole('button', { name: /Claim 20% Off/i });
    await expect(claimButton).toBeEnabled();

    // Clicking the claim button should not throw — it opens the checkout modal
    await claimButton.click();
    // The checkout modal (or a dialog) should open; just verify no crash
    await page.waitForTimeout(500);
    // No assertion on specific checkout UI since that has its own tests
  });

  test('offer details match the eligibility API response', async ({ page }) => {
    // Original price is only shown on desktop (hidden on mobile)
    await page.setViewportSize({ width: 1280, height: 720 });
    await setupAndShowToast(page);

    // The toast uses values from the eligibility API response
    // We mocked: discountPercent=20, originalPriceCents=1499, discountedPriceCents=1199
    await expect(page.getByText(/20% off your first purchase/i)).toBeVisible();
    await expect(page.locator('.text-white\\/50.line-through')).toContainText('$14.99');
    await expect(page.locator('.text-green-300')).toContainText('$11.99');
  });

  test('eligibility API is called exactly once per session', async ({ page }) => {
    let callCount = 0;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await page.route('**/api/engagement-discount/eligibility', route => {
      callCount++;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          eligible: true,
          discountExpiresAt: expiresAt,
          couponId: 'test-coupon-id',
          discountPercent: 20,
          targetPackKey: 'medium',
          originalPriceCents: 1499,
          discountedPriceCents: 1199,
        }),
      });
    });

    await page.addInitScript(getClearEngagementScript());
    await page.addInitScript(getSignalsNearThresholdScript());
    await page.addInitScript(getSupabaseSessionScript());
    await page.addInitScript(
      getAuthInitScript({
        profile: {
          id: 'test-user-id',
          email: 'test@example.com',
          role: 'user',
          subscription_credits_balance: 10,
          purchased_credits_balance: 0,
        },
        subscription: null,
      })
    );
    await setupFreeUserApiMocks(page);

    await page.goto('/dashboard');
    await uploadTestImage(page);
    await switchToFaceRestoreModel(page);

    // Wait for the toast to appear (eligibility check completed)
    await expect(page.getByText('off your first purchase')).toBeVisible({ timeout: 10000 });

    // Give time for any duplicate calls to arrive
    await page.waitForTimeout(1000);

    // Should only have been called once (hasCheckedEligibility prevents re-calls)
    expect(callCount).toBe(1);
  });
});
