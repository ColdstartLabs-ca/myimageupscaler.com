import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load test environment variables (quiet: true suppresses dotenv tips)
dotenv.config({ path: '.env.test', quiet: true });

const isCI = !!process.env.CI;

// QA artifact configuration
const qaArtifacts = process.env.NW_QA_ARTIFACTS || 'both';
const enableScreenshots = qaArtifacts === 'screenshot' || qaArtifacts === 'both';
const enableVideos = qaArtifacts === 'video' || qaArtifacts === 'both';

// Generate random ports for each test run to avoid conflicts with dev server
const TEST_PORT = process.env.TEST_PORT || (3100 + Math.floor(Math.random() * 900)).toString();
const TEST_WRANGLER_PORT =
  process.env.TEST_WRANGLER_PORT || (8800 + Math.floor(Math.random() * 200)).toString();

// Export for use in tests if needed
process.env.TEST_PORT = TEST_PORT;
process.env.TEST_WRANGLER_PORT = TEST_WRANGLER_PORT;

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts', // Auto-install browsers if missing
  globalTeardown: './tests/global-teardown.ts', // Clean up test users after all tests
  fullyParallel: false, // Disable full parallelization for memory optimization
  forbidOnly: isCI,
  retries: isCI ? 2 : 1,
  workers: process.env.CI ? 2 : 2, // Keep workers low to reduce shared-server contention
  reporter: [['html'], ['list']],
  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
    trace: 'retain-on-failure', // Only keep traces on failure to save memory
    screenshot: enableScreenshots ? 'on' : 'only-on-failure',
    video: enableVideos ? { mode: 'on', size: { width: 1280, height: 720 } } : 'retain-on-failure',
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
      timeout: 60000, // Dev server compiles on demand; locale pages can be slow under load
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
        baseURL: `http://localhost:${TEST_PORT}`,
      },
      testMatch: /.*\.api\.spec\.ts/,
      workers: 1, // Keep single worker for API tests to avoid Supabase rate limits
      timeout: 60000, // Increase timeout to handle rate limiting retries
    },

    // Integration Tests (API integration without browser)
    {
      name: 'integration',
      use: {
        baseURL: `http://localhost:${TEST_PORT}`,
      },
      testMatch: /.*\.integration\.spec\.ts/,
      workers: 1, // Keep single worker for integration tests to avoid Supabase rate limits
      timeout: 90000, // Increase timeout for complex integration workflows
    },

    // Workers Preview Tests (validate Cloudflare behavior)
    {
      name: 'workers-preview',
      use: {
        baseURL: `http://localhost:${TEST_WRANGLER_PORT}`,
      },
      testMatch: /.*\.preview\.spec\.ts/,
    },
  ],

  // Automatically start dev server for tests on random ports
  // This avoids clashing with the regular dev server
  webServer: {
    command: `TEST_PORT=${TEST_PORT} TEST_WRANGLER_PORT=${TEST_WRANGLER_PORT} yarn dev:test`,
    url: `http://localhost:${TEST_PORT}`,
    reuseExistingServer: false, // Always start fresh test server - don't interfere with dev server
    timeout: 120000, // 2 minutes to start server
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
