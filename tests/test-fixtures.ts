/* eslint-disable @typescript-eslint/no-explicit-any */
import { test as base } from '@playwright/test';

/**
 * Extended Playwright test with global fixtures
 *
 * This adds the test environment marker to prevent
 * unwanted redirects during E2E tests.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Inject test environment marker before each test
    await page.addInitScript(() => {
      (window as any).__TEST_ENV__ = true;
      (window as any).playwrightTest = true;
    });

    await use(page);
  },
});

export { expect } from '@playwright/test';
