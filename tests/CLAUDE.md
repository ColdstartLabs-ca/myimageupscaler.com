# Tests Directory

## Overview

All testing-related files including unit tests, integration tests, E2E tests, and test utilities.

**📋 Note:** This test suite has been refactored to use enhanced abstractions and consistent patterns. See the "New Testing Infrastructure" section below for details.

## Structure

### Unit Tests (`tests/unit/`)

- Individual function and component testing
- Pure function tests with Vitest
- Component unit tests with React Testing Library
- Utility function tests

### Integration Tests (`tests/integration/`)

- API endpoint testing with new TestContext and ApiClient patterns
- Database integration tests
- Service layer testing
- Multi-component integration

### E2E Tests (`tests/e2e/`)

- **✅ Refactored** - End-to-end user journey tests using enhanced Page Objects
- Browser automation with Playwright
- Critical path testing with TestContext for user management
- Cross-browser compatibility with accessibility checks

### API Tests (`tests/api/`)

- **✅ Refactored** - API route testing using ApiClient with fluent assertions
- Request/response validation with typed responses
- Error handling testing with structured error matching
- Webhook testing using WebhookClient

### Pages (`tests/pages/`)

- **✅ Enhanced** - Page object models extending BasePage with common UI patterns
- Page-specific test utilities with accessibility support
- Component page tests with proper waiting strategies

### Fixtures (`tests/fixtures/`)

- Mock data for testing
- Test database seeds
- Sample files for upload testing
- API response mocks

### Helpers (`tests/helpers/`)

**New Enhanced Testing Infrastructure:**

#### Core Abstractions

- **`TestContext`** - Centralized test resource management with automatic cleanup
- **`ApiClient`** - Fluent API client with typed responses and assertion chaining
- **`AuthenticatedApiClient`** - Pre-configured API client for authenticated requests
- **`WebhookClient`** - Dedicated client for webhook testing with signature handling
- **`UserFactory`** & **`UserBuilder`** - Builder pattern for test user creation

#### Enhanced Page Objects

- **`BasePage`** - Rich base class with common UI patterns:
  - Navigation utilities (`goto`, `waitForURL`, `reload`)
  - Modal handling (`waitForModal`, `closeModal`, `clickModalButton`)
  - Toast/notification management (`waitForToast`, `dismissToast`)
  - Form helpers (`fillField`, `clickButton`, `selectOption`)
  - Accessibility checks (`checkBasicAccessibility`, `checkAriaLabels`)
  - Network request waiting (`waitForApiResponse`, `waitForApiRequest`)
  - Loading state management (`waitForLoadingComplete`, `waitForNetworkIdle`)
  - Screenshot and debugging helpers

#### Legacy Helpers (Maintained for Compatibility)

- `TestDataManager` - Direct database operations (use TestContext when possible)
- `IntegrationTestHelpers` - Legacy integration test patterns
- `StripeWebhookMockFactory` - Webhook event generation (use WebhookClient)
- Various legacy helpers - Maintained for backward compatibility

## New Testing Infrastructure Usage

### TestContext Pattern

```typescript
import { TestContext } from '../helpers';

let ctx: TestContext;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

test('creates user with subscription', async () => {
  const user = await ctx.createUser({
    subscription: 'active',
    tier: 'pro',
    credits: 500,
  });

  // Test with user...
  // Cleanup handled automatically
});
```

### ApiClient with Fluent Assertions

```typescript
import { ApiClient } from '../helpers';

test('API endpoint with authentication', async ({ request }) => {
  const api = new ApiClient(request).withAuth(user.token);

  const response = await api.post('/api/checkout', { priceId: 'price_123' });

  // Fluent assertions
  response.expectStatus(200).expectSuccess();
  await response.expectData({ url: expect.any(String) });
});
```

### Enhanced Page Objects

```typescript
import { LoginPage } from '../pages/LoginPage';

test('login flow with enhanced page object', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto('/');
  await loginPage.openLoginModal();
  await loginPage.assertModalVisible();

  // Enhanced base methods available
  await loginPage.checkBasicAccessibility();
  await loginPage.waitForLoadingComplete();
});
```

## Testing Stack

- **Unit Tests**: Vitest + React Testing Library
- **E2E Tests**: Playwright with enhanced Page Objects
- **API Tests**: Playwright API testing with ApiClient
- **Integration Tests**: Playwright with TestContext
- **Mocking**: Vitest built-in mocking + WebhookClient
- **Coverage**: Vitest coverage reports

## Key Files

- `vitest.config.ts` - Unit test configuration
- `playwright.config.ts` - E2E test configuration
- `tests/setup.ts` - Global test setup
- `tests/helpers/index.ts` - Barrel exports for all testing utilities
- `tests/helpers/test-context.ts` - Centralized test resource management
- `tests/pages/BasePage.ts` - Enhanced base page with common UI patterns

## Updated Testing Standards

- ✅ **Use TestContext** for all user lifecycle management and cleanup
- ✅ **Use ApiClient** for API testing with fluent assertions
- ✅ **Extend BasePage** for all page objects to get common UI patterns
- ✅ **Prefer semantic waits** over fixed timeouts (`waitForModal` vs `waitForTimeout`)
- ✅ **Include accessibility checks** in E2E tests (`checkBasicAccessibility`)
- ✅ **Test both happy path and error scenarios** with structured assertions
- ✅ **Use UserFactory builder pattern** for complex user setup
- ✅ **Handle cleanup automatically** through TestContext
- ⚠️ **Avoid mid-file dynamic imports** in tests - prefer top-level imports or `beforeAll` setup
- Aim for high code coverage (80%+)
- Use descriptive test names that explain the behavior
- Mock external dependencies in unit tests
- Use fixtures for consistent test data

## Migration Patterns

### Before (Old Pattern)

```typescript
let dataManager: TestDataManager;
let testUser: { id: string; email: string; token: string };

test.beforeAll(async () => {
  dataManager = new TestDataManager();
  testUser = await dataManager.createTestUser();
});

test.afterAll(async () => {
  await dataManager.cleanupAllUsers();
});

test('should reject unauthenticated requests', async ({ request }) => {
  const response = await request.post('/api/checkout', {
    data: { priceId: 'price_test_123' },
  });

  expect(response.status()).toBe(401);
  const data = await response.json();
  expect(data.error.code).toBe('UNAUTHORIZED');
});
```

### After (New Pattern)

```typescript
let ctx: TestContext;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

test('should reject unauthenticated requests', async ({ request }) => {
  const api = new ApiClient(request);
  const response = await api.post('/api/checkout', { priceId: 'price_test_123' });

  response.expectStatus(401);
  await response.expectErrorCode('UNAUTHORIZED');
});
```

## Commands

- `yarn test` - Run unit tests
- `yarn test:e2e` - Run E2E tests
- `yarn test:api` - Run API tests
- `yarn test:coverage` - Generate coverage report
- `yarn verify:full` - Run all tests + linting + type checking
- `yarn verify` - Run verification suite (recommended before commits)
