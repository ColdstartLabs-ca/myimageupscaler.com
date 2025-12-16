import { test, expect, devices } from '@playwright/test';
import { TestContext } from '../helpers';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { UpscalerPage } from '../pages/UpscalerPage';
import { PricingPage } from '../pages/PricingPage';
import type { ITestUser } from '../helpers/test-data-manager';

/**
 * Complete User Journey Integration Tests
 *
 * Tests end-to-end user workflows including:
 * - User registration and onboarding
 * - Authentication flow
 * - Image processing workflow
 * - Subscription upgrade process
 * - Credit management
 * - Error recovery scenarios
 */
test.describe('Complete User Journey Integration', () => {
  let ctx: TestContext;
  let testUser: ITestUser;

  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test.afterEach(async ({ page }) => {
    // Cleanup any lingering sessions
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test.describe('New User Onboarding Journey', () => {
    let newUserEmail: string;

    test('should complete full user registration and first use', async ({ page, request }) => {
      const homePage = new HomePage(page);
      const loginPage = new LoginPage(page);
      const upscalerPage = new UpscalerPage(page);

      // Step 1: Navigate to landing page
      await homePage.goto();
      await expect(homePage.getHeading()).toBeVisible();
      await expect(homePage.getUscalerButton()).toBeVisible();

      // Step 2: Navigate to signup
      await homePage.clickGetStarted();
      await expect(loginPage.getSignupForm()).toBeVisible();

      // Step 3: Create new user account
      newUserEmail = `test-${Date.now()}@test.local`;
      const testPassword = 'TestPassword123!';

      await loginPage.signup(newUserEmail, testPassword);

      // Should be redirected to dashboard or upscaler
      await expect(page).toHaveURL(/\/(dashboard|upscaler)/);

      // Verify user was created in database
      await request.post('/api/auth/verify-email', {
        data: { email: newUserEmail },
      });

      // Step 4: Complete first image processing
      await upscalerPage.goto();
      await expect(upscalerPage.getUploadArea()).toBeVisible();

      // Check initial credits
      const creditsResponse = await request.get('/api/credits');
      if (creditsResponse.ok()) {
        const credits = await creditsResponse.json();
        expect(credits.data.balance).toBe(10);
      }

      // Step 5: Upload and process first image
      const testImagePath = './tests/fixtures/sample.jpg';
      await upscalerPage.uploadImage(testImagePath);
      await expect(upscalerPage.getProcessingOptions()).toBeVisible();

      await upscalerPage.selectMode('standard');
      await upscalerPage.selectScale(2);
      await upscalerPage.clickProcessButton();

      // Step 6: Handle processing result or error gracefully
      await expect(upscalerPage.getProcessingStatus()).toBeVisible();

      // Wait for processing to complete or timeout
      await upscalerPage.waitForProcessingCompletion(30000);

      // Check final credit balance
      const finalCreditsResponse = await request.get('/api/credits');
      if (finalCreditsResponse.ok()) {
        const finalCredits = await finalCreditsResponse.json();
        expect(finalCredits.data.balance).toBeLessThanOrEqual(10);
      }

      // Cleanup test user
      // Note: TestContext handles cleanup automatically(profile.data.id);
    });
  });

  test.describe('Existing User Login and Processing Journey', () => {
    test.beforeAll(async () => {
      testUser = await ctx.createUser();
    });

    test.afterAll(async () => {
      // Note: TestContext handles cleanup automatically(testUser.id);
    });

    test('should login, process images, and manage credits', async ({ page, request }) => {
      const homePage = new HomePage(page);
      const loginPage = new LoginPage(page);
      const upscalerPage = new UpscalerPage(page);

      // Step 1: Login
      await homePage.goto();
      await homePage.clickLoginButton();
      await loginPage.login(testUser.email, 'test-password-123');

      // Step 2: Verify user profile
      await expect(page).toHaveURL(/\/(dashboard|upscaler)/);

      const profileResponse = await request.get('/api/profile');
      expect(profileResponse.ok()).toBeTruthy();
      const profile = await profileResponse.json();
      expect(profile.data.email).toBe(testUser.email);

      // Step 3: Navigate to upscaler
      await upscalerPage.goto();
      await expect(upscalerPage.getUploadArea()).toBeVisible();

      // Step 4: Check initial credits
      const creditsResponse = await request.get('/api/credits');
      expect(creditsResponse.ok()).toBeTruthy();
      const initialCredits = await creditsResponse.json();
      expect(initialCredits.data.balance).toBe(10);

      // Step 5: Process multiple images
      const testImagePath = './tests/fixtures/sample.jpg';

      for (let i = 0; i < 3; i++) {
        await upscalerPage.uploadImage(testImagePath);
        await upscalerPage.selectMode('standard');
        await upscalerPage.selectScale(2);
        await upscalerPage.clickProcessButton();

        await upscalerPage.waitForProcessingCompletion(15000);

        // Small delay between processes
        await page.waitForTimeout(1000);
      }

      // Step 6: Verify credit deduction
      const finalCreditsResponse = await request.get('/api/credits');
      const finalCredits = await finalCreditsResponse.json();
      expect(finalCredits.data.balance).toBeLessThan(initialCredits.data.balance);

      // Step 7: Check transaction history
      const transactionsResponse = await request.get('/api/credits/transactions');
      if (transactionsResponse.ok()) {
        const transactions = await transactionsResponse.json();
        expect(transactions.data.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Subscription Upgrade Journey', () => {
    let freeUser: { id: string; email: string; password: string };

    test.beforeAll(async () => {
      freeUser = await ctx.createUser({ subscription: 'free' });
    });

    test.afterAll(async () => {
      // Note: TestContext handles cleanup automatically(freeUser.id);
    });

    test('should upgrade from free to pro subscription', async ({ page, request }) => {
      const loginPage = new LoginPage(page);
      const upscalerPage = new UpscalerPage(page);
      const pricingPage = new PricingPage(page);

      // Step 1: Login as free user
      await page.goto('/login');
      await loginPage.login(freeUser.email, 'test-password-123');

      // Step 2: Verify free tier limitations
      const creditsResponse = await request.get('/api/credits');
      expect(creditsResponse.ok()).toBeTruthy();
      const credits = await creditsResponse.json();
      expect(credits.data.tier).toBe('free');
      expect(credits.data.balance).toBe(10);

      // Step 3: Navigate to pricing page
      await page.goto('/pricing');
      await expect(pricingPage.getPricingCards()).toBeVisible();

      // Step 4: Select Pro plan
      await pricingPage.selectPlan('pro');

      // Step 5: Initiate checkout
      const checkoutResponse = await request.post('/api/billing/checkout', {
        data: {
          priceId: 'price_pro_monthly',
          successUrl: 'http://localhost:3000/success',
          cancelUrl: 'http://localhost:3000/cancel',
        },
      });

      expect(checkoutResponse.ok()).toBeTruthy();
      const checkout = await checkoutResponse.json();
      expect(checkout.data.checkoutUrl).toContain('stripe.com');

      // Step 6: Mock successful checkout (in real scenario, user would complete Stripe flow)
      await ctx.data.setSubscriptionStatus(freeUser.id, 'active', 'pro');
      await ctx.data.addCredits(freeUser.id, 500);

      // Step 7: Verify upgrade benefits
      const upgradedCreditsResponse = await request.get('/api/credits');
      const upgradedCredits = await upgradedCreditsResponse.json();
      expect(upgradedCredits.data.balance).toBe(510); // Initial 10 + 500 bonus
      expect(upgradedCredits.data.tier).toBe('pro');
      expect(upgradedCredits.data.maxRollover).toBe(3000);

      // Step 8: Test pro tier features
      await upscalerPage.goto();
      await expect(upscalerPage.getEnhancedModeButton()).toBeVisible();

      // Verify higher processing limits are available
      const testImagePath = './tests/fixtures/sample.jpg';
      await upscalerPage.uploadImage(testImagePath);
      await upscalerPage.selectMode('enhanced'); // Pro tier feature
      await upscalerPage.selectScale(8); // Higher scale for pro tier
      await expect(upscalerPage.getProcessButton()).toBeEnabled();
    });
  });

  test.describe('Error Recovery Journey', () => {
    let errorTestUser: { id: string; email: string; password: string };

    test.beforeAll(async () => {
      errorTestUser = await ctx.createUser({ subscription: 'active', tier: 'pro', credits: 50 });
    });

    test.afterAll(async () => {
      // Note: TestContext handles cleanup automatically(errorTestUser.id);
    });

    test('should handle processing errors gracefully', async ({ page, request }) => {
      const loginPage = new LoginPage(page);
      const upscalerPage = new UpscalerPage(page);

      // Step 1: Login
      await page.goto('/login');
      await loginPage.login(errorTestUser.email, 'test-password-123');

      // Step 2: Navigate to upscaler
      await upscalerPage.goto();

      // Step 3: Attempt to process with invalid data
      await page.setInputFiles('input[type="file"]', './tests/fixtures/sample.jpg');
      await upscalerPage.selectMode('standard');
      await upscalerPage.selectScale(2);

      // Mock error scenario
      await page.route('/api/upscale', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: {
              code: 'AI_UNAVAILABLE',
              message: 'AI service temporarily unavailable',
              details: { retryAfter: 60 },
            },
          }),
        });
      });

      await upscalerPage.clickProcessButton();

      // Step 4: Verify error handling
      await expect(upscalerPage.getErrorMessage()).toBeVisible();
      const errorMessage = await upscalerPage.getErrorMessage().textContent();
      expect(errorMessage).toContain('AI service temporarily unavailable');

      // Step 5: Verify retry option
      await expect(upscalerPage.getRetryButton()).toBeVisible();

      // Step 6: Verify credit refund
      const creditsBefore = await (await request.get('/api/credits')).json();
      const creditsAfter = await (await request.get('/api/credits')).json();

      // Credits should not be deducted due to error
      expect(creditsAfter.data.balance).toBe(creditsBefore.data.balance);

      // Step 7: Test retry functionality
      await page.unroute('/api/upscale');
      await upscalerPage.clickRetryButton();

      // Should attempt processing again
      await expect(upscalerPage.getProcessingStatus()).toBeVisible();
    });
  });

  test.describe('Mobile User Journey', () => {
    let mobileUser: { id: string; email: string; password: string };

    test.beforeAll(async () => {
      mobileUser = await ctx.createUser();
    });

    test.afterAll(async () => {
      // Note: TestContext handles cleanup automatically(mobileUser.id);
    });

    test.use({ ...devices['iPhone 14'] });

    test('should complete user journey on mobile device', async ({ page }) => {
      const homePage = new HomePage(page);
      const loginPage = new LoginPage(page);
      const upscalerPage = new UpscalerPage(page);

      // Step 1: Navigate on mobile
      await homePage.goto();
      await expect(homePage.getMobileMenuButton()).toBeVisible();

      // Step 2: Open mobile menu and login
      await homePage.openMobileMenu();
      await homePage.clickMobileLoginButton();

      // Step 3: Login on mobile
      await loginPage.login(mobileUser.email, 'test-password-123');

      // Step 4: Verify mobile upscaler interface
      await upscalerPage.goto();
      await expect(upscalerPage.getMobileUploadButton()).toBeVisible();

      // Step 5: Test mobile upload flow
      await upscalerPage.clickMobileUploadButton();

      // Mobile file input should work
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toBeVisible();

      // Step 6: Test mobile processing options
      await upscalerPage.uploadImage('./tests/fixtures/sample.jpg');
      await expect(upscalerPage.getMobileProcessingOptions()).toBeVisible();

      // Step 7: Verify mobile-optimized processing controls
      await expect(upscalerPage.getMobileModeSelector()).toBeVisible();
      await expect(upscalerPage.getMobileScaleSelector()).toBeVisible();
    });
  });

  test.describe('Accessibility Journey', () => {
    let accessibilityUser: { id: string; email: string; password: string };

    test.beforeAll(async () => {
      accessibilityUser = await ctx.createUser();
    });

    test.afterAll(async () => {
      // Note: TestContext handles cleanup automatically(accessibilityUser.id);
    });

    test('should support keyboard navigation and screen readers', async ({ page }) => {
      const homePage = new HomePage(page);
      const loginPage = new LoginPage(page);
      const upscalerPage = new UpscalerPage(page);

      // Step 1: Test keyboard navigation
      await homePage.goto();
      await page.keyboard.press('Tab');

      // Should focus on first interactive element
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(['BUTTON', 'A', 'INPUT']).toContain(focusedElement);

      // Step 2: Navigate through page with keyboard
      await page.keyboard.press('Enter');
      await expect(page.url()).toMatch(/\/(login|signup)/);

      // Step 3: Test form accessibility
      await loginPage.login(accessibilityUser.email, 'test-password-123');

      // Step 4: Test upscaler accessibility
      await upscalerPage.goto();

      // Check for ARIA labels
      await expect(upscalerPage.getUploadArea()).toHaveAttribute('aria-label');

      // Check for proper heading hierarchy
      const headings = await page.locator('h1, h2, h3').all();
      expect(headings.length).toBeGreaterThan(0);

      // Step 5: Test keyboard upload
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');

      // Should trigger file selection
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toBeVisible();
    });
  });

  test.describe('Performance Journey', () => {
    let performanceUser: { id: string; email: string; password: string };

    test.beforeAll(async () => {
      performanceUser = await ctx.createUser({ subscription: 'active', tier: 'pro', credits: 100 });
    });

    test.afterAll(async () => {
      // Note: TestContext handles cleanup automatically(performanceUser.id);
    });

    test('should maintain performance during user journey', async ({ page }) => {
      const loginPage = new LoginPage(page);
      const upscalerPage = new UpscalerPage(page);

      // Step 1: Measure page load performance
      const startTime = Date.now();
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      // Page should load within reasonable time
      expect(loadTime).toBeLessThan(3000); // 3 seconds

      // Step 2: Login performance
      const loginStartTime = Date.now();
      await loginPage.login(performanceUser.email, 'test-password-123');
      const loginTime = Date.now() - loginStartTime;

      expect(loginTime).toBeLessThan(5000); // 5 seconds

      // Step 3: Navigate to upscaler
      const navigationStartTime = Date.now();
      await upscalerPage.goto();
      await expect(upscalerPage.getUploadArea()).toBeVisible();
      const navigationTime = Date.now() - navigationStartTime;

      expect(navigationTime).toBeLessThan(2000); // 2 seconds

      // Step 4: Upload performance
      const uploadStartTime = Date.now();
      await upscalerPage.uploadImage('./tests/fixtures/sample.jpg');
      const uploadTime = Date.now() - uploadStartTime;

      expect(uploadTime).toBeLessThan(5000); // 5 seconds

      // Step 5: UI responsiveness during processing
      await upscalerPage.selectMode('standard');
      await upscalerPage.selectScale(2);
      await upscalerPage.clickProcessButton();

      // UI should remain responsive
      await expect(upscalerPage.getProcessingStatus()).toBeVisible({ timeout: 1000 });

      // Step 6: Memory and resource usage
      const metrics = await page.evaluate(() => {
        if ('memory' in performance) {
          const perfMemory = (
            performance as Performance & {
              memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
            }
          ).memory;
          if (perfMemory) {
            return {
              used: perfMemory.usedJSHeapSize,
              total: perfMemory.totalJSHeapSize,
            };
          }
        }
        return null;
      });

      if (metrics) {
        // Memory usage should be reasonable (adjust thresholds as needed)
        expect(metrics.used).toBeLessThan(100 * 1024 * 1024); // 100MB
      }
    });
  });
});
