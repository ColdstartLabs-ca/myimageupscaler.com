import { expect } from '@playwright/test';

import { BasePage } from './BasePage';

/**
 * Page object for login functionality
 *
 * Extends the enhanced BasePage to provide login-specific functionality
 * while leveraging common UI interaction patterns.
 */
export class LoginPage extends BasePage {
  // Login form selectors
  private get modalTitle() {
    return this.modal.locator('#modal-title h3', { hasText: 'Sign In' });
  }

  private get emailField() {
    return this.modal.getByPlaceholder(/email/i);
  }

  private get passwordField() {
    return this.modal.getByPlaceholder(/password/i);
  }

  private get submitButton() {
    return this.modal.getByRole('button', { name: 'Sign In' }).first();
  }

  /**
   * Opens the login modal by clicking the sign in button in header
   *
   * @param timeout - Optional timeout for modal to appear
   */
  async openLoginModal(): Promise<void> {
    // Wait for header to be visible using enhanced base method
    await this.header.waitFor({ state: 'visible', timeout: 15000 });

    // Wait for authentication loading to complete
    await this.waitForAuthLoadingComplete();

    // Try to find and click the sign in button with multiple strategies
    try {
      // First, try desktop sign in button
      const desktopSignInButton = this.page
        .locator('button:has-text("Sign In"):not([hidden])')
        .first();
      if (await desktopSignInButton.isVisible({ timeout: 5000 })) {
        await desktopSignInButton.click();
      } else {
        // If not visible on desktop, try mobile menu
        await this.openMobileMenuAndSignIn();
      }
    } catch {
      // Fallback strategy
      try {
        await this.openMobileMenuAndSignIn();
      } catch {
        // Last resort - look for any sign in button
        const anySignInButton = this.page.locator('button:has-text("Sign In")').first();
        await anySignInButton.click({ timeout: 5000 });
      }
    }

    // Wait for modal to appear with multiple strategies
    try {
      await this.waitForModal();
    } catch {
      // Fallback: wait a bit and try again
      await this.wait(1000);
      await this.waitForModal();
    }
  }

  /**
   * Opens mobile menu and clicks sign in button (mobile-specific flow)
   */
  private async openMobileMenuAndSignIn(): Promise<void> {
    // Check if we're on mobile by looking for mobile menu toggle
    const mobileMenuToggle = this.page.locator(
      'button[aria-label="Toggle menu"], .md\\:hidden button'
    );
    if (await mobileMenuToggle.isVisible({ timeout: 3000 })) {
      // Open mobile menu
      await mobileMenuToggle.click();
      await this.wait(500); // Wait for menu to animate open

      // Click sign in button inside mobile menu
      const mobileSignInButton = this.page
        .locator('[role="navigation"] button:has-text("Sign In"), nav button:has-text("Sign In")')
        .first();
      await expect(mobileSignInButton).toBeVisible({ timeout: 5000 });
      await mobileSignInButton.click();
    } else {
      throw new Error('Mobile menu not found and desktop sign in button not visible');
    }
  }

  /**
   * Performs login with email and password
   *
   * @param email - User email address
   * @param password - User password
   * @param timeout - Optional timeout for form submission
   */
  async login(email: string, password: string, timeout = 30000): Promise<void> {
    await this.openLoginModal();

    // Fill form using enhanced base methods
    await this.emailField.fill(email);
    await this.passwordField.fill(password);

    // Click submit and wait for navigation
    await this.submitButton.click();

    // Wait for either success (dashboard) or error
    try {
      await this.waitForURL(/dashboard/, { timeout });
    } catch {
      // If we don't get dashboard, check for authentication state change
      await this.page.waitForTimeout(2000);
    }
  }

  /**
   * Performs login with error handling and retry
   *
   * @param email - User email address
   * @param password - User password
   * @param retries - Number of retry attempts
   */
  async loginWithRetry(email: string, password: string, retries = 2): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.login(email, password);

        // Verify login was successful
        await this.assertLoginSuccess();
        return;
      } catch (error) {
        lastError = error as Error;

        if (attempt < retries) {
          // Close modal if still open and retry
          if (await this.isModalVisible()) {
            await this.closeModal();
          }
          await this.wait(1000);
          continue;
        }
      }
    }

    throw lastError || new Error('Login failed after retries');
  }

  /**
   * Asserts that the login modal is visible and properly configured
   */
  async assertModalVisible(): Promise<void> {
    await expect(this.modal).toBeVisible({ timeout: 10000 });
    await expect(this.modalTitle).toBeVisible();
    await expect(this.emailField).toBeVisible();
    await expect(this.passwordField).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  /**
   * Asserts that login was successful by checking for dashboard elements
   */
  async assertLoginSuccess(): Promise<void> {
    // Look for dashboard heading or other authenticated user indicators
    const dashboardHeading = this.page.getByRole('heading', { name: /dashboard/i });
    await expect(dashboardHeading).toBeVisible({ timeout: 10000 });

    // Also check that sign out button is now visible
    await expect(this.signOutButton).toBeVisible();
  }

  /**
   * Asserts that login failed by checking for error messages
   *
   * @param expectedError - Optional expected error message
   */
  async assertLoginFailure(expectedError?: string): Promise<void> {
    // Check for error messages in modal or toast
    const errorSelectors = ['.error-message', '.alert-danger', '[role="alert"]', '.text-red-600'];

    let errorFound = false;
    for (const selector of errorSelectors) {
      const errorElement = this.page.locator(selector);
      if (await errorElement.isVisible()) {
        errorFound = true;

        if (expectedError) {
          await expect(errorElement).toContainText(expectedError);
        }
        break;
      }
    }

    expect(errorFound).toBe(true);
  }

  /**
   * Checks if login modal is currently visible
   *
   * @returns True if modal is visible
   */
  async isModalVisible(): Promise<boolean> {
    return await super.isModalVisible();
  }

  /**
   * Closes the login modal using escape key
   */
  async closeModal(): Promise<void> {
    await super.closeModal();
  }

  /**
   * Fills the login form without submitting
   *
   * @param email - User email address
   * @param password - User password
   */
  async fillLoginForm(email: string, password: string): Promise<void> {
    if (!(await this.isModalVisible())) {
      await this.openLoginModal();
    }

    await this.emailField.fill(email);
    await this.passwordField.fill(password);
  }

  /**
   * Submits the current login form
   */
  async submitForm(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * Clears the login form fields
   */
  async clearForm(): Promise<void> {
    await this.emailField.clear();
    await this.passwordField.clear();
  }

  /**
   * Waits for authentication state to change
   *
   * @param isAuthenticated - Expected authentication state
   */
  async waitForAuthState(isAuthenticated: boolean): Promise<void> {
    // Always wait for auth loading to complete first
    await this.waitForAuthLoadingComplete();

    if (isAuthenticated) {
      // Wait for sign out button to appear
      await expect(this.signOutButton).toBeVisible({ timeout: 10000 });
      // Wait for sign in button to disappear
      await expect(this.signInButton).not.toBeVisible();
    } else {
      // Wait for sign in button to appear with fallback strategies
      try {
        await expect(this.signInButton).toBeVisible({ timeout: 10000 });
      } catch {
        // Fallback: wait for header to be visible and then check for sign in button
        await this.header.waitFor({ state: 'visible', timeout: 5000 });
        await this.wait(1000); // Give extra time for authentication state to settle
        await expect(this.signInButton).toBeVisible({ timeout: 5000 });
      }
      // Wait for sign out button to disappear
      await expect(this.signOutButton).not.toBeVisible();
    }
  }

  /**
   * Gets current authentication state
   *
   * @returns True if user appears to be authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    return await this.signOutButton.isVisible();
  }
}
