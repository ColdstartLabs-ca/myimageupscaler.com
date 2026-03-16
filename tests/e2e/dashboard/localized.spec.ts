import { test, expect } from '@playwright/test';

test.describe('Localized Dashboard', () => {
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

  test('should show Spanish dashboard', async ({ page }) => {
    await page.goto('/es/dashboard');

    await expect(page.getByText('Panel de Control')).toBeVisible();
    await expect(page.getByText(/Sube y mejora tus imágenes/)).toBeVisible();
  });

  test('should show Spanish sidebar navigation', async ({ page }) => {
    await page.goto('/es/dashboard');

    await expect(page.getByText('Panel')).toBeVisible();
    await expect(page.getByText('Facturación')).toBeVisible();
    await expect(page.getByText('Configuración')).toBeVisible();
    await expect(page.getByText('Ayuda y Soporte')).toBeVisible();
    await expect(page.getByText('Cerrar Sesión')).toBeVisible();
  });

  test('should show Spanish history page', async ({ page }) => {
    await page.goto('/es/dashboard/history');

    await expect(page.getByText('Historial')).toBeVisible();
    await expect(page.getByText('Cargas Recientes')).toBeVisible();
    await expect(page.getByText(/Ver tus imágenes procesadas/)).toBeVisible();
  });

  test('should show Spanish settings page', async ({ page }) => {
    await page.goto('/es/dashboard/settings');

    await expect(page.getByText('Configuración')).toBeVisible();
    await expect(page.getByText('Perfil')).toBeVisible();
    await expect(page.getByText('Correo Electrónico')).toBeVisible();
  });

  test('should redirect Spanish support page to help', async ({ page }) => {
    await page.goto('/es/dashboard/support');

    // Use waitForURL instead of toHaveURL to properly await the redirect
    await page.waitForURL(/\/es\/help/, { timeout: 10000 });

    await expect(page.getByText('Ayuda y Preguntas Frecuentes')).toBeVisible();
    await expect(page.getByText('Contactar Soporte')).toBeVisible();
  });
});
