import { expect, test } from '../test-fixtures';
import type { Page } from '@playwright/test';
import { setupAuthenticatedStateWithSupabase } from '../helpers/auth-helpers';

async function openActiveWorkspace(page: Page): Promise<void> {
  await setupAuthenticatedStateWithSupabase(page, {
    subscription: {
      id: 'sub-credit-display',
      status: 'active',
      price_id: 'price_pro_monthly',
    },
    profile: {
      id: 'credit-display-user',
      email: 'credit-display@example.com',
      role: 'user',
      subscription_credits_balance: 100,
      purchased_credits_balance: 0,
      subscription_status: 'active',
      subscription_tier: 'pro',
    },
  });
  await page.goto('/workspace');

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Click or drag images/i }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles('tests/fixtures/sample.jpg');
}

async function selectUltra(page: Page, selector: string): Promise<void> {
  await page.locator(selector).click();
  const ultra = page.locator('[data-testid="select-ultra"]');
  await expect(ultra).toBeVisible({ timeout: 20_000 });
  const box = await ultra.boundingBox();

  expect(box).not.toBeNull();
  await ultra.click({
    position: {
      x: box!.width / 2,
      y: box!.height * 0.9,
    },
  });
}

test.describe('Credit display parity', () => {
  test('shows the Ultra 13-25 CR range in the desktop quality selector', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openActiveWorkspace(page);

    await selectUltra(page, '[data-driver="quality-selector"] button');

    await expect(page.locator('[data-driver="quality-selector"]')).toContainText('13-25 CR');
  });

  test('shows the Ultra 13-25 CR range in the mobile quality selector', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openActiveWorkspace(page);

    await selectUltra(page, '[data-driver="mobile-quality-selector"]');

    await expect(page.locator('[data-driver="mobile-quality-selector"]')).toContainText('13-25 CR');
  });
});
