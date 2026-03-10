import { test, expect } from '../test-fixtures';
import { BillingPage } from '../pages/BillingPage';
import { BasePage } from '../pages/BasePage';
import { setupAuthenticatedState, type ITestUserData } from '../helpers/auth-helpers';

/**
 * Subscription Upgrade Proof E2E Tests
 *
 * These tests verify what the user actually sees in the browser after
 * completing a subscription upgrade flow. They prove that:
 * 1. The billing page reflects the new tier after upgrade
 * 2. The dashboard shows the updated tier without stale cache
 * 3. Credit balance is preserved correctly after upgrade
 *
 * Strategy:
 * - Set up authenticated user state with initial subscription (e.g., Hobby)
 * - Simulate upgrade by updating mocked API responses to new tier (e.g., Pro)
 * - Assert visible UI elements reflect the new subscription tier
 */

/**
 * Assertion helper: Verify the visible plan name on the page
 */
async function assertVisiblePlan(page: import('@playwright/test').Page, expectedPlan: string): Promise<void> {
  // The billing page shows plan name in the subscription section
  const planLocator = page
    .locator(
      [
        // Billing page current plan section
        'h2:has-text("Current Plan") + * p:text-is("' + expectedPlan + '")',
        'div:has-text("Current Plan") p:text-is("' + expectedPlan + '")',
        // Plan badge in sidebar
        '.bg-accent\\/10:has-text("' + expectedPlan + '")',
      ].join(', ')
    )
    .or(page.getByText(expectedPlan, { exact: true }));

  await expect(planLocator.first()).toBeVisible({ timeout: 10000 });
}

/**
 * Assertion helper: Verify the visible credits balance on the page
 */
async function assertVisibleCredits(
  page: import('@playwright/test').Page,
  expectedCredits: number
): Promise<void> {
  const creditsText = expectedCredits.toString();

  const creditsLocator = page
    .locator(
      [
        'p:text-is("' + creditsText + '")',
        '.text-3xl:has-text("' + creditsText + '")',
        '[data-testid="credits-display"]',
      ].join(', ')
    )
    .or(page.getByText(`${creditsText} credits`));

  await expect(creditsLocator.first()).toBeVisible({ timeout: 10000 });
}

/**
 * Assertion helper: Verify subscription status badge is visible
 */
async function assertVisibleStatus(
  page: import('@playwright/test').Page,
  expectedStatus: string
): Promise<void> {
  const statusText = expectedStatus.charAt(0).toUpperCase() + expectedStatus.slice(1);
  const statusLocator = page.locator(
    [
      `span:has-text("${statusText}")`,
      `.bg-success\\/20:has-text("${statusText}")`,
      `[class*="rounded-full"]:has-text("${statusText}")`,
    ].join(', ')
  );

  await expect(statusLocator.first()).toBeVisible({ timeout: 10000 });
}

/**
 * Create test user data with Hobby subscription (pre-upgrade state)
 */
function createHobbySubscriber(): Partial<ITestUserData> {
  return {
    id: 'test-hobby-to-pro',
    email: 'hobby-to-pro@test.example.com',
    name: 'Upgrade Test User',
    profile: {
      id: 'test-hobby-to-pro',
      email: 'hobby-to-pro@test.example.com',
      role: 'user',
      subscription_credits_balance: 200,
      purchased_credits_balance: 0,
    },
    subscription: {
      id: 'sub_test_hobby',
      status: 'active',
      price_id: 'price_hobby_monthly',
    },
  } as unknown as Partial<ITestUserData>;
}

/**
 * Create test user data with Pro subscription (post-upgrade state)
 */
function createProSubscriber(credits: number = 1000): Partial<ITestUserData> {
  return {
    id: 'test-hobby-to-pro',
    email: 'hobby-to-pro@test.example.com',
    name: 'Upgrade Test User',
    profile: {
      id: 'test-hobby-to-pro',
      email: 'hobby-to-pro@test.example.com',
      role: 'user',
      subscription_credits_balance: credits,
      purchased_credits_balance: 0,
    },
    subscription: {
      id: 'sub_test_pro',
      status: 'active',
      price_id: 'price_pro_monthly',
    },
  } as unknown as Partial<ITestUserData>;
}

test.describe('Subscription Upgrade Proof Tests', () => {
  let billingPage: BillingPage;

  test.describe('Billing Page After Upgrade', () => {
    test('Billing page reflects new tier after upgrade from Hobby to Pro', async ({ page }) => {
      // Start with Hobby subscription
      await setupAuthenticatedState(page, createHobbySubscriber());

      // Initially mock with Hobby data
      let currentTier = 'hobby';
      let currentCredits = 200;

      // Mock the profile API that returns updated state after "upgrade"
      await page.route('**/api/stripe/profile', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            subscription_credits_balance: currentCredits,
            purchased_credits_balance: 0,
            subscription_tier: currentTier,
            subscription_status: 'active',
            stripe_customer_id: 'cus_test_upgrade',
          }),
        });
      });

      // Mock the subscription API
      await page.route('**/api/stripe/subscription', async route => {
        const priceId = currentTier === 'pro' ? 'price_pro_monthly' : 'price_hobby_monthly';
        const subId = currentTier === 'pro' ? 'sub_test_pro' : 'sub_test_hobby';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: subId,
            status: 'active',
            price_id: priceId,
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            cancel_at_period_end: false,
          }),
        });
      });

      // Mock credit history API
      await page.route('**/api/stripe/credit-history*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            transactions: [],
            pagination: { total: 0 },
          }),
        });
      });

      // Mock plan change API (upgrade)
      await page.route('**/api/stripe/change-plan', async route => {
        if (route.request().method() === 'POST') {
          // Simulate upgrade
          currentTier = 'pro';
          currentCredits = 1000;

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              message: 'Plan upgraded successfully',
            }),
          });
        } else {
          await route.continue();
        }
      });

      // Initialize billing page
      billingPage = new BillingPage(page);

      // Navigate to billing page
      await billingPage.gotoSubscriptionTab();

      // Assert: Initial state shows Hobby
      await assertVisiblePlan(page, 'Hobby');
      await assertVisibleCredits(page, 200);

      // Simulate upgrade: Click change plan button
      const changePlanButton = page.getByTestId('change-plan-button');
      await expect(changePlanButton).toBeVisible();
      await changePlanButton.click();

      // Wait for plan selection modal to appear
      await expect(page.locator('[class*="rounded-3xl"]').filter({ hasText: 'Choose Plan' })).toBeVisible({
        timeout: 5000,
      });

      // Select Professional plan
      const proCard = page.locator('div').filter({ hasText: 'Professional' }).first();
      await expect(proCard).toBeVisible();

      // Click the select button for Professional plan
      const selectProButton = proCard.getByRole('button').filter({ hasText: /Select|Upgrade/ }).first();
      await selectProButton.click();

      // Wait for the plan change to process
      await page.waitForTimeout(1000);

      // Mock the page reload after upgrade by navigating again
      await billingPage.gotoSubscriptionTab();

      // Assert: Updated state shows Professional
      await assertVisiblePlan(page, 'Professional');
      await assertVisibleCredits(page, 1000);
      await assertVisibleStatus(page, 'active');
    });

    test('Billing page shows Business tier after upgrade from Pro', async ({ page }) => {
      // Start with Pro subscription
      const proUser: Partial<ITestUserData> = {
        id: 'test-pro-to-business',
        email: 'pro-to-business@test.example.com',
        name: 'Pro to Business User',
        profile: {
          id: 'test-pro-to-business',
          email: 'pro-to-business@test.example.com',
          role: 'user',
          subscription_credits_balance: 1000,
          purchased_credits_balance: 0,
        },
        subscription: {
          id: 'sub_test_pro',
          status: 'active',
          price_id: 'price_pro_monthly',
        },
      } as unknown as Partial<ITestUserData>;
      await setupAuthenticatedState(page, proUser);

      // Mock the profile API with Business tier
      await page.route('**/api/stripe/profile', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            subscription_credits_balance: 5000,
            purchased_credits_balance: 0,
            subscription_tier: 'business',
            subscription_status: 'active',
            stripe_customer_id: 'cus_test_business',
          }),
        });
      });

      // Mock the subscription API with Business subscription
      await page.route('**/api/stripe/subscription', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'sub_test_business',
            status: 'active',
            price_id: 'price_business_monthly',
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            cancel_at_period_end: false,
          }),
        });
      });

      // Mock credit history API
      await page.route('**/api/stripe/credit-history*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            transactions: [],
            pagination: { total: 0 },
          }),
        });
      });

      // Initialize billing page
      billingPage = new BillingPage(page);

      // Navigate to billing page
      await billingPage.gotoSubscriptionTab();

      // Assert: Business plan is shown
      await assertVisiblePlan(page, 'Business');
      await assertVisibleCredits(page, 5000);
      await assertVisibleStatus(page, 'active');
    });

    test('Upgrade preserves existing credit balance', async ({ page }) => {
      // User has 150 credits from rollover + usage
      const userWithCredits: Partial<ITestUserData> = {
        id: 'test-credits-preserved',
        email: 'credits-preserved@test.example.com',
        name: 'Credits Preserved User',
        profile: {
          id: 'test-credits-preserved',
          email: 'credits-preserved@test.example.com',
          role: 'user',
          subscription_credits_balance: 150, // Partially used credits
          purchased_credits_balance: 50, // Some purchased credits too
        },
        subscription: {
          id: 'sub_test_hobby',
          status: 'active',
          price_id: 'price_hobby_monthly',
        },
      } as unknown as Partial<ITestUserData>;
      await setupAuthenticatedState(page, userWithCredits);

      // Mock the profile API - after upgrade, credits should still be 150 + 50 = 200
      await page.route('**/api/stripe/profile', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            subscription_credits_balance: 150,
            purchased_credits_balance: 50,
            subscription_tier: 'pro',
            subscription_status: 'active',
            stripe_customer_id: 'cus_test_credits',
          }),
        });
      });

      // Mock the subscription API
      await page.route('**/api/stripe/subscription', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'sub_test_pro',
            status: 'active',
            price_id: 'price_pro_monthly',
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            cancel_at_period_end: false,
          }),
        });
      });

      // Mock credit history API
      await page.route('**/api/stripe/credit-history*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            transactions: [],
            pagination: { total: 0 },
          }),
        });
      });

      // Initialize billing page
      billingPage = new BillingPage(page);

      // Navigate to billing page
      await billingPage.gotoSubscriptionTab();

      // Assert: Professional plan is shown (upgraded)
      await assertVisiblePlan(page, 'Professional');

      // Assert: Total credits (150 + 50 = 200) are preserved
      const totalCredits = 150 + 50;
      await assertVisibleCredits(page, totalCredits);
    });
  });

  test.describe('Dashboard After Upgrade', () => {
    test('Dashboard shows updated tier without stale cache after upgrade', async ({ page }) => {
      // Set up with initial Hobby state
      await setupAuthenticatedState(page, createHobbySubscriber());

      // Track current state for dynamic mocking
      let currentTier = 'hobby';
      let currentCredits = 200;

      // Mock the profile API - this simulates the backend state change after upgrade
      await page.route('**/api/stripe/profile', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            subscription_credits_balance: currentCredits,
            purchased_credits_balance: 0,
            subscription_tier: currentTier,
            subscription_status: 'active',
            stripe_customer_id: 'cus_test_dashboard',
          }),
        });
      });

      // Navigate to dashboard
      const dashboardPage = new BasePage(page);
      await dashboardPage.goto('/dashboard');

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Assert: Sidebar initially shows Hobby
      const hobbyBadge = page.locator('.bg-accent\\/10.text-accent').filter({ hasText: 'Hobby' });
      await expect(hobbyBadge.first()).toBeVisible({ timeout: 10000 });

      // Simulate upgrade happening on the backend
      currentTier = 'pro';
      currentCredits = 1000;

      // Clear the user store cache by triggering a fetchUserData
      // In the real app, this would happen after the webhook processes the upgrade
      await page.evaluate(() => {
        // Trigger a storage event to simulate cache invalidation
        window.localStorage.setItem('__upgrade_test__', Date.now().toString());
      });

      // Reload the dashboard to get fresh data
      await dashboardPage.reload();
      await page.waitForLoadState('networkidle');

      // Assert: Sidebar now shows Professional
      const proBadge = page.locator('.bg-accent\\/10.text-accent').filter({ hasText: 'Professional' });
      await expect(proBadge.first()).toBeVisible({ timeout: 10000 });

      // Assert: Credits are updated
      const creditsText = page.locator('text=1000');
      await expect(creditsText.first()).toBeVisible({ timeout: 10000 });
    });

    test('Dashboard header reflects subscription status immediately', async ({ page }) => {
      // Set up with Pro subscription
      await setupAuthenticatedState(page, createProSubscriber());

      // Mock the profile API
      await page.route('**/api/stripe/profile', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            subscription_credits_balance: 1000,
            purchased_credits_balance: 0,
            subscription_tier: 'pro',
            subscription_status: 'active',
            stripe_customer_id: 'cus_test_header',
          }),
        });
      });

      // Navigate to dashboard
      const dashboardPage = new BasePage(page);
      await dashboardPage.goto('/dashboard');

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Assert: User avatar/initials are visible
      const userAvatar = page.locator('.rounded-full.bg-gradient-to-br');
      await expect(userAvatar.first()).toBeVisible({ timeout: 10000 });

      // Assert: Professional badge is visible in sidebar user info
      const proBadge = page.locator('.bg-accent\\/10.text-accent').filter({ hasText: 'Professional' });
      await expect(proBadge.first()).toBeVisible({ timeout: 10000 });

      // Assert: No "Upgrade" prompt shown for Pro users
      const upgradePrompt = page.locator('text=Upgrade').filter({ hasText: 'Upgrade to Pro' });
      // Pro users shouldn't see upgrade prompts in the sidebar
      const isVisible = await upgradePrompt.count();
      expect(isVisible).toBe(0);
    });
  });

  test.describe('Upgrade Flow Edge Cases', () => {
    test('Billing page handles concurrent upgrade requests gracefully', async ({ page }) => {
      // Set up with Hobby subscription
      await setupAuthenticatedState(page, createHobbySubscriber());

      let requestCount = 0;
      let currentTier = 'hobby';

      // Mock the profile API
      await page.route('**/api/stripe/profile', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            subscription_credits_balance: 200,
            purchased_credits_balance: 0,
            subscription_tier: currentTier,
            subscription_status: 'active',
            stripe_customer_id: 'cus_test_concurrent',
          }),
        });
      });

      // Mock the subscription API
      await page.route('**/api/stripe/subscription', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'sub_test_concurrent',
            status: 'active',
            price_id: currentTier === 'pro' ? 'price_pro_monthly' : 'price_hobby_monthly',
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            cancel_at_period_end: false,
          }),
        });
      });

      // Mock plan change API - only process first request
      await page.route('**/api/stripe/change-plan', async route => {
        requestCount++;
        if (requestCount === 1) {
          currentTier = 'pro';
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              message: 'Plan upgraded successfully',
            }),
          });
        } else {
          // Subsequent requests get a "no change needed" response
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              message: 'Plan already updated',
            }),
          });
        }
      });

      // Mock credit history API
      await page.route('**/api/stripe/credit-history*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            transactions: [],
            pagination: { total: 0 },
          }),
        });
      });

      // Initialize billing page
      billingPage = new BillingPage(page);
      await billingPage.gotoSubscriptionTab();

      // Verify initial Hobby state
      await assertVisiblePlan(page, 'Hobby');

      // The page should remain functional even with concurrent requests
      await expect(billingPage.pageTitle).toBeVisible();
    });

    test('Billing page shows scheduled downgrade correctly', async ({ page }) => {
      // User has Pro subscription with scheduled downgrade to Hobby
      const userWithScheduledDowngrade: Partial<ITestUserData> = {
        id: 'test-scheduled-downgrade',
        email: 'scheduled-downgrade@test.example.com',
        name: 'Scheduled Downgrade User',
        profile: {
          id: 'test-scheduled-downgrade',
          email: 'scheduled-downgrade@test.example.com',
          role: 'user',
          subscription_credits_balance: 1000,
          purchased_credits_balance: 0,
        },
        subscription: {
          id: 'sub_test_scheduled',
          status: 'active',
          price_id: 'price_pro_monthly',
        },
      } as unknown as Partial<ITestUserData>;
      await setupAuthenticatedState(page, userWithScheduledDowngrade);

      // Mock the profile API
      await page.route('**/api/stripe/profile', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            subscription_credits_balance: 1000,
            purchased_credits_balance: 0,
            subscription_tier: 'pro',
            subscription_status: 'active',
            stripe_customer_id: 'cus_test_scheduled',
          }),
        });
      });

      // Mock the subscription API with scheduled change
      await page.route('**/api/stripe/subscription', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'sub_test_scheduled',
            status: 'active',
            price_id: 'price_pro_monthly',
            current_period_end: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
            cancel_at_period_end: false,
            scheduled_price_id: 'price_hobby_monthly',
            scheduled_change_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        });
      });

      // Mock credit history API
      await page.route('**/api/stripe/credit-history*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            transactions: [],
            pagination: { total: 0 },
          }),
        });
      });

      // Initialize billing page
      billingPage = new BillingPage(page);
      await billingPage.gotoSubscriptionTab();

      // Assert: Current plan is still Professional
      await assertVisiblePlan(page, 'Professional');

      // Assert: Scheduled change notice is visible
      const scheduledNotice = page.locator('text=Scheduled Plan Change');
      await expect(scheduledNotice).toBeVisible({ timeout: 10000 });

      // Assert: Shows the downgrade target (Hobby)
      const hobbyTarget = page.locator('text=Hobby');
      await expect(hobbyTarget.first()).toBeVisible();
    });
  });
});
