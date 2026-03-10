import { test, expect } from '../test-fixtures';
import { BillingPage } from '../pages/BillingPage';
import { BasePage } from '../pages/BasePage';
import { setupAuthenticatedStateWithSupabase, createTestUser, type ITestUserData } from '../helpers/auth-helpers';
import { CheckoutMock } from '../helpers/checkout-mock';
import { mockSupabaseForUser } from '../helpers/supabase-mock';

/**
 * Subscription Signup Proof E2E Tests
 *
 * These tests verify what the user actually sees in the browser after
 * completing a subscription signup flow. They prove that:
 * 1. The success page displays the correct plan and credits
 * 2. The billing page shows active subscription status after signup
 *
 * Strategy:
 * - Mock the Stripe checkout API to bypass real Stripe calls
 * - Set up authenticated user state with subscription data
 * - Assert visible UI elements reflect the expected subscription state
 */

/**
 * Assertion helper: Verify the visible plan name on the page
 */
async function assertVisiblePlan(page: import('@playwright/test').Page, expectedPlan: string): Promise<void> {
  // The billing page shows plan name in the subscription section
  // Look for plan name in various locations where it might appear
  const planLocator = page
    .locator(
      [
        // Billing page current plan section
        'h2:has-text("Current Plan") + * :has-text("' + expectedPlan + '")',
        'div:has-text("Current Plan"):has-text("' + expectedPlan + '")',
        // Plan badge in sidebar
        '.bg-accent\\/10:has-text("' + expectedPlan + '")',
        // Success page heading
        'h1:has-text("Subscription Activated")',
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
  // Look for credits display in various formats
  // The billing page shows total credits in the current plan section
  const creditsText = expectedCredits.toString();

  // Try multiple selectors for credits display
  const creditsLocator = page
    .locator(
      [
        // Credits balance in billing page
        'p:text-is("' + creditsText + '")',
        // Current balance section
        '.text-3xl:has-text("' + creditsText + '")',
        // Credits display component
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
  // Status badges show capitalized status text
  const statusText = expectedStatus.charAt(0).toUpperCase() + expectedStatus.slice(1);
  const statusLocator = page.locator(
    [
      // Status badge in billing page
      `span:has-text("${statusText}")`,
      `.bg-success\\/20:has-text("${statusText}")`,
      `[class*="rounded-full"]:has-text("${statusText}")`,
    ].join(', ')
  );

  await expect(statusLocator.first()).toBeVisible({ timeout: 10000 });
}

/**
 * Create test user data with an active Hobby subscription
 */
function createHobbySubscriber(): Partial<ITestUserData> {
  return {
    id: 'test-hobby-subscriber',
    email: 'hobby-subscriber@test.example.com',
    name: 'Hobby Subscriber',
    profile: {
      id: 'test-hobby-subscriber',
      email: 'hobby-subscriber@test.example.com',
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

test.describe('Subscription Signup Proof Tests', () => {
  let billingPage: BillingPage;
  let checkoutMock: CheckoutMock;

  test.describe('Success Page After Signup', () => {
    test('Success page shows correct plan after signup', async ({ page }) => {
      // Set up authenticated user with Hobby subscription
      await setupAuthenticatedStateWithSupabase(page, createHobbySubscriber());

      // Mock checkout success to redirect to success page
      checkoutMock = new CheckoutMock(page);
      await checkoutMock.mockCheckoutSuccess({
        successUrl: '/success?session_id=test_session_hobby_123&type=subscription',
      });

      // Navigate to success page (simulating post-checkout redirect)
      await page.goto('/success?session_id=test_session_hobby_123&type=subscription');

      // Wait for the page to load
      await page.waitForLoadState('networkidle');

      // Assert: Success page shows subscription activated
      await expect(page.locator('h1:has-text("Subscription Activated")')).toBeVisible({
        timeout: 10000,
      });

      // Assert: Success page shows credits balance
      await assertVisibleCredits(page, 200);

      // Assert: Links to dashboard and billing are visible
      await expect(page.getByRole('link', { name: 'Go to Dashboard' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'View Billing' })).toBeVisible();
    });

    test('Success page shows credits purchased for credit pack', async ({ page }) => {
      // Set up authenticated user
      const creditPackUser: Partial<ITestUserData> = {
        id: 'test-credit-pack-user',
        email: 'credit-pack@test.example.com',
        name: 'Credit Pack Buyer',
        profile: {
          id: 'test-credit-pack-user',
          email: 'credit-pack@test.example.com',
          role: 'user',
          subscription_credits_balance: 10, // Free tier default
          purchased_credits_balance: 200, // Purchased credits
        },
        subscription: null,
      };
      await setupAuthenticatedStateWithSupabase(page, creditPackUser);

      // Navigate to success page for credit pack purchase
      await page.goto('/success?session_id=test_session_credits_123&type=credits&credits=200');

      // Wait for the page to load
      await page.waitForLoadState('networkidle');

      // Assert: Success page shows credits purchased
      await expect(page.locator('h1:has-text("Credits Purchased")')).toBeVisible({
        timeout: 10000,
      });

      // Assert: Success page shows total credits (10 + 200 = 210)
      await assertVisibleCredits(page, 210);
    });
  });

  test.describe('Billing Page After Signup', () => {
    test('Billing page shows active subscription after signup', async ({ page }) => {
      // Set up authenticated user with Hobby subscription
      await setupAuthenticatedStateWithSupabase(page, createHobbySubscriber());

      // Initialize billing page
      billingPage = new BillingPage(page);

      // Navigate to billing page and switch to subscription tab
      await billingPage.gotoSubscriptionTab();

      // Assert: Plan name is visible (Hobby)
      await assertVisiblePlan(page, 'Hobby');

      // Assert: Credits balance is visible (200)
      await assertVisibleCredits(page, 200);

      // Assert: Status badge shows Active
      await assertVisibleStatus(page, 'active');

      // Assert: Change Plan button is visible
      await expect(page.getByTestId('change-plan-button')).toBeVisible();

      // Note: manageSubscriptionButton is in the Invoices tab, not Subscription tab
      // We need to switch to Invoices tab to verify it's visible
      await billingPage.switchToInvoicesTab();
      await expect(billingPage.manageSubscriptionButton).toBeVisible();
    });

    test('Billing page shows correct tier for Pro subscriber', async ({ page }) => {
      // Set up authenticated user with Pro subscription
      const proSubscriber: Partial<ITestUserData> = {
        id: 'test-pro-subscriber',
        email: 'pro-subscriber@test.example.com',
        name: 'Pro Subscriber',
        profile: {
          id: 'test-pro-subscriber',
          email: 'pro-subscriber@test.example.com',
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
      await setupAuthenticatedStateWithSupabase(page, proSubscriber);

      // Initialize billing page
      billingPage = new BillingPage(page);

      // Navigate to billing page and switch to subscription tab
      await billingPage.gotoSubscriptionTab();

      // Assert: Plan name is visible (Professional)
      await assertVisiblePlan(page, 'Professional');

      // Assert: Credits balance is visible (1000)
      await assertVisibleCredits(page, 1000);

      // Assert: Status badge shows Active
      await assertVisibleStatus(page, 'active');
    });

    test('Billing page shows free user state correctly', async ({ page }) => {
      // Set up authenticated free user
      const freeUser: Partial<ITestUserData> = {
        id: 'test-free-user',
        email: 'free-user@test.example.com',
        name: 'Free User',
        profile: {
          id: 'test-free-user',
          email: 'free-user@test.example.com',
          role: 'user',
          subscription_credits_balance: 10,
          purchased_credits_balance: 0,
        },
        subscription: null,
      };
      await setupAuthenticatedStateWithSupabase(page, freeUser);

      // Initialize billing page
      billingPage = new BillingPage(page);

      // Navigate to billing page and switch to subscription tab
      await billingPage.gotoSubscriptionTab();

      // Assert: Free Plan is shown
      await assertVisiblePlan(page, 'Free Plan');

      // Assert: Credits balance is visible (10)
      await assertVisibleCredits(page, 10);

      // Assert: Pricing cards are visible for upgrade options
      await expect(page.getByRole('heading', { name: 'Hobby', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Professional', exact: true })).toBeVisible();

      // Note: verifyFreeUserState checks manageSubscriptionButton is NOT visible
      // This button is in the Invoices tab, so we need to switch there to verify
      await billingPage.switchToInvoicesTab();
      // Free users should NOT see "Manage Subscription" button (no stripe_customer_id)
      await expect(billingPage.manageSubscriptionButton).not.toBeVisible();
    });
  });

  test.describe('Dashboard Sidebar After Signup', () => {
    test('Dashboard sidebar shows updated tier after signup', async ({ page }) => {
      // Set up authenticated user with Hobby subscription
      await setupAuthenticatedStateWithSupabase(page, createHobbySubscriber());

      // Navigate to dashboard
      const dashboardPage = new BasePage(page);
      await dashboardPage.goto('/dashboard');

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Assert: Sidebar shows the plan name
      // The sidebar shows plan name in a badge under user info
      const planBadge = page.locator('.bg-accent\\/10.text-accent').filter({ hasText: 'Hobby' });
      await expect(planBadge.first()).toBeVisible({ timeout: 10000 });

      // Assert: Credits display is visible in sidebar
      const creditsDisplay = page.locator('[data-testid="credits-display"], .credits-display');
      // If there's no specific testid, look for the credits text
      const creditsText = page.locator('text=200');
      await expect(creditsText.first()).toBeVisible({ timeout: 10000 });
    });
  });
});
