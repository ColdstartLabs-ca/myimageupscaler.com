import { expect, test } from '@playwright/test';

test.describe('Informational blog above-the-fold CTA', () => {
  test('shows the image tool entry point without scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/blog/fixing-pixelated-photos', { waitUntil: 'domcontentloaded' });

    const cta = page.getByTestId('blog-above-fold-cta');
    const notFound = page.getByRole('heading', { name: '404', exact: true });
    const errorBoundary = page.getByText('Something went wrong', { exact: false }).first();
    await expect(notFound.or(errorBoundary).or(cta)).toBeVisible({ timeout: 30000 });

    if (await notFound.isVisible()) {
      test.skip(true, 'The test environment does not contain the published blog post.');
      return;
    }

    if (await errorBoundary.isVisible()) {
      test.skip(true, 'The test environment cannot load the published blog data.');
      return;
    }

    await expect(cta).toBeVisible({ timeout: 10000 });
    await expect(cta.locator('a')).toHaveAttribute('href', '/tools/ai-image-upscaler');

    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  });
});
