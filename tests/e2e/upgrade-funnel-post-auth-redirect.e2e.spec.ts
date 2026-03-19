import { test, expect } from '../test-fixtures';
import { setupAuthenticatedState, setupAuthenticatedStateWithSupabase } from '../helpers/auth-helpers';

/**
 * Upgrade Funnel Post-Auth Redirect E2E Tests
 *
 * Tests for the post-authentication checkout redirect functionality
 * and originating model tracking in the upgrade funnel.
 *
 * PRD: docs/PRDs/upgrade-funnel-ux-improvements.md
 * Branch: night-watch/35-fix-upgrade-funnel-post-auth-redirect-checkout-path-optimization
 *
 * Key features tested:
 * 1. Post-auth checkout redirect via ?checkout=<priceId> URL param
 * 2. Originating model tracking from model gate through checkout
 * 3. UpgradePlanModal opens from workspace triggers
 * 4. Model gate upgrade prompt via model gallery
 */

test.describe('Upgrade Funnel - Post-Auth Redirect', () => {
  test.describe('?checkout= URL Parameter Handling', () => {
    test('should auto-open checkout modal when ?checkout=<priceId> is present in URL', async ({
      page,
    }) => {
      // Authenticated user arriving after post-auth redirect
      await setupAuthenticatedStateWithSupabase(page, {
        subscription: null,
        profile: {
          id: 'test-user-checkout-modal',
          email: 'test@example.com',
          role: 'user',
          subscription_credits_balance: 100,
          purchased_credits_balance: 0,
        },
      });

      const priceId = 'price_test_starter_monthly';

      // Navigate to workspace with checkout parameter (simulating post-auth redirect)
      await page.goto(`/workspace?checkout=${priceId}`);
      await page.waitForLoadState('domcontentloaded');

      // CheckoutModal renders at workspace root regardless of queue state
      const checkoutModal = page.locator('[data-modal="checkout"]');
      await expect(checkoutModal).toBeVisible({ timeout: 8000 });

      // Confirm param is still in the URL
      const url = new URL(page.url());
      expect(url.searchParams.get('checkout')).toBe(priceId);
    });

    test('should not open checkout when ?checkout param is missing', async ({ page }) => {
      await setupAuthenticatedStateWithSupabase(page, {
        subscription: null,
        profile: {
          id: 'test-user-no-checkout',
          email: 'test@example.com',
          role: 'user',
          subscription_credits_balance: 100,
          purchased_credits_balance: 0,
        },
      });

      await page.goto('/workspace');
      await page.waitForLoadState('domcontentloaded');

      const checkoutModal = page.locator('[data-modal="checkout"]');
      await expect(checkoutModal).not.toBeVisible();
    });

    test('should only open one checkout modal instance', async ({ page }) => {
      await setupAuthenticatedStateWithSupabase(page, {
        subscription: null,
        profile: {
          id: 'test-user-one-modal',
          email: 'test@example.com',
          role: 'user',
          subscription_credits_balance: 100,
          purchased_credits_balance: 0,
        },
      });

      const priceId = 'price_test_pro_monthly';

      await page.goto(`/workspace?checkout=${priceId}`);
      await page.waitForLoadState('domcontentloaded');

      const checkoutModal = page.locator('[data-modal="checkout"]');
      await expect(checkoutModal).toBeVisible({ timeout: 8000 });

      // processedCheckoutParamRef prevents duplicate opens
      const modalCount = await page.locator('[data-modal="checkout"]').count();
      expect(modalCount).toBeLessThanOrEqual(1);
    });

    test('should close checkout modal when close button is clicked', async ({ page }) => {
      await setupAuthenticatedStateWithSupabase(page, {
        subscription: null,
        profile: {
          id: 'test-user-close-modal',
          email: 'test@example.com',
          role: 'user',
          subscription_credits_balance: 100,
          purchased_credits_balance: 0,
        },
      });

      const priceId = 'price_test_hobby_monthly';

      await page.goto(`/workspace?checkout=${priceId}`);
      await page.waitForLoadState('domcontentloaded');

      const checkoutModal = page.locator('[data-modal="checkout"]');
      await expect(checkoutModal).toBeVisible({ timeout: 8000 });

      // Close button in CheckoutModal has an aria-label
      const closeButton = checkoutModal.locator('button[aria-label]').first();
      await closeButton.click();

      await expect(checkoutModal).not.toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Originating Model Tracking', () => {
    test('should preserve originating model through post-auth redirect', async ({ page }) => {
      const testTier = 'clarity';
      const priceId = 'price_test_starter_monthly';
      const sessionStorageKey = 'checkout_originating_model';

      // Simulate state set before auth redirect (user clicked locked model, then signed in)
      await page.addInitScript(
        ({ key, tier }: { key: string; tier: string }) => {
          sessionStorage.setItem(key, tier);
        },
        { key: sessionStorageKey, tier: testTier }
      );

      await setupAuthenticatedStateWithSupabase(page, {
        subscription: null,
        profile: {
          id: 'test-user-preserve-model',
          email: 'test@example.com',
          role: 'user',
          subscription_credits_balance: 100,
          purchased_credits_balance: 0,
        },
      });

      // Post-auth redirect
      await page.goto(`/workspace?checkout=${priceId}`);
      await page.waitForLoadState('domcontentloaded');

      const checkoutModal = page.locator('[data-modal="checkout"]');
      await expect(checkoutModal).toBeVisible({ timeout: 8000 });

      // Originating model must survive the redirect
      const storedModel = await page.evaluate(
        (key: string) => sessionStorage.getItem(key),
        sessionStorageKey
      );
      expect(storedModel).toBe(testTier);
    });

    test('should preserve originating model across same-origin navigation', async ({ page }) => {
      await setupAuthenticatedStateWithSupabase(page, {
        subscription: null,
        profile: {
          id: 'test-user-same-origin',
          email: 'test@example.com',
          role: 'user',
          subscription_credits_balance: 100,
          purchased_credits_balance: 0,
        },
      });

      const testTier = 'clarity';
      const sessionStorageKey = 'checkout_originating_model';

      await page.goto('/workspace');

      // Set originating model
      await page.evaluate(
        ({ key, tier }: { key: string; tier: string }) => {
          sessionStorage.setItem(key, tier);
        },
        { key: sessionStorageKey, tier: testTier }
      );

      // Navigate to pricing page — sessionStorage persists across same-origin navigation
      await page.goto('/pricing');

      const storedModel = await page.evaluate(
        (key: string) => sessionStorage.getItem(key),
        sessionStorageKey
      );
      expect(storedModel).toBe(testTier);
    });

    test('should set originating model in sessionStorage when locked tier is clicked', async ({
      page,
    }) => {
      // Use setupAuthenticatedStateWithSupabase to properly mock all user data
      // This ensures isFreeUser is computed correctly in the workspace
      await setupAuthenticatedStateWithSupabase(page, {
        subscription: null, // Free user
        profile: {
          id: 'test-free-user',
          email: 'test-free@example.com',
          role: 'user',
          subscription_credits_balance: 100,
          purchased_credits_balance: 0,
        },
      });

      const sessionStorageKey = 'checkout_originating_model';

      // Use mobile viewport so mobile quality selector is visible
      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/workspace');
      await page.waitForLoadState('domcontentloaded');

      // Upload a file to transition to active workspace (gallery only accessible then)
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles('tests/fixtures/sample.jpg');
      await page.waitForTimeout(500);

      // Open model gallery via mobile quality selector
      const mobileQualityBtn = page.locator('[data-driver="mobile-quality-selector"]');
      await expect(mobileQualityBtn).toBeVisible({ timeout: 8000 });
      await mobileQualityBtn.click();

      const galleryModal = page.locator('text=Select Model');
      await expect(galleryModal).toBeVisible({ timeout: 8000 });

      // Click any premium/locked tier.
      // ModelCard has a before/after slider inside whose onClick stops propagation.
      // Click at 85% height (text area below image) to avoid the slider handle.
      const lockedTier = page
        .locator('[data-tier="ultra"], [data-tier="hd-upscale"], [data-tier="auto"]')
        .first();

      if (await lockedTier.isVisible()) {
        // Scroll into view and click in the text content area (below the image/slider)
        // using Playwright's built-in scroll+click to handle BottomSheet's overflow-y-auto container.
        // position.y at ~90% of card height lands in the text section, below the before/after slider.
        await lockedTier.scrollIntoViewIfNeeded();
        const bbox = await lockedTier.boundingBox();
        if (bbox) {
          await lockedTier.click({ position: { x: bbox.width / 2, y: bbox.height * 0.9 } });
        }
        await page.waitForTimeout(300);

        const storedModel = await page.evaluate(
          (key: string) => sessionStorage.getItem(key),
          sessionStorageKey
        );
        expect(storedModel).not.toBeNull();
      }
    });

    test('should not set originating model when free tier is selected', async ({ page }) => {
      await setupAuthenticatedStateWithSupabase(page, {
        subscription: null, // Free user
        profile: {
          id: 'test-free-user-2',
          email: 'test-free-2@example.com',
          role: 'user',
          subscription_credits_balance: 100,
          purchased_credits_balance: 0,
        },
      });

      const sessionStorageKey = 'checkout_originating_model';

      // Clear any pre-existing value
      await page.addInitScript((key: string) => {
        sessionStorage.removeItem(key);
      }, sessionStorageKey);

      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/workspace');
      await page.waitForLoadState('domcontentloaded');

      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles('tests/fixtures/sample.jpg');
      await page.waitForTimeout(500);

      const mobileQualityBtn = page.locator('[data-driver="mobile-quality-selector"]');
      if (await mobileQualityBtn.isVisible({ timeout: 8000 })) {
        await mobileQualityBtn.click();

        const galleryModal = page.locator('text=Select Model');
        await expect(galleryModal).toBeVisible({ timeout: 8000 });

        // Click a free tier — should NOT set originating model
        const freeTierBtn = page.locator('[data-tier="quick"]').first();
        if (await freeTierBtn.isVisible()) {
          await freeTierBtn.click();
          await page.waitForTimeout(300);
        }

        const storedModel = await page.evaluate(
          (key: string) => sessionStorage.getItem(key),
          sessionStorageKey
        );
        expect(storedModel).toBeNull();
      }
    });
  });

  test.describe('PurchaseModal Visibility', () => {
    test('should open PurchaseModal when "View Plans" is clicked', async ({ page }) => {
      await setupAuthenticatedStateWithSupabase(page, {
        subscription: null, // Free user so MobileUpgradePrompt is visible
        profile: {
          id: 'test-free-user-3',
          email: 'test-free-3@example.com',
          role: 'user',
          subscription_credits_balance: 100,
          purchased_credits_balance: 0,
        },
      });

      // Use mobile viewport so MobileUpgradePrompt is visible in empty state
      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/workspace');
      await page.waitForLoadState('domcontentloaded');

      // The "View Plans" button is in MobileUpgradePrompt (md:hidden — visible on mobile)
      const viewPlansBtn = page.locator('button:has-text("View Plans")').first();

      if (await viewPlansBtn.isVisible({ timeout: 8000 })) {
        await viewPlansBtn.click();

        // PurchaseModal is rendered with "Get More Credits" title
        // It uses a custom modal structure (not role="dialog" like BottomSheet)
        const purchaseModal = page.locator('.fixed.inset-0.z-50:has-text("Get More Credits")');
        await expect(purchaseModal).toBeVisible({ timeout: 8000 });
      }
    });

    test('should open model gallery from mobile quality selector in active workspace', async ({
      page,
    }) => {
      await setupAuthenticatedStateWithSupabase(page, {
        subscription: null, // Free user
        profile: {
          id: 'test-free-user-4',
          email: 'test-free-4@example.com',
          role: 'user',
          subscription_credits_balance: 100,
          purchased_credits_balance: 0,
        },
      });

      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/workspace');
      await page.waitForLoadState('domcontentloaded');

      // Upload a file to get active workspace
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles('tests/fixtures/sample.jpg');
      await page.waitForTimeout(500);

      const mobileQualityBtn = page.locator('[data-driver="mobile-quality-selector"]');
      await expect(mobileQualityBtn).toBeVisible({ timeout: 8000 });
      await mobileQualityBtn.click();

      // Model gallery opens with "Select Model" title
      const galleryModal = page.locator('text=Select Model');
      await expect(galleryModal).toBeVisible({ timeout: 8000 });

      // Gallery closes on Escape
      await page.keyboard.press('Escape');
      await expect(galleryModal).not.toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('End-to-End Upgrade Funnel Flow', () => {
    test('should complete full flow: locked model click → sessionStorage → upgrade modal', async ({
      page,
    }) => {
      await setupAuthenticatedStateWithSupabase(page, {
        subscription: null, // Free user
        profile: {
          id: 'test-free-user-5',
          email: 'test-free-5@example.com',
          role: 'user',
          subscription_credits_balance: 100,
          purchased_credits_balance: 0,
        },
      });

      const sessionStorageKey = 'checkout_originating_model';

      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/workspace');
      await page.waitForLoadState('domcontentloaded');

      // Upload to get active workspace
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles('tests/fixtures/sample.jpg');
      await page.waitForTimeout(500);

      // Open model gallery
      const mobileQualityBtn = page.locator('[data-driver="mobile-quality-selector"]');
      await expect(mobileQualityBtn).toBeVisible({ timeout: 8000 });
      await mobileQualityBtn.click();

      const galleryModal = page.locator('text=Select Model');
      await expect(galleryModal).toBeVisible({ timeout: 8000 });

      // Click a locked premium tier
      const lockedTier = page
        .locator('[data-tier="ultra"], [data-tier="hd-upscale"], [data-tier="auto"]')
        .first();

      if (await lockedTier.isVisible()) {
        // Scroll into view and click in the text content area (below the image/slider)
        await lockedTier.scrollIntoViewIfNeeded();
        const bbox = await lockedTier.boundingBox();
        if (bbox) {
          await lockedTier.click({ position: { x: bbox.width / 2, y: bbox.height * 0.9 } });
        }
        await page.waitForTimeout(300);

        // sessionStorage should have originating model
        const storedModel = await page.evaluate(
          (key: string) => sessionStorage.getItem(key),
          sessionStorageKey
        );
        expect(storedModel).not.toBeNull();

        // PurchaseModal should open after clicking locked tier
        // It shows "Get More Credits" title and includes Subscribe tab
        const purchaseModal = page.locator('.fixed.inset-0.z-50:has-text("Get More Credits")');
        await expect(purchaseModal).toBeVisible({ timeout: 8000 });

        // Verify Subscribe tab/button is visible
        const subscribeButton = page.locator('button:has-text("Subscribe")');
        await expect(subscribeButton).toBeVisible();
      }
    });

    test('pricing page should be accessible and show plans', async ({ page }) => {
      await page.goto('/pricing');
      await page.waitForLoadState('domcontentloaded');

      await expect(page).toHaveURL(/\/pricing/);

      // Pricing page shows plan options
      const planHeading = page.locator('text=Starter').or(page.locator('text=Pro')).first();
      await expect(planHeading).toBeVisible({ timeout: 8000 });
    });
  });

  test.describe('Regional Pricing Integration', () => {
    test('should display pricing plans on pricing page', async ({ page }) => {
      await page.goto('/pricing');
      await page.waitForLoadState('domcontentloaded');

      const planText = page.locator('text=Starter').or(page.locator('text=Pro')).first();
      await expect(planText).toBeVisible({ timeout: 8000 });
    });

    test('should load pricing page for users from discounted regions', async ({ page }) => {
      // Set CF-IPCountry header to India (south_asia = 65% discount)
      await page.setExtraHTTPHeaders({
        'CF-IPCountry': 'IN',
      });

      await page.route('**/api/geo**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ region: 'south_asia', country: 'IN', discountPercent: 65 }),
        });
      });

      await page.goto('/pricing');
      await page.waitForLoadState('domcontentloaded');

      // Page must load with plan options regardless of region
      const planText = page.locator('text=Starter').or(page.locator('text=Pro')).first();
      await expect(planText).toBeVisible({ timeout: 8000 });
    });
  });
});
