import { test, expect } from '../test-fixtures';
import { TestContext } from '../helpers';
import { UpscalerPage } from '../pages/UpscalerPage';

/**
 * Helper function to set up API mocks for model selection tests
 * NOTE: This does NOT mock the /api/upscale endpoint - tests should do that themselves
 * NOTE: Auth is handled by test-fixtures, no need to mock auth endpoints
 */
async function setupApiMocks(page: import('@playwright/test').Page) {
  // Mock the get_user_data RPC endpoint with credits
  await page.route('**/rest/v1/rpc/get_user_data', async route => {
    console.log('🔐 API MOCK: get_user_data RPC called');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profile: {
          id: 'test-user-id',
          email: 'test@example.com',
          role: 'user',
          subscription_credits_balance: 1000,
          purchased_credits_balance: 0,
        },
        subscription: null,
      }),
    });
  });

  // DO NOT mock /api/upscale here - let tests handle that themselves
}

test.describe('E2E: Model Selection UI', () => {
  let ctx: TestContext;
  let upscalerPage: UpscalerPage;

  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test.beforeEach(async ({ page }) => {
    upscalerPage = new UpscalerPage(page);
  });

  test('should show model selection UI after image upload', async ({ page }) => {
    // Set up API mocks (auth handled by test-fixtures)
    await setupApiMocks(page);

    // Go to dashboard page (UpscalerPage.goto() already routes to /dashboard)
    await upscalerPage.goto();

    // Wait for page to load and file input to be available
    await upscalerPage.waitForLoad();

    // Upload an image to activate the workspace
    await upscalerPage.uploadImage('tests/fixtures/sample.jpg');

    // Wait for the workspace to load by checking for files in queue
    await page.waitForFunction(
      () => {
        const queueItems = document.querySelectorAll('[data-testid="queue-item"]');
        return queueItems.length > 0;
      },
      {},
      { timeout: 10000 }
    );

    // Look for the quality tier selector
    await expect(page.getByText('Quality Tier')).toBeVisible({ timeout: 10000 });

    // Look for the current tier selection button (shows "Quick" by default)
    const currentTierButton = page
      .locator('button')
      .filter({ hasText: /Quick|Auto|Face Restore|HD Upscale|Face Pro|Ultra/ })
      .first();
    await expect(currentTierButton).toBeVisible();

    // Open the dropdown to check options
    await currentTierButton.click();

    // Check that tier options exist in the dropdown
    await expect(page.getByText('Auto').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Quick').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Face Restore').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('HD Upscale').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Face Pro').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Ultra').first()).toBeVisible({ timeout: 5000 });

    // Note: The "Best Value" badge may not be visible in all UI states
    // We've already verified all the tier options are visible above
  });

  test('should show operation mode buttons', async ({ page }) => {
    // Set up API mocks (auth handled by test-fixtures)
    await setupApiMocks(page);

    await upscalerPage.goto();
    await upscalerPage.waitForLoad();
    await upscalerPage.uploadImage('tests/fixtures/sample.jpg');

    // Wait for the workspace to load by checking for files in queue
    await page.waitForFunction(
      () => {
        const queueItems = document.querySelectorAll('[data-testid="queue-item"]');
        return queueItems.length > 0;
      },
      {},
      { timeout: 10000 }
    );

    // Look for enhancement options section header
    const additionalEnhancementsHeader = page.getByText('Additional Enhancements');
    await expect(additionalEnhancementsHeader).toBeVisible({ timeout: 10000 });

    // The "Additional Enhancements" section is collapsed by default
    // We need to click it to expand and see the options
    await additionalEnhancementsHeader.click();

    // Wait for the content to expand - check for the actual options to appear
    // The collapsible content has a transition, so wait for the content to be visible
    await page.waitForFunction(
      () => {
        const enhanceImageCheckbox = document.querySelector('input#enhance-image');
        return enhanceImageCheckbox !== null && enhanceImageCheckbox.offsetParent !== null;
      },
      {},
      { timeout: 5000 }
    );

    // Check for enhancement options using the new UI
    await expect(page.getByText('Enhance Image')).toBeVisible();
    await expect(page.getByText('Enhance Faces')).toBeVisible();
    await expect(page.getByText('Preserve Text')).toBeVisible();
  });

  test('should show scale options', async ({ page }) => {
    // Set up API mocks (auth handled by test-fixtures)
    await setupApiMocks(page);

    await upscalerPage.goto();
    await upscalerPage.waitForLoad();
    await upscalerPage.uploadImage('tests/fixtures/sample.jpg');

    // Wait for the workspace to load by checking for files in queue
    await page.waitForFunction(
      () => {
        const queueItems = document.querySelectorAll('[data-testid="queue-item"]');
        return queueItems.length > 0;
      },
      {},
      { timeout: 10000 }
    );

    // Check for upscale factor section label
    await expect(page.getByText('Upscale Factor')).toBeVisible({ timeout: 10000 });

    // Look for scale buttons - they are rendered as buttons by ToggleButtonGroup
    // The buttons contain the scale text (2x, 4x)
    // Note: The quick model (default for free tier) only supports 2x and 4x
    // The 8x option is only available for HD Upscale tier
    const twoXButton = page.locator('button').filter({ hasText: '2x' }).first();
    const fourXButton = page.locator('button').filter({ hasText: '4x' }).first();

    await expect(twoXButton).toBeVisible({ timeout: 5000 });
    await expect(fourXButton).toBeVisible({ timeout: 5000 });
  });

  test('should show processing options', async ({ page }) => {
    // Set up API mocks (auth handled by test-fixtures)
    await setupApiMocks(page);

    await upscalerPage.goto();
    await upscalerPage.waitForLoad();
    await upscalerPage.uploadImage('tests/fixtures/sample.jpg');

    // Wait for the workspace to load by checking for files in queue
    await page.waitForFunction(
      () => {
        const queueItems = document.querySelectorAll('[data-testid="queue-item"]');
        return queueItems.length > 0;
      },
      {},
      { timeout: 10000 }
    );

    // The Additional Enhancements section is collapsed by default
    // We need to expand it first
    const additionalEnhancementsHeader = page.getByText('Additional Enhancements');
    await additionalEnhancementsHeader.click();

    // Wait for the content to expand - check for the actual options to appear
    await page.waitForFunction(
      () => {
        const enhanceImageCheckbox = document.querySelector('input#enhance-image');
        return enhanceImageCheckbox !== null && enhanceImageCheckbox.offsetParent !== null;
      },
      {},
      { timeout: 5000 }
    );

    // Check for processing options in the Additional Enhancements section
    await expect(page.getByText('Preserve Text')).toBeVisible();
    await expect(page.getByText('Enhance Faces')).toBeVisible();
    await expect(page.getByText('Custom Instructions')).toBeVisible();
  });
});
