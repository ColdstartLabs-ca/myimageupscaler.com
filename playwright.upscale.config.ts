import { defineConfig } from '@playwright/test';

const suite = process.argv.includes('--project=worker') ? 'worker' : 'recovery';

// These tests own an isolated PostgreSQL container and HTTP services. Starting
// the normal app/test-auth server would conceal the durable transaction boundary.
export default defineConfig({
  testDir: './tests',
  projects: [
    {
      name: 'recovery',
      testMatch: [
        /integration\/upscale-.*\.integration\.spec\.ts/,
        /api\/upscale-jobs\.api\.spec\.ts/,
        /e2e\/upscale-job-recovery\.e2e\.spec\.ts/,
      ],
    },
    { name: 'worker', testMatch: /workers\/upscale-memory\.runtime\.spec\.ts/ },
  ],
  use: {
    browserName: 'chromium',
    headless: true,
    launchOptions: { args: ['--disable-gpu'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: `test-results/upscale/${suite}.json` }]],
  outputDir: `test-results/upscale/${suite}/results`,
});
