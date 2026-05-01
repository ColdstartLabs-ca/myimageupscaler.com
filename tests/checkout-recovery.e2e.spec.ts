import { test, expect } from '@playwright/test';

/**
 * E2E tests for Checkout Recovery System
 *
 * Tests the abandoned checkout recovery flow including:
 * 1. Pre-checkout email capture modal
 * 2. Complete purchase banner for returning users
 * 3. Cart persistence and restoration
 *
 * @see docs/PRDs/checkout-recovery-system.md
 */

test.describe('Checkout Recovery - Pre-Checkout Email Capture', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.context().clearCookies();
    await page.goto('/');
  });

  test('should show email capture modal when clicking upgrade on pricing page', async ({
    page,
  }) => {
    await page.goto('/pricing');

    // Find and click an upgrade button (e.g., Starter plan)
    const upgradeButton = page
      .getByRole('button', { name: /get started|upgrade|subscribe/i })
      .first();

    await upgradeButton.click();

    // Email capture modal should appear
    await expect(page.getByText(/enter your email/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /continue/i })).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/pricing');

    const upgradeButton = page.getByRole('button', { name: /get started|upgrade/i }).first();
    await upgradeButton.click();

    // Enter invalid email
    const emailInput = page.getByPlaceholder(/email/i);
    await emailInput.fill('invalid-email');

    // Should show validation error or disable continue button
    const continueButton = page.getByRole('button', { name: /continue/i });
    await expect(continueButton).toBeDisabled();
  });

  test('should accept valid email and continue to checkout', async ({ page }) => {
    await page.goto('/pricing');

    const upgradeButton = page.getByRole('button', { name: /get started|upgrade/i }).first();
    await upgradeButton.click();

    // Enter valid email
    const emailInput = page.getByPlaceholder(/email/i);
    await emailInput.fill('test@example.com');

    // Checkbox for consent
    const consentCheckbox = page.getByRole('checkbox');
    await consentCheckbox.check();

    // Continue button should be enabled
    const continueButton = page.getByRole('button', { name: /continue/i });
    await expect(continueButton).toBeEnabled();

    await continueButton.click();

    // Modal should close and proceed to auth or checkout
    await expect(page.getByText(/enter your email/i)).not.toBeVisible();
  });

  test('should allow dismissing the email capture modal', async ({ page }) => {
    await page.goto('/pricing');

    const upgradeButton = page.getByRole('button', { name: /get started|upgrade/i }).first();
    await upgradeButton.click();

    // Close button should be present
    const closeButton = page.getByRole('button', { name: /close|cancel|×/i }).first();
    await expect(closeButton).toBeVisible();

    await closeButton.click();

    // Modal should be dismissed
    await expect(page.getByText(/enter your email/i)).not.toBeVisible();
  });
});

test.describe('Checkout Recovery - Complete Purchase Banner', () => {
  test('should show restoration banner for returning users with pending checkout', async ({
    page,
  }) => {
    // Simulate a user with a pending checkout in localStorage
    await page.goto('/');

    // Set up localStorage with pending checkout data
    await page.evaluate(() => {
      const mockCheckout = {
        priceId: 'price_123',
        planKey: 'starter',
        packKey: null,
        purchaseType: 'subscription',
        pricingRegion: 'standard',
        discountPercent: 0,
        recoveryCode: null,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem('miu_pending_checkout', JSON.stringify(mockCheckout));
    });

    // Reload the page to trigger the restoration check
    await page.reload();

    // Banner should appear with restoration message
    await expect(page.getByText(/pick up where you left off|complete your purchase/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('button', { name: /complete purchase|restore/i })).toBeVisible();
  });

  test('should display correct plan name in restoration banner', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      const mockCheckout = {
        priceId: 'price_123',
        planKey: 'pro',
        packKey: null,
        purchaseType: 'subscription',
        pricingRegion: 'standard',
        discountPercent: 0,
        recoveryCode: null,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem('miu_pending_checkout', JSON.stringify(mockCheckout));
    });

    await page.reload();

    // Should show the plan name
    await expect(page.getByText(/pro plan/i)).toBeVisible();
  });

  test('should show discount message when recovery code is present', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      const mockCheckout = {
        priceId: 'price_123',
        planKey: 'starter',
        packKey: null,
        purchaseType: 'subscription',
        pricingRegion: 'standard',
        discountPercent: 0,
        recoveryCode: 'RECOVER10',
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem('miu_pending_checkout', JSON.stringify(mockCheckout));
    });

    await page.reload();

    // Should mention the discount
    await expect(page.getByText(/10%.*discount|exclusive.*discount/i)).toBeVisible();
  });

  test('should allow dismissing the restoration banner', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      const mockCheckout = {
        priceId: 'price_123',
        planKey: 'starter',
        packKey: null,
        purchaseType: 'subscription',
        pricingRegion: 'standard',
        discountPercent: 0,
        recoveryCode: null,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem('miu_pending_checkout', JSON.stringify(mockCheckout));
    });

    await page.reload();

    const closeButton = page.getByRole('button', { name: /dismiss|close|×/i });
    await expect(closeButton).toBeVisible();

    await closeButton.click();

    // Banner should be dismissed
    await expect(page.getByText(/pick up where you left off/i)).not.toBeVisible();
  });
});

test.describe('Checkout Recovery - Credit Pack Cart', () => {
  test('should show credit pack restoration banner', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      const mockCheckout = {
        priceId: 'price_pack_100',
        planKey: null,
        packKey: 'pack_100',
        purchaseType: 'credit_pack',
        pricingRegion: 'standard',
        discountPercent: 0,
        recoveryCode: null,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem('miu_pending_checkout', JSON.stringify(mockCheckout));
    });

    await page.reload();

    // Should show credit pack in restoration message
    await expect(page.getByText(/100.*credits|credit pack/i)).toBeVisible();
  });

  test('should handle regional discount in restoration', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      const mockCheckout = {
        priceId: 'price_123',
        planKey: 'starter',
        packKey: null,
        purchaseType: 'subscription',
        pricingRegion: 'standard',
        discountPercent: 20,
        recoveryCode: null,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem('miu_pending_checkout', JSON.stringify(mockCheckout));
    });

    await page.reload();

    // Should mention regional pricing
    await expect(page.getByText(/20%.*regional|regional.*pricing/i)).toBeVisible();
  });
});
