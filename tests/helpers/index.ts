// Core abstractions - New test infrastructure
export { TestContext } from './test-context';
export {
  ApiClient,
  AuthenticatedApiClient,
  ApiResponse,
  type IApiResponse,
  type IApiErrorResponse,
  type IApiSuccessResponse,
  type IApiRequestOptions,
} from './api-client';
export { WebhookClient, type IWebhookClientOptions } from './webhook-client';
export {
  UserFactory,
  UserBuilder,
  type SubscriptionStatus,
  type SubscriptionTier,
  type IUserBuilderOptions,
  type IPresetUserConfig,
} from './user-factory';

// Import for internal use in utility functions
import { TestContext as TestContextClass } from './test-context';
import { UserFactory as UserFactoryClass } from './user-factory';
import { ApiClient as ApiClientClass } from './api-client';
import { WebhookClient as WebhookClientClass } from './webhook-client';
import type { IWebhookClientOptions as IWebhookClientOptionsType } from './webhook-client';

// Existing exports (maintained for backward compatibility)
export { TestDataManager, type ITestUser } from './test-data-manager';
export { IntegrationTestHelpers, testFixtures, customMatchers } from './integration-test-helpers';
export {
  StripeWebhookMockFactory,
  type IStripeEventMock,
  type IWebhookTestOptions,
} from './stripe-webhook-mocks';
export { CheckoutMock } from './checkout-mock';
export { resetTestUser, cleanupOldTestUsers } from './test-user-reset';
export { test as authTest, expect } from './auth';

// Re-export commonly used combinations
export type { ITestContextOptions } from './test-context';

/**
 * Utility function to create a complete test setup
 *
 * @param options - Test context options
 * @returns Object with test context and factory instances
 */
export function createTestSetup(options?: { autoCleanup?: boolean }) {
  const context = new TestContextClass(options);
  const userFactory = new UserFactoryClass(context.data);

  return {
    context,
    userFactory,
    dataManager: context.data,
  };
}

/**
 * Utility function to create an API client with authentication
 *
 * @param request - Playwright APIRequestContext
 * @param token - Authentication token
 * @param baseUrl - Base URL for API requests
 * @returns AuthenticatedApiClient instance
 */
export function createAuthenticatedApi(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  baseUrl = ''
) {
  return new ApiClientClass(request, baseUrl).withAuth(token);
}

/**
 * Utility function to create a webhook client
 *
 * @param request - Playwright APIRequestContext
 * @param options - Webhook client options
 * @returns WebhookClient instance
 */
export function createWebhookClient(
  request: import('@playwright/test').APIRequestContext,
  options?: IWebhookClientOptionsType
) {
  return new WebhookClientClass(request, options);
}
