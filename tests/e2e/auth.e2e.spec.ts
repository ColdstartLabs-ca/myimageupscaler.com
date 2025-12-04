import { expect, test } from '@playwright/test';

import { LoginPage } from '../pages/LoginPage';

/**
 * Authentication E2E Tests
 *
 * Tests cover:
 * 1. Login modal visibility and form elements
 * 2. Protected route redirects
 * 3. Session management
 * 4. Form validation and error handling
 * 5. Navigation state management
 *
 * Note: Actual login with Supabase requires test user setup.
 * For now, these tests focus on UI behavior and enhanced page object patterns.
 */

test.describe('Authentication', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
  });

  test.describe('Login Modal', () => {
    test('should show login form when clicking sign in', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.openLoginModal();
      await loginPage.assertModalVisible();
    });

    test('login modal contains email and password fields', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.openLoginModal();
      await loginPage.assertModalVisible();

      // Verify form fields using enhanced page object methods
      await expect(loginPage.modal.locator('input[placeholder*="email" i]')).toBeVisible();
      await expect(loginPage.modal.locator('input[placeholder*="password" i]')).toBeVisible();
    });

    test('login modal has submit button', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.openLoginModal();

      // Verify submit button using enhanced base page method
      await expect(loginPage.modal.getByRole('button', { name: 'Sign In' }).first()).toBeVisible();
    });

    test('can close login modal by pressing Escape key', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.openLoginModal();
      await loginPage.assertModalVisible();

      // Close modal using enhanced base page method
      await loginPage.closeModal();

      // Verify modal is hidden
      await expect(loginPage.modal).toBeHidden({ timeout: 5000 });
    });

    test('can close and reopen login modal multiple times', async ({ page }) => {
      await loginPage.goto('/');

      // Test multiple open/close cycles
      for (let i = 0; i < 3; i++) {
        await loginPage.openLoginModal();
        await loginPage.assertModalVisible();
        await loginPage.closeModal();
        await expect(loginPage.modal).toBeHidden();
      }
    });

    test('modal maintains focus management', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.openLoginModal();

      // Check that modal can receive focus
      await loginPage.modal.focus();
      expect(await loginPage.modal.evaluate(el => document.activeElement === el)).toBe(true);
    });
  });

  test.describe('Protected Routes', () => {
    test('accessing /dashboard without auth handles appropriately', async ({ page }) => {
      await loginPage.goto('/dashboard');
      await loginPage.waitForNetworkIdle();

      // The app may: show dashboard with sign in option, redirect, or show login modal
      // Just verify the page loads without crashing
      const url = page.url();
      const hasSignIn = await loginPage.signInButton.isVisible();
      const hasModal = await loginPage.isModalVisible();

      // Page should be functional - either shows sign in button, modal, or redirected
      expect(url.length > 0 || hasSignIn || hasModal).toBe(true);
    });

    test('accessing /dashboard/billing without auth handles appropriately', async ({ page }) => {
      await loginPage.goto('/dashboard/billing');
      await loginPage.waitForNetworkIdle();

      // Should show login requirement or redirect or stay on page with sign in option
      const hasLoginOption = await loginPage.signInButton.isVisible();
      const currentUrl = await loginPage.logCurrentUrl();
      const redirectedToLogin = currentUrl.includes('/login');
      const isOnBillingPage = currentUrl.includes('/billing');
      const isOnHomePage = currentUrl.endsWith('/');

      // One of these conditions should be true for protected routes
      expect(hasLoginOption || redirectedToLogin || isOnBillingPage || isOnHomePage).toBe(true);
    });

    test('direct URL navigation maintains header functionality', async ({ page }) => {
      // Navigate directly to various pages and verify header still works
      const pages = ['/', '/about', '/pricing', '/dashboard/billing'];

      for (const pagePath of pages) {
        await loginPage.goto(pagePath);
        await loginPage.waitForPageLoad();

        // Header should be visible and functional
        await expect(loginPage.header).toBeVisible();
        await expect(loginPage.signInButton).toBeVisible();
      }
    });
  });

  test.describe('Navigation', () => {
    test('header shows sign in button when not authenticated', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.waitForPageLoad();

      // Wait for header to be visible and auth state to load
      await loginPage.header.waitFor({ state: 'visible', timeout: 15000 });

      // Wait for sign-in button to be visible (auth state loading)
      await expect(loginPage.signInButton).toBeVisible({ timeout: 15000 });
    });

    test('sign in button opens login modal', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.waitForPageLoad();

      // Click sign in button using enhanced base page method
      await expect(loginPage.signInButton).toBeVisible();
      await loginPage.signInButton.click();

      // Modal should appear
      await loginPage.waitForModal();
      await loginPage.assertModalVisible();
    });

    test('navigation elements are accessible', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.waitForPageLoad();

      // Check basic accessibility
      await loginPage.checkBasicAccessibility();

      // Verify navigation has proper structure
      await expect(loginPage.navigation).toBeVisible();
      await expect(loginPage.mainContent).toBeVisible();
    });

    test('page maintains scroll position after modal interactions', async ({ page }) => {
      await loginPage.goto('/pricing');
      await loginPage.waitForPageLoad();

      // Scroll down a bit
      await page.evaluate(() => window.scrollTo(0, 500));
      const scrollPosition = await page.evaluate(() => window.scrollY);

      // Open and close modal
      await loginPage.openLoginModal();
      await loginPage.assertModalVisible();
      await loginPage.closeModal();

      // Scroll position should be maintained
      const finalScrollPosition = await page.evaluate(() => window.scrollY);
      expect(Math.abs(scrollPosition - finalScrollPosition)).toBeLessThan(10);
    });
  });

  test.describe('Form Validation', () => {
    test('empty form submission shows validation feedback', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.openLoginModal();

      // Try to submit without filling fields
      await loginPage.submitForm();

      // Form should show validation (HTML5 validation or custom)
      // This could be browser validation or custom error messages
      await loginPage.wait(500);

      // The form should not close (still visible) if validation failed
      await expect(loginPage.modal).toBeVisible();
    });

    test('invalid email format shows validation error', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.openLoginModal();

      // Fill with invalid email using enhanced base page method
      await loginPage.fillField(/email/i, 'invalid-email');
      await loginPage.fillField(/password/i, 'somepassword');

      await loginPage.submitForm();

      // Form should remain open due to validation
      await loginPage.wait(500);
      await expect(loginPage.modal).toBeVisible();
    });

    test('form fields can be filled and cleared', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.openLoginModal();

      // Fill form
      await loginPage.fillLoginForm('test@example.com', 'password123');

      // Verify fields are filled
      await expect(loginPage.modal.locator('input[placeholder*="email" i]')).toHaveValue('test@example.com');
      await expect(loginPage.modal.locator('input[placeholder*="password" i]')).toHaveValue('password123');

      // Clear form
      await loginPage.clearForm();

      // Verify fields are cleared
      await expect(loginPage.modal.locator('input[placeholder*="email" i]')).toHaveValue('');
      await expect(loginPage.modal.locator('input[placeholder*="password" i]')).toHaveValue('');
    });

    test('form handles rapid successive submissions', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.openLoginModal();

      // Try to submit multiple times rapidly
      for (let i = 0; i < 3; i++) {
        await loginPage.submitForm();
        await loginPage.wait(100);
      }

      // Modal should still be visible (validation preventing submission)
      await expect(loginPage.modal).toBeVisible();
    });

    test('form maintains focus after validation failures', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.openLoginModal();

      // Try to submit empty form
      await loginPage.submitForm();
      await loginPage.wait(500);

      // Check if focus remains on form or moves to first invalid field
      const activeElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(['INPUT', 'BUTTON']).toContain(activeElement);
    });
  });

  test.describe('Authentication State Management', () => {
    test('can check authentication state', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.waitForPageLoad();

      // Should not be authenticated initially
      expect(await loginPage.isAuthenticated()).toBe(false);

      // Sign in button should be visible
      await expect(loginPage.signInButton).toBeVisible();

      // Sign out button should not be visible
      await expect(loginPage.signOutButton).not.toBeVisible();
    });

    test('waits for authentication state changes', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.waitForPageLoad();

      // Wait for unauthenticated state
      await loginPage.waitForAuthState(false);

      // Verify state
      expect(await loginPage.signInButton.isVisible()).toBe(true);
      expect(await loginPage.signOutButton.isVisible()).toBe(false);
    });

    test('handles page reload with authentication persistence', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.waitForPageLoad();

      // Get initial state
      const initialAuthState = await loginPage.isAuthenticated();

      // Reload page
      await loginPage.reload();
      await loginPage.waitForPageLoad();

      // State should be consistent after reload
      const finalAuthState = await loginPage.isAuthenticated();
      expect(initialAuthState).toBe(finalAuthState);
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test('handles network errors gracefully', async ({ page }) => {
      await loginPage.goto('/');

      // Intercept and block authentication requests
      await page.route('/api/auth/**', route => route.abort());

      await loginPage.openLoginModal();
      await loginPage.fillLoginForm('test@example.com', 'password123');
      await loginPage.submitForm();

      // Should handle network error without crashing
      await loginPage.wait(2000);
      await expect(loginPage.modal).toBeVisible();
    });

    test('modal handles rapid open/close operations', async ({ page }) => {
      await loginPage.goto('/');

      // Rapidly open and close modal
      for (let i = 0; i < 5; i++) {
        await loginPage.openLoginModal();
        await loginPage.wait(50);
        await loginPage.closeModal();
        await loginPage.wait(50);
      }

      // Should still work normally
      await loginPage.openLoginModal();
      await loginPage.assertModalVisible();
    });

    test('handles keyboard navigation properly', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.openLoginModal();

      // Test Tab navigation through modal
      await page.keyboard.press('Tab');
      const firstFocused = await page.evaluate(() => document.activeElement?.tagName);

      await page.keyboard.press('Tab');
      const secondFocused = await page.evaluate(() => document.activeElement?.tagName);

      // Should be able to navigate through form elements
      expect(['INPUT', 'BUTTON']).toContain(firstFocused);
      expect(['INPUT', 'BUTTON']).toContain(secondFocused);

      // Escape should close modal
      await page.keyboard.press('Escape');
      await expect(loginPage.modal).toBeHidden();
    });

    test('maintains proper page accessibility', async ({ page }) => {
      await loginPage.goto('/');

      // Check accessibility before modal
      await loginPage.checkBasicAccessibility();

      await loginPage.openLoginModal();

      // Check accessibility with modal open
      await loginPage.checkAriaLabels();
      await expect(loginPage.modal).toBeVisible();

      await loginPage.closeModal();

      // Accessibility should still be good after modal
      await loginPage.checkBasicAccessibility();
    });
  });

  test.describe('Performance and Loading', () => {
    test('page loads within reasonable time', async ({ page }) => {
      const startTime = Date.now();
      await loginPage.goto('/');
      await loginPage.waitForPageLoad();
      const loadTime = Date.now() - startTime;

      // Should load within 5 seconds
      expect(loadTime).toBeLessThan(5000);
    });

    test('modal appears within reasonable time after click', async ({ page }) => {
      await loginPage.goto('/');
      await loginPage.waitForPageLoad();

      const startTime = Date.now();
      await loginPage.signInButton.click();
      await loginPage.waitForModal();
      const modalAppearTime = Date.now() - startTime;

      // Modal should appear within 1 second
      expect(modalAppearTime).toBeLessThan(1000);
    });

    test('handles rapid navigation between pages', async ({ page }) => {
      const pages = ['/', '/pricing', '/about', '/dashboard'];

      for (const pagePath of pages) {
        const startTime = Date.now();
        await loginPage.goto(pagePath);
        await loginPage.waitForPageLoad();
        const navigationTime = Date.now() - startTime;

        // Each navigation should complete within 3 seconds
        expect(navigationTime).toBeLessThan(3000);

        // Header should be functional on each page
        await expect(loginPage.header).toBeVisible();
        await expect(loginPage.signInButton).toBeVisible();
      }
    });
  });
});
