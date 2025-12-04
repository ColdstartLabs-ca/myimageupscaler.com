import { Page, Locator, expect, Response, Request } from '@playwright/test';

export interface IWaitOptions {
  timeout?: number;
  state?: 'visible' | 'hidden' | 'attached' | 'detached';
}

/**
 * Enhanced base page with common UI interaction patterns
 *
 * Provides reusable methods for navigation, UI element interaction,
 * network request handling, and accessibility testing. All page objects
 * should extend this base class to inherit common functionality.
 */
export class BasePage {
  constructor(protected readonly page: Page) {}

  // Navigation methods

  /**
   * Navigates to a specific path and waits for network idle
   *
   * Uses Playwright's configured baseURL from playwright.config.ts,
   * which uses dynamic ports to avoid conflicts with dev server.
   *
   * @param path - URL path (relative) or full URL (absolute)
   */
  async goto(path: string): Promise<void> {
    // For absolute URLs, use as-is; for relative paths, let Playwright prepend baseURL
    await this.page.goto(path);

    // Wait for network idle with a reasonable timeout to handle flaky network conditions
    // Use a shorter timeout and catch errors to handle protected routes gracefully
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch {
      // If network idle times out, fall back to domcontentloaded
      // This handles cases where protected routes have ongoing API calls
      try {
        await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 });
      } catch {
        // If even domcontentloaded fails, just wait a bit and continue
        await this.wait(1000);
      }
    }
  }

  /**
   * Waits for URL to match specific pattern
   *
   * @param url - URL pattern to wait for
   */
  async waitForURL(url: string | RegExp): Promise<void> {
    await this.page.waitForURL(url);
  }

  /**
   * Reloads the current page and waits for network idle
   */
  async reload(): Promise<void> {
    await this.page.reload();
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  }

  // Common UI element selectors

  /**
   * Gets the main header element
   */
  get header(): Locator {
    return this.page.locator('header');
  }

  /**
   * Gets the sign in button from header
   */
  get signInButton(): Locator {
    // Try multiple strategies to find the sign in button
    return this.page.locator('button:has-text("Sign In")').first();
  }

  /**
   * Gets the sign out button
   */
  get signOutButton(): Locator {
    return this.header.getByRole('button', { name: 'Sign Out' }).first();
  }

  /**
   * Gets the main navigation element
   */
  get navigation(): Locator {
    return this.page.locator('nav, [role="navigation"]').first();
  }

  /**
   * Gets the modal dialog element
   */
  get modal(): Locator {
    return this.page.locator('div[role="dialog"], .modal, [data-modal]').first();
  }

  /**
   * Gets the main content area
   */
  get mainContent(): Locator {
    return this.page.locator('main, [role="main"]').first();
  }

  // Toast/Notification handling

  /**
   * Waits for a toast notification to appear
   *
   * @param text - Optional text to filter toast by
   * @returns Toast element locator
   */
  async waitForToast(text?: string | RegExp): Promise<Locator> {
    const toast = this.page.locator('[role="alert"], [data-sonner-toast], .toast, .notification');

    if (text) {
      await expect(toast.filter({ hasText: text })).toBeVisible();
      return toast.filter({ hasText: text }).first();
    }

    await expect(toast.first()).toBeVisible();
    return toast.first();
  }

  /**
   * Dismisses any visible toast notifications
   */
  async dismissToast(): Promise<void> {
    const toast = this.page.locator('[role="alert"], [data-sonner-toast], .toast, .notification');
    if (await toast.isVisible()) {
      await toast
        .locator('button[aria-label="Close"], .close-button, [data-dismiss]')
        .click()
        .catch(() => {});
    }
  }

  /**
   * Checks if a toast with specific text is visible
   *
   * @param text - Text to search for in toast
   * @returns True if toast is visible
   */
  async isToastVisible(text: string | RegExp): Promise<boolean> {
    const toast = this.page.locator('[role="alert"], [data-sonner-toast], .toast, .notification');
    const filteredToast = toast.filter({ hasText: text });
    return filteredToast.isVisible();
  }

  // Modal handling

  /**
   * Waits for a modal to become visible
   */
  async waitForModal(): Promise<void> {
    await expect(this.modal).toBeVisible({ timeout: 10000 });
  }

  /**
   * Closes the modal using escape key
   */
  async closeModal(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.modal).toBeHidden({ timeout: 5000 });
  }

  /**
   * Checks if a modal is currently visible
   *
   * @returns True if modal is visible
   */
  async isModalVisible(): Promise<boolean> {
    return this.modal.isVisible();
  }

  /**
   * Clicks a button within the modal
   *
   * @param name - Button name or text
   */
  async clickModalButton(name: string | RegExp): Promise<void> {
    const button = this.modal.getByRole('button', { name });
    await expect(button).toBeVisible();
    await button.click();
  }

  // Loading states

  /**
   * Waits for loading indicators to disappear
   */
  async waitForLoadingComplete(): Promise<void> {
    const spinner = this.page.locator(
      '[data-loading], .animate-spin, [aria-busy="true"], .loading'
    );
    await spinner.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  }

  /**
   * Waits for network to become idle
   */
  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Waits for page to be fully loaded
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.waitForLoadingComplete();
  }

  // Network request handling

  /**
   * Waits for an API response matching URL pattern
   *
   * @param urlPattern - URL pattern to match
   * @returns Response object
   */
  async waitForApiResponse(urlPattern: string | RegExp): Promise<Response> {
    return this.page.waitForResponse(urlPattern);
  }

  /**
   * Waits for an API request matching URL pattern
   *
   * @param urlPattern - URL pattern to match
   * @returns Request object
   */
  async waitForApiRequest(urlPattern: string | RegExp): Promise<Request> {
    return this.page.waitForRequest(urlPattern);
  }

  /**
   * Waits for multiple API responses
   *
   * @param urlPatterns - Array of URL patterns
   * @returns Array of response objects
   */
  async waitForMultipleApiResponses(urlPatterns: (string | RegExp)[]): Promise<Response[]> {
    const promises = urlPatterns.map(pattern => this.page.waitForResponse(pattern));
    return Promise.all(promises);
  }

  // Form helpers

  /**
   * Fills a form field by placeholder
   *
   * @param placeholder - Placeholder text
   * @param value - Value to fill
   */
  async fillField(placeholder: string | RegExp, value: string): Promise<void> {
    await this.page.getByPlaceholder(placeholder).fill(value);
  }

  /**
   * Fills a form field by label
   *
   * @param label - Label text
   * @param value - Value to fill
   */
  async fillFieldByLabel(label: string | RegExp, value: string): Promise<void> {
    await this.page.getByLabel(label).fill(value);
  }

  /**
   * Clicks a button by name or text
   *
   * @param name - Button name or text
   */
  async clickButton(name: string | RegExp): Promise<void> {
    await this.page.getByRole('button', { name }).click();
  }

  /**
   * Clicks a link by text
   *
   * @param text - Link text
   */
  async clickLink(text: string | RegExp): Promise<void> {
    await this.page.getByRole('link', { name: text }).click();
  }

  /**
   * Selects an option from a dropdown
   *
   * @param label - Dropdown label
   * @param option - Option to select
   */
  async selectOption(label: string | RegExp, option: string): Promise<void> {
    await this.page.getByLabel(label).selectOption(option);
  }

  /**
   * Checks a checkbox
   *
   * @param label - Checkbox label
   */
  async checkCheckbox(label: string | RegExp): Promise<void> {
    await this.page.getByLabel(label).check();
  }

  /**
   * Unchecks a checkbox
   *
   * @param label - Checkbox label
   */
  async uncheckCheckbox(label: string | RegExp): Promise<void> {
    await this.page.getByLabel(label).uncheck();
  }

  // Screenshot and debugging helpers

  /**
   * Takes a screenshot with descriptive name
   *
   * @param name - Screenshot name
   * @param options - Screenshot options
   */
  async screenshot(name: string, options?: { fullPage?: boolean }): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}-${timestamp}.png`;
    await this.page.screenshot({
      path: `test-results/screenshots/${filename}`,
      fullPage: options?.fullPage,
    });
  }

  /**
   * Logs the current page title
   *
   * @returns Page title
   */
  async logPageTitle(): Promise<string> {
    const title = await this.page.title();
    console.log(`Page title: ${title}`);
    return title;
  }

  /**
   * Logs the current URL
   *
   * @returns Current URL
   */
  async logCurrentUrl(): Promise<string> {
    const url = this.page.url();
    console.log(`Current URL: ${url}`);
    return url;
  }

  // Accessibility helpers

  /**
   * Performs basic accessibility checks
   */
  async checkBasicAccessibility(): Promise<void> {
    // Check for page title
    const title = await this.page.title();
    expect(title.length).toBeGreaterThan(0);

    // Check for main landmark
    const main = this.page.locator('main, [role="main"]');
    await expect(main.first()).toBeVisible();

    // Check for navigation or skip link
    const nav = this.page.locator('nav, [role="navigation"], a[href="#main"], .skip-link');
    await expect(nav.first()).toBeVisible();

    // Check for proper heading structure
    const h1 = this.page.locator('h1');
    await expect(h1.first()).toBeVisible();
  }

  /**
   * Checks for proper ARIA labels on interactive elements
   */
  async checkAriaLabels(): Promise<void> {
    // Check buttons have accessible names
    const buttons = this.page.locator('button:not([aria-label]):not([aria-labelledby])');
    const buttonCount = await buttons.count();

    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const text = await button.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  }

  // Utility methods

  /**
   * Scrolls element into view
   *
   * @param selector - Element selector
   */
  async scrollIntoView(selector: string): Promise<void> {
    await this.page.locator(selector).scrollIntoViewIfNeeded();
  }

  /**
   * Hovers over an element
   *
   * @param selector - Element selector
   */
  async hover(selector: string): Promise<void> {
    await this.page.locator(selector).hover();
  }

  /**
   * Focuses an element
   *
   * @param selector - Element selector
   */
  async focus(selector: string): Promise<void> {
    await this.page.locator(selector).focus();
  }

  /**
   * Types text with natural delay
   *
   * @param selector - Element selector
   * @param text - Text to type
   * @param delay - Delay between keystrokes
   */
  async typeSlowly(selector: string, text: string, delay = 50): Promise<void> {
    await this.page.locator(selector).type(text, { delay });
  }

  /**
   * Waits for a specified amount of time
   *
   * @param ms - Milliseconds to wait
   */
  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }
}
