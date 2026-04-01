import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke test config — runs against the live production URL.
 * No local webServer needed. Designed to run a few seconds post-deploy.
 *
 * Usage:
 *   yarn test:smoke
 *   SMOKE_BASE_URL=https://staging.myimageupscaler.com yarn test:smoke
 */
export default defineConfig({
  testDir: './tests/smoke',
  globalSetup: './tests/global-setup.ts', // Auto-install browsers if missing
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.SMOKE_BASE_URL || 'https://myimageupscaler.com',
    trace: 'retain-on-failure',
    actionTimeout: 30000,
    navigationTimeout: 60000,
  },
  projects: [
    {
      name: 'smoke',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*\.smoke\.spec\.ts/,
    },
  ],
  // No webServer — we're hitting production directly
});
