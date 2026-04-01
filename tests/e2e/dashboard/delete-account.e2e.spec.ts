import { test, expect } from '../../test-fixtures';
import { getAuthInitScript } from '../../helpers/auth-helpers';

const TEST_EMAIL = 'test@example.com';
const FAKE_TOKEN = 'fake-test-token';
const TEST_USER_ID = 'test-user-id';

/**
 * Build an init script that injects a fake Supabase v2 session cookie.
 *
 * @supabase/ssr createBrowserClient() uses document.cookie as the session
 * storage backend. Without a valid cookie, Supabase fires INITIAL_SESSION(null)
 * which triggers store.reset() → user data is cleared.
 */
function getSupabaseSessionCookieScript(userId = TEST_USER_ID, email = TEST_EMAIL): string {
  return `
    (function() {
      function toBase64URL(str) {
        const b64 = btoa(str);
        let out = '';
        for (let i = 0; i < b64.length; i++) {
          const c = b64[i];
          if (c === '+') out += '-';
          else if (c === '/') out += '_';
          else if (c === '=') {}
          else out += c;
        }
        return out;
      }

      const jwtHeader  = toBase64URL(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const jwtPayload = toBase64URL(JSON.stringify({
        sub: '${userId}',
        email: '${email}',
        aud: 'authenticated',
        role: 'authenticated',
        exp: 9999999999,
        iat: 1700000000,
      }));
      const fakeJwt = jwtHeader + '.' + jwtPayload + '.fakesig';

      const sessionJson = JSON.stringify({
        access_token: fakeJwt,
        token_type: 'bearer',
        expires_in: 99999999,
        expires_at: 9999999999,
        refresh_token: 'fake-refresh-token',
        user: {
          id: '${userId}',
          aud: 'authenticated',
          role: 'authenticated',
          email: '${email}',
          email_confirmed_at: '2024-01-01T00:00:00.000000Z',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
        },
      });

      const cookieValue = 'base64-' + toBase64URL(sessionJson);
      document.cookie = 'supabase.auth.token=' + cookieValue + '; path=/; max-age=99999999';
    })();
  `;
}

test.describe('Delete Account', () => {
  test.beforeEach(async ({ page }) => {
    // Inject Supabase session cookie so INITIAL_SESSION fires with a valid session
    await page.addInitScript(getSupabaseSessionCookieScript());
    // Inject user data into localStorage so userStore recognizes user immediately
    await page.addInitScript(getAuthInitScript({ id: TEST_USER_ID, email: TEST_EMAIL }));

    // Mock auth/session endpoints
    await page.route('**/auth/v1/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: {
            access_token: FAKE_TOKEN,
            user: { id: TEST_USER_ID, email: TEST_EMAIL, aud: 'authenticated' },
          },
        }),
      });
    });

    // Mock RPC to avoid background fetch noise
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
  });

  test('should send Authorization header, show success state, then redirect home', async ({
    page,
  }) => {
    let capturedAuthHeader: string | undefined;
    let capturedUserId: string | undefined;

    await page.route('**/api/account/delete', async route => {
      const headers = route.request().headers();
      capturedAuthHeader = headers['authorization'];
      capturedUserId = TEST_USER_ID;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/dashboard/settings');

    // Wait for user data to hydrate — profile email input shows the email
    await expect(page.locator('input[disabled][type="email"]')).toHaveValue(TEST_EMAIL);

    await page.getByRole('button', { name: 'Delete Account' }).click();
    // Target the modal's email input specifically (not the disabled profile one)
    await page.locator('.fixed input[type="email"]').fill(TEST_EMAIL);
    await page.getByRole('button', { name: 'Delete My Account' }).click();

    // Sent the correct Authorization header
    expect(capturedAuthHeader).toBe(`Bearer ${FAKE_TOKEN}`);
    expect(capturedUserId).toBe(TEST_USER_ID);

    // Success confirmation is shown before redirect
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

    await expect(page.locator('input[disabled][type="email"]')).toHaveValue(TEST_EMAIL);

    await page.getByRole('button', { name: 'Delete Account' }).click();
    await page.locator('.fixed input[type="email"]').fill(TEST_EMAIL);
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

    await expect(page.locator('input[disabled][type="email"]')).toHaveValue(TEST_EMAIL);

    await page.getByRole('button', { name: 'Delete Account' }).click();

    const confirmBtn = page.getByRole('button', { name: 'Delete My Account' });

    // Disabled initially
    await expect(confirmBtn).toBeDisabled();

    // Disabled with wrong email
    await page.locator('.fixed input[type="email"]').fill('wrong@example.com');
    await expect(confirmBtn).toBeDisabled();

    // Enabled only when email matches
    await page.locator('.fixed input[type="email"]').fill(TEST_EMAIL);
    await expect(confirmBtn).toBeEnabled();
  });
});
