import { test, expect } from '@playwright/test';

test.describe('Localized Auth Pages', () => {
  test.beforeEach(async ({ page }) => {
    // Set locale cookie to Spanish
    await page.context().addCookies([
      {
        name: 'locale',
        value: 'es',
        domain: 'localhost',
        path: '/',
      },
    ]);
  });

  test('should show Spanish reset password page', async ({ page }) => {
    // Navigate to Spanish reset password page
    await page.goto('/es/auth/reset-password?code=test');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check for Spanish reset password page elements
    await expect(page.getByText('Restablecer Contraseña')).toBeVisible();
    await expect(page.getByText(/Ingresa tu nueva contraseña/)).toBeVisible();
  });

  test('should show Spanish confirm page', async ({ page }) => {
    // Navigate to Spanish confirm page
    await page.goto('/es/auth/confirm?code=test');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check for Spanish confirm page elements
    // The confirm page should show Spanish text during confirmation
    await expect(page.getByText('Confirmando Correo...')).toBeVisible();
  });

  test('should show Spanish login prompt on confirm page', async ({ page }) => {
    // Navigate to Spanish confirm page without code
    await page.goto('/es/auth/confirm');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Wait for timeout to show login prompt
    await page.waitForTimeout(2500);

    // Check for Spanish login prompt
    await expect(
      page.getByText(/Por favor inicia sesión con tu correo/)
    ).toBeVisible();
  });

  test('should switch language and persist', async ({ page }) => {
    // Start with English
    await page.goto('/en/dashboard');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check for English dashboard title
    await expect(page.getByText('Dashboard')).toBeVisible();

    // Navigate to Spanish dashboard
    await page.goto('/es/dashboard');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check for Spanish dashboard title
    await expect(page.getByText('Panel de Control')).toBeVisible();

    // Reload page to check persistence
    await page.reload();

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Spanish should persist
    await expect(page.getByText('Panel de Control')).toBeVisible();
  });

  test('should show correct Spanish auth error messages', async ({ page }) => {
    // Navigate to Spanish reset password page without code
    await page.goto('/es/auth/reset-password');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check for Spanish error message
    await expect(page.getByText(/inválido o faltante/)).toBeVisible();
  });
});
