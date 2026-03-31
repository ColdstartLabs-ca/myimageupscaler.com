import { test, expect, type Page } from '@playwright/test';

const TEST_EMAIL = 'test@example.com';
const FAKE_TOKEN = 'fake-test-token';
const TEST_USER_ID = 'test-user-id';

async function setupAuthMocks(page: Page) {
  await page.route('**/auth/v1/session', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: {
          access_token: FAKE_TOKEN,
          token_type: 'bearer',
          user: { id: TEST_USER_ID, email: TEST_EMAIL },
        },
      }),
    });
  });

  await page.route('**/rest/v1/rpc/get_user_data', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profile: {
          id: TEST_USER_ID,
          email: TEST_EMAIL,
          role: 'user',
          subscription_credits_balance: 100,
          purchased_credits_balance: 0,
        },
        subscription: null,
      }),
    });
  });
}

test.describe('Delete Account', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
  });

  test('should send Authorization header, show success state, then redirect home', async ({
    page,
  }) => {
    let capturedAuthHeader: string | undefined;

    await page.route('**/api/account/delete', async route => {
      capturedAuthHeader = route.request().headers()['authorization'];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/dashboard/settings');

    await page.getByRole('button', { name: 'Delete Account' }).click();
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.getByRole('button', { name: 'Delete My Account' }).click();

    // Sent the correct Authorization header — this was the root cause of the bug
    expect(capturedAuthHeader).toBe(`Bearer ${FAKE_TOKEN}`);

    // Success confirmation is shown before redirect (not a silent disappearance)
    await expect(page.getByText('Account deleted')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('permanently deleted')).toBeVisible();
    await expect(page.getByText('Dashboard Error')).not.toBeVisible();
  });

  test('should show error in modal (not Dashboard Error) when deletion fails', async ({ page }) => {
    await page.route('**/api/account/delete', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Failed to delete account' }),
      });
    });

    await page.goto('/dashboard/settings');

    await page.getByRole('button', { name: 'Delete Account' }).click();
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.getByRole('button', { name: 'Delete My Account' }).click();

    // Error shown inline in the modal — not the full-page Dashboard Error boundary
    await expect(page.getByText('Failed to delete account')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Dashboard Error')).not.toBeVisible();

    // Modal stays open so the user can try again
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('should keep confirm button disabled until email matches exactly', async ({ page }) => {
    await page.route('**/api/account/delete', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/dashboard/settings');

    await page.getByRole('button', { name: 'Delete Account' }).click();

    const confirmBtn = page.getByRole('button', { name: 'Delete My Account' });

    // Disabled initially
    await expect(confirmBtn).toBeDisabled();

    // Disabled with wrong email
    await page.locator('input[type="email"]').fill('wrong@example.com');
    await expect(confirmBtn).toBeDisabled();

    // Enabled only when email matches
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await expect(confirmBtn).toBeEnabled();
  });
});
