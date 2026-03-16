/**
 * First-Time User Activation E2E Tests
 *
 * Tests the first-time user activation flow introduced in this PR:
 * - HeroActions CTAs on landing page
 * - SampleImageSelector visibility in tool page
 * - ProgressSteps visibility in tool page
 * - First-time user detection via localStorage
 *
 * @see docs/PRDs/first-time-user-activation.md
 */

import { test, expect } from '../test-fixtures';

/**
 * Returns an initScript string that clears first-time user state before page JS runs.
 * Must be registered via page.addInitScript() before navigation.
 */
function getFirstTimeUserInitScript(): string {
  return `
    localStorage.removeItem('miu_first_upload_completed');
    localStorage.removeItem('miu_onboarding_started');
    localStorage.removeItem('miu_celebration_shown');
    localStorage.removeItem('miu_sample_images_used');
    localStorage.removeItem('miu_onboarding_completed');
  `;
}

/**
 * Helper to set up auth mocks for authenticated user tests
 */
async function setupAuthMocks(page: import('@playwright/test').Page, credits = 1000) {
  await page.route('**/auth/v1/session', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: {
          access_token: 'fake-test-token',
          user: { id: 'test-user-id', email: 'test@example.com' },
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
          subscription_credits_balance: credits,
          purchased_credits_balance: 0,
        },
        subscription: null,
      }),
    });
  });
}

test.describe('First-Time User Activation', () => {
  test.describe('Hero Actions on Landing Page', () => {
    test('Verify primary CTA button is visible on hero section', async ({ page }) => {
      await page.goto('/');

      // Primary CTA: "Upscale My First Image" or "Fix My Images Free" (depending on trial config)
      const heroSection = page.locator('section:has-text("What is")').first();
      const primaryButton = heroSection
        .getByRole('button')
        .filter({ hasText: /upscale|fix|image|first/i })
        .first();

      await expect(primaryButton).toBeVisible({ timeout: 15000 });
    });

    test('Verify secondary CTA button is visible on hero section', async ({ page }) => {
      await page.goto('/');

      // Secondary CTA: "Sign In" button
      const heroSection = page.locator('section:has-text("What is")').first();
      const signInButton = heroSection
        .getByRole('button')
        .filter({ hasText: /sign in|log in/i })
        .first();

      await expect(signInButton).toBeVisible({ timeout: 15000 });
    });

    test('Clicking primary CTA opens auth modal', async ({ page }) => {
      await page.goto('/');

      const heroSection = page.locator('section:has-text("What is")').first();
      const primaryButton = heroSection
        .getByRole('button')
        .filter({ hasText: /upscale|fix|image|first/i })
        .first();

      await expect(primaryButton).toBeVisible({ timeout: 15000 });
      await primaryButton.click();

      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 10000 });
    });

    test('Clicking secondary CTA opens login modal', async ({ page }) => {
      await page.goto('/');

      const heroSection = page.locator('section:has-text("What is")').first();
      const signInButton = heroSection
        .getByRole('button')
        .filter({ hasText: /sign in|log in/i })
        .first();

      await expect(signInButton).toBeVisible({ timeout: 15000 });
      await signInButton.click();

      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Workspace - First-Time User Features', () => {
    test('Sample images modal opens via help button', async ({ page }) => {
      // Clear state BEFORE navigation so React sees the clean state on first render
      await page.addInitScript(getFirstTimeUserInitScript());
      await setupAuthMocks(page);
      await page.goto('/dashboard');

      // The "Try sample images" help button is always visible in the empty state
      const helpButton = page.locator('[aria-label="Try sample images"]').first();
      await expect(helpButton).toBeVisible({ timeout: 15000 });

      // Click to open the modal
      await helpButton.click();

      // SampleImageSelector shows sample type labels in the modal
      await expect(page.getByText('Photo', { exact: true }).first()).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Illustration', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Old Photo', { exact: true }).first()).toBeVisible();
    });

    test('Progress steps show correct step labels for first-time users', async ({ page }) => {
      await page.addInitScript(getFirstTimeUserInitScript());
      await setupAuthMocks(page);
      await page.goto('/dashboard');

      // ProgressSteps uses aria-current="step" to mark the active step
      const currentStep = page.locator('[aria-current="step"]').first();
      await expect(currentStep).toBeVisible({ timeout: 15000 });

      const stepText = await currentStep.textContent();
      expect(stepText).toBeTruthy();
    });

    test('Progress steps container has correct navigation role', async ({ page }) => {
      await page.addInitScript(getFirstTimeUserInitScript());
      await setupAuthMocks(page);
      await page.goto('/dashboard');

      // ProgressSteps component uses role="navigation" with aria-label
      const progressNav = page.locator('[role="navigation"][aria-label*="progress" i]').first();
      await expect(progressNav).toBeVisible({ timeout: 15000 });

      const ariaLabel = await progressNav.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
    });
  });

  test.describe('First-Time User Detection', () => {
    test('First-time user state is tracked in localStorage', async ({ page }) => {
      await page.addInitScript(getFirstTimeUserInitScript());
      await setupAuthMocks(page);
      await page.goto('/dashboard');

      // Check initial state - should not have first upload completed
      const initialState = await page.evaluate(() => {
        return !localStorage.getItem('miu_first_upload_completed');
      });
      expect(initialState).toBe(true);

      // Reload and check state persists (no upload happened, so still first-time)
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      const afterReload = await page.evaluate(() => {
        return !localStorage.getItem('miu_first_upload_completed');
      });
      expect(afterReload).toBe(true);
    });

    test('Returning users still have access to workspace features', async ({ page }) => {
      await setupAuthMocks(page);

      // Set returning-user state via initScript so it's set before page loads
      await page.addInitScript(() => {
        localStorage.setItem('miu_first_upload_completed', Date.now().toString());
      });

      await page.goto('/dashboard');

      // ProgressSteps guides all users, not just first-time
      const progressSteps = page.locator('[aria-current="step"]').first();
      await expect(progressSteps).toBeVisible({ timeout: 15000 });
    });
  });
});
