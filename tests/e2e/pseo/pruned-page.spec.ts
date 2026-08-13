import { expect, test } from '../../test-fixtures';

test.describe('pruned pSEO pages', () => {
  test('keeps a pruned page reachable, noindexed, and linked to its hub', async ({ page }) => {
    const response = await page.goto('/platform-format/dalle-upscaler-avif');

    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i);

    const parentHub = page.getByTestId('pseo-parent-hub-link');
    await expect(parentHub).toBeVisible();
    await expect(parentHub.getByRole('link', { href: '/platform-format' })).toBeVisible();
  });
});
