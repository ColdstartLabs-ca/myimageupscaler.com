import { test, expect } from '../test-fixtures';
import { setupAuthenticatedStateWithSupabase } from '../helpers/auth-helpers';

test('low-balance prior buyer opens their last pack while all packs remain available', async ({
  page,
}) => {
  await setupAuthenticatedStateWithSupabase(page, {
    id: 'repeat-pack-buyer',
    email: 'repeat@example.com',
    role: 'user',
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
  await page.getByRole('button', { name: 'repeat@example.com' }).click();
  const credits = page.getByRole('button', { name: /3 credits/i }).first();
  await credits.hover();
  const repeat = page.getByRole('button', { name: /buy medium pack again/i });
  await expect(repeat).toBeVisible();
  await repeat.click();

  await expect(page.getByRole('heading', { name: 'Credits for premium models' })).toBeVisible();
  await expect(page.getByText('50', { exact: true })).toBeVisible();
  await expect(page.getByText('200', { exact: true })).toBeVisible();
  await expect(page.getByText('600', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /buy 200 credits/i })).toBeVisible();
});
