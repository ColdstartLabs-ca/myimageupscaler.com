/* eslint-disable import/no-default-export */
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [['html'], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
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

  webServer: {
    command: 'next dev --port 3000',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: true,
    timeout: 60000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
