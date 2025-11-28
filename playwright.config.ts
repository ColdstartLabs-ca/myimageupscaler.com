/* eslint-disable import/no-default-export */
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Disable full parallelization for memory optimization
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1, // Force single worker globally to prevent Supabase rate limiting
  reporter: [['html'], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure', // Only keep traces on failure to save memory
    actionTimeout: 30000, // Increased action timeout for stability
    navigationTimeout: 45000, // Increased navigation timeout
  },

  projects: [
    // Desktop Browser Tests
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: /.*\.e2e\.spec\.ts/,
    },

    // Mobile Tests - iPhone
    {
      name: 'mobile-iphone',
      use: {
        ...devices['iPhone 14'],
      },
      testMatch: /.*\.mobile\.spec\.ts/,
    },

    // Mobile Tests - Android
    {
      name: 'mobile-android',
      use: {
        ...devices['Pixel 7'],
      },
      testMatch: /.*\.mobile\.spec\.ts/,
    },

    // Tablet Tests - iPad
    {
      name: 'tablet',
      use: {
        ...devices['iPad Pro 11'],
      },
      testMatch: /.*\.mobile\.spec\.ts/,
    },

    // API Tests (no browser needed)
    {
      name: 'api',
      use: {
        baseURL: 'http://localhost:3000',
      },
      testMatch: /.*\.api\.spec\.ts/,
      workers: 1, // Use single worker to avoid Supabase rate limits completely
    },

    // Workers Preview Tests (validate Cloudflare behavior)
    {
      name: 'workers-preview',
      use: {
        baseURL: 'http://localhost:8788',
      },
      testMatch: /.*\.preview\.spec\.ts/,
    },
  ],

  // Automatically start dev server for tests
  webServer: {
    command: 'yarn dev:no-webhooks',
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: 120000, // 2 minutes to start server
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
