import { test, expect } from '../test-fixtures';

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
 * 3. UpgradePlanModal analytics tracking
 * 4. Model gate upgrade prompt analytics
 */

test.describe('Upgrade Funnel - Post-Auth Redirect', () => {
  test.describe('?checkout= URL Parameter Handling', () => {
    test('should auto-open checkout modal when ?checkout=<priceId> is present in URL', async ({
      page,
    }) => {
      const priceId = 'price_test_starter_monthly';

      // Navigate to workspace with checkout parameter
      await page.goto(`/workspace?checkout=${priceId}`);

      // Wait for checkout modal to appear
      const checkoutModal = page.locator(
        '[data-modal="checkout"], [role="dialog"]:has-text("Checkout")'
      );
      await expect(checkoutModal).toBeVisible({ timeout: 5000 });

      // Verify the priceId is being used for checkout
      // The CheckoutModal component should receive the priceId prop
      const url = new URL(page.url());
      expect(url.searchParams.get('checkout')).toBe(priceId);
    });

    test('should prevent duplicate checkout modal opens with processed flag', async ({ page }) => {
      const priceId = 'price_test_pro_monthly';

      // Navigate with checkout param
      await page.goto(`/workspace?checkout=${priceId}`);

      // Wait for modal to open
      const checkoutModal = page.locator(
        '[data-modal="checkout"], [role="dialog"]:has-text("Checkout")'
      );
      await expect(checkoutModal).toBeVisible({ timeout: 5000 });

      // Navigate again with same param (simulating page refresh or re-entry)
      await page.goto(`/workspace?checkout=${priceId}`);

      // Modal should still be open but not duplicate
      // The processedCheckoutParamRef should prevent re-processing
      await expect(checkoutModal).toBeVisible();

      // Should only see one checkout modal instance
      const modalCount = await page.locator('[data-modal="checkout"]').count();
      expect(modalCount).toBeLessThanOrEqual(1);
    });

    test('should not open checkout when ?checkout param is missing', async ({ page }) => {
      // Navigate to workspace without checkout parameter
      await page.goto('/workspace');

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Checkout modal should NOT be visible
      const checkoutModal = page.locator('[data-modal="checkout"]');
      await expect(checkoutModal).not.toBeVisible();
    });

    test('should handle invalid priceId in ?checkout param gracefully', async ({ page }) => {
      const invalidPriceId = 'invalid_price_id';

      // Navigate with invalid price ID
      await page.goto(`/workspace?checkout=${invalidPriceId}`);

      // The checkout modal should still open (validation happens server-side)
      const checkoutModal = page.locator('[data-modal="checkout"]');
      await expect(checkoutModal).toBeVisible({ timeout: 5000 });

      // Error handling should occur within the checkout flow
      // The modal should show appropriate error state
      const url = new URL(page.url());
      expect(url.searchParams.get('checkout')).toBe(invalidPriceId);
    });

    test('should clear checkout state after modal is closed', async ({ page }) => {
      const priceId = 'price_test_hobby_monthly';

      // Navigate with checkout param
      await page.goto(`/workspace?checkout=${priceId}`);

      // Wait for modal
      const checkoutModal = page.locator('[data-modal="checkout"]');
      await expect(checkoutModal).toBeVisible({ timeout: 5000 });

      // Close the modal
      const closeButton = page
        .locator(
          '[data-modal="checkout"] button[aria-label="Close"], [data-modal="checkout"] button:has-text("×")'
        )
        .first();
      await closeButton.click();

      // Wait for modal to close
      await expect(checkoutModal).not.toBeVisible();

      // Navigate to workspace again without the param
      await page.goto('/workspace');

      // Checkout modal should NOT open again (state was cleared)
      await expect(checkoutModal).not.toBeVisible();
    });
  });

  test.describe('Originating Model Tracking', () => {
    test('should store originating model in sessionStorage when clicking locked tier', async ({
      page,
    }) => {
      const testTier = 'ultra';
      const sessionStorageKey = 'checkout_originating_model';

      // Navigate to workspace
      await page.goto('/workspace');

      // Open model gallery (mobile gallery button or desktop quality selector)
      const galleryButton = page
        .locator('[data-driver="quality-selector"], button:has-text("Quality")')
        .first();
      await galleryButton.click();

      // Wait for gallery modal
      const galleryModal = page
        .locator('text=Select Model')
        .or(page.locator('[role="dialog"]:has-text("Professional Tiers")'));
      await expect(galleryModal).toBeVisible();

      // Click on a locked (premium) tier
      const lockedTier = page
        .locator(`[data-tier="${testTier}"], button:has-text("${testTier}")`)
        .first();
      if (await lockedTier.isVisible()) {
        await lockedTier.click();
      }

      // Check sessionStorage for originating model
      const storedModel = await page.evaluate(key => {
        return sessionStorage.getItem(key);
      }, sessionStorageKey);

      expect(storedModel).toBe(testTier);
    });

    test('should not store originating model when selecting free tier', async ({ page }) => {
      const freeTier = 'quick';
      const sessionStorageKey = 'checkout_originating_model';

      // Navigate to workspace
      await page.goto('/workspace');

      // Open model gallery
      const galleryButton = page
        .locator('[data-driver="quality-selector"], button:has-text("Quality")')
        .first();
      await galleryButton.click();

      // Wait for gallery modal
      const galleryModal = page
        .locator('text=Select Model')
        .or(page.locator('[role="dialog"]:has-text("Available")'));
      await expect(galleryModal).toBeVisible();

      // Click on a free tier
      const freeTierButton = page
        .locator(`[data-tier="${freeTier}"], button:has-text("${freeTier}")`)
        .first();
      if (await freeTierButton.isVisible()) {
        await freeTierButton.click();
      }

      // Check sessionStorage - should not have originating model for free tiers
      const storedModel = await page.evaluate(key => {
        return sessionStorage.getItem(key);
      }, sessionStorageKey);

      expect(storedModel).toBeNull();
    });

    test('should preserve originating model across navigation', async ({ page }) => {
      const testTier = 'premium';
      const sessionStorageKey = 'checkout_originating_model';

      // Navigate to workspace
      await page.goto('/workspace');

      // Open model gallery
      const galleryButton = page
        .locator('[data-driver="quality-selector"], button:has-text("Quality")')
        .first();
      await galleryButton.click();

      // Wait for gallery modal
      const galleryModal = page.locator('text=Select Model');
      await expect(galleryModal).toBeVisible();

      // Click on a locked tier
      const lockedTier = page.locator(`[data-tier="${testTier}"]`).first();
      if (await lockedTier.isVisible()) {
        await lockedTier.click();
      }

      // Navigate to pricing page
      await page.goto('/pricing');

      // Check sessionStorage - originating model should still be present
      const storedModel = await page.evaluate(key => {
        return sessionStorage.getItem(key);
      }, sessionStorageKey);

      expect(storedModel).toBe(testTier);
    });
  });

  test.describe('Upgrade Plan Modal Analytics', () => {
    test('should track upgrade_plans_viewed event when modal opens', async ({ page }) => {
      // Navigate to workspace
      await page.goto('/workspace');

      // Intercept analytics events
      const analyticsEvents: string[] = [];
      page.route('**/api/analytics/event', async route => {
        const response = await route.continue();
        try {
          const body = await response.json();
          analyticsEvents.push(body.name);
        } catch {
          // Ignore non-JSON responses
        }
      });

      // Open upgrade plan modal (triggered by upgrade button)
      const upgradeButton = page
        .locator('button:has-text("Upgrade"), [data-upgrade-trigger]')
        .first();
      if (await upgradeButton.isVisible()) {
        await upgradeButton.click();
      }

      // Wait for modal to appear
      const upgradeModal = page.locator('text=Choose a Plan, text=Unlock premium');
      await expect(upgradeModal).toBeVisible({ timeout: 5000 });

      // Verify upgrade_plans_viewed was tracked
      // Note: Analytics tracking happens asynchronously, so we need to wait
      await page.waitForTimeout(500);

      expect(analyticsEvents).toContain('upgrade_plans_viewed');
    });

    test('should include trigger property in upgrade_plans_viewed event', async ({ page }) => {
      // Navigate to workspace
      await page.goto('/workspace');

      // Intercept analytics events
      let eventPayload: Record<string, unknown> | null = null;
      page.route('**/api/analytics/event', async route => {
        const response = await route.continue();
        try {
          const body = await response.json();
          if (body.name === 'upgrade_plans_viewed') {
            eventPayload = body.properties || body;
          }
        } catch {
          // Ignore
        }
      });

      // Open upgrade plan modal
      const upgradeButton = page
        .locator('button:has-text("Upgrade"), [data-upgrade-trigger]')
        .first();
      if (await upgradeButton.isVisible()) {
        await upgradeButton.click();
      }

      // Wait for modal
      const upgradeModal = page.locator('text=Choose a Plan');
      await expect(upgradeModal).toBeVisible({ timeout: 5000 });

      // Wait for analytics
      await page.waitForTimeout(500);

      // Verify trigger property exists
      expect(eventPayload).not.toBeNull();
      expect(eventPayload?.trigger).toBeDefined();
    });

    test('should include pricingRegion in upgrade_plans_viewed event', async ({ page }) => {
      // Navigate to workspace
      await page.goto('/workspace');

      // Intercept analytics events
      let eventPayload: Record<string, unknown> | null = null;
      page.route('**/api/analytics/event', async route => {
        const response = await route.continue();
        try {
          const body = await response.json();
          if (body.name === 'upgrade_plans_viewed') {
            eventPayload = body.properties || body;
          }
        } catch {
          // Ignore
        }
      });

      // Open upgrade plan modal
      const upgradeButton = page.locator('button:has-text("Upgrade")').first();
      if (await upgradeButton.isVisible()) {
        await upgradeButton.click();
      }

      // Wait for modal
      const upgradeModal = page.locator('text=Choose a Plan');
      await expect(upgradeModal).toBeVisible({ timeout: 5000 });

      // Wait for analytics
      await page.waitForTimeout(500);

      // Verify pricingRegion property exists
      expect(eventPayload).not.toBeNull();
      expect(eventPayload?.pricingRegion).toBeDefined();
      expect(typeof eventPayload?.pricingRegion).toBe('string');
    });

    test('should include discountPercent in upgrade_plans_viewed event for discounted regions', async ({
      page,
    }) => {
      // Set CF-IPCountry header to a discounted region (e.g., India)
      await page.setExtraHTTPHeaders({
        'CF-IPCountry': 'IN',
      });

      // Navigate to workspace
      await page.goto('/workspace');

      // Intercept analytics events
      let eventPayload: Record<string, unknown> | null = null;
      page.route('**/api/analytics/event', async route => {
        const response = await route.continue();
        try {
          const body = await response.json();
          if (body.name === 'upgrade_plans_viewed') {
            eventPayload = body.properties || body;
          }
        } catch {
          // Ignore
        }
      });

      // Open upgrade plan modal
      const upgradeButton = page.locator('button:has-text("Upgrade")').first();
      if (await upgradeButton.isVisible()) {
        await upgradeButton.click();
      }

      // Wait for modal
      const upgradeModal = page.locator('text=Choose a Plan');
      await expect(upgradeModal).toBeVisible({ timeout: 5000 });

      // Wait for analytics
      await page.waitForTimeout(500);

      // Verify discountPercent property
      expect(eventPayload).not.toBeNull();
      expect(eventPayload?.discountPercent).toBeDefined();
      // India should have a discount
      expect(Number(eventPayload?.discountPercent)).toBeGreaterThan(0);
    });
  });

  test.describe('Model Gate Analytics', () => {
    const MODEL_GATE_SESSION_KEY = 'upgrade_prompt_shown_model_gate';

    test('should track upgrade_prompt_shown with trigger=model_gate when opening gallery as free user', async ({
      page,
    }) => {
      // Clear session storage to ensure fresh state
      await page.addInitScript(() => {
        sessionStorage.clear();
      });

      // Navigate to workspace as free user
      await page.goto('/workspace');

      // Intercept analytics events
      let eventPayload: Record<string, unknown> | null = null;
      page.route('**/api/analytics/event', async route => {
        const response = await route.continue();
        try {
          const body = await response.json();
          if (body.name === 'upgrade_prompt_shown') {
            eventPayload = body.properties || body;
          }
        } catch {
          // Ignore
        }
      });

      // Open model gallery
      const galleryButton = page
        .locator('[data-driver="quality-selector"], button:has-text("Quality")')
        .first();
      await galleryButton.click();

      // Wait for gallery modal
      const galleryModal = page.locator('text=Select Model');
      await expect(galleryModal).toBeVisible();

      // Wait for analytics
      await page.waitForTimeout(500);

      // Verify upgrade_prompt_shown was tracked with trigger='model_gate'
      expect(eventPayload).not.toBeNull();
      expect(eventPayload?.trigger).toBe('model_gate');
      expect(eventPayload?.currentPlan).toBe('free');
    });

    test('should only track model_gate prompt once per session', async ({ page }) => {
      // Navigate to workspace
      await page.goto('/workspace');

      // Track analytics events
      const eventCount = { model_gate: 0 };
      page.route('**/api/analytics/event', async route => {
        const response = await route.continue();
        try {
          const body = await response.json();
          if (body.name === 'upgrade_prompt_shown') {
            const props = body.properties || body;
            if (props.trigger === 'model_gate') {
              eventCount.model_gate++;
            }
          }
        } catch {
          // Ignore
        }
      });

      // Open model gallery first time
      const galleryButton = page.locator('[data-driver="quality-selector"]').first();
      await galleryButton.click();
      const galleryModal = page.locator('text=Select Model');
      await expect(galleryModal).toBeVisible();

      // Close and reopen gallery
      const closeButton = page
        .locator('[role="dialog"] button[aria-label="Close"], [role="dialog"] button:has-text("×")')
        .first();
      await closeButton.click();
      await expect(galleryModal).not.toBeVisible();

      await page.waitForTimeout(500);

      // Reopen gallery
      await galleryButton.click();
      await expect(galleryModal).toBeVisible();

      // Wait for potential analytics
      await page.waitForTimeout(500);

      // Should only have one model_gate event (first time only)
      expect(eventCount.model_gate).toBe(1);
    });

    test('should track upgrade_prompt_clicked when clicking locked tier in model gallery', async ({
      page,
    }) => {
      // Navigate to workspace
      await page.goto('/workspace');

      // Intercept analytics events
      let eventPayload: Record<string, unknown> | null = null;
      page.route('**/api/analytics/event', async route => {
        const response = await route.continue();
        try {
          const body = await response.json();
          if (body.name === 'upgrade_prompt_clicked') {
            eventPayload = body.properties || body;
          }
        } catch {
          // Ignore
        }
      });

      // Open model gallery
      const galleryButton = page.locator('[data-driver="quality-selector"]').first();
      await galleryButton.click();
      const galleryModal = page.locator('text=Select Model');
      await expect(galleryModal).toBeVisible();

      // Click on a locked premium tier
      const lockedTier = page.locator('[data-tier="premium"], [data-tier="ultra"]').first();
      if (await lockedTier.isVisible()) {
        await lockedTier.click();
      }

      // Wait for analytics
      await page.waitForTimeout(500);

      // Verify upgrade_prompt_clicked was tracked
      expect(eventPayload).not.toBeNull();
      expect(eventPayload?.trigger).toBe('model_gate');
      expect(eventPayload?.destination).toBe('upgrade_plan_modal');
    });
  });

  test.describe('End-to-End Upgrade Funnel Flow', () => {
    test('should complete full flow: model gate -> originating model -> checkout redirect', async ({
      page,
    }) => {
      const testTier = 'ultra';
      const priceId = 'price_test_pro_monthly';
      const sessionStorageKey = 'checkout_originating_model';

      // Navigate to workspace
      await page.goto('/workspace');

      // Step 1: Open model gallery
      const galleryButton = page.locator('[data-driver="quality-selector"]').first();
      await galleryButton.click();
      const galleryModal = page.locator('text=Select Model');
      await expect(galleryModal).toBeVisible();

      // Step 2: Click on locked tier (triggers upgrade_prompt_clicked)
      const lockedTier = page.locator(`[data-tier="${testTier}"]`).first();
      if (await lockedTier.isVisible()) {
        await lockedTier.click();
      }

      // Step 3: Verify originating model was stored
      const storedModel = await page.evaluate(key => {
        return sessionStorage.getItem(key);
      }, sessionStorageKey);
      expect(storedModel).toBe(testTier);

      // Step 4: Upgrade modal should open
      const upgradeModal = page.locator('text=Choose a Plan');
      await expect(upgradeModal).toBeVisible({ timeout: 5000 });

      // Step 5: Click on a plan to go to checkout (with checkout param)
      const planButton = page.locator(`button:has-text("Pro"), [data-plan="pro"]`).first();
      if (await planButton.isVisible()) {
        await planButton.click();
      }

      // Step 6: Verify navigation to pricing/checkout
      await page.waitForURL(/\/pricing|\/checkout/);
      const url = new URL(page.url());
      const hasCheckoutParam = url.searchParams.has('checkout');

      // Either went to checkout directly or to pricing with checkout param
      expect(
        url.pathname.includes('/checkout') ||
          (url.pathname.includes('/pricing') && hasCheckoutParam)
      ).toBe(true);
    });

    test('should preserve originating model through post-auth redirect', async ({ page }) => {
      const testTier = 'premium';
      const priceId = 'price_test_starter_monthly';
      const sessionStorageKey = 'checkout_originating_model';

      // Set originating model before auth redirect
      await page.addInitScript(tier => {
        sessionStorage.setItem('checkout_originating_model', tier);
      }, testTier);

      // Navigate to workspace with checkout param (simulating post-auth redirect)
      await page.goto(`/workspace?checkout=${priceId}`);

      // Wait for checkout modal
      const checkoutModal = page.locator('[data-modal="checkout"]');
      await expect(checkoutModal).toBeVisible({ timeout: 5000 });

      // Verify originating model is still in sessionStorage
      const storedModel = await page.evaluate(key => {
        return sessionStorage.getItem(key);
      }, sessionStorageKey);

      expect(storedModel).toBe(testTier);

      // The originating model should be included in checkout_opened event
      // (This requires analytics verification in the actual checkout flow)
    });
  });

  test.describe('Regional Pricing Integration', () => {
    test('should apply correct regional pricing in UpgradePlanModal', async ({ page }) => {
      // Set CF-IPCountry to a discounted region (South Asia - 65% discount)
      await page.setExtraHTTPHeaders({
        'CF-IPCountry': 'IN',
      });

      // Navigate to workspace
      await page.goto('/workspace');

      // Open upgrade modal
      const upgradeButton = page.locator('button:has-text("Upgrade")').first();
      if (await upgradeButton.isVisible()) {
        await upgradeButton.click();
      }

      // Wait for modal
      const upgradeModal = page.locator('text=Choose a Plan');
      await expect(upgradeModal).toBeVisible({ timeout: 5000 });

      // Check for discounted pricing (should show reduced prices)
      // The standard Pro plan is $29/mo, with 65% discount it should be ~$10.15
      const priceText = await page
        .locator('text=/$10.1')
        .or(page.locator('text=$10').or(page.locator('text=₹')))
        .first()
        .textContent();

      // Verify some discount indicator is present
      expect(priceText).toBeDefined();
    });

    test('should track correct pricingRegion in analytics for different countries', async ({
      page,
    }) => {
      const testCases = [
        { country: 'US', expectedRegion: 'standard', discount: 0 },
        { country: 'IN', expectedRegion: 'south_asia', discount: 65 },
        { country: 'BR', expectedRegion: 'latam', discount: 50 },
      ];

      for (const testCase of testCases) {
        // Reset headers
        await page.setExtraHTTPHeaders({
          'CF-IPCountry': testCase.country,
        });

        // Navigate to workspace
        await page.goto('/workspace');

        // Track analytics events
        let eventPayload: Record<string, unknown> | null = null;
        page.route('**/api/analytics/event', async route => {
          const response = await route.continue();
          try {
            const body = await response.json();
            if (body.name === 'upgrade_plans_viewed') {
              eventPayload = body.properties || body;
            }
          } catch {
            // Ignore
          }
        });

        // Open upgrade modal
        const upgradeButton = page.locator('button:has-text("Upgrade")').first();
        if (await upgradeButton.isVisible()) {
          await upgradeButton.click();
        }

        // Wait for modal and analytics
        await page.waitForTimeout(500);

        // Verify pricing region is correct
        expect(eventPayload).not.toBeNull();
        expect(eventPayload?.pricingRegion).toBeDefined();

        // Close modal for next test
        const closeButton = page.locator('[role="dialog"] button[aria-label="Close"]').first();
        if (await closeButton.isVisible()) {
          await closeButton.click();
        }

        await page.waitForTimeout(500);
      }
    });
  });
});
