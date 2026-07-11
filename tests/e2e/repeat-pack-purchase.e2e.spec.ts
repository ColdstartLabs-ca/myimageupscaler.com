import { test, expect } from '../test-fixtures';
import { setupAuthenticatedStateWithSupabase } from '../helpers/auth-helpers';

test('low-balance prior buyer opens their last pack while all packs remain available', async ({
  page,
}) => {
  await setupAuthenticatedStateWithSupabase(page, {
    subscription: null,
    profile: {
      id: 'repeat-pack-buyer',
      email: 'repeat@example.com',
      role: 'user',
      subscription_credits_balance: 0,
      purchased_credits_balance: 3,
    },
  });
  await page.route('**/api/auto-top-up/settings', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null, repeatPackKey: 'medium' }),
    })
  );

  await page.goto('/workspace');
  const credits = page.getByRole('button', { name: /3 credits/i }).first();
  await credits.hover();
  const repeat = page.getByRole('button', { name: /buy medium pack again/i });
  await expect(repeat).toBeVisible();
  await repeat.click();

  await expect(page.getByText('Medium Pack', { exact: true })).toBeVisible();
  await expect(page.getByText('Small Pack', { exact: true })).toBeVisible();
  await expect(page.getByText('Large Pack', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /buy 200 credits/i })).toBeVisible();
});
