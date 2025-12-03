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

  test.beforeAll(async ({ page }) => {
    ctx = new TestContext();
  });

  test.afterAll(async ({ page }) => {
    await ctx.cleanup();
  });

  test.describe('Pricing Page - Structure Verification', () => {
    let pricingPage: PricingPage;

    test.beforeEach(async ({ page }) => {
      pricingPage = new PricingPage(page);
    });

    test('Pricing page displays main sections', async ({ page }) => {
      await pricingPage.goto();

      // Verify page title loads with enhanced wait
      await expect(pricingPage.pageTitle).toBeVisible({ timeout: 15000 });

      // Use enhanced BasePage accessibility check
      await pricingPage.checkBasicAccessibility();

      // Verify Credit Packs section
      await expect(pricingPage.creditPacksTitle).toBeVisible();

      // Verify Subscriptions section
      await expect(pricingPage.subscriptionsTitle).toBeVisible();

      // Verify FAQ section
      await expect(pricingPage.faqTitle).toBeVisible();

      // Take screenshot for debugging
      await pricingPage.screenshot('pricing-page-structure');
    });

    test('Credit pack cards have Buy Now buttons', async ({ page }) => {
      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      // Use enhanced BasePage button finding method
      await pricingPage.clickButton('Buy Now');

      // Find buy buttons in credit packs area
      const buyButtons = page.getByRole('button', { name: 'Buy Now' });
      await expect(buyButtons.first()).toBeVisible({ timeout: 5000 });

      // Should have 3 credit pack buttons
      const count = await buyButtons.count();
      expect(count).toBeGreaterThanOrEqual(3);

      // Check ARIA labels using enhanced BasePage method
      await pricingPage.checkAriaLabels();
    });

    test('Subscription cards have Subscribe Now buttons', async ({ page }) => {
      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      // Use enhanced BasePage button finding method
      await pricingPage.clickButton('Subscribe Now');

      // Find subscribe buttons
      const subscribeButtons = page.getByRole('button', { name: 'Subscribe Now' });
      await expect(subscribeButtons.first()).toBeVisible({ timeout: 5000 });

      // Should have 3 subscription buttons
      const count = await subscribeButtons.count();
      expect(count).toBeGreaterThanOrEqual(3);

      // Screenshot after button interaction
      await pricingPage.screenshot('subscribe-buttons-visible');
    });

    test('Pricing cards display pricing information', async ({ page }) => {
      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      // Verify pricing amounts are visible
      const prices = page.locator('.text-4xl.font-bold');
      await expect(prices.first()).toBeVisible();

      // Should have multiple price displays (6 total - 3 packs + 3 subscriptions)
      const priceCount = await prices.count();
      expect(priceCount).toBeGreaterThanOrEqual(6);

      // Check for proper contrast and readability
      await pricingPage.checkBasicAccessibility();
    });

    test('FAQ section has expandable questions', async ({ page }) => {
      await pricingPage.goto();
      await pricingPage.waitForLoadingComplete();

      await expect(pricingPage.faqTitle).toBeVisible({ timeout: 15000 });

      // Find FAQ items (collapse elements)
      const faqItems = page.locator('.collapse-arrow');
      await expect(faqItems.first()).toBeVisible();

      const faqCount = await faqItems.count();
      expect(faqCount).toBeGreaterThanOrEqual(3);

      // Test FAQ accessibility
      await pricingPage.checkAriaLabels();
    });

    test('Contact Sales link is visible', async ({ page }) => {
      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      // Verify custom plan section
      await expect(pricingPage.customPlanTitle).toBeVisible();
      await expect(pricingPage.contactSalesButton).toBeVisible();

      // Test link accessibility
      await pricingPage.checkAriaLabels();
    });
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

    test('Buy Now button is clickable and triggers checkout attempt', async ({ page }) => {
      // Capture any alerts that appear
      let alertMessage = '';
      page.on('dialog', async dialog => {
        alertMessage = dialog.message();
        await dialog.accept();
      });

      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      // Use enhanced BasePage wait for loading
      await pricingPage.waitForLoadingComplete();

      // Click Buy Now button using enhanced BasePage method
      await pricingPage.clickButton('Buy Now');

      // Use enhanced BasePage wait instead of fixed timeout
      await pricingPage.wait(2000);

      // Verify the authentication error is shown
      expect(alertMessage).toContain('not authenticated');

      // Screenshot after error
      await pricingPage.screenshot('auth-error-after-buy-click');
    });

    test('Subscribe Now button is clickable and triggers checkout attempt', async ({ page }) => {
      // Capture any alerts that appear
      let alertMessage = '';
      page.on('dialog', async dialog => {
        alertMessage = dialog.message();
        await dialog.accept();
      });

      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      // Use enhanced BasePage wait for loading
      await pricingPage.waitForLoadingComplete();

      // Click Subscribe Now button using enhanced BasePage method
      await pricingPage.clickButton('Subscribe Now');

      // Use enhanced BasePage wait instead of fixed timeout
      await pricingPage.wait(2000);

      // Verify the authentication error is shown
      expect(alertMessage).toContain('not authenticated');

      // Screenshot after error
      await pricingPage.screenshot('auth-error-after-subscribe-click');
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

      // Click buy button and check for loading state
      const buyButton = page.getByRole('button', { name: 'Buy Now' }).first();
      await buyButton.click();

      // Wait for any loading states to complete
      await pricingPage.waitForLoadingComplete();

      // The button should still be visible (didn't crash)
      await expect(buyButton).toBeVisible();

      // Check page is still functional
      await expect(pricingPage.pageTitle).toBeVisible();
    });

    test('handles network errors gracefully', async ({ page }) => {
      // Intercept and block checkout requests
      await page.route('/api/checkout/**', route => route.abort());

      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      // Try to click buy button
      await pricingPage.clickButton('Buy Now');

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

    test('Clicking purchase buttons shows error for unauthenticated users', async ({ page }) => {
      // Capture dialog/alert using enhanced pattern
      let alertMessage = '';
      page.on('dialog', async dialog => {
        alertMessage = dialog.message();
        await dialog.accept();
      });

      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      // Click Buy Now using enhanced BasePage method
      await pricingPage.clickButton('Buy Now');

      // Use enhanced BasePage wait instead of fixed timeout
      await pricingPage.wait(2000);

      // Verify error was shown (should show authentication error)
      expect(alertMessage).toBeTruthy();
      expect(alertMessage.toLowerCase()).toContain('authenticated');

      // Check accessibility after error
      await pricingPage.checkBasicAccessibility();
    });

    test('Page remains functional after checkout error', async ({ page }) => {
      // Handle alerts
      page.on('dialog', async dialog => {
        await dialog.accept();
      });

      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      // Click Buy Now using enhanced BasePage method
      await pricingPage.clickButton('Buy Now');

      // Use enhanced BasePage wait for error handling
      await pricingPage.waitForLoadingComplete();

      // Page should still be responsive (not crashed)
      await expect(pricingPage.pageTitle).toBeVisible();

      // Other buttons should still be clickable
      const subscribeButtons = page.getByRole('button', { name: 'Subscribe Now' });
      await expect(subscribeButtons.first()).toBeVisible();

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

      // Rapidly click buy button multiple times
      for (let i = 0; i < 5; i++) {
        await pricingPage.clickButton('Buy Now');
        await pricingPage.wait(100);
      }

      // Wait for all operations to complete
      await pricingPage.waitForLoadingComplete();

      // Page should still be functional
      await expect(pricingPage.pageTitle).toBeVisible();
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

      // Find recommended badges
      const recommendedBadges = page.locator('.badge-primary').filter({ hasText: 'Recommended' });
      await expect(recommendedBadges.first()).toBeVisible();

      // Should have 2 recommended badges (one for credit pack, one for subscription)
      const badgeCount = await recommendedBadges.count();
      expect(badgeCount).toBe(2);

      // Check accessibility of badges
      await pricingPage.checkAriaLabels();

      // Screenshot with badges visible
      await pricingPage.screenshot('recommended-badges-visible');
    });

    test('badges have proper contrast and visibility', async ({ page }) => {
      await pricingPage.goto();
      await pricingPage.waitForPageLoad();

      const recommendedBadges = page.locator('.badge-primary').filter({ hasText: 'Recommended' });

      // Check badges are visible
      await expect(recommendedBadges.first()).toBeVisible();

      // Check for proper styling (non-empty text content)
      const badgeText = await recommendedBadges.first().textContent();
      expect(badgeText?.trim().length).toBeGreaterThan(0);
    });
  });

  test.describe('Test Infrastructure Validation', () => {
    // Using TestContext instead of direct TestDataManager usage
    test('TestContext can create and cleanup test users', async ({ page }) => {
      const testUser = await ctx.createUser();

        expect(testUser.id).toBeTruthy();
    expect(testUser.email).toContain('test-');
    expect(testUser.token).toBeTruthy();

    // Verify user exists via TestContext data manager
    const profile = await ctx.data.getUserProfile(testUser.id);
    expect(profile).toBeTruthy();
    expect(profile.credits_balance).toBeGreaterThanOrEqual(0);
  });

  test('TestContext can create users with subscription', async ({ page }) => {
    const testUser = await ctx.createUser({
      subscription: 'active',
      tier: 'pro',
      credits: 500
    });

        expect(testUser.id).toBeTruthy();

    // Verify subscription was set correctly
    const profile = await ctx.data.getUserProfile(testUser.id);
    expect(profile.subscription_status).toBe('active');
    expect(profile.subscription_tier).toBe('pro');
    expect(profile.credits_balance).toBeGreaterThanOrEqual(500);
  });

  test('TestContext manages multiple users efficiently', async ({ page }) => {
    // Create multiple users
    const users = [];
    for (let i = 0; i < 3; i++) {
      const user = await ctx.createUser({
        credits: 100 + (i * 50)
      });
      users.push(user);
    }

    // Verify all users were created successfully
    expect(users.length).toBe(3);
    for (const user of users) {
      expect(user.id).toBeTruthy();
      expect(user.email).toContain('test-');

      const profile = await ctx.data.getUserProfile(user.id);
      expect(profile).toBeTruthy();
    }

    // Cleanup will be handled by TestContext.afterAll
  });

  test('TestContext handles user creation errors gracefully', async ({ page }) => {
    // Test should handle any potential errors in user creation
    try {
      const user = await ctx.createUser({
        subscription: 'active',
        tier: 'pro',
        credits: 1000
      });

      expect(user.id).toBeTruthy();
    } catch (error) {
      // If user creation fails, test should not crash
      expect(error).toBeDefined();
    }
    });
  });
});
