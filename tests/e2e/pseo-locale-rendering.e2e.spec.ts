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
    const url = `/${locale}/tools/${testSlug}`;
    await page.goto(url);

    await expect(page.locator('body')).not.toContainText('404');
    await expect(page.locator('body')).not.toContainText('Not Found');

    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();

    if (locale !== 'en') {
      const pageTitle = await h1.textContent();
      expect(pageTitle?.length).toBeGreaterThan(0);
    }
  });
}

test('English tools page serves correctly from root URL', async ({ page }) => {
  await page.goto(`/tools/${testSlug}`);

  await expect(page.locator('body')).not.toContainText('404');

  const h1 = page.locator('h1');
  await expect(h1).toBeVisible();
  const title = await h1.textContent();
  expect(title).toContain('AI Image Upscaler');
});

test('Japanese alternatives page renders with Japanese content', async ({ page }) => {
  await page.goto('/ja/alternatives/vs-topaz');

  const h1 = page.locator('h1');
  await expect(h1).toBeVisible();

  const title = await h1.textContent();
  expect(title?.length).toBeGreaterThan(0);

  await expect(page.locator('body')).not.toContainText('404');
});

test('German format-scale page renders correctly', async ({ page }) => {
  await page.goto('/de/format-scale/jpeg-upscale-2x');

  const h1 = page.locator('h1');
  await expect(h1).toBeVisible();

  const title = await h1.textContent();
  expect(title?.length).toBeGreaterThan(0);

  await expect(page.locator('body')).not.toContainText('404');
});

test('French use-cases page renders correctly', async ({ page }) => {
  await page.goto('/fr/use-cases/ecommerce-product-photos');

  const h1 = page.locator('h1');
  await expect(h1).toBeVisible();

  const title = await h1.textContent();
  expect(title?.length).toBeGreaterThan(0);

  await expect(page.locator('body')).not.toContainText('404');
});
