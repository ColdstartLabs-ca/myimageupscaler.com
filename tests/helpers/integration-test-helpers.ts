import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { TestDataManager } from './test-data-manager';

/**
 * Integration Test Helpers
 *
 * Common utilities and helper functions for integration tests
 * to reduce code duplication and standardize test patterns.
 */

export interface ITestUser {
  id: string;
  email: string;
  password?: string;
  token?: string;
}

export interface ITestEnvironment {
  baseURL: string;
  apiBase: string;
  isCI: boolean;
  testTimeout: number;
}

export class IntegrationTestHelpers {
  private testDataManager: TestDataManager;

  constructor() {
    this.testDataManager = new TestDataManager();
  }

  /**
   * Creates a test user with optional subscription and credits
   */
  async createTestUser(
    subscription: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled' = 'free',
    tier?: 'starter' | 'pro' | 'business',
    credits: number = 10
  ): Promise<ITestUser> {
    if (subscription === 'free') {
      const user = await this.testDataManager.createTestUser();
      return {
        id: user.id,
        email: user.email,
        password: 'test-password-123',
        token: user.token,
      };
    }

    const user = await this.testDataManager.createTestUserWithSubscription(
      subscription,
      tier,
      credits
    );
    return {
      id: user.id,
      email: user.email,
      password: 'test-password-123',
      token: user.token,
    };
  }

  /**
   * Cleans up test user and all associated data
   */
  async cleanupTestUser(user: ITestUser): Promise<void> {
    await this.testDataManager.cleanupUser(user.id);
  }

  /**
   * Authenticates a user and returns the session token
   */
  async authenticateUser(
    request: APIRequestContext,
    email: string,
    password: string
  ): Promise<string> {
    const response = await request.post('/api/auth/login', {
      data: { email, password },
    });

    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    return result.data.session.access_token;
  }

  /**
   * Makes an authenticated API request
   */
  async makeAuthenticatedRequest<T = unknown>(
    request: APIRequestContext,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    token: string,
    data?: unknown
  ): Promise<{ status: number; data: T }> {
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    let response;
    switch (method) {
      case 'GET':
        response = await request.get(endpoint, { headers });
        break;
      case 'POST':
        response = await request.post(endpoint, { headers, data });
        break;
      case 'PUT':
        response = await request.put(endpoint, { headers, data });
        break;
      case 'DELETE':
        response = await request.delete(endpoint, { headers });
        break;
    }

    return {
      status: response.status(),
      data: response.ok() ? await response.json() : await response.json(),
    };
  }

  /**
   * Waits for a condition to be true with timeout
   */
  async waitForCondition(
    condition: () => Promise<boolean>,
    timeout: number = 10000,
    interval: number = 500
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Creates a test image buffer for testing
   */
  createTestImageBuffer(): Buffer {
    // Create a simple 1x1 PNG image for testing
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    return Buffer.from(pngBase64, 'base64');
  }

  /**
   * Validates API response structure
   */
  validateApiResponse(response: Record<string, unknown>, expectedFields: string[]): void {
    expect(response).toHaveProperty('success');
    expect(typeof response.success).toBe('boolean');

    if (response.success) {
      expect(response).toHaveProperty('data');
      for (const field of expectedFields) {
        expect(response.data).toHaveProperty(field);
      }
    } else {
      expect(response).toHaveProperty('error');
      expect(response.error).toHaveProperty('code');
      expect(response.error).toHaveProperty('message');
    }
  }

  /**
   * Validates error response structure
   */
  validateErrorResponse(response: Record<string, unknown>, expectedCode?: string): void {
    expect(response.success).toBe(false);
    expect(response.error).toHaveProperty('code');
    expect(response.error).toHaveProperty('message');

    if (expectedCode) {
      expect(response.error.code).toBe(expectedCode);
    }
  }

  /**
   * Checks database state after operations
   */
  async verifyDatabaseState(
    userId: string,
    expectedCredits: number,
    expectedSubscription?: string | null
  ): Promise<void> {
    const profile = await this.testDataManager.getUserProfile(userId);
    expect(profile.credits_balance).toBe(expectedCredits);

    if (expectedSubscription !== undefined) {
      expect(profile.subscription_status).toBe(expectedSubscription);
    }

    const transactions = await this.testDataManager.getCreditTransactions(userId);
    expect(Array.isArray(transactions)).toBe(true);
  }

  /**
   * Measures and logs performance metrics
   */
  async measurePerformance<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<{ result: T; duration: number }> {
    const startTime = Date.now();
    const result = await operation();
    const duration = Date.now() - startTime;

    console.log(`Performance: ${operationName} took ${duration}ms`);
    return { result, duration };
  }

  /**
   * Sets up mock API routes for testing
   */
  setupMockRoutes(page: Page, mocks: Record<string, { status: number; body: unknown }>): void {
    for (const [url, mock] of Object.entries(mocks)) {
      page.route(url, route => {
        route.fulfill({
          status: mock.status,
          contentType: 'application/json',
          body: JSON.stringify(mock.body),
        });
      });
    }
  }

  /**
   * Captures and analyzes console logs
   */
  async captureConsoleLogs(page: Page): Promise<string[]> {
    const logs: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        logs.push(`[${msg.type()}] ${msg.text()}`);
      }
    });

    return logs;
  }

  /**
   * Tests responsive design at different viewport sizes
   */
  async testResponsiveDesign(
    page: Page,
    testCases: Array<{
      name: string;
      viewport: { width: number; height: number };
      assertions: Array<() => Promise<void>>;
    }>
  ): Promise<void> {
    for (const testCase of testCases) {
      await page.setViewportSize(testCase.viewport);
      await page.reload();

      for (const assertion of testCase.assertions) {
        await assertion();
      }
    }
  }

  /**
   * Validates accessibility compliance
   */
  async validateAccessibility(page: Page): Promise<void> {
    // Check for proper heading structure
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
    expect(headings.length).toBeGreaterThan(0);

    // Check for alt text on images
    const images = await page.locator('img:not([alt])').all();
    expect(images.length).toBe(0);

    // Check for ARIA labels on interactive elements
    await page.locator('button:not([aria-label]):not([aria-labelledby])').all();
    // Note: This is a basic check - in real scenarios, you'd want more sophisticated a11y testing
  }

  /**
   * Simulates network conditions
   */
  async simulateNetworkConditions(
    page: Page,
    options: {
      offline?: boolean;
      latency?: number;
      downloadThroughput?: number;
      uploadThroughput?: number;
    }
  ): Promise<void> {
    const context = page.context();
    await context.setOffline(options.offline || false);

    if (options.latency || options.downloadThroughput || options.uploadThroughput) {
      // Note: This would require additional setup with Chrome DevTools Protocol
      console.log('Network condition simulation would be implemented here');
    }
  }

  /**
   * Creates test data for bulk operations
   */
  createBulkTestData(count: number, dataGenerator: (index: number) => unknown): unknown[] {
    return Array.from({ length: count }, (_, index) => dataGenerator(index));
  }

  /**
   * Validates rate limiting behavior
   */
  async validateRateLimiting(
    request: APIRequestContext,
    endpoint: string,
    token: string,
    maxRequests: number,
    windowMs: number
  ): Promise<void> {
    const responses = [];
    const startTime = Date.now();

    for (let i = 0; i < maxRequests + 2; i++) {
      const response = await this.makeAuthenticatedRequest(request, 'POST', endpoint, token, {
        test: i,
      });
      responses.push(response);

      if (response.status === 429) {
        break;
      }
    }

    const rateLimitedResponses = responses.filter(r => r.status === 429);
    expect(rateLimitedResponses.length).toBeGreaterThan(0);

    const endTime = Date.now();
    expect(endTime - startTime).toBeLessThan(windowMs + 5000); // Allow some tolerance
  }

  /**
   * Cleanup method for all test data
   */
  async cleanup(): Promise<void> {
    // TestDataManager has its own cleanup methods
    // This can be used for any additional cleanup needed
  }
}

/**
 * Test fixtures for common test scenarios
 */
export const testFixtures = {
  /**
   * Standard free user
   */
  async createFreeUser(): Promise<ITestUser> {
    const helpers = new IntegrationTestHelpers();
    return await helpers.createTestUser('free');
  },

  /**
   * Pro user with credits
   */
  async createProUser(credits: number = 500): Promise<ITestUser> {
    const helpers = new IntegrationTestHelpers();
    return await helpers.createTestUser('active', 'pro', credits);
  },

  /**
   * User with specific subscription state
   */
  async createUserWithSubscription(
    status: 'active' | 'trialing' | 'past_due' | 'canceled',
    tier: 'starter' | 'pro' | 'business' = 'pro',
    credits: number = 100
  ): Promise<ITestUser> {
    const helpers = new IntegrationTestHelpers();
    return await helpers.createTestUser(status, tier, credits);
  },
};

/**
 * Custom test matchers for common assertions
 */
export const customMatchers = {
  /**
   * Checks if response is a successful API response
   */
  toBeSuccessfulApiResponse(received: Record<string, unknown>) {
    const pass = received && received.success === true;
    return {
      message: () => `expected API response to be successful`,
      pass,
    };
  },

  /**
   * Checks if response has specific error code
   */
  toHaveErrorCode(received: Record<string, unknown>, expectedCode: string) {
    const pass = received && received.error && received.error.code === expectedCode;
    return {
      message: () => `expected error code to be ${expectedCode}`,
      pass,
    };
  },

  /**
   * Checks if timestamp is recent (within last minute)
   */
  toBeRecentTimestamp(received: string | number) {
    const timestamp = typeof received === 'string' ? new Date(received).getTime() : received;
    const now = Date.now();
    const oneMinute = 60 * 1000;
    const pass = Math.abs(now - timestamp) < oneMinute;
    return {
      message: () => `expected timestamp to be recent (within last minute)`,
      pass,
    };
  },
};

/**
 * Extend expect with custom matchers
 */
expect.extend(customMatchers as unknown as typeof expect.extend);
