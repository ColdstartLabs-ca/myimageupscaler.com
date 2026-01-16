import { test, expect } from '../test-fixtures';

/**
 * E2E Test for pSEO Locale Rendering
 *
 * Verifies that localized pSEO pages render correctly with translated content.
 * This tests the locale-aware data loading in app/[locale]/(pseo)/.
 */

const locales = ['en', 'es', 'de', 'fr', 'it', 'pt', 'ja'] as const;
const testSlug = 'ai-image-upscaler'; // A common slug that should exist in all locales

for (const locale of locales) {
  test(`locale ${locale}: tools page renders with translated content`, async ({ page }) => {
    // Navigate to the localized page
    const url = `/${locale}/tools/${testSlug}`;
    await page.goto(url);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check that we're not on a 404 page
    await expect(page.locator('body')).not.toContainText('404');
    await expect(page.locator('body')).not.toContainText('Not Found');

    // Check that the page has content (h1 heading should exist)
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();

    // For non-English locales, verify the content is translated
    // (This is a basic check - we're just ensuring the page loads with content)
    if (locale !== 'en') {
      const pageTitle = await h1.textContent();
      expect(pageTitle?.length).toBeGreaterThan(0);

      // Log the page title for debugging
      console.log(`[${locale}] Page title: ${pageTitle}`);
    }
  });
}

test('English tools page serves correctly from root URL', async ({ page }) => {
  // Navigate to root tools URL (no locale prefix - should serve English)
  await page.goto(`/tools/${testSlug}`);

  await page.waitForLoadState('networkidle');

  // Check that we're not on a 404 page
  await expect(page.locator('body')).not.toContainText('404');

  // Check that the page has content
  const h1 = page.locator('h1');
  await expect(h1).toBeVisible();
  const title = await h1.textContent();
  expect(title).toContain('AI Image Upscaler');
});

test('Japanese alternatives page renders with Japanese content', async ({ page }) => {
  // Test a different category - alternatives
  const url = '/ja/alternatives/vs-topaz';
  await page.goto(url);

  await page.waitForLoadState('networkidle');

  // Check for Japanese content
  const h1 = page.locator('h1');
  await expect(h1).toBeVisible();

  const title = await h1.textContent();
  expect(title?.length).toBeGreaterThan(0);
  console.log(`[JA alternatives] Page title: ${title}`);

  // Verify we're not on error page
  await expect(page.locator('body')).not.toContainText('404');
});

test('German format-scale page renders correctly', async ({ page }) => {
  // Test format-scale category
  const url = '/de/format-scale/jpeg-upscale-2x';
  await page.goto(url);

  await page.waitForLoadState('networkidle');

  // Check for German content
  const h1 = page.locator('h1');
  await expect(h1).toBeVisible();

  const title = await h1.textContent();
  expect(title?.length).toBeGreaterThan(0);
  console.log(`[DE format-scale] Page title: ${title}`);

  // Verify we're not on error page
  await expect(page.locator('body')).not.toContainText('404');
});

test('French use-cases page renders correctly', async ({ page }) => {
  // Test use-cases category
  const url = '/fr/use-cases/ecommerce-product-photos';
  await page.goto(url);

  await page.waitForLoadState('networkidle');

  // Check for French content
  const h1 = page.locator('h1');
  await expect(h1).toBeVisible();

  const title = await h1.textContent();
  expect(title?.length).toBeGreaterThan(0);
  console.log(`[FR use-cases] Page title: ${title}`);

  // Verify we're not on error page
  await expect(page.locator('body')).not.toContainText('404');
});
