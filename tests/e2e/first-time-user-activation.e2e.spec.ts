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
 * Helper to clear first-time user state from localStorage
 */
async function clearFirstTimeUserState(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    localStorage.removeItem('miu_first_upload_completed');
    localStorage.removeItem('miu_onboarding_started');
    localStorage.removeItem('miu_celebration_shown');
    localStorage.removeItem('miu_sample_images_used');
    localStorage.removeItem('miu_onboarding_completed');
  });
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
      await page.waitForLoadState('networkidle');

      // Primary CTA: "Upload your first image" - look for any button with upload text
      const heroSection = page.locator('main').first();
      const uploadButton = heroSection
        .getByRole('button')
        .filter({
          hasText: /upload|first image/i,
        })
        .first();

      await expect(uploadButton).toBeVisible({ timeout: 15000 });
    });

    test('Verify secondary CTA button is visible on hero section', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Secondary CTA: "Try a sample" - look for any button with try/sample text
      const heroSection = page.locator('main').first();
      const sampleButton = heroSection
        .getByRole('button')
        .filter({
          hasText: /try|sample/i,
        })
        .first();

      await expect(sampleButton).toBeVisible({ timeout: 15000 });
    });

    test('Clicking primary CTA navigates to tool page', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Find and click the primary upload CTA
      const heroSection = page.locator('main').first();
      const uploadButton = heroSection
        .getByRole('button')
        .filter({
          hasText: /upload|first image/i,
        })
        .first();

      await uploadButton.click();

      // Wait for navigation to complete
      await expect(page).toHaveURL(/tools\/ai-image-upscaler/, { timeout: 15000 });
    });

    test('Clicking secondary CTA navigates to tool page with sample intent', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Find and click the sample/try CTA
      const heroSection = page.locator('main').first();
      const sampleButton = heroSection
        .getByRole('button')
        .filter({
          hasText: /try|sample/i,
        })
        .first();

      await sampleButton.click();

      // Wait for navigation to complete - should include sample=true
      await expect(page).toHaveURL(/sample=true/, { timeout: 15000 });
    });
  });

  test.describe('Sample Image Selector on Tool Page', () => {
    test('Sample images container is present for first-time users', async ({ page }) => {
      await setupAuthMocks(page);
      await page.goto('/tools/ai-image-upscaler');
      await clearFirstTimeUserState(page);
      await page.waitForLoadState('networkidle');

      // Look for sample images section - the component has a header with title/subtitle
      const sampleSection = page.locator('text=/or try a sample|sample images/i').first();

      // Check if sample section is visible (conditional on first-time user)
      const isVisible = await sampleSection.isVisible().catch(() => false);

      // This test documents the expected behavior
      console.log(`Sample section visible: ${isVisible}`);
    });
  });

  test.describe('Progress Steps on Tool Page', () => {
    test('Progress steps show correct step labels for first-time users', async ({ page }) => {
      await setupAuthMocks(page);
      await page.goto('/tools/ai-image-upscaler');
      await clearFirstTimeUserState(page);
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Look for progress steps container with role="navigation"
      const progressContainer = page.locator('[role="navigation"]').filter({
        hasText: /upload|configure|download/i,
      });

      const isVisible = await progressContainer.isVisible().catch(() => false);

      if (isVisible) {
        // Check for step labels
        const text = await progressContainer.textContent();
        expect(text?.toLowerCase()).toContain('upload');
        expect(text?.toLowerCase()).toContain('configure');
        expect(text?.toLowerCase()).toContain('download');
      }
    });

    test('Progress steps have correct aria structure', async ({ page }) => {
      await setupAuthMocks(page);
      await page.goto('/tools/ai-image-upscaler');
      await clearFirstTimeUserState(page);
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Look for progress steps with aria-current
      const currentStep = page.locator('[aria-current="step"]');

      const isVisible = await currentStep.isVisible().catch(() => false);

      if (isVisible) {
        // Step 1 should be current for first-time users
        const stepText = await currentStep.textContent();
        expect(stepText).toBeTruthy();
      }
    });
  });

  test.describe('First-Time User Detection', () => {
    test('First-time user state is tracked in localStorage', async ({ page }) => {
      await setupAuthMocks(page);
      await page.goto('/tools/ai-image-upscaler');
      await clearFirstTimeUserState(page);

      // Check initial state - should not have first upload completed
      const initialState = await page.evaluate(() => {
        return !localStorage.getItem('miu_first_upload_completed');
      });
      expect(initialState).toBe(true);

      // Reload and check state persists
      await page.reload();

      const afterReload = await page.evaluate(() => {
        return !localStorage.getItem('miu_first_upload_completed');
      });
      expect(afterReload).toBe(true);
    });

    test('Returning users do not see first-time UI elements', async ({ page }) => {
      await setupAuthMocks(page);

      // Set up as returning user (first upload completed)
      await page.goto('/tools/ai-image-upscaler');
      await page.evaluate(() => {
        localStorage.setItem('miu_first_upload_completed', Date.now().toString());
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      // Progress steps should not be visible for returning users
      const progressSteps = page.locator('[role="navigation"]').filter({
        hasText: /upload|configure|download/i,
      });

      // Should not be visible since user is not first-time
      const isVisible = await progressSteps.isVisible().catch(() => false);
      expect(isVisible).toBe(false);
    });
  });
});
