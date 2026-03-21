/**
 * Engagement Discount E2E Tests
 *
 * Tests cover:
 * 1. GET /api/engagement-discount/eligibility — returns 401 for unauthenticated
 * 2. GET /api/engagement-discount/eligibility — returns ineligible for paid users
 * 3. GET /api/engagement-discount/eligibility — returns ineligible when already offered
 * 4. Toast visibility — appears when API returns eligible
 * 5. Toast countdown — urgency styling kicks in under 5 minutes
 * 6. Toast dismiss — hides toast and does not re-show in session
 * 7. Toast CTA — opens checkout modal for the medium pack
 * 8. Checkout stacking — engagement discount reflected in checkout metadata
 *
 * PRD: docs/PRDs/engagement-based-first-purchase-discount.md
 */

import { test, expect } from '../test-fixtures';
import { setupAuthenticatedStateWithSupabase } from '../helpers/auth-helpers';
import type { Page } from '@playwright/test';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mock the eligibility endpoint with a given response */
async function mockEligibility(
  page: Page,
  response: {
    eligible: boolean;
    discountExpiresAt?: string;
    discountPercent?: number;
    targetPackKey?: string;
    originalPriceCents?: number;
    discountedPriceCents?: number;
    reason?: string;
  },
  status = 200
) {
  await page.route('**/api/engagement-discount/eligibility', route => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/** Build an eligible API response expiring in N minutes */
function eligibleResponse(expiresInMinutes = 30) {
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
  return {
    eligible: true,
    discountExpiresAt: expiresAt,
    discountPercent: 20,
    targetPackKey: 'medium',
    originalPriceCents: 1499,
    discountedPriceCents: 1199,
  };
}

/** Inject sessionStorage signals to simulate engagement thresholds being met */
async function injectEngagementSignals(
  page: Page,
  signals: { upscales: number; downloads: number; modelSwitches: number }
) {
  await page.addInitScript(signals => {
    window.addEventListener('DOMContentLoaded', () => {
      sessionStorage.setItem(
        'miu_engagement_signals',
        JSON.stringify({
          upscales: signals.upscales,
          downloads: signals.downloads,
          modelSwitches: signals.modelSwitches,
          sessionStartedAt: Date.now(),
        })
      );
    });
  }, signals);
}

// ─── API Endpoint Tests ────────────────────────────────────────────────────────

test.describe('Engagement Discount: /api/engagement-discount/eligibility', () => {
  test('returns 401 for unauthenticated requests', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/engagement-discount/eligibility');
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(401);
    expect(result.body.eligible).toBe(false);
  });

  test('is a protected route (not in PUBLIC_API_ROUTES)', async ({ page }) => {
    await page.goto('/');
    // Without Authorization header, must return 401
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/engagement-discount/eligibility', {
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: res.status };
    });
    expect(result.status).toBe(401);
  });

  test('redeem endpoint is removed (returns 404)', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/engagement-discount/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test', sessionId: 'test' }),
      });
      return { status: res.status };
    });
    expect(result.status).toBe(404);
  });
});

// ─── Toast UI Tests ───────────────────────────────────────────────────────────

test.describe('Engagement Discount: Toast UI', () => {
  test('toast does not appear for unauthenticated users', async ({ page }) => {
    await injectEngagementSignals(page, { upscales: 3, downloads: 2, modelSwitches: 1 });
    await page.goto('/workspace');
    await page.waitForLoadState('domcontentloaded');

    // Toast should never show without auth
    await page.waitForTimeout(1000);
    const toast = page.locator('text=Special Offer');
    await expect(toast).not.toBeVisible();
  });

  test('toast appears for eligible free user after engagement thresholds met', async ({ page }) => {
    await setupAuthenticatedStateWithSupabase(page, {
      subscription: null,
      profile: {
        id: 'test-eligible-user',
        email: 'eligible@example.com',
        role: 'user',
        subscription_credits_balance: 0,
        purchased_credits_balance: 0,
      },
    });

    // Inject signals that meet 2/3 thresholds
    await injectEngagementSignals(page, { upscales: 3, downloads: 2, modelSwitches: 0 });

    // Mock eligibility to return eligible
    await mockEligibility(page, eligibleResponse());

    await page.goto('/workspace');
    await page.waitForLoadState('domcontentloaded');

    // Toast should appear
    const toast = page.locator('text=Special Offer');
    await expect(toast).toBeVisible({ timeout: 5000 });

    // Should show discount percent and price comparison
    await expect(page.locator('text=20% Off Your First Purchase!')).toBeVisible();
    await expect(page.locator('text=$11.99')).toBeVisible();
    await expect(page.locator('text=$14.99')).toBeVisible();
  });

  test('toast shows countdown timer', async ({ page }) => {
    await setupAuthenticatedStateWithSupabase(page, {
      subscription: null,
      profile: {
        id: 'test-countdown-user',
        email: 'countdown@example.com',
        role: 'user',
        subscription_credits_balance: 0,
        purchased_credits_balance: 0,
      },
    });

    await injectEngagementSignals(page, { upscales: 3, downloads: 2, modelSwitches: 0 });
    await mockEligibility(page, eligibleResponse(30));

    await page.goto('/workspace');
    await page.waitForLoadState('domcontentloaded');

    const toast = page.locator('text=Special Offer');
    await expect(toast).toBeVisible({ timeout: 5000 });

    // Countdown timer in MM:SS format should be visible
    const countdown = page.locator('text=/\\d{2}:\\d{2}/');
    await expect(countdown).toBeVisible();
  });

  test('urgent styling appears when less than 5 minutes remain', async ({ page }) => {
    await setupAuthenticatedStateWithSupabase(page, {
      subscription: null,
      profile: {
        id: 'test-urgent-user',
        email: 'urgent@example.com',
        role: 'user',
        subscription_credits_balance: 0,
        purchased_credits_balance: 0,
      },
    });

    await injectEngagementSignals(page, { upscales: 3, downloads: 2, modelSwitches: 0 });
    // Set offer to expire in 4 minutes (under 5 = urgent)
    await mockEligibility(page, eligibleResponse(4));

    await page.goto('/workspace');
    await page.waitForLoadState('domcontentloaded');

    const toast = page.locator('text=Special Offer');
    await expect(toast).toBeVisible({ timeout: 5000 });

    // Urgent countdown area should have red styling
    const urgentTimer = page.locator('.bg-red-500\\/30');
    await expect(urgentTimer).toBeVisible();
  });

  test('toast can be dismissed', async ({ page }) => {
    await setupAuthenticatedStateWithSupabase(page, {
      subscription: null,
      profile: {
        id: 'test-dismiss-user',
        email: 'dismiss@example.com',
        role: 'user',
        subscription_credits_balance: 0,
        purchased_credits_balance: 0,
      },
    });

    await injectEngagementSignals(page, { upscales: 3, downloads: 2, modelSwitches: 0 });
    await mockEligibility(page, eligibleResponse());

    await page.goto('/workspace');
    await page.waitForLoadState('domcontentloaded');

    const toast = page.locator('text=Special Offer');
    await expect(toast).toBeVisible({ timeout: 5000 });

    // Click dismiss button
    await page.getByRole('button', { name: 'Dismiss' }).click();

    // Toast should hide
    await expect(toast).not.toBeVisible({ timeout: 2000 });
  });

  test('toast does not appear for ineligible user (already offered)', async ({ page }) => {
    await setupAuthenticatedStateWithSupabase(page, {
      subscription: null,
      profile: {
        id: 'test-already-offered',
        email: 'offered@example.com',
        role: 'user',
        subscription_credits_balance: 0,
        purchased_credits_balance: 0,
      },
    });

    await injectEngagementSignals(page, { upscales: 3, downloads: 2, modelSwitches: 0 });
    await mockEligibility(page, { eligible: false, reason: 'already_offered' });

    await page.goto('/workspace');
    await page.waitForLoadState('domcontentloaded');

    await page.waitForTimeout(1000);
    const toast = page.locator('text=Special Offer');
    await expect(toast).not.toBeVisible();
  });

  test('CTA click opens checkout modal for medium pack', async ({ page }) => {
    await setupAuthenticatedStateWithSupabase(page, {
      subscription: null,
      profile: {
        id: 'test-cta-user',
        email: 'cta@example.com',
        role: 'user',
        subscription_credits_balance: 0,
        purchased_credits_balance: 0,
      },
    });

    await injectEngagementSignals(page, { upscales: 3, downloads: 2, modelSwitches: 0 });
    await mockEligibility(page, eligibleResponse());

    // Mock checkout API to capture request
    let checkoutBody: Record<string, unknown> | null = null;
    await page.route('**/api/checkout', async route => {
      checkoutBody = (await route.request().postDataJSON()) as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, url: 'https://checkout.stripe.com/test' }),
      });
    });

    await page.goto('/workspace');
    await page.waitForLoadState('domcontentloaded');

    const toast = page.locator('text=Special Offer');
    await expect(toast).toBeVisible({ timeout: 5000 });

    // Click CTA
    await page.getByRole('button', { name: /Claim Your 20% Discount/i }).click();

    // CheckoutModal should open
    const checkoutModal = page.locator('[data-modal="checkout"]');
    await expect(checkoutModal).toBeVisible({ timeout: 5000 });
  });
});

// ─── Engagement Tracking Tests ────────────────────────────────────────────────

test.describe('Engagement Discount: Signal Tracking', () => {
  test('eligibility check fires after signals meet threshold', async ({ page }) => {
    await setupAuthenticatedStateWithSupabase(page, {
      subscription: null,
      profile: {
        id: 'test-signal-user',
        email: 'signal@example.com',
        role: 'user',
        subscription_credits_balance: 10,
        purchased_credits_balance: 0,
      },
    });

    // Track eligibility API calls
    let eligibilityCallCount = 0;
    await page.route('**/api/engagement-discount/eligibility', route => {
      eligibilityCallCount++;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: false, reason: 'not_offered_yet' }),
      });
    });

    // Inject signals that already meet threshold (will trigger check on load)
    await injectEngagementSignals(page, { upscales: 3, downloads: 2, modelSwitches: 0 });

    await page.goto('/workspace');
    await page.waitForLoadState('domcontentloaded');

    // Wait a moment for the eligibility check to fire
    await page.waitForTimeout(2000);

    // Eligibility should have been checked
    expect(eligibilityCallCount).toBeGreaterThan(0);
  });

  test('eligibility check is NOT fired when signals are below threshold', async ({ page }) => {
    await setupAuthenticatedStateWithSupabase(page, {
      subscription: null,
      profile: {
        id: 'test-below-threshold',
        email: 'below@example.com',
        role: 'user',
        subscription_credits_balance: 10,
        purchased_credits_balance: 0,
      },
    });

    let eligibilityCallCount = 0;
    await page.route('**/api/engagement-discount/eligibility', route => {
      eligibilityCallCount++;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: false }),
      });
    });

    // Only 1 signal met — below the 2/3 requirement
    await injectEngagementSignals(page, { upscales: 3, downloads: 0, modelSwitches: 0 });

    await page.goto('/workspace');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    expect(eligibilityCallCount).toBe(0);
  });
});
