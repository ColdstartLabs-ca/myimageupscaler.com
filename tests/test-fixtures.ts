import { test as base } from '@playwright/test';

/**
 * Extended Playwright test with global fixtures
 *
 * This adds the test environment marker and test headers to prevent
 * unwanted redirects during E2E tests.
 *
 * IMPORTANT: Does NOT inject authenticated user state by default.
 * Tests that require authentication should explicitly call
 * setupAuthenticatedState() from auth-helpers.ts.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Import auth helpers
    const { getTestHeaders } = await import('./helpers/auth-helpers');

    // Inject test environment markers ONLY (no authenticated user by default)
    await page.addInitScript(`
      // Inject test environment markers
      window.__TEST_ENV__ = true;
      window.playwrightTest = true;

      // Store test marker for middleware to check
      localStorage.setItem('__test_mode__', 'true');
    `);

    // Add test headers to all requests to bypass auth redirects in middleware
    await page.route('**/*', async route => {
      const testHeaders = getTestHeaders();
      const headers = { ...route.request().headers(), ...testHeaders };
      await route.continue({ headers });
    });

    await use(page);
  },
});

export { expect } from '@playwright/test';
