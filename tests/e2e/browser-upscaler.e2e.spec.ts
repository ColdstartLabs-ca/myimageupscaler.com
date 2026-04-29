import { test, expect } from '../test-fixtures';
import { getFixturePath } from '../fixtures';

test.describe('Browser Image Upscaler', () => {
  const fixturePath = getFixturePath('browser-upscaler-1x1.png');

  test('loads the free browser upscaler page', async ({ page }) => {
    const response = await page.goto('/tools/free-image-upscaler');

    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole('heading', { name: /free browser image upscaler/i })).toBeVisible();
    await expect(page.getByText(/drop your image here or click to browse/i)).toBeVisible();
    await expect(page.getByText(/choose file/i)).toBeVisible();
  });

  test('accepts a PNG upload and shows the before/after comparison view', async ({ page }) => {
    await page.goto('/tools/free-image-upscaler');

    await expect(page.getByText(/drop your image here or click to browse/i)).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(fixturePath);

    await expect(page.getByRole('button', { name: /upscale 2x/i })).toBeVisible();
    await expect(page.getByRole('img', { name: /original selected image/i })).toBeVisible();
    await expect(page.getByText('Original', { exact: true })).toBeVisible();
    await expect(page.getByText('1 x 1')).toBeVisible();

    await expect(
      page.getByText(
        /upload a jpeg|choose an image under|could not (open|read)|choose an image below|upscaling failed/i
      )
    ).toHaveCount(0);

    await page.getByRole('button', { name: /upscale 2x/i }).click();

    await expect(page.getByText('Before / After')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Upscaled', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /upscale again/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /download/i })).toBeEnabled();
  });
});
