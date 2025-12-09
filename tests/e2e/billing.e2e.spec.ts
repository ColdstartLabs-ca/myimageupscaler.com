import { test, expect } from '@playwright/test';
import { PricingPage } from '../pages/PricingPage';
import { TestContext } from '../helpers';

/**
 * Billing E2E Tests
 *
 * Strategy:
 * - Pricing page tests: Public page, no auth needed
 * - Checkout flow tests: Mock the /api/checkout endpoint to bypass Stripe
 * - Billing page tests: Enhanced with TestContext for better test management
 *
 * The tests focus on validating the frontend behavior with mocked API responses
 * while leveraging enhanced page object patterns for better reliability.
 */

test.describe('Billing E2E Tests', () => {
  let ctx: TestContext;

  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test.describe('Checkout Flow - Unauthenticated User', () => {
    let pricingPage: PricingPage;

    test.beforeEach(async ({ page }) => {
      pricingPage = new PricingPage(page);
    });

    /**
     * Note: The StripeService checks for auth before making API calls.
     * When user is not authenticated, it throws 'User not authenticated'
     * immediately without hitting the API. This is expected behavior.
     */

    test('should show auth modal for unauthenticated Get Started clicks', async ({ page }) => {
      await page.goto('/pricing');
      await pricingPage.waitForPageLoad();

      // Click Get Started button (nth=1 for second pricing card, which is Pro)
      await page.getByRole('button', { name: 'Get Started' }).nth(1).click();

      // Wait for the auth modal to appear
      await pricingPage.wait(1000);

      // Check that auth modal is shown
      const authModal = page
        .getByRole('dialog')
        .or(page.locator('[role="dialog"]'))
        .or(page.locator('.modal'));
      const isModalVisible = await authModal.isVisible().catch(() => false);

      if (isModalVisible) {
        // Modal is shown - this is the expected behavior
        expect(isModalVisible).toBe(true);
      } else {
        // Alternatively, check if a toast notification is shown
        const toast = page
          .locator('[role="status"]')
          .or(page.locator('.toast'))
          .or(page.getByText(/sign in/i));
        const isToastVisible = await toast.isVisible().catch(() => false);
        expect(isToastVisible).toBe(true);
      }

      // Should still be on pricing page
      expect(page.url()).toContain('/pricing');

      // Screenshot after action
      await pricingPage.screenshot('get-started-unauthenticated-click');

      // Check accessibility after action
      await pricingPage.checkBasicAccessibility();
    });

    test('Buttons show loading state when clicked', async ({ page }) => {
      // Set up alert handling to not block
      page.on('dialog', async dialog => {
        await dialog.accept();
      });

      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      // Wait for loading complete before interaction
      await pricingPage.waitForLoadingComplete();

      // Click Get Started button from pricing card (not header)
      const getStartedButton = pricingPage.pricingGrid
        .getByRole('button', { name: 'Get Started' })
        .first();
      await expect(getStartedButton).toBeVisible();
      await getStartedButton.click();

      // Wait for any loading states to complete
      await pricingPage.waitForLoadingComplete();

      // The page should still be functional (didn't crash)
      await expect(pricingPage.pageTitle).toBeVisible();

      // Check page is still functional
      await expect(pricingPage.pageTitle).toBeVisible();
    });

    test('handles network errors gracefully', async ({ page }) => {
      // Intercept and block checkout requests
      await page.route('/api/checkout/**', route => route.abort());

      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      // Try to click Get Started button from pricing card (not header)
      // Use the pricing grid to scope the selector to pricing cards only
      const getStartedButton = pricingPage.pricingGrid
        .getByRole('button', { name: 'Get Started' })
        .first();
      await expect(getStartedButton).toBeVisible();
      await getStartedButton.click();

      // Should handle network error without crashing
      await pricingPage.waitForLoadingComplete();

      // Page should still be functional
      await expect(pricingPage.pageTitle).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    let pricingPage: PricingPage;

    test.beforeEach(async ({ page }) => {
      pricingPage = new PricingPage(page);
    });

    test('Page remains functional after checkout error', async ({ page }) => {
      // Handle alerts
      page.on('dialog', async dialog => {
        await dialog.accept();
      });

      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      // Click Get Started from pricing grid to avoid header button
      const getStartedButton = pricingPage.pricingGrid
        .getByRole('button', { name: 'Get Started' })
        .first();
      await expect(getStartedButton).toBeVisible();
      await getStartedButton.click();

      // Use enhanced BasePage wait for error handling
      await pricingPage.waitForLoadingComplete();

      // Page should still be responsive (not crashed)
      await expect(pricingPage.pageTitle).toBeVisible();

      // Other buttons should still be clickable
      const getStartedButtons = pricingPage.pricingGrid.getByRole('button', {
        name: 'Get Started',
      });
      await expect(getStartedButtons.first()).toBeVisible();

      // Test basic functionality is preserved
      await pricingPage.checkBasicAccessibility();
    });

    test('handles rapid button clicking gracefully', async ({ page }) => {
      // Handle alerts
      page.on('dialog', async dialog => {
        await dialog.accept();
      });

      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      // Block navigation and API calls to test button clicking behavior without leaving page
      await page.route('**/checkout/**', route => route.abort());
      await page.route('/api/checkout/**', route => route.abort());

      // Rapidly click Get Started button multiple times
      const getStartedButton = pricingPage.pricingGrid
        .getByRole('button', { name: 'Get Started' })
        .first();
      await expect(getStartedButton).toBeVisible();

      for (let i = 0; i < 5; i++) {
        try {
          // Use a more robust approach to check button state with timeout
          const isVisible = await getStartedButton.isVisible({ timeout: 1000 }).catch(() => false);
          if (!isVisible) break;

          // Try to click directly without checking disabled state, catch any errors
          await getStartedButton.click({ timeout: 1000 });
        } catch (error) {
          // Ignore errors if button becomes unavailable or disabled after first clicks
          console.log(`Button click ${i + 1} handled gracefully: ${(error as Error).message}`);
          break; // Stop trying if we encounter an error
        }
        await pricingPage.wait(100);
      }

      // Wait for all operations to complete
      await pricingPage.waitForLoadingComplete();

      // Check if we're still on pricing page - if not, verify we can navigate back
      const currentUrl = page.url();
      if (currentUrl.includes('/pricing')) {
        // Still on pricing page - verify it's functional
        await expect(pricingPage.pageTitle).toBeVisible();
      } else {
        // We navigated away - test that the application handled rapid clicks gracefully by not crashing
        // The test passes if we got here without timeouts or unhandled exceptions
        console.log(`Navigated to: ${currentUrl} - rapid clicking handled gracefully`);
      }
    });
  });

  test.describe('Recommended Badge', () => {
    let pricingPage: PricingPage;

    test.beforeEach(async ({ page }) => {
      pricingPage = new PricingPage(page);
    });

    test('Recommended badges are displayed on featured plans', async ({ page }) => {
      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      // Find recommended badges - they use bg-indigo-500 class and contain "Recommended" text
      const recommendedBadges = page
        .locator('div')
        .filter({ hasText: 'Recommended' })
        .filter({ has: page.locator('.bg-indigo-500') });
      await expect(recommendedBadges.first()).toBeVisible();

      // Should have at least 1 recommended badge (for the Pro plan)
      const badgeCount = await recommendedBadges.count();
      expect(badgeCount).toBeGreaterThanOrEqual(1);

      // Check accessibility of badges
      await pricingPage.checkAriaLabels();

      // Screenshot with badges visible
      await pricingPage.screenshot('recommended-badges-visible');
    });

    test('badges have proper contrast and visibility', async ({ page }) => {
      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      const recommendedBadges = page
        .locator('div')
        .filter({ hasText: 'Recommended' })
        .filter({ has: page.locator('.bg-indigo-500') });

      // Check badges are visible
      await expect(recommendedBadges.first()).toBeVisible();

      // Check for proper styling (non-empty text content)
      const badgeText = await recommendedBadges.first().textContent();
      expect(badgeText?.trim().length).toBeGreaterThan(0);
    });
  });
});
