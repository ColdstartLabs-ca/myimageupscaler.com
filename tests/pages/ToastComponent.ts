import { Page, Locator, expect } from '@playwright/test';
import type { IWaitOptions } from './BasePage';

export interface IToastOptions {
  timeout?: number;
  dismissAfter?: number;
  checkAccessibility?: boolean;
}

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

/**
 * Reusable toast notification component
 *
 * Provides standardized methods for interacting with toast notifications
 * across the application, including waiting for, dismissing, and verifying toasts.
 */
export class ToastComponent {
  constructor(
    private page: Page,
    private toastSelector: string = '[role="alert"], [data-sonner-toast], .toast, .notification'
  ) {}

  /**
   * Gets all visible toast elements
   */
  get allToasts(): Locator {
    return this.page.locator(this.toastSelector);
  }

  /**
   * Gets the most recent toast (typically the last one)
   */
  get latestToast(): Locator {
    return this.allToasts.last();
  }

  /**
   * Gets the first visible toast
   */
  get firstToast(): Locator {
    return this.allToasts.first();
  }

  /**
   * Waits for a toast with specific content to appear
   *
   * @param content - Text content to wait for
   * @param options - Toast waiting options
   * @returns Toast element locator
   */
  async waitForToast(content: string | RegExp, options: IToastOptions = {}): Promise<Locator> {
    const { timeout = 10000, checkAccessibility = true } = options;

    const toast = this.allToasts.filter({ hasText: content });
    await expect(toast).toBeVisible({ timeout });

    if (checkAccessibility) {
      await this.checkAccessibility(toast);
    }

    return toast.first();
  }

  /**
   * Waits for any toast to appear
   *
   * @param options - Toast waiting options
   * @returns Toast element locator
   */
  async waitForAnyToast(options: IToastOptions = {}): Promise<Locator> {
    const { timeout = 10000, checkAccessibility = true } = options;

    await expect(this.firstToast).toBeVisible({ timeout });

    if (checkAccessibility) {
      await this.checkAccessibility(this.firstToast);
    }

    return this.firstToast;
  }

  /**
   * Checks if a toast with specific content is visible
   *
   * @param content - Text content to check for
   * @returns True if toast is visible
   */
  async isVisible(content: string | RegExp): Promise<boolean> {
    const toasts = this.allToasts.filter({ hasText: content });
    return await toasts.isVisible();
  }

  /**
   * Gets all visible toasts with specific content
   *
   * @param content - Text content to filter by
   * @returns Array of toast locators
   */
  async getToasts(content: string | RegExp): Promise<Locator[]> {
    const filteredToasts = this.allToasts.filter({ hasText: content });
    const count = await filteredToasts.count();
    const result: Locator[] = [];

    for (let i = 0; i < count; i++) {
      result.push(filteredToasts.nth(i));
    }

    return result;
  }

  /**
   * Gets the text content of all visible toasts
   *
   * @returns Array of toast text content
   */
  async getAllToastTexts(): Promise<string[]> {
    const toasts = this.allToasts;
    const count = await toasts.count();
    const texts: string[] = [];

    for (let i = 0; i < count; i++) {
      const text = await toasts.nth(i).textContent();
      if (text) {
        texts.push(text.trim());
      }
    }

    return texts;
  }

  /**
   * Dismisses all visible toasts
   *
   * @param timeout - Optional timeout for each dismissal
   */
  async dismissAll(timeout = 5000): Promise<void> {
    const toasts = this.allToasts;
    const count = await toasts.count();

    for (let i = 0; i < count; i++) {
      await this.dismiss(toasts.nth(i), timeout);
    }
  }

  /**
   * Dismisses a specific toast
   *
   * @param toast - Toast element locator
   * @param timeout - Optional timeout for dismissal
   */
  async dismiss(toast: Locator, timeout = 5000): Promise<void> {
    if (await toast.isVisible()) {
      // Try to find and click close button
      const closeButton = toast.locator('button[aria-label="Close"], .close-button, [data-dismiss], [role="button"]').first();

      if (await closeButton.isVisible()) {
        await closeButton.click();
      } else {
        // Try clicking the toast itself if it's dismissible
        await toast.click();
      }

      // Wait for toast to be hidden
      await toast.waitFor({ state: 'hidden', timeout }).catch(() => {});
    }
  }

  /**
   * Dismisses the latest toast
   *
   * @param timeout - Optional timeout for dismissal
   */
  async dismissLatest(timeout = 5000): Promise<void> {
    await this.dismiss(this.latestToast, timeout);
  }

  /**
   * Dismisses the first toast
   *
   * @param timeout - Optional timeout for dismissal
   */
  async dismissFirst(timeout = 5000): Promise<void> {
    await this.dismiss(this.firstToast, timeout);
  }

  /**
   * Waits for toasts to automatically disappear
   *
   * @param content - Optional content to wait for
   * @param timeout - Maximum time to wait
   */
  async waitForAutoDismiss(content?: string | RegExp, timeout = 10000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const hasToast = content
        ? await this.isVisible(content)
        : await this.firstToast.isVisible();

      if (!hasToast) {
        return;
      }

      await this.page.waitForTimeout(100);
    }

    throw new Error(`Toast did not auto-dismiss within ${timeout}ms`);
  }

  /**
   * Determines the type of toast based on its content and styling
   *
   * @param toast - Toast element locator
   * @returns Toast type
   */
  async getToastType(toast: Locator = this.firstToast): Promise<ToastType> {
    if (!(await toast.isVisible())) {
      throw new Error('Toast is not visible');
    }

    // Check for error indicators
    const hasErrorClass = await toast.locator('.error, .alert-error, .text-red, [data-type="error"]').isVisible();
    if (hasErrorClass) return 'error';

    // Check for success indicators
    const hasSuccessClass = await toast.locator('.success, .alert-success, .text-green, [data-type="success"]').isVisible();
    if (hasSuccessClass) return 'success';

    // Check for warning indicators
    const hasWarningClass = await toast.locator('.warning, .alert-warning, .text-yellow, [data-type="warning"]').isVisible();
    if (hasWarningClass) return 'warning';

    // Check for loading indicators
    const hasLoadingClass = await toast.locator('.loading, .spinner, [data-loading], [data-type="loading"]').isVisible();
    if (hasLoadingClass) return 'loading';

    // Default to info
    return 'info';
  }

  /**
   * Waits for a success toast
   *
   * @param content - Optional success message content
   * @param options - Toast waiting options
   * @returns Toast element locator
   */
  async waitForSuccessToast(content?: string, options: IToastOptions = {}): Promise<Locator> {
    if (content) {
      const toast = await this.waitForToast(content, options);
      const type = await this.getToastType(toast);
      expect(type).toBe('success');
      return toast;
    } else {
      // Look for any success-type toast
      const toasts = this.allToasts;
      const count = await toasts.count();

      for (let i = 0; i < count; i++) {
        const toast = toasts.nth(i);
        if (await toast.isVisible()) {
          const type = await this.getToastType(toast);
          if (type === 'success') {
            return toast;
          }
        }
      }

      throw new Error('No success toast found');
    }
  }

  /**
   * Waits for an error toast
   *
   * @param content - Optional error message content
   * @param options - Toast waiting options
   * @returns Toast element locator
   */
  async waitForErrorToast(content?: string, options: IToastOptions = {}): Promise<Locator> {
    if (content) {
      const toast = await this.waitForToast(content, options);
      const type = await this.getToastType(toast);
      expect(type).toBe('error');
      return toast;
    } else {
      // Look for any error-type toast
      const toasts = this.allToasts;
      const count = await toasts.count();

      for (let i = 0; i < count; i++) {
        const toast = toasts.nth(i);
        if (await toast.isVisible()) {
          const type = await this.getToastType(toast);
          if (type === 'error') {
            return toast;
          }
        }
      }

      throw new Error('No error toast found');
    }
  }

  /**
   * Takes a screenshot of a specific toast
   *
   * @param toast - Toast element locator
   * @param name - Screenshot name
   */
  async screenshot(toast: Locator, name: string): Promise<void> {
    if (await toast.isVisible()) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${name}-${timestamp}.png`;
      await toast.screenshot({
        path: `test-results/screenshots/${filename}`
      });
    }
  }

  /**
   * Checks accessibility of a toast element
   *
   * @param toast - Toast element locator
   */
  private async checkAccessibility(toast: Locator): Promise<void> {
    // Check toast has proper role
    const hasRole = await toast.getAttribute('role');
    if (!hasRole && hasRole !== 'alert' && hasRole !== 'status') {
      console.warn('Toast missing proper ARIA role');
    }

    // Check for aria-live if applicable
    const hasAriaLive = await toast.getAttribute('aria-live');
    if (!hasAriaLive && !hasRole) {
      console.warn('Toast should have aria-live attribute or role for screen readers');
    }

    // Check for close button accessibility if present
    const closeButton = toast.locator('button[aria-label="Close"], .close-button').first();
    if (await closeButton.isVisible()) {
      const hasAriaLabel = await closeButton.getAttribute('aria-label');
      if (!hasAriaLabel) {
        console.warn('Toast close button missing aria-label');
      }
    }
  }

  /**
   * Counts the number of visible toasts
   *
   * @returns Number of visible toasts
   */
  async getCount(): Promise<number> {
    return await this.allToasts.count();
  }

  /**
   * Checks if any toasts are currently visible
   *
   * @returns True if toasts are visible
   */
  async hasToasts(): Promise<boolean> {
    return await this.firstToast.isVisible();
  }

  /**
   * Waits for all toasts to be dismissed or hidden
   *
   * @param timeout - Maximum time to wait
   */
  async waitForAllToastsHidden(timeout = 10000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (!(await this.hasToasts())) {
        return;
      }

      await this.page.waitForTimeout(100);
    }

    throw new Error(`Toasts did not disappear within ${timeout}ms`);
  }

  /**
   * Creates a toast manager instance for a specific page
   *
   * @param page - Playwright page instance
   * @param selector - Custom toast selector
   * @returns ToastComponent instance
   */
  static forPage(page: Page, selector?: string): ToastComponent {
    return new ToastComponent(page, selector);
  }

  /**
   * Asserts that a toast with specific content is visible
   *
   * @param content - Expected content
   * @param timeout - Optional timeout
   */
  async expectToast(content: string | RegExp, timeout = 5000): Promise<void> {
    await expect(this.allToasts.filter({ hasText: content })).toBeVisible({ timeout });
  }

  /**
   * Asserts that no toast with specific content is visible
   *
   * @param content - Content that should not be present
   * @param timeout - Optional timeout
   */
  async expectNoToast(content: string | RegExp, timeout = 5000): Promise<void> {
    await expect(this.allToasts.filter({ hasText: content })).not.toBeVisible({ timeout });
  }

  /**
   * Asserts that no toasts are visible
   *
   * @param timeout - Optional timeout
   */
  async expectNoToasts(timeout = 5000): Promise<void> {
    await expect(this.firstToast).not.toBeVisible({ timeout });
  }
}