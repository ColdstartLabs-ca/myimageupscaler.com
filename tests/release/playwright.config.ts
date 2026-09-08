import { defineConfig } from '@playwright/test';

// No shared dev server, production credentials, or remote-user teardown.
export default defineConfig({
  globalSetup: './setup.ts',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  outputDir: '../../test-results/upscale-release',
  use: { browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'schema', testDir: '.', testMatch: 'async-schema.release.spec.ts' },
    { name: 'provider-outage', testDir: '.', testMatch: 'provider-outage.release.spec.ts' },
    { name: 'fallback', testDir: '.', testMatch: 'async-fallback.release.spec.ts' },
    {
      name: 'durable-api',
      testDir: '../integration',
      testMatch: 'async-upscale-recovery.integration.spec.ts',
    },
    { name: 'browser', testDir: '.', testMatch: 'upscale.release.spec.ts' },
  ],
});
