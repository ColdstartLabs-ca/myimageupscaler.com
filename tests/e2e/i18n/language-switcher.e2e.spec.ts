import { test, expect } from '../../test-fixtures';

/**
 * Language Switcher E2E Tests
 *
 * Tests the language switcher functionality and locale persistence:
 * - Language switcher is visible in footer
 * - Clicking switcher opens dropdown with all locales
 * - Selecting a locale changes the language and reloads the page
 * - Locale preference persists via cookie after page refresh
 * - Switching between English and Spanish works correctly
 */

test.describe('Language Switcher', () => {
  test.describe('Component Visibility', () => {
    test('should display language switcher in footer', async ({ page }) => {
      await page.goto('/');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Look for the language switcher button (has flag icon and chevron)
      const switcherButton = page.locator('footer').getByRole('button').filter({
        has: page.locator('svg'), // Chevron icon
      });

      await expect(switcherButton).toBeVisible({ timeout: 10000 });
    });

    test('should show current locale flag in switcher button', async ({ page }) => {
      await page.goto('/');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // The switcher button should contain a flag (SVG from country-flag-icons)
      const switcherButton = page.locator('footer').getByRole('button').filter({
        has: page.locator('svg').first(),
      });

      await expect(switcherButton).toBeVisible();

      // Check that it has an SVG element (the flag)
      const flagIcon = switcherButton.locator('svg').first();
      await expect(flagIcon).toBeVisible();
    });
  });

  test.describe('Dropdown Functionality', () => {
    test('should open dropdown when clicking switcher', async ({ page }) => {
      await page.goto('/');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Find and click the switcher button
      const switcherButton = page.locator('footer').getByRole('button').filter({
        has: page.locator('svg'),
      });

      await switcherButton.click();

      // Wait for dropdown to appear
      const dropdown = page.locator('footer').locator('.glass-dropdown, [role="menu"], .absolute');
      await expect(dropdown).toBeVisible({ timeout: 5000 });
    });

    test('should show all available locales in dropdown', async ({ page }) => {
      await page.goto('/');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Click switcher to open dropdown
      const switcherButton = page.locator('footer').getByRole('button').filter({
        has: page.locator('svg'),
      });

      await switcherButton.click();

      // Wait for dropdown
      const dropdown = page.locator('footer').locator('.glass-dropdown, [role="menu"], .absolute');
      await dropdown.waitFor({ state: 'visible', timeout: 5000 });

      // Check for English option
      const englishOption = page
        .locator('button')
        .filter({ hasText: /english/i })
        .and(page.locator('footer *'));

      await expect(englishOption).toBeVisible();

      // Check for Spanish option
      const spanishOption = page
        .locator('button')
        .filter({ hasText: /español|spanish/i })
        .and(page.locator('footer *'));

      await expect(spanishOption).toBeVisible();
    });

    test('should close dropdown when clicking outside', async ({ page }) => {
      await page.goto('/');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Click switcher to open dropdown
      const switcherButton = page.locator('footer').getByRole('button').filter({
        has: page.locator('svg'),
      });

      await switcherButton.click();

      // Wait for dropdown to appear
      const dropdown = page.locator('footer').locator('.glass-dropdown, [role="menu"], .absolute');
      await dropdown.waitFor({ state: 'visible', timeout: 5000 });

      // Click outside the dropdown (on main content)
      await page.locator('main').click();

      // Dropdown should close
      await expect(dropdown).not.toBeVisible({ timeout: 2000 });
    });
  });

  test.describe('Language Switching', () => {
    test('should switch to Spanish and reload page', async ({ page }) => {
      await page.goto('/');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Click switcher to open dropdown
      const switcherButton = page.locator('footer').getByRole('button').filter({
        has: page.locator('svg'),
      });

      await switcherButton.click();

      // Click Spanish option
      const spanishOption = page
        .locator('button')
        .filter({ hasText: /español|spanish/i })
        .and(page.locator('footer *'));

      await spanishOption.click();

      // Wait for navigation to complete
      await page.waitForLoadState('domcontentloaded');

      // URL should contain /es/ or be in Spanish locale
      const url = page.url();
      expect(url).toContain('/es');

      // Check for Spanish content in footer (e.g., "Producto" instead of "Product")
      const spanishFooter = page.locator('footer').getByText(/producto|soporte|legal/i);
      await expect(spanishFooter.first()).toBeVisible({ timeout: 5000 });
    });

    test('should switch from Spanish to English', async ({ page }) => {
      // Start on Spanish page
      await page.goto('/es');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Click switcher to open dropdown
      const switcherButton = page.locator('footer').getByRole('button').filter({
        has: page.locator('svg'),
      });

      await switcherButton.click();

      // Click English option
      const englishOption = page
        .locator('button')
        .filter({ hasText: /english/i })
        .and(page.locator('footer *'));

      await englishOption.click();

      // Wait for navigation to complete
      await page.waitForLoadState('domcontentloaded');

      // URL should not contain /es/ (English is default)
      const url = page.url();
      expect(url).not.toContain('/es');

      // Check for English content in footer
      const englishFooter = page.locator('footer').getByText(/product|support|legal/i);
      await expect(englishFooter.first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Locale Persistence', () => {
    test('should persist Spanish locale preference after page refresh', async ({
      page,
      context,
    }) => {
      // Navigate to Spanish version
      await page.goto('/es');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Verify we're on Spanish version
      expect(page.url()).toContain('/es');

      // Check that locale cookie is set
      const cookies = await context.cookies();
      const localeCookie = cookies.find(c => c.name === 'locale');

      expect(localeCookie).toBeDefined();
      expect(localeCookie?.value).toBe('es');

      // Reload the page
      await page.reload();

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Should still be on Spanish version
      expect(page.url()).toContain('/es');

      // Should still show Spanish content
      const spanishContent = page.locator('footer').getByText(/producto|soporte/i);
      await expect(spanishContent.first()).toBeVisible({ timeout: 5000 });
    });

    test('should persist English locale preference after page refresh', async ({
      page,
      context,
    }) => {
      // Start on English (default)
      await page.goto('/');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Use switcher to explicitly select English
      const switcherButton = page.locator('footer').getByRole('button').filter({
        has: page.locator('svg'),
      });

      await switcherButton.click();

      const englishOption = page
        .locator('button')
        .filter({ hasText: /english/i })
        .and(page.locator('footer *'));

      await englishOption.click();

      // Wait for navigation
      await page.waitForLoadState('domcontentloaded');

      // Check that locale cookie is set to 'en'
      const cookies = await context.cookies();
      const localeCookie = cookies.find(c => c.name === 'locale');

      expect(localeCookie).toBeDefined();
      expect(localeCookie?.value).toBe('en');

      // Reload the page
      await page.reload();

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Should still show English content
      const englishContent = page.locator('footer').getByText(/product|support|legal/i);
      await expect(englishContent.first()).toBeVisible({ timeout: 5000 });
    });

    test('should maintain locale when navigating between pages', async ({ page }) => {
      // Start on Spanish homepage
      await page.goto('/es');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Verify we're on Spanish homepage
      expect(page.url()).toContain('/es');

      // Navigate to pricing page (should maintain /es/ prefix)
      await page.goto('/es/pricing');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // URL should contain /es/pricing
      expect(page.url()).toContain('/es/pricing');

      // Check that we have the locale cookie set to es
      const cookies = await page.context().cookies();
      const localeCookie = cookies.find(c => c.name === 'locale');
      expect(localeCookie?.value).toBe('es');
    });
  });

  test.describe('Content Translation', () => {
    test('should display Spanish translations when locale is es', async ({ page }) => {
      await page.goto('/es');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Check for Spanish footer content
      const footer = page.locator('footer');

      // Look for Spanish text (use .first() to avoid strict mode violations)
      await expect(footer.getByText(/producto/i).first()).toBeVisible();
      await expect(footer.getByText(/soporte/i).first()).toBeVisible();
      await expect(footer.getByText(/legal/i).first()).toBeVisible();
    });

    test('should display English content when locale is en', async ({ page }) => {
      await page.goto('/');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Check for English footer content
      const footer = page.locator('footer');

      // Look for English text (use .first() to avoid strict mode violations)
      await expect(footer.getByText(/product/i).first()).toBeVisible();
      await expect(footer.getByText(/support/i).first()).toBeVisible();
      await expect(footer.getByText(/legal/i).first()).toBeVisible();
    });
  });
});
