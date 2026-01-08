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
    // Navigate to Spanish dashboard
    await page.goto('/es/dashboard');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check for Spanish dashboard title
    const dashboardTitle = page.getByText('Panel de Control');
    await expect(dashboardTitle).toBeVisible();

    // Check for Spanish subtitle
    const subtitle = page.getByText(/Sube y mejora tus imágenes/);
    await expect(subtitle).toBeVisible();
  });

  test('should show Spanish sidebar navigation', async ({ page }) => {
    // Navigate to Spanish dashboard
    await page.goto('/es/dashboard');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check for Spanish sidebar items
    await expect(page.getByText('Panel')).toBeVisible();
    await expect(page.getByText('Facturación')).toBeVisible();
    await expect(page.getByText('Configuración')).toBeVisible();
    await expect(page.getByText('Ayuda y Soporte')).toBeVisible();
    await expect(page.getByText('Cerrar Sesión')).toBeVisible();
  });

  test('should show Spanish history page', async ({ page }) => {
    // Navigate to Spanish history page
    await page.goto('/es/dashboard/history');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check for Spanish history page elements
    await expect(page.getByText('Historial')).toBeVisible();
    await expect(page.getByText('Cargas Recientes')).toBeVisible();
    await expect(page.getByText(/Ver tus imágenes procesadas/)).toBeVisible();
  });

  test('should show Spanish settings page', async ({ page }) => {
    // Navigate to Spanish settings page
    await page.goto('/es/dashboard/settings');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check for Spanish settings page elements
    await expect(page.getByText('Configuración')).toBeVisible();
    await expect(page.getByText('Perfil')).toBeVisible();
    await expect(page.getByText('Correo Electrónico')).toBeVisible();
  });

  test('should show Spanish support page', async ({ page }) => {
    // Navigate to Spanish support page
    await page.goto('/es/dashboard/support');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check for Spanish support page elements
    await expect(page.getByText('Ayuda y Soporte')).toBeVisible();
    await expect(page.getByText('Documentación')).toBeVisible();
    await expect(page.getByText('Preguntas Frecuentes')).toBeVisible();
    await expect(page.getByText('Contactar Soporte')).toBeVisible();
  });
});
