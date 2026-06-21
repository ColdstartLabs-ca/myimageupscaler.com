import { test, expect } from '@playwright/test';

test.describe('middleware auth routing', () => {
  test('public pSEO route renders without auth redirect', async ({ page }) => {
    await page.goto('/tools/ai-image-upscaler');

    await expect(page.locator('body')).not.toContainText('404');
    await expect(page.locator('h1')).toContainText('AI Image Upscaler');
    expect(new URL(page.url()).pathname).toBe('/tools/ai-image-upscaler');
  });

  test('dashboard route remains routable in Playwright test mode', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.locator('body')).not.toContainText('404');
    expect(new URL(page.url()).pathname).toBe('/dashboard');
  });

  test('localized dashboard route remains routable in Playwright test mode', async ({ page }) => {
    await page.goto('/pt/dashboard');

    await expect(page.locator('body')).not.toContainText('404');
    expect(new URL(page.url()).pathname).toBe('/pt/dashboard');
  });
});
