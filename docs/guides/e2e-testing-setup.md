# E2E Testing Setup Guide

This guide covers setting up and running Playwright E2E tests for the PixelPerfect application.

## Prerequisites

- Node.js 18+
- Yarn package manager
- Supabase project (for billing tests)

## Quick Start

### 1. Install Playwright Browsers

```bash
npx playwright install chromium
```

### 2. Run Tests

```bash
# Run all E2E tests (headless)
yarn test:e2e

# Run all tests (E2E + API)
yarn test:all

# Full verification (TypeScript + Lint + Tests)
yarn verify
```

## Environment Setup

### Basic Tests (No Environment Variables Required)

The authentication tests (`auth.e2e.spec.ts`) run without any environment configuration:

```bash
yarn test:e2e
```

### Billing Tests (Requires Supabase Service Role Key)

Billing tests require access to Supabase Admin API to create/cleanup test users.

#### Step 1: Get Your Supabase Service Role Key

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Settings** → **API**
4. Under "Project API keys", copy the **service_role** key (NOT the anon key)

#### Step 2: Configure `.env.prod`

```bash
# Copy the example file
cp .env.prod.example .env.prod
```

Edit `.env.prod` and add your keys:

```bash
# Supabase - Get from: Supabase Dashboard > Settings > API
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Also ensure .env has the public URL
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
```

#### Step 3: Run Billing Tests

```bash
yarn test:e2e
```

With the environment configured, billing tests will run instead of being skipped.

## Available Test Commands

| Command                | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `yarn test:e2e`        | Run E2E browser tests (chromium, headless)        |
| `yarn test:api`        | Run API tests only                                |
| `yarn test:all`        | Run all Playwright tests                          |
| `yarn test:e2e:ui`     | Open interactive Playwright UI (requires display) |
| `yarn test:e2e:debug`  | Debug mode with browser DevTools                  |
| `yarn test:e2e:report` | Show HTML test report                             |
| `yarn verify`          | Full validation (tsc + lint + all tests)          |

## Test Structure

```
tests/
├── e2e/                    # Browser E2E tests (*.e2e.spec.ts)
│   ├── auth.e2e.spec.ts    # Authentication flows
│   └── billing.e2e.spec.ts # Billing/subscription flows
├── api/                    # API tests (*.api.spec.ts)
│   ├── health.api.spec.ts
│   ├── checkout.api.spec.ts
│   └── webhooks.api.spec.ts
├── pages/                  # Page Object Models
│   ├── BasePage.ts
│   ├── LoginPage.ts
│   ├── BillingPage.ts
│   └── PricingPage.ts
└── helpers/                # Test utilities
    ├── auth.ts             # Auth fixtures
    ├── test-data-manager.ts
    └── checkout-mock.ts
```

## Page Object Model (POM)

Tests use the Page Object Model pattern for maintainability:

```typescript
// tests/pages/LoginPage.ts
export class LoginPage extends BasePage {
  async openLoginModal() {
    await this.page.locator('header').waitFor({ state: 'visible' });
    await this.page.getByRole('button', { name: /sign in/i }).click();
    await expect(this.page.locator('div[role="dialog"]')).toBeVisible();
  }

  async login(email: string, password: string) {
    await this.openLoginModal();
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole('button', { name: /sign in/i }).click();
  }
}
```

Usage in tests:

```typescript
// tests/e2e/auth.e2e.spec.ts
import { LoginPage } from '../pages/LoginPage';

test('should show login form', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto('/');
  await loginPage.openLoginModal();
  await loginPage.assertModalVisible();
});
```

## Writing New Tests

### 1. Create a Page Object (if needed)

```typescript
// tests/pages/MyPage.ts
import { BasePage } from './BasePage';

export class MyPage extends BasePage {
  async doSomething() {
    // Use accessibility-driven selectors
    await this.page.getByRole('button', { name: /submit/i }).click();
  }
}
```

### 2. Create the Test Spec

```typescript
// tests/e2e/my-feature.e2e.spec.ts
import { test, expect } from '@playwright/test';
import { MyPage } from '../pages/MyPage';

test.describe('My Feature', () => {
  test('should work correctly', async ({ page }) => {
    const myPage = new MyPage(page);
    await myPage.goto('/my-route');
    await myPage.doSomething();
    await expect(page.getByText('Success')).toBeVisible();
  });
});
```

### 3. Selector Best Practices

Prefer accessibility-driven selectors (resilient to UI changes):

```typescript
// Good - accessibility selectors
page.getByRole('button', { name: /submit/i });
page.getByLabel('Email');
page.getByText('Welcome');

// Avoid - brittle selectors
page.locator('.btn-primary');
page.locator('#submit-btn');
page.locator('div > span.text');
```

## Troubleshooting

### Tests Skipped (Billing)

If billing tests show as skipped (`-`):

```
-  1 › Billing System E2E Tests › should display free user state
```

**Cause**: Missing `SUPABASE_SERVICE_ROLE_KEY` in `.env.prod`

**Solution**: Follow the [Billing Tests setup](#billing-tests-requires-supabase-service-role-key) above.

### Browser Not Installed

```
Error: browserType.launch: Executable doesn't exist
```

**Solution**:

```bash
npx playwright install chromium
```

### Port Already in Use

```
Port 3000 is in use by an unknown process
```

**Solution**:

```bash
# Kill processes on port 3000
lsof -ti:3000 | xargs kill -9

# Or let Playwright use the existing server
# (playwright.config.ts has reuseExistingServer: true for local dev)
```

### Timeout Errors

```
TimeoutError: page.waitForSelector: Timeout 15000ms exceeded
```

**Possible causes**:

1. Slow compilation - increase timeout in `playwright.config.ts`
2. Selector changed - update Page Object
3. Server not ready - check webServer configuration

## CI/CD Integration

For CI environments, set environment variables as secrets:

```yaml
# GitHub Actions example
env:
  NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

Run tests in CI:

```bash
CI=true yarn test:e2e
```

## Security Notes

- **NEVER** commit `.env.prod` to version control
- `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security (RLS)
- Only use service role key server-side (API routes, tests)
- Rotate keys if compromised
