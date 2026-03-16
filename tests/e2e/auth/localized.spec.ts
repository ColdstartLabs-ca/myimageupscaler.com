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
    await page.goto('/es/auth/reset-password?code=test');

    await expect(page.getByText('Restablecer Contraseña')).toBeVisible();
    await expect(page.getByText(/Ingresa tu nueva contraseña/)).toBeVisible();
  });

  test('should show Spanish confirm page', async ({ page }) => {
    await page.goto('/es/auth/confirm?code=test');

    await expect(page.getByText('Confirmando Correo...')).toBeVisible();
  });

  test('should show Spanish login prompt on confirm page', async ({ page }) => {
    await page.goto('/es/auth/confirm');

    // Check for Spanish login prompt (component shows this after an internal timeout)
    await expect(page.getByText(/Por favor inicia sesión con tu correo/)).toBeVisible({
      timeout: 8000,
    });
  });

  test('should switch language and persist', async ({ page }) => {
    await page.goto('/en/dashboard');
    await expect(page.getByText('Dashboard')).toBeVisible();

    await page.goto('/es/dashboard');
    await expect(page.getByText('Panel de Control')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Panel de Control')).toBeVisible();
  });

  test('should show correct Spanish auth error messages', async ({ page }) => {
    await page.goto('/es/auth/reset-password');
    await expect(page.getByText(/inválido o faltante/)).toBeVisible();
  });
});
