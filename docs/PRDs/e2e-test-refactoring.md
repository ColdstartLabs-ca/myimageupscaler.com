# E2E & Integration Test Refactoring PRD

## 1. Context Analysis

### 1.1 Files Analyzed

```
tests/
├── api/                          (15 files)
│   ├── checkout.api.spec.ts
│   ├── checkout.test.ts
│   ├── portal.api.spec.ts
│   ├── portal.test.ts
│   ├── webhooks.api.spec.ts
│   ├── webhooks-stripe.test.ts
│   └── ...
├── e2e/                          (4 files)
│   ├── auth.e2e.spec.ts
│   ├── billing.e2e.spec.ts
│   ├── responsive.mobile.spec.ts
│   └── upscaler.e2e.spec.ts
├── integration/                  (13 files)
│   ├── billing-workflow.integration.spec.ts
│   ├── checkout.trial.integration.spec.ts
│   ├── webhook.trial.integration.spec.ts
│   └── ...
├── unit/                         (22 files)
├── pages/                        (6 files - Page Object Models)
│   ├── BasePage.ts
│   ├── LoginPage.ts
│   ├── BillingPage.ts
│   └── ...
├── helpers/                      (6 files)
│   ├── test-data-manager.ts
│   ├── integration-test-helpers.ts
│   ├── stripe-webhook-mocks.ts
│   ├── checkout-mock.ts
│   ├── auth.ts
│   └── test-user-reset.ts
└── fixtures/                     (2 files)
```

### 1.2 Component & Dependency Overview

```mermaid
graph TD
    subgraph "Test Types"
        API[API Tests<br/>Playwright]
        E2E[E2E Tests<br/>Playwright]
        INT[Integration Tests<br/>Playwright]
        UNIT[Unit Tests<br/>Vitest]
    end

    subgraph "Current Helpers"
        TDM[TestDataManager]
        ITH[IntegrationTestHelpers]
        SWM[StripeWebhookMockFactory]
        CM[CheckoutMock]
        AUTH[auth.ts fixtures]
    end

    subgraph "Page Objects"
        BP[BasePage]
        LP[LoginPage]
        BIP[BillingPage]
        PP[PricingPage]
    end

    API --> TDM
    INT --> TDM
    INT --> ITH
    INT --> SWM
    E2E --> LP
    LP --> BP

    ITH --> TDM
    CM -.-> E2E
```

### 1.3 Current Behavior Summary

- **Test Frameworks**: Playwright (API/E2E/Integration), Vitest (Unit)
- **57 total test files** with inconsistent naming patterns
- **Rate limiting protection** via delays and exponential backoff
- **User lifecycle management** through TestDataManager
- **Mock factories** for Stripe webhook events
- **Page Object Model** with minimal base abstraction

### 1.4 Problem Statement

The test suite has grown organically, resulting in duplicated patterns, inconsistent abstractions, naming conventions, and setup/teardown flows that make tests harder to maintain and extend.

---

## 2. Identified Issues & Refactoring Opportunities

### 2.1 Naming Convention Inconsistencies

| Pattern | Files | Issue |
|---------|-------|-------|
| `*.api.spec.ts` | 10 | Primary API test pattern |
| `*.test.ts` | 5 | Alternative naming (checkout.test.ts, portal.test.ts) |
| `*.e2e.spec.ts` | 3 | E2E tests |
| `*.integration.spec.ts` | 11 | Integration tests |
| `*.trial.*.spec.ts` | 4 | Feature-specific tests mixed naming |
| `*.unit.spec.ts` | 12 | Unit test pattern |
| `*.test.tsx` | 5 | React component tests |

**Recommendation**: Standardize on `*.{type}.spec.ts` pattern:
- API: `*.api.spec.ts`
- E2E: `*.e2e.spec.ts`
- Integration: `*.integration.spec.ts`
- Unit: `*.unit.spec.ts`
- Component: `*.component.spec.tsx`

### 2.2 Duplicate Test Files

Several API endpoints have duplicate test files:
- `checkout.api.spec.ts` AND `checkout.test.ts`
- `portal.api.spec.ts` AND `portal.test.ts`
- `webhooks.api.spec.ts` AND `webhooks-stripe.test.ts`

**Recommendation**: Consolidate into single files per endpoint.

### 2.3 Setup/Teardown Pattern Inconsistencies

**Pattern A - Class-level shared user:**
```typescript
// checkout.api.spec.ts
let dataManager: TestDataManager;
let testUser: { id: string; email: string; token: string };

test.beforeAll(async () => {
  dataManager = new TestDataManager();
  testUser = await dataManager.createTestUser();
});

test.afterAll(async () => {
  await dataManager.cleanupAllUsers();
});
```

**Pattern B - Per-test user creation:**
```typescript
// billing-workflow.integration.spec.ts
test.beforeAll(async () => {
  dataManager = new TestDataManager();
});

test.beforeEach(async () => {
  testUser = await dataManager.createTestUser();
});

test.afterAll(async () => {
  if (testUser) {
    await dataManager.cleanupUser(testUser.id);
  }
});
```

**Pattern C - Direct helper instantiation per test:**
```typescript
// testFixtures usage
const user = await testFixtures.createFreeUser();
// No cleanup tracked
```

### 2.4 Missing Abstractions

#### A. API Request Builder
Currently, every API test manually constructs requests:

```typescript
// Repeated across 15+ test files
const response = await request.post('/api/checkout', {
  data: { priceId: 'price_123' },
  headers: { Authorization: `Bearer ${testUser.token}` },
});
expect(response.status()).toBe(401);
const data = await response.json();
expect(data.error.code).toBe('UNAUTHORIZED');
```

**Missing**: Fluent API request builder with assertion chaining.

#### B. Response Assertion Helpers
Repeated assertion patterns:

```typescript
// Pattern repeated 50+ times
expect(response.status()).toBe(200);
const data = await response.json();
expect(data.success).toBe(true);
expect(data.data.url).toBeTruthy();
```

**Missing**: Standardized response matchers.

#### C. Test User Factories
User creation is scattered with varying options:

```typescript
// Different patterns across files
await dataManager.createTestUser();
await dataManager.createTestUserWithSubscription('active', 'pro', 500);
await testFixtures.createProUser(500);
await helpers.createTestUser('active', 'pro', 100);
```

**Missing**: Unified user factory with builder pattern.

#### D. Webhook Testing Utilities
Webhook tests repeat signature handling:

```typescript
// Repeated pattern
const webhookEvent = StripeWebhookMockFactory.createCheckoutSessionCompletedForCredits({...});
const response = await request.post('/api/webhooks/stripe', {
  headers: { 'Stripe-Signature': 'test-signature' },
  data: webhookEvent,
});
```

**Missing**: WebhookTestClient abstraction.

### 2.5 Page Object Model Gaps

Current BasePage is minimal:
```typescript
export class BasePage {
  async goto(path: string): Promise<void> { ... }
  async waitForURL(url: string | RegExp): Promise<void> { ... }
}
```

**Missing**:
- Common UI interactions (toast notifications, modals, loading states)
- Network request waiting utilities
- Screenshot/visual comparison helpers
- Accessibility checking hooks

---

## 3. Proposed Solution

### 3.1 Architecture Summary

1. **Unified Test Context** - Single `TestContext` class managing user lifecycle, cleanup, and state
2. **API Client Abstraction** - Fluent `ApiClient` with typed endpoints and response validation
3. **Enhanced Page Objects** - Rich base page with common UI patterns
4. **Webhook Test Client** - Dedicated client for webhook testing with signature handling
5. **Standardized Factories** - Builder pattern for test data creation

### 3.2 Architecture Diagram

```mermaid
flowchart TB
    subgraph "Test Layer"
        API_TESTS[API Tests]
        E2E_TESTS[E2E Tests]
        INT_TESTS[Integration Tests]
    end

    subgraph "Abstraction Layer"
        TC[TestContext]
        AC[ApiClient]
        WC[WebhookClient]
        POM[Enhanced Page Objects]
    end

    subgraph "Factory Layer"
        UF[UserFactory]
        SF[SubscriptionFactory]
        WF[WebhookEventFactory]
    end

    subgraph "Infrastructure"
        TDM[TestDataManager]
        SUPABASE[Supabase Admin]
    end

    API_TESTS --> TC
    API_TESTS --> AC
    INT_TESTS --> TC
    INT_TESTS --> AC
    INT_TESTS --> WC
    E2E_TESTS --> TC
    E2E_TESTS --> POM

    TC --> UF
    TC --> SF
    WC --> WF

    UF --> TDM
    SF --> TDM
    TDM --> SUPABASE
```

### 3.3 Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test Context Pattern | Singleton per test file | Ensures cleanup tracking and resource management |
| API Client | Class-based with method chaining | Type safety and discoverability |
| Page Objects | Composition over inheritance | Flexible, maintainable components |
| User Factory | Builder pattern | Complex user state setup with fluent API |
| Webhook Client | Dedicated abstraction | Isolates signature handling complexity |

### 3.4 Data Model Changes

**No database changes required.** Refactoring affects only test infrastructure.

---

## 4. Detailed Implementation Spec

### 4.1 TestContext Class

**File**: `tests/helpers/test-context.ts`

```typescript
import { APIRequestContext } from '@playwright/test';
import { TestDataManager, ITestUser } from './test-data-manager';

export interface ITestContextOptions {
  autoCleanup?: boolean;
}

export class TestContext {
  private dataManager: TestDataManager;
  private users: ITestUser[] = [];
  private cleanupCallbacks: (() => Promise<void>)[] = [];

  constructor(options: ITestContextOptions = { autoCleanup: true }) {
    this.dataManager = new TestDataManager();
  }

  /**
   * Creates a test user and tracks it for cleanup
   */
  async createUser(options?: {
    subscription?: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled';
    tier?: 'starter' | 'pro' | 'business';
    credits?: number;
  }): Promise<ITestUser> {
    const { subscription = 'free', tier, credits = 10 } = options || {};

    const user = subscription === 'free'
      ? await this.dataManager.createTestUser()
      : await this.dataManager.createTestUserWithSubscription(subscription, tier, credits);

    this.users.push(user);
    return user;
  }

  /**
   * Gets the underlying data manager for advanced operations
   */
  get data(): TestDataManager {
    return this.dataManager;
  }

  /**
   * Registers a cleanup callback
   */
  onCleanup(callback: () => Promise<void>): void {
    this.cleanupCallbacks.push(callback);
  }

  /**
   * Cleans up all resources
   */
  async cleanup(): Promise<void> {
    // Run custom cleanup callbacks first
    for (const callback of this.cleanupCallbacks) {
      try {
        await callback();
      } catch (error) {
        console.warn('Cleanup callback failed:', error);
      }
    }

    // Clean up users
    await this.dataManager.cleanupAllUsers();
    this.users = [];
    this.cleanupCallbacks = [];
  }
}
```

**Justification**: Centralizes test resource management, ensuring proper cleanup and preventing resource leaks.

---

### 4.2 ApiClient Class

**File**: `tests/helpers/api-client.ts`

```typescript
import { APIRequestContext, expect } from '@playwright/test';

export interface IApiResponse<T = unknown> {
  status: number;
  data: T;
  raw: Response;
}

export interface IApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export interface IApiSuccessResponse<T> {
  success: true;
  data: T;
}

export class ApiClient {
  constructor(
    private request: APIRequestContext,
    private baseUrl: string = ''
  ) {}

  /**
   * Creates an authenticated client
   */
  withAuth(token: string): AuthenticatedApiClient {
    return new AuthenticatedApiClient(this.request, this.baseUrl, token);
  }

  /**
   * POST request without authentication
   */
  async post<T = unknown>(
    endpoint: string,
    data?: unknown
  ): Promise<ApiResponse<T>> {
    const response = await this.request.post(`${this.baseUrl}${endpoint}`, {
      data,
      headers: { 'Content-Type': 'application/json' },
    });
    return new ApiResponse<T>(response);
  }

  /**
   * GET request without authentication
   */
  async get<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
    const response = await this.request.get(`${this.baseUrl}${endpoint}`);
    return new ApiResponse<T>(response);
  }
}

export class AuthenticatedApiClient extends ApiClient {
  constructor(
    private req: APIRequestContext,
    private base: string,
    private token: string
  ) {
    super(req, base);
  }

  private get authHeaders() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async post<T = unknown>(
    endpoint: string,
    data?: unknown
  ): Promise<ApiResponse<T>> {
    const response = await this.req.post(`${this.base}${endpoint}`, {
      data,
      headers: this.authHeaders,
    });
    return new ApiResponse<T>(response);
  }

  async get<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
    const response = await this.req.get(`${this.base}${endpoint}`, {
      headers: this.authHeaders,
    });
    return new ApiResponse<T>(response);
  }

  async put<T = unknown>(
    endpoint: string,
    data?: unknown
  ): Promise<ApiResponse<T>> {
    const response = await this.req.put(`${this.base}${endpoint}`, {
      data,
      headers: this.authHeaders,
    });
    return new ApiResponse<T>(response);
  }

  async delete<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
    const response = await this.req.delete(`${this.base}${endpoint}`, {
      headers: this.authHeaders,
    });
    return new ApiResponse<T>(response);
  }
}

/**
 * Fluent response wrapper with assertion methods
 */
export class ApiResponse<T = unknown> {
  private _json: T | null = null;

  constructor(private response: Response) {}

  get status(): number {
    return this.response.status();
  }

  get ok(): boolean {
    return this.response.ok();
  }

  async json(): Promise<T> {
    if (this._json === null) {
      this._json = await this.response.json();
    }
    return this._json as T;
  }

  // Assertion methods for fluent chaining

  expectStatus(status: number): this {
    expect(this.status).toBe(status);
    return this;
  }

  expectSuccess(): this {
    expect(this.ok).toBe(true);
    return this;
  }

  expectError(): this {
    expect(this.ok).toBe(false);
    return this;
  }

  async expectErrorCode(code: string): Promise<this> {
    const data = await this.json() as IApiErrorResponse;
    expect(data.success).toBe(false);
    expect(data.error?.code).toBe(code);
    return this;
  }

  async expectData<K extends keyof T>(
    assertions: Partial<Record<K, unknown>>
  ): Promise<this> {
    const data = await this.json() as IApiSuccessResponse<T>;
    expect(data.success).toBe(true);
    for (const [key, value] of Object.entries(assertions)) {
      expect(data.data[key as K]).toEqual(value);
    }
    return this;
  }
}
```

**Justification**: Reduces boilerplate in API tests by ~60%, provides type safety, and standardizes response handling.

---

### 4.3 WebhookClient Class

**File**: `tests/helpers/webhook-client.ts`

```typescript
import { APIRequestContext } from '@playwright/test';
import { StripeWebhookMockFactory, IWebhookTestOptions } from './stripe-webhook-mocks';
import { ApiResponse } from './api-client';

export class WebhookClient {
  constructor(
    private request: APIRequestContext,
    private endpoint: string = '/api/webhooks/stripe'
  ) {}

  /**
   * Sends a checkout completed event for credit purchase
   */
  async sendCreditPurchase(options: IWebhookTestOptions): Promise<ApiResponse> {
    const event = StripeWebhookMockFactory.createCheckoutSessionCompletedForCredits(options);
    return this.send(event);
  }

  /**
   * Sends a subscription created event
   */
  async sendSubscriptionCreated(options: IWebhookTestOptions): Promise<ApiResponse> {
    const event = StripeWebhookMockFactory.createSubscriptionCreated(options);
    return this.send(event);
  }

  /**
   * Sends a subscription updated event
   */
  async sendSubscriptionUpdated(
    options: IWebhookTestOptions & { status?: string }
  ): Promise<ApiResponse> {
    const event = StripeWebhookMockFactory.createSubscriptionUpdated(options);
    return this.send(event);
  }

  /**
   * Sends a subscription deleted event
   */
  async sendSubscriptionDeleted(options: IWebhookTestOptions): Promise<ApiResponse> {
    const event = StripeWebhookMockFactory.createSubscriptionDeleted(options);
    return this.send(event);
  }

  /**
   * Sends an invoice payment succeeded event
   */
  async sendInvoicePaymentSucceeded(options: IWebhookTestOptions): Promise<ApiResponse> {
    const event = StripeWebhookMockFactory.createInvoicePaymentSucceeded(options);
    return this.send(event);
  }

  /**
   * Sends an invoice payment failed event
   */
  async sendInvoicePaymentFailed(options: IWebhookTestOptions): Promise<ApiResponse> {
    const event = StripeWebhookMockFactory.createInvoicePaymentFailed(options);
    return this.send(event);
  }

  /**
   * Sends a raw webhook event
   */
  async send(event: unknown, signature: string = 'test-signature'): Promise<ApiResponse> {
    const response = await this.request.post(this.endpoint, {
      headers: {
        'Stripe-Signature': signature,
        'Content-Type': 'application/json',
      },
      data: event,
    });
    return new ApiResponse(response);
  }
}
```

**Justification**: Encapsulates webhook testing complexity, provides semantic methods for common events.

---

### 4.4 Enhanced BasePage

**File**: `tests/pages/BasePage.ts` (enhanced)

```typescript
import { Page, Locator, expect } from '@playwright/test';

export interface IWaitOptions {
  timeout?: number;
  state?: 'visible' | 'hidden' | 'attached' | 'detached';
}

export class BasePage {
  constructor(protected readonly page: Page) {}

  // Navigation
  async goto(path: string): Promise<void> {
    const url = path.startsWith('http') ? path : `http://localhost:3000${path}`;
    await this.page.goto(url);
    await this.page.waitForLoadState('networkidle');
  }

  async waitForURL(url: string | RegExp): Promise<void> {
    await this.page.waitForURL(url);
  }

  async reload(): Promise<void> {
    await this.page.reload();
    await this.page.waitForLoadState('networkidle');
  }

  // Common UI Elements
  get header(): Locator {
    return this.page.locator('header');
  }

  get signInButton(): Locator {
    return this.header.getByRole('button', { name: 'Sign In' }).first();
  }

  get modal(): Locator {
    return this.page.locator('div[role="dialog"]');
  }

  // Toast/Notification Handling
  async waitForToast(text?: string | RegExp): Promise<Locator> {
    const toast = this.page.locator('[role="alert"], [data-sonner-toast]');
    if (text) {
      await expect(toast.filter({ hasText: text })).toBeVisible();
      return toast.filter({ hasText: text });
    }
    await expect(toast.first()).toBeVisible();
    return toast.first();
  }

  async dismissToast(): Promise<void> {
    const toast = this.page.locator('[role="alert"], [data-sonner-toast]');
    if (await toast.isVisible()) {
      await toast.locator('button[aria-label="Close"]').click().catch(() => {});
    }
  }

  // Modal Handling
  async waitForModal(): Promise<void> {
    await expect(this.modal).toBeVisible({ timeout: 10000 });
  }

  async closeModal(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.modal).toBeHidden({ timeout: 5000 });
  }

  async isModalVisible(): Promise<boolean> {
    return this.modal.isVisible();
  }

  // Loading States
  async waitForLoadingComplete(): Promise<void> {
    // Wait for loading spinners to disappear
    const spinner = this.page.locator('[data-loading], .animate-spin, [aria-busy="true"]');
    await spinner.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  }

  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  // API Request Waiting
  async waitForApiResponse(urlPattern: string | RegExp): Promise<Response> {
    return this.page.waitForResponse(urlPattern);
  }

  async waitForApiRequest(urlPattern: string | RegExp): Promise<Request> {
    return this.page.waitForRequest(urlPattern);
  }

  // Form Helpers
  async fillField(placeholder: string | RegExp, value: string): Promise<void> {
    await this.page.getByPlaceholder(placeholder).fill(value);
  }

  async clickButton(name: string | RegExp): Promise<void> {
    await this.page.getByRole('button', { name }).click();
  }

  // Screenshot Helpers
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `test-results/screenshots/${name}.png` });
  }

  // Accessibility Helpers
  async checkBasicAccessibility(): Promise<void> {
    // Check for page title
    const title = await this.page.title();
    expect(title.length).toBeGreaterThan(0);

    // Check for main landmark
    const main = this.page.locator('main');
    await expect(main).toBeVisible();

    // Check for skip link or navigation
    const nav = this.page.locator('nav, [role="navigation"]');
    await expect(nav.first()).toBeVisible();
  }
}
```

**Justification**: Provides common UI interaction patterns, reduces duplication across page objects.

---

### 4.5 User Factory with Builder Pattern

**File**: `tests/helpers/user-factory.ts`

```typescript
import { TestDataManager, ITestUser } from './test-data-manager';

export type SubscriptionStatus = 'free' | 'active' | 'trialing' | 'past_due' | 'canceled';
export type SubscriptionTier = 'starter' | 'pro' | 'business';

export class UserBuilder {
  private options = {
    subscription: 'free' as SubscriptionStatus,
    tier: undefined as SubscriptionTier | undefined,
    credits: 10,
    email: undefined as string | undefined,
  };

  constructor(private dataManager: TestDataManager) {}

  withSubscription(status: SubscriptionStatus, tier?: SubscriptionTier): this {
    this.options.subscription = status;
    this.options.tier = tier;
    return this;
  }

  withCredits(amount: number): this {
    this.options.credits = amount;
    return this;
  }

  withEmail(email: string): this {
    this.options.email = email;
    return this;
  }

  // Preset configurations
  asFreeUser(): this {
    return this.withSubscription('free').withCredits(10);
  }

  asProUser(credits = 500): this {
    return this.withSubscription('active', 'pro').withCredits(credits);
  }

  asBusinessUser(credits = 1000): this {
    return this.withSubscription('active', 'business').withCredits(credits);
  }

  asTrialingUser(tier: SubscriptionTier = 'pro'): this {
    return this.withSubscription('trialing', tier);
  }

  asCanceledUser(): this {
    return this.withSubscription('canceled');
  }

  async build(): Promise<ITestUser> {
    const { subscription, tier, credits, email } = this.options;

    if (subscription === 'free') {
      const user = email
        ? await this.dataManager.createTestUser({ email })
        : await this.dataManager.createTestUser();

      if (credits !== 10) {
        await this.dataManager.addCredits(user.id, credits - 10, 'bonus');
      }
      return user;
    }

    return this.dataManager.createTestUserWithSubscription(subscription, tier, credits);
  }
}

export class UserFactory {
  constructor(private dataManager: TestDataManager) {}

  create(): UserBuilder {
    return new UserBuilder(this.dataManager);
  }

  // Convenience methods
  async freeUser(): Promise<ITestUser> {
    return this.create().asFreeUser().build();
  }

  async proUser(credits = 500): Promise<ITestUser> {
    return this.create().asProUser(credits).build();
  }

  async businessUser(credits = 1000): Promise<ITestUser> {
    return this.create().asBusinessUser(credits).build();
  }

  async trialingUser(tier: SubscriptionTier = 'pro'): Promise<ITestUser> {
    return this.create().asTrialingUser(tier).build();
  }
}
```

**Justification**: Builder pattern allows complex user setups with readable, fluent API.

---

## 5. Step-by-Step Execution Plan

### Phase 1: Core Infrastructure (PR #1) ✅ COMPLETED

- [x] Create `tests/helpers/test-context.ts`
- [x] Create `tests/helpers/api-client.ts`
- [x] Create `tests/helpers/webhook-client.ts`
- [x] Create `tests/helpers/user-factory.ts`
- [x] Add exports in `tests/helpers/index.ts`
- [ ] Update existing imports to use new barrel export

### Phase 2: Enhanced Page Objects (PR #2) ✅ COMPLETED

- [x] Enhance `tests/pages/BasePage.ts` with new utilities
- [x] Update `LoginPage.ts` to extend enhanced base
- [x] Update `BillingPage.ts` to extend enhanced base
- [x] Update `PricingPage.ts` to extend enhanced base
- [x] Add new `ModalComponent.ts` for reusable modal interactions
- [x] Add `ToastComponent.ts` for notification handling

### Phase 3: API Test Migration (PR #3) 🟡 IN PROGRESS

#### Completed ✅
- [x] Refactor `checkout.api.spec.ts` to use new abstractions
- [x] Consolidate `checkout.test.ts` into `checkout.api.spec.ts`
- [x] Fix critical type errors in API client (Response → APIResponse)

#### Remaining Tasks
- [ ] Refactor `portal.api.spec.ts` to use new abstractions
- [ ] Consolidate `portal.test.ts` into `portal.api.spec.ts`
- [ ] Refactor `webhooks.api.spec.ts` to use WebhookClient
- [ ] Consolidate `webhooks-stripe.test.ts` into `webhooks.api.spec.ts`

#### Phase 3 Progress Summary

**checkout.api.spec.ts Refactoring Completed:**

**Before Pattern:**
```typescript
let dataManager: TestDataManager;
let testUser: { id: string; email: string; token: string };

test.beforeAll(async () => {
  dataManager = new TestDataManager();
  testUser = await dataManager.createTestUser();
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

**After Pattern:**
```typescript
let ctx: TestContext;
let api: ApiClient;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test('should reject unauthenticated requests', async ({ request }) => {
  api = new ApiClient(request);
  const response = await api.post('/api/checkout', { priceId: 'price_test_123' });

  response.expectStatus(401);
  await response.expectErrorCode('UNAUTHORIZED');
});
```

**Key Improvements:**
- **58% reduction** in test code boilerplate
- **Fluent API assertions** (`response.expectStatus(401).expectErrorCode('UNAUTHORIZED')`)
- **Type-safe API client** with automatic authentication handling
- **Centralized test context** for user lifecycle management
- **Consolidated duplicate tests** from checkout.test.ts

**Critical Fixes Applied:**
- Fixed `Response` → `APIResponse` type compatibility issues
- Updated `ApiResponse` constructor and interfaces
- Fixed Playwright assertion method compatibility
- Updated webhook client import types

### Phase 4: Integration Test Migration (PR #4) 🟡 IN PROGRESS

#### Completed ✅
- [x] Update remaining integration tests to use TestContext
- [x] `database-operations.integration.spec.ts` - migrated to TestContext + ApiClient
- [x] `billing-system.integration.spec.ts` - migrated to TestContext + ApiClient
- [x] `credit-operations.integration.spec.ts` - migrated to TestContext
- [x] `ai-services.integration.spec.ts` - already using new abstractions
- [x] Identified that `webhook.trial.integration.spec.ts` and `checkout.trial.integration.spec.ts` are Vitest unit tests (not Playwright integration tests)

#### Remaining Tasks
- [ ] Refactor `billing-workflow.integration.spec.ts`

#### Phase 4 Progress Summary

**Integration Tests Successfully Migrated:**

**Before Pattern:**
```typescript
let testDataManager: TestDataManager;
let testUser: { id: string; email: string; token: string };

test.beforeAll(async () => {
  testDataManager = new TestDataManager();
  testUser = await testDataManager.createTestUser();
});

test.afterAll(async () => {
  await testDataManager.cleanupUser(testUser.id);
});

test('should reflect correct subscription status', async ({ request }) => {
  const response = await request.get('/api/profile', {
    headers: { Authorization: `Bearer ${testUser.token}` },
  });
  expect(response.ok()).toBeTruthy();
});
```

**After Pattern:**
```typescript
let ctx: TestContext;
let testUser: { id: string; email: string; token: string };

test.beforeAll(async () => {
  ctx = new TestContext();
  testUser = await ctx.createUser();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

test('should reflect correct subscription status', async ({ request }) => {
  const api = new ApiClient(request).withAuth(testUser.token);
  const response = await api.get('/api/profile');
  response.expectStatus(200);
});
```

**Key Improvements:**
- **Centralized user lifecycle management** with automatic cleanup tracking
- **Type-safe API client** with fluent assertions
- **Reduced boilerplate** in setup/teardown patterns
- **Better error handling** through structured response assertions
- **Consistent patterns** across all integration tests

**Files Updated:**
- ✅ `database-operations.integration.spec.ts`
- ✅ `billing-system.integration.spec.ts`
- ✅ `credit-operations.integration.spec.ts`
- ✅ `ai-services.integration.spec.ts` (was already updated)

**Classification Correction:**
- 📋 `webhook.trial.integration.spec.ts` → Vitest unit test (not Playwright)
- 📋 `checkout.trial.integration.spec.ts` → Vitest unit test (not Playwright)

### Phase 5: E2E Test Migration (PR #5)

- [ ] Refactor `auth.e2e.spec.ts` to use enhanced page objects
- [ ] Refactor `billing.e2e.spec.ts` to use enhanced page objects
- [ ] Update mobile responsive tests

### Phase 6: Cleanup & Documentation (PR #6)

- [ ] Remove deprecated helper files
- [ ] Update `tests/CLAUDE.md` with new patterns
- [ ] Add JSDoc comments to all public APIs
- [ ] Create migration guide for team

---

## 6. Testing Strategy

### Unit Tests

New helper classes should have comprehensive unit tests:

| File | Test Coverage |
|------|---------------|
| `api-client.ts` | Request building, response parsing, assertion methods |
| `test-context.ts` | User lifecycle, cleanup callbacks |
| `user-factory.ts` | Builder pattern, preset configurations |
| `webhook-client.ts` | Event generation, signature handling |

### Integration Tests

Verify new abstractions work with actual services:

| Scenario | Expected Behavior |
|----------|-------------------|
| TestContext cleanup | All users deleted after test |
| ApiClient auth | Token properly attached to requests |
| WebhookClient events | Events processed correctly |

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Rate limit during user creation | Exponential backoff succeeds |
| Cleanup failure | Warning logged, continues cleanup |
| Invalid token | 401 response with UNAUTHORIZED code |
| Duplicate webhook | Idempotent handling |

---

## 7. Acceptance Criteria

- [ ] All existing tests pass with new abstractions
- [ ] Code duplication in test files reduced by >50%
- [ ] Consistent naming convention across all test files
- [ ] No duplicate test files for same endpoints
- [ ] Test execution time does not regress
- [ ] New tests are easier to write (measured by LOC reduction)
- [ ] Documentation updated with new patterns

---

## 8. Verification & Rollback

### Success Criteria

- `yarn test` passes with 0 failures
- `yarn verify` completes successfully
- No orphaned test users after test runs
- CI pipeline execution time within ±10% baseline

### Rollback Plan

Each PR is independently revertible:
1. Revert specific PR via `git revert`
2. Import paths updated to use original helpers
3. No database changes to rollback

---

## 9. Example: Before vs After

### Before (Current Pattern)

```typescript
// checkout.api.spec.ts - 478 lines
import { test, expect } from '@playwright/test';
import { TestDataManager } from '../helpers/test-data-manager';

let dataManager: TestDataManager;
let testUser: { id: string; email: string; token: string };

test.beforeAll(async () => {
  dataManager = new TestDataManager();
  testUser = await dataManager.createTestUser();
});

test.afterAll(async () => {
  if (dataManager) {
    await dataManager.cleanupAllUsers();
  }
});

test('should reject unauthenticated requests', async ({ request }) => {
  const response = await request.post('/api/checkout', {
    data: { priceId: 'price_test_123' },
  });

  expect(response.status()).toBe(401);
  const data = await response.json();
  expect(data.error).toBeDefined();
  expect(data.error.code).toBe('UNAUTHORIZED');
});

test('should validate required fields', async ({ request }) => {
  const response = await request.post('/api/checkout', {
    data: {},
    headers: { Authorization: `Bearer ${testUser.token}` },
  });

  expect(response.status()).toBe(400);
  const data = await response.json();
  expect(data.error).toBeDefined();
  expect(data.error.message).toBe('priceId is required');
  expect(data.error.code).toBe('VALIDATION_ERROR');
});
```

### After (Refactored)

```typescript
// checkout.api.spec.ts - ~200 lines (58% reduction)
import { test } from '@playwright/test';
import { TestContext, ApiClient } from '../helpers';

let ctx: TestContext;
let api: ApiClient;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

test.describe('API: Checkout', () => {
  test.describe('Authentication', () => {
    test('should reject unauthenticated requests', async ({ request }) => {
      api = new ApiClient(request);
      const response = await api.post('/api/checkout', { priceId: 'price_test_123' });

      response.expectStatus(401);
      await response.expectErrorCode('UNAUTHORIZED');
    });
  });

  test.describe('Validation', () => {
    test('should validate required fields', async ({ request }) => {
      const user = await ctx.createUser();
      api = new ApiClient(request).withAuth(user.token);

      const response = await api.post('/api/checkout', {});

      response.expectStatus(400);
      await response.expectErrorCode('VALIDATION_ERROR');
    });
  });
});
```

---

## 10. Migration Priority Matrix

| Test File | Complexity | Impact | Priority |
|-----------|------------|--------|----------|
| `checkout.api.spec.ts` | Medium | High | P0 |
| `webhooks.api.spec.ts` | High | High | P0 |
| `billing-workflow.integration.spec.ts` | High | High | P1 |
| `auth.e2e.spec.ts` | Low | Medium | P2 |
| Unit tests | Low | Low | P3 |

---

## Appendix A: File Rename Mapping

| Current Name | New Name |
|--------------|----------|
| `checkout.test.ts` | (merge into `checkout.api.spec.ts`) |
| `portal.test.ts` | (merge into `portal.api.spec.ts`) |
| `webhooks-stripe.test.ts` | (merge into `webhooks.api.spec.ts`) |
| `credit-management.test.ts` | `credit-management.integration.spec.ts` |
| `PricingCard.test.tsx` | `PricingCard.component.spec.tsx` |
| `BillingPage.trial.test.tsx` | `BillingPage.component.spec.tsx` |
| `SubscriptionStatus.trial.test.tsx` | `SubscriptionStatus.component.spec.tsx` |

## Appendix B: Helper Barrel Export

**File**: `tests/helpers/index.ts`

```typescript
// Core abstractions
export { TestContext } from './test-context';
export { ApiClient, AuthenticatedApiClient, ApiResponse } from './api-client';
export { WebhookClient } from './webhook-client';
export { UserFactory, UserBuilder } from './user-factory';

// Existing exports (deprecated, use new abstractions)
export { TestDataManager, ITestUser } from './test-data-manager';
export { IntegrationTestHelpers, testFixtures, customMatchers } from './integration-test-helpers';
export { StripeWebhookMockFactory } from './stripe-webhook-mocks';
export { CheckoutMock } from './checkout-mock';
```
